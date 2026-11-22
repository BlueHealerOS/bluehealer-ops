import type { OpsStore } from '../graph/store';
import type { OrgFull, PersonFull, IntakeItem } from '../domain/types';
import { fillBlanks, mapOrg, mapPerson, mapTrello, type DryRun, type HubRecord, type TrelloExport } from '../domain/imports';
import { findDuplicates } from '../domain/crm';
import { SEED_MILESTONES, FEBRUARY_TARGET } from '../domain/milestones';

const clean = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

export function parseHubExport(text: string): HubRecord[] {
  const j = JSON.parse(text) as unknown;
  if (!Array.isArray(j)) throw new Error('This file is not a hub export (expected a list of records).');
  return j.filter((r): r is HubRecord => !!r && typeof r === 'object' && 'kind' in r && 'file' in r && 'fields' in r);
}

export async function seedMilestones(store: OpsStore): Promise<number> {
  const have = new Set((await store.items<{ Title: string }>('Milestones')).map((m) => m.Title));
  const todo = SEED_MILESTONES.filter((m) => !have.has(m.Title));
  const res = await store.createMany('Milestones', todo.map((m) => ({ Title: m.Title, Owner: m.Owner, Track: m.Track, TargetDate: FEBRUARY_TARGET, BaselineDate: FEBRUARY_TARGET, Status: 'not started', Labels: 'draft seed', Source: 'manual', Sensitivity: 'normal' })));
  return res.filter((r) => r.id !== null).length;
}

export interface HubPlan { report: DryRun & { orgs: number; people: number; possibleDuplicates: number }; run: (onProgress?: (m: string) => void) => Promise<string> }

/** Dry run first. The returned run() writes only new records and blank fields. */
export async function planHubImport(store: OpsStore, records: HubRecord[]): Promise<HubPlan> {
  const orgRecs = records.filter((r) => r.kind === 'company');
  const personRecs = records.filter((r) => r.kind === 'person');
  const existingOrgs = await store.items<OrgFull>('Organizations');
  const existingPeople = await store.items<PersonFull>('People');
  const orgByExt = new Map(existingOrgs.filter((o) => o.ExtId).map((o) => [o.ExtId!, o]));
  const personByExt = new Map(existingPeople.filter((p) => p.ExtId).map((p) => [p.ExtId!, p]));
  const nameSet = new Set([...existingOrgs.map((o) => o.Title.toLowerCase()), ...orgRecs.map((r) => r.file.replace(/\.md$/, '').toLowerCase())]);

  const report = { create: 0, fill: 0, unchanged: 0, unresolvedOrgs: 0, unmappedRelationships: 0, tierConverted: 0, orgs: orgRecs.length, people: personRecs.length, possibleDuplicates: 0 };
  const orgNew: Record<string, unknown>[] = [], orgFill: { id: number; fields: Record<string, unknown> }[] = [];
  for (const r of orgRecs) {
    const m = clean(mapOrg(r));
    const ex = orgByExt.get(m.ExtId as string);
    if (!ex) { orgNew.push(m); report.create++; continue; }
    const f = fillBlanks(ex as unknown as Record<string, unknown>, m);
    if (Object.keys(f).length) { orgFill.push({ id: ex.id, fields: f }); report.fill++; } else report.unchanged++;
  }
  for (const r of personRecs) {
    const m = mapPerson(r, new Map([...nameSet].map((n) => [n, 1])));
    if (m.unresolvedOrg) report.unresolvedOrgs++;
    if (m.unmappedRelationship) report.unmappedRelationships++;
    if (m.fields.Tier) report.tierConverted++;
    const ex = personByExt.get(m.fields.ExtId);
    if (!ex) {
      report.create++;
      if (findDuplicates({ name: m.fields.Title, email: m.fields.Email }, existingPeople).length) report.possibleDuplicates++;
    } else if (Object.keys(fillBlanks(ex as unknown as Record<string, unknown>, clean(m.fields))).length) report.fill++; else report.unchanged++;
  }

  const run = async (onProgress: (m: string) => void = () => {}) => {
    onProgress(`Organizations: ${orgNew.length} new, ${orgFill.length} to fill`);
    const created = await store.createMany('Organizations', orgNew);
    await store.updateMany('Organizations', orgFill);
    const orgs = await store.items<OrgFull>('Organizations'); // now includes the new ids
    const idByName = new Map(orgs.map((o) => [o.Title.toLowerCase(), o.id]));
    const people = await store.items<PersonFull>('People');
    const pByExt = new Map(people.filter((p) => p.ExtId).map((p) => [p.ExtId!, p]));
    const pNew: Record<string, unknown>[] = [], pFill: { id: number; fields: Record<string, unknown> }[] = [];
    for (const r of personRecs) {
      const m = clean(mapPerson(r, idByName).fields);
      const ex = pByExt.get(m.ExtId as string);
      if (!ex) pNew.push(m);
      else { const f = fillBlanks(ex as unknown as Record<string, unknown>, m); if (Object.keys(f).length) pFill.push({ id: ex.id, fields: f }); }
    }
    onProgress(`People: ${pNew.length} new, ${pFill.length} to fill`);
    const pc = await store.createMany('People', pNew);
    await store.updateMany('People', pFill);
    const failed = [...created, ...pc].filter((x) => x.id === null).length;
    return `Import finished. Created ${created.filter((x) => x.id).length} organizations and ${pc.filter((x) => x.id).length} people, filled blanks on ${orgFill.length + pFill.length} records.${failed ? ` ${failed} writes failed; run the dry run again to see what is left.` : ''}`;
  };
  return { report, run };
}

export async function planTrelloImport(store: OpsStore, x: TrelloExport) {
  const { items, skipped } = mapTrello(x);
  const have = new Set((await store.items<IntakeItem>('Intake')).map((i) => i.ExtId).filter(Boolean));
  const fresh = items.filter((i) => !have.has(i.ExtId as string));
  return {
    report: { toCreate: fresh.length, alreadyImported: items.length - fresh.length, skippedClosedOrDone: skipped },
    run: async () => { const r = await store.createMany('Intake', fresh); return `Imported ${r.filter((y) => y.id).length} cards into Intake.`; },
  };
}
