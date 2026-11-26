import { addDays, etToday } from '../domain/time.ts';
import { dealDataProblem } from '../domain/guards.ts';
import { defaultDirection, mostRestrictive, DIRECTIONS, INTERACTION_TYPES } from './model/defaults.ts';
import { deriveSystemFields, staleSystemFields, type SystemFields } from './model/derived.ts';
import { findPersonDuplicates, normalizeDomain, type PersonDuplicate } from './model/dedupe.ts';
import type { CrmInteraction, CrmOrg, CrmPerson, Direction, InteractionType, Owner, RankingConfig, Sensitivity, Stage } from './model/types.ts';
import { interactionFromRow, interactionToFields, mergeLogFromRow, mergeLogToFields, orgFromRow, orgToFields, personFromRow, personToFields, type MergeLogEntry, type WithEtag } from './graph/mappers.ts';
import { mergedPatch, parseSnapshot, repoint, type MergeChoices, type MergeSnapshot } from './model/merge.ts';
import { deletionPreview } from './export.ts';
import { ConflictError, CrmValidationError, assertNoDealData, type CrmRepo } from './graph/repo.ts';
import { CRM_INTERACTIONS, CRM_MERGE_LOG, CRM_ORGANIZATIONS, CRM_PEOPLE, ORG_TYPES, OWNERS, RELATIONSHIP_TYPES, STAGES } from './schema.ts';

export interface CrmData { orgs: WithEtag<CrmOrg>[]; people: WithEtag<CrmPerson>[]; interactions: WithEtag<CrmInteraction>[]; mergeLog: MergeLogEntry[] }

/** Everything for the session, read in one pass. Held in memory by the caller; nothing is stored. */
export async function loadCrm(repo: CrmRepo): Promise<CrmData> {
  const [o, p, i, m] = await Promise.all([repo.listAll(CRM_ORGANIZATIONS), repo.listAll(CRM_PEOPLE), repo.listAll(CRM_INTERACTIONS), repo.listAll(CRM_MERGE_LOG)]);
  return { orgs: o.map(orgFromRow), people: p.map(personFromRow), interactions: i.map(interactionFromRow), mergeLog: m.map(mergeLogFromRow) };
}

const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const bad = (m: string, f?: string): never => { throw new CrmValidationError(m, f); };
const oneOf = <T extends string>(v: unknown, set: readonly T[], label: string): T => (set.includes(v as T) ? (v as T) : bad(`Please choose a valid ${label}.`, label));
const score = (v: unknown, label: string): number | undefined => {
  if (v === undefined || v === null || v === '') return undefined;
  return Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 5 ? (v as number) : bad(`${label} must be a whole number from 1 to 5.`, label);
};
const text = (v: unknown, label: string, max: number, required = false): string | undefined => {
  const s = typeof v === 'string' ? v.trim() : '';
  if (!s) return required ? bad(`Please enter ${label}.`, label) : undefined;
  if (s.length > max) bad(`${label} is limited to ${max} characters.`, label);
  const p = dealDataProblem(s);
  if (p) bad(p, label);
  return s;
};

export interface NewPerson {
  name: string; relationshipType: string; owner: Owner; organizationId?: number; email?: string; importance?: number; comfort?: number;
  agreedCheckIn?: string; stage?: Stage; sensitivity?: Sensitivity; sourceId?: string;
}
/** The fields a founder may edit. System fields are never in a patch. */
export type PersonPatch = Partial<Omit<NewPerson, 'sourceId'>>;
export interface NewInteraction {
  personIds: number[]; summary: string; date?: string; type?: InteractionType; direction?: Direction; followUpNeeded?: boolean; sourceLink?: string;
}
export interface LogResult {
  interaction: WithEtag<CrmInteraction>;
  people: WithEtag<CrmPerson>[];
  /** People whose system fields could not be updated (changed by someone else). Recompute repairs them. */
  failed: { personId: number; message: string }[];
  task: { id: number } | null;
  warnings: string[];
}

