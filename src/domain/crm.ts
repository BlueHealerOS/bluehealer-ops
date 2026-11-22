import { DISCOVERY_STAGES, GENERAL_STAGES, INVESTOR_STAGES } from '../schema/choices';
import type { Interaction, PersonFull } from './types';
import { addDays, mondayOf } from './time';
import { isShareable } from '../reminders/rules';

export function stagesFor(relationshipType: string | undefined): readonly string[] {
  if (relationshipType === 'investor') return INVESTOR_STAGES;
  if (['customer discovery', 'payer', 'hospital'].includes(relationshipType ?? '')) return DISCOVERY_STAGES;
  return GENERAL_STAGES;
}

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

export function jaroWinkler(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const range = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const am = new Array<boolean>(a.length).fill(false), bm = new Array<boolean>(b.length).fill(false);
  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    for (let j = Math.max(0, i - range); j <= Math.min(b.length - 1, i + range); j++) {
      if (!bm[j] && a[i] === b[j]) { am[i] = bm[j] = true; matches++; break; }
    }
  }
  if (!matches) return 0;
  let t = 0, k = 0;
  for (let i = 0; i < a.length; i++) if (am[i]) { while (!bm[k]) k++; if (a[i] !== b[k]) t++; k++; }
  const jaro = (matches / a.length + matches / b.length + (matches - t / 2) / matches) / 3;
  let l = 0;
  while (l < 4 && a[l] === b[l]) l++;
  return jaro + l * 0.1 * (1 - jaro);
}

export interface DuplicateMatch { id: number; title: string; reason: 'email' | 'alias' | 'name' }

/** Duplicate detection on normalised email, aliases and name similarity (Jaro-Winkler 0.92 or more). */
export function findDuplicates(cand: { name: string; email?: string }, people: Pick<PersonFull, 'id' | 'Title' | 'Email' | 'Aliases'>[]): DuplicateMatch[] {
  const out: DuplicateMatch[] = [];
  const n = norm(cand.name);
  const e = cand.email?.trim().toLowerCase();
  for (const p of people) {
    if (e && p.Email?.trim().toLowerCase() === e) { out.push({ id: p.id, title: p.Title, reason: 'email' }); continue; }
    const aliases = (p.Aliases ?? '').split(/[;,]/).map(norm).filter(Boolean);
    if (n && aliases.includes(n)) { out.push({ id: p.id, title: p.Title, reason: 'alias' }); continue; }
    if (n && jaroWinkler(n, norm(p.Title)) >= 0.92) out.push({ id: p.id, title: p.Title, reason: 'name' });
  }
  return out;
}

export function investorBoard(people: PersonFull[]) {
  const inv = people.filter((p) => p.RelationshipType === 'investor');
  return INVESTOR_STAGES.map((stage) => ({ stage, people: inv.filter((p) => (p.Stage ?? 'Identified') === stage) }));
}

export function followUpsDueThisWeek(people: PersonFull[], today: string) {
  const end = addDays(mondayOf(today), 6);
  return people.filter((p) => p.NextFollowUp && p.NextFollowUp <= end && isShareable(p));
}

/** Last contact = latest of the imported seed and any logged interaction. */
export function lastContact(p: Pick<PersonFull, 'id' | 'LastContactSeed'>, interactions: Pick<Interaction, 'PersonLookupId' | 'Date'>[]): string | undefined {
  const dates = interactions.filter((i) => i.PersonLookupId === p.id && i.Date).map((i) => i.Date!);
  if (p.LastContactSeed) dates.push(p.LastContactSeed);
  return dates.sort().at(-1);
}

/** Plan the writes for logging one interaction. A follow-up creates a task in the same step. */
export function planInteraction(a: {
  person: Pick<PersonFull, 'id' | 'Title' | 'LastContact' | 'Owner'>;
  date: string; type: string; summary: string; followUpDue?: string; followUpTitle?: string;
}) {
  const person: Record<string, unknown> = {};
  if (!a.person.LastContact || a.date > a.person.LastContact) person.LastContact = a.date;
  if (a.followUpDue) person.NextFollowUp = a.followUpDue;
  return {
    interaction: { Title: `${a.type} with ${a.person.Title}`, Date: a.date, InteractionType: a.type, PersonLookupId: a.person.id, PeopleIds: `;${a.person.id};`, Summary: a.summary },
    person,
    task: a.followUpDue ? {
      Title: a.followUpTitle?.trim() || `Follow up with ${a.person.Title}`, Status: 'Next', Priority: 'P2', DueDate: a.followUpDue,
      ContributionType: 'Relationship', PersonLookupId: a.person.id, Owner: a.person.Owner && a.person.Owner !== 'Unassigned' ? a.person.Owner : undefined, Source: 'manual',
    } : undefined,
  };
}

export interface EmailTemplate { id: string; name: string; subject: string; body: string }
export const EMAIL_TEMPLATES: EmailTemplate[] = [
  { id: 'intro', name: 'Introduction and thanks', subject: 'Thank you, {{firstName}}', body: '<p>Dear {{firstName}},</p><p>Thank you for your time. I would be glad to continue the conversation whenever it suits you.</p><p>With kind regards</p>' },
  { id: 'followup', name: 'Follow-up', subject: 'Following up', body: '<p>Dear {{firstName}},</p><p>I wanted to follow up on our recent conversation and share a brief update. Please let me know if a short call would be helpful.</p><p>With kind regards</p>' },
  { id: 'meeting', name: 'Request a meeting', subject: 'A short conversation?', body: '<p>Dear {{firstName}},</p><p>Would you have twenty minutes in the coming weeks for a short conversation? I am happy to work around your schedule.</p><p>With kind regards</p>' },
];
export function renderTemplate(t: EmailTemplate, person: { Title: string }): { subject: string; body: string } {
  const first = person.Title.split(' ')[0] ?? person.Title;
  const sub = (s: string) => s.replaceAll('{{firstName}}', first);
  return { subject: sub(t.subject), body: sub(t.body) };
}