type Sys = Pick<CrmPerson, 'lastTwoWayAt' | 'lastTouchAt' | 'lastDirection'>;
const SYSTEM_KEYS = ['lastTwoWayAt', 'lastTouchAt', 'lastDirection'] as const;
/** Only the system fields that differ and have a value. */
const sysPatch = (e: SystemFields, p: CrmPerson): Sys => {
  const out: Sys = {};
  if (e.lastTwoWayAt !== undefined && e.lastTwoWayAt !== p.lastTwoWayAt) out.lastTwoWayAt = e.lastTwoWayAt;
  if (e.lastTouchAt !== undefined && e.lastTouchAt !== p.lastTouchAt) out.lastTouchAt = e.lastTouchAt;
  if (e.lastDirection !== undefined && e.lastDirection !== p.lastDirection) out.lastDirection = e.lastDirection;
  return out;
};

export class CrmService {
  private repo: CrmRepo; private cfg: RankingConfig; private now: () => Date;
  constructor(repo: CrmRepo, cfg: RankingConfig, now: () => Date = () => new Date()) { this.repo = repo; this.cfg = cfg; this.now = now; }
  private today() { return etToday(this.now()); }

  load() { return loadCrm(this.repo); }

  async addOrganization(i: { name: string; orgType: string; domain?: string; relationshipToBH?: string; hubPath?: string }): Promise<WithEtag<CrmOrg>> {
    const fields = orgToFields({
      name: text(i.name, 'a name', 255, true), orgType: oneOf(i.orgType, ORG_TYPES, 'organization type'),
      domain: normalizeDomain(i.domain), relationshipToBH: i.relationshipToBH, hubPath: text(i.hubPath, 'the hub path', 255),
    });
    assertNoDealData(CRM_ORGANIZATIONS, fields);
    return orgFromRow(await this.repo.create(CRM_ORGANIZATIONS, fields));
  }

  /** People without an organization belong to "Independent". */
  async ensureIndependent(data: Pick<CrmData, 'orgs'>): Promise<WithEtag<CrmOrg>> {
    return data.orgs.find((o) => o.name === 'Independent') ?? this.addOrganization({ name: 'Independent', orgType: 'other' });
  }

  /**
   * Creates a person unless a possible duplicate exists (exact normalized email, or same normalized name in the same organization).
   * With duplicates and no `allowDuplicate`, nothing is written and the duplicates are returned ("Open existing" or "Create anyway").
   */
  async addPerson(i: NewPerson, data: CrmData, opts: { allowDuplicate?: boolean } = {}): Promise<{ person?: WithEtag<CrmPerson>; duplicates: PersonDuplicate[] }> {
    const name = text(i.name, 'a name', 255, true)!;
    const owner = oneOf(i.owner, OWNERS, 'owner');
    const relationshipType = oneOf(i.relationshipType, RELATIONSHIP_TYPES, 'relationship type');
    const stage = i.stage === undefined ? 'Active' : oneOf(i.stage, STAGES, 'stage');
    const email = text(i.email, 'an email address', 255)?.toLowerCase();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) bad('That email address does not look right.', 'email');
    if (i.agreedCheckIn !== undefined && !isDate(i.agreedCheckIn)) bad('The agreed check-in must be a date.', 'agreedCheckIn');
    const organizationId = i.organizationId ?? (await this.ensureIndependent(data)).id;
    if (i.organizationId !== undefined && !data.orgs.some((o) => o.id === i.organizationId)) bad('That organization no longer exists. Reload.', 'organization');
    const sensitivity = i.sensitivity ? oneOf(i.sensitivity, ['Normal', 'Restricted'] as const, 'sensitivity') : this.cfg.familyInvestorsRestricted && relationshipType === 'family and friends' ? 'Restricted' : 'Normal';
    const duplicates = findPersonDuplicates({ name, email, organizationId }, data.people, this.cfg);
    if (duplicates.length && !opts.allowDuplicate) return { duplicates };
    const fields = personToFields({
      name, organizationId, relationshipType, owner, email, importance: score(i.importance, 'Importance') ?? this.cfg.defaultImportance, comfort: score(i.comfort, 'Comfort'),
      agreedCheckIn: i.agreedCheckIn, stage, sensitivity, sourceId: text(i.sourceId, 'the source id', 255),
    });
    assertNoDealData(CRM_PEOPLE, fields);
    return { person: personFromRow(await this.repo.create(CRM_PEOPLE, fields)), duplicates };
  }

  /** Edits founder-editable fields with the eTag the record was loaded with. `null` clears an optional field. */
  async updatePerson(p: WithEtag<CrmPerson>, patch: { [K in keyof PersonPatch]?: PersonPatch[K] | null }): Promise<WithEtag<CrmPerson>> {
    const out: { [K in keyof CrmPerson]?: CrmPerson[K] | null } = {};
    if (patch.name !== undefined) out.name = text(patch.name, 'a name', 255, true)!;
    if (patch.organizationId !== undefined && patch.organizationId !== null) out.organizationId = patch.organizationId;
    if (patch.relationshipType !== undefined && patch.relationshipType !== null) out.relationshipType = oneOf(patch.relationshipType, RELATIONSHIP_TYPES, 'relationship type');
    if (patch.owner !== undefined && patch.owner !== null) out.owner = oneOf(patch.owner, OWNERS, 'owner');
    if (patch.stage !== undefined && patch.stage !== null) out.stage = oneOf(patch.stage, STAGES, 'stage');
    if (patch.sensitivity !== undefined && patch.sensitivity !== null) out.sensitivity = oneOf(patch.sensitivity, ['Normal', 'Restricted'] as const, 'sensitivity');
    if (patch.email !== undefined) out.email = patch.email === null ? null : text(patch.email, 'an email address', 255)?.toLowerCase() ?? null;
    if (patch.importance !== undefined) out.importance = patch.importance === null ? null : score(patch.importance, 'Importance');
    if (patch.comfort !== undefined) out.comfort = patch.comfort === null ? null : score(patch.comfort, 'Comfort');
    if (patch.agreedCheckIn !== undefined) out.agreedCheckIn = patch.agreedCheckIn === null ? null : isDate(patch.agreedCheckIn) ? patch.agreedCheckIn : bad('The agreed check-in must be a date.', 'agreedCheckIn');
    const fields = personToFields(out);
    if (!Object.keys(fields).length) return p;
    return personFromRow(await this.repo.update(CRM_PEOPLE, p.id, p.etag, fields));
  }

  /** Snooze writes AgreedCheckIn. The date must be after today. */
  async snooze(p: WithEtag<CrmPerson>, date: string) {
    if (!isDate(date) || date <= this.today()) bad('Please choose a date after today.', 'agreedCheckIn');
    return this.updatePerson(p, { agreedCheckIn: date });
  }
  /** Mute is Stage = Dormant. The caller keeps `previousStage` for the 10-second Undo. */
  async mute(p: WithEtag<CrmPerson>): Promise<{ person: WithEtag<CrmPerson>; previousStage: Stage }> {
    return { previousStage: p.stage, person: await this.updatePerson(p, { stage: 'Dormant' }) };
  }
  async setStage(p: WithEtag<CrmPerson>, stage: Stage) { return this.updatePerson(p, { stage }); }

  /**
   * Log contact: writes the interaction, then each person's LastTwoWayAt, LastTouchAt and LastDirection (a broadcast moves only
   * LastTouchAt), then optionally a follow-up task. Before any write it checks that every person is unchanged since loaded; if one
   * changed it throws ConflictError and writes nothing.
   */
  async logContact(i: NewInteraction, data: CrmData): Promise<LogResult> {
    const today = this.today();
    const summary = text(i.summary, 'a short summary', 200, true)!;
    const type = oneOf(i.type ?? 'email', INTERACTION_TYPES, 'type');
    const direction = i.direction === undefined ? defaultDirection(type) : oneOf(i.direction, DIRECTIONS, 'direction');
    const date = i.date ?? today;
    if (!isDate(date)) bad('Please choose a valid date.', 'date');
    if (date > today) bad('The date cannot be in the future.', 'date');
    const sourceLink = text(i.sourceLink, 'the source link', 255);
    const ids = [...new Set(i.personIds)];
    if (!ids.length) bad('Please choose at least one person.', 'people');
    const people = ids.map((id) => data.people.find((p) => p.id === id) ?? bad('A person in this contact no longer exists. Reload.', 'people'));

    for (const p of people) { // preflight: nothing is written if anyone changed
      const fresh = await this.repo.get(CRM_PEOPLE, p.id);
      if (!fresh) bad('A person in this contact no longer exists. Reload.', 'people');
      if (p.etag && fresh!.etag !== p.etag) throw new ConflictError();
    }

    const organizationId = people[0]!.organizationId;
    const sensitivity = mostRestrictive(people.map((p) => p.sensitivity));
    const row = await this.repo.create(CRM_INTERACTIONS, interactionToFields({ summary, date, type, direction, peopleIds: ids, organizationId, followUpNeeded: i.followUpNeeded === true, sourceLink, sensitivity }));
    const interaction = interactionFromRow(row);
    const all = [...data.interactions, interaction];

    const updated: WithEtag<CrmPerson>[] = [], failed: LogResult['failed'] = [], warnings: string[] = [];
    for (const p of people) {
      const patch = sysPatch(deriveSystemFields(p.id, all), p);
      if (!Object.keys(patch).length) { updated.push(p); continue; }
      try { updated.push(personFromRow(await this.repo.update(CRM_PEOPLE, p.id, p.etag, personToFields(patch)))); } catch (e) {
        if (!(e instanceof ConflictError)) throw e;
        failed.push({ personId: p.id, message: `${e.message} Use Recompute in Needs attention to repair ${p.name}.` });
        updated.push(p);
      }
    }

    let task: { id: number } | null = null;
    if (i.followUpNeeded) {
      const p = people[0]!;
      try {
        task = await this.repo.createTask({
          Title: `Follow up with ${p.name}`, Status: 'Next', Priority: 'P2', DueDate: addDays(today, 7), ContributionType: 'Relationship',
          Owner: p.owner, ExtId: `crm-person:${p.id}`, Source: 'manual', Description: `Follow-up from a logged contact on ${date}.`,
        });
        if (!task) warnings.push('There is no Tasks list, so no follow-up task was created. The flag stays on the interaction.');
      } catch (e) { warnings.push(`The follow-up task could not be created: ${(e as Error).message}`); }
    }
    return { interaction, people: updated, failed, task, warnings };
  }

  /** Repairs system fields that no longer match the interactions (the Recompute action). */
  async recompute(data: CrmData): Promise<{ updated: number; failed: { personId: number; message: string }[] }> {
    let updated = 0;
    const failed: { personId: number; message: string }[] = [];
    for (const { person, expected } of staleSystemFields(data.people, data.interactions)) {
      const clear = Object.fromEntries(SYSTEM_KEYS.filter((k) => expected[k] === undefined && person[k] !== undefined).map((k) => [k, null])) as { [K in keyof Sys]?: null };
      try { await this.repo.update(CRM_PEOPLE, person.id, (person as WithEtag<CrmPerson>).etag, personToFields({ ...clear, ...sysPatch(expected, person) })); updated++; } catch (e) {
        if (!(e instanceof ConflictError)) throw e;
        failed.push({ personId: person.id, message: e.message });
      }
    }
    return { updated, failed };
  }
  private async freshOrConflict(p: WithEtag<CrmPerson>) {
    const fresh = await this.repo.get(CRM_PEOPLE, p.id);
    if (!fresh) bad('A person in this change no longer exists. Reload.');
    if (p.etag && fresh!.etag !== p.etag) throw new ConflictError();
  }

  /**
   * Merges `lose` into `keep`: writes the merge log first (with everything Undo needs), re-points the losing person's interactions,
   * updates the surviving person (chosen fields, recomputed system fields), then deletes the losing person to the SharePoint recycle bin.
   * Not transactional: if it stops part-way the log entry stays, the losing person is still there, and running the merge again finishes it.
   */
  async mergePeople(keepId: number, loseId: number, choices: MergeChoices, data: CrmData, by: string): Promise<{ keep: WithEtag<CrmPerson>; log: MergeLogEntry }> {
    if (keepId === loseId) bad('Choose two different people.');
    const keep = data.people.find((p) => p.id === keepId), lose = data.people.find((p) => p.id === loseId);
    if (!keep || !lose) return bad('A person in this merge no longer exists. Reload.');
    await this.freshOrConflict(keep);
    await this.freshOrConflict(lose);
    const patch = mergedPatch(keep, lose, choices);
    const links = data.interactions.filter((i) => i.peopleIds.includes(loseId)).map((i) => ({ interactionId: i.id, peopleIds: [...i.peopleIds] }));
    const { etag: _e, ...loseFields } = lose as WithEtag<CrmPerson>; void _e;
    const snapshot: MergeSnapshot = { v: 1, kind: 'person', lose: loseFields, keepBefore: Object.fromEntries(Object.keys(patch).map((k) => [k, (keep as unknown as Record<string, unknown>)[k] ?? null])), links };
    const log = mergeLogFromRow(await this.repo.create(CRM_MERGE_LOG, mergeLogToFields({
      title: `Merged ${lose.name} into ${keep.name}`, kind: 'person', snapshot: JSON.stringify(snapshot), mergedIntoId: keepId, mergedAt: this.now().toISOString(), mergedBy: by, undone: false,
    })));
    for (const l of links) {
      const i = data.interactions.find((x) => x.id === l.interactionId)!;
      await this.repo.update(CRM_INTERACTIONS, i.id, i.etag, interactionToFields({ peopleIds: repoint(i.peopleIds, loseId, keepId) }));
    }
    const after = data.interactions.map((i) => (i.peopleIds.includes(loseId) ? { ...i, peopleIds: repoint(i.peopleIds, loseId, keepId) } : i));
    const merged = personFromRow(await this.repo.update(CRM_PEOPLE, keepId, keep.etag, personToFields({ ...patch, ...sysPatch(deriveSystemFields(keepId, after), keep) })));
    await this.repo.remove(CRM_PEOPLE, loseId);
    return { keep: merged, log };
  }

  /** Recreates the losing person from the log (with a new item id), puts the interactions and the surviving person's fields back, and blanks the snapshot. */
  async undoMerge(logId: number, data: CrmData): Promise<{ restored: WithEtag<CrmPerson>; keep: WithEtag<CrmPerson> }> {
    const entry = data.mergeLog.find((e) => e.id === logId);
    if (!entry) return bad('That merge was not found. Reload.');
    if (entry.undone) return bad('This merge was already undone.');
    const snap = parseSnapshot(entry.snapshot);
    if (!snap) return bad('This merge log entry cannot be read, so it cannot be undone.');
    const keep = data.people.find((p) => p.id === entry.mergedIntoId);
    if (!keep) return bad('The record it was merged into no longer exists, so it cannot be undone.');
    await this.freshOrConflict(keep);
    const oldId = snap.lose.id;
    const { id: _id, ...fields } = snap.lose; void _id;
    let restored = personFromRow(await this.repo.create(CRM_PEOPLE, personToFields(fields)));
    const restoredInteractions = data.interactions.map((i) => ({ ...i }));
    for (const l of snap.links) {
      const cur = restoredInteractions.find((i) => i.id === l.interactionId);
      if (!cur) continue; // deleted since
      const ids = l.peopleIds.map((x) => (x === oldId ? restored.id : x));
      await this.repo.update(CRM_INTERACTIONS, cur.id, (cur as WithEtag<CrmInteraction>).etag, interactionToFields({ peopleIds: ids }));
      cur.peopleIds = ids;
    }
    const keepRow = await this.repo.update(CRM_PEOPLE, keep.id, keep.etag, personToFields({ ...snap.keepBefore, ...sysPatch(deriveSystemFields(keep.id, restoredInteractions), { ...keep, ...Object.fromEntries(Object.entries(snap.keepBefore).filter(([, v]) => v !== null)) } as CrmPerson) }));
    const sys = sysPatch(deriveSystemFields(restored.id, restoredInteractions), restored);
    if (Object.keys(sys).length) restored = personFromRow(await this.repo.update(CRM_PEOPLE, restored.id, restored.etag, personToFields(sys)));
    await this.repo.update(CRM_MERGE_LOG, entry.id, entry.etag, mergeLogToFields({ undone: true, snapshot: '' })); // no personal data kept for an undone merge
    return { restored, keep: personFromRow(keepRow) };
  }

  /** Deletes one person: interactions only they were in, their place in shared interactions, merge log snapshots of them, then the person. Everything goes to the SharePoint recycle bin. */
  async deletePerson(personId: number, data: CrmData): Promise<{ interactionsDeleted: number; interactionsUpdated: number; mergeLogsDeleted: number }> {
    const p = data.people.find((x) => x.id === personId);
    if (!p) return bad('That person no longer exists. Reload.');
    await this.freshOrConflict(p);
    const pv = deletionPreview(personId, data);
    for (const i of pv.solo) await this.repo.remove(CRM_INTERACTIONS, i.id);
    for (const i of pv.shared) await this.repo.update(CRM_INTERACTIONS, i.id, i.etag, interactionToFields({ peopleIds: i.peopleIds.filter((x) => x !== personId) }));
    for (const e of pv.mergeLogs) await this.repo.remove(CRM_MERGE_LOG, e.id);
    await this.repo.remove(CRM_PEOPLE, personId);
    return { interactionsDeleted: pv.solo.length, interactionsUpdated: pv.shared.length, mergeLogsDeleted: pv.mergeLogs.length };
  }

}
