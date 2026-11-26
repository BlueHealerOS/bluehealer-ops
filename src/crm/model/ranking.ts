import { addDays, diffDays } from '../../domain/time.ts';
import { lastInteractions } from './derived.ts';
import type { CrmInteraction, CrmPerson, Owner, Ranked, RankingConfig, Stage } from './types.ts';

const ELIGIBLE_STAGES: readonly Stage[] = ['Active', 'Intro pending', 'Identified', 'Contacted', 'Meeting held', 'Following up', 'Committed'];
/** Investor stages from Contacted onward: a never-contacted person here is due now. */
const DUE_WHEN_NEW: readonly Stage[] = ['Active', 'Contacted', 'Meeting held', 'Following up', 'Committed'];

export const cadenceDays = (p: CrmPerson, cfg: RankingConfig): number => cfg.cadenceDays[p.relationshipType] ?? cfg.cadenceDays.default;

/** Stage, sensitivity and nothing else. Restricted, Mapped, Targeted, Dormant, Closed, Passed and Do not contact are out. */
export const eligibleForToday = (p: CrmPerson): boolean => ELIGIBLE_STAGES.includes(p.stage) && p.sensitivity === 'Normal';

export const daysSinceTwoWay = (p: CrmPerson, today: string): number | undefined => (p.lastTwoWayAt ? diffDays(today, p.lastTwoWayAt) : undefined);

/** AgreedCheckIn wins when it is later than the last two-way contact. Never-contacted people are due now only in DUE_WHEN_NEW stages. */
export function nextCheckIn(p: CrmPerson, today: string, cfg: RankingConfig): string | undefined {
  if (p.agreedCheckIn && (!p.lastTwoWayAt || p.agreedCheckIn > p.lastTwoWayAt)) return p.agreedCheckIn;
  if (p.lastTwoWayAt) return addDays(p.lastTwoWayAt, cadenceDays(p, cfg));
  return DUE_WHEN_NEW.includes(p.stage) ? today : undefined;
}

export const isDue = (p: CrmPerson, today: string, cfg: RankingConfig): boolean => {
  const n = nextCheckIn(p, today, cfg);
  return n !== undefined && n <= today;
};

/** 8 x Importance + min(40, 20 x days / cadence) + 20 if due. Never-contacted people count as one full cadence. */
export function priorityScore(p: CrmPerson, today: string, cfg: RankingConfig): number {
  const cad = cadenceDays(p, cfg);
  const imp = Math.min(5, Math.max(1, p.importance ?? cfg.defaultImportance));
  const days = daysSinceTwoWay(p, today) ?? cad;
  const w = cfg.weights;
  const score = w.importance * imp + Math.min(w.recencyMax, (w.recencyPerCadence * days) / cad) + (isDue(p, today, cfg) ? w.dueBonus : 0);
  return Math.round(score * 10) / 10;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const shortDate = (d: string): string => `${MONTHS[Number(d.slice(5, 7)) - 1] ?? '?'} ${Number(d.slice(8, 10))}`;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** A plain sentence from the same inputs as the score, enough to act on without opening the profile. */
export function reason(p: CrmPerson, today: string, cfg: RankingConfig, last?: Pick<CrmInteraction, 'summary' | 'date'>): string {
  const cad = cadenceDays(p, cfg);
  const days = daysSinceTwoWay(p, today);
  const next = nextCheckIn(p, today, cfg);
  const parts = [`Importance ${p.importance ?? cfg.defaultImportance}.`];
  parts.push(days === undefined ? `No two-way contact yet, cadence ${cad}.` : `${plural(days, 'day')} since last two-way contact, cadence ${cad}.`);
  if (next !== undefined && next <= today) parts.push(p.agreedCheckIn && next === p.agreedCheckIn ? 'Due: the agreed check-in date has arrived.' : 'Due.');
  else if (next !== undefined) parts.push(`Next check-in ${shortDate(next)}.`);
  if (last) parts.push(`Last: ${last.summary} (${shortDate(last.date)}).`);
  return parts.join(' ');
}

export interface RankOptions { owner?: Owner | 'both'; interactions?: CrmInteraction[] }
export interface RankResult { due: Ranked[]; upcoming: Ranked[]; top: Ranked[] }

/** Due people first by score, then days since contact, then name. Not-due people within upcomingDays go under upcoming by date. */
export function rankToday(people: CrmPerson[], today: string, cfg: RankingConfig, opts: RankOptions = {}): RankResult {
  const owner = opts.owner ?? 'both';
  const lasts = opts.interactions ? lastInteractions(opts.interactions) : new Map<number, CrmInteraction>();
  const rows: Ranked[] = [];
  for (const person of people) {
    if (!eligibleForToday(person) || (owner !== 'both' && person.owner !== owner)) continue;
    const next = nextCheckIn(person, today, cfg);
    if (next === undefined) continue;
    rows.push({
      person, nextCheckIn: next, due: next <= today, score: priorityScore(person, today, cfg), daysSince: daysSinceTwoWay(person, today),
      reason: reason(person, today, cfg, lasts.get(person.id)),
    });
  }
  const days = (r: Ranked) => r.daysSince ?? cadenceDays(r.person, cfg);
  const due = rows.filter((r) => r.due).sort((a, b) => b.score - a.score || days(b) - days(a) || a.person.name.localeCompare(b.person.name));
  const horizon = addDays(today, cfg.upcomingDays);
  const upcoming = rows.filter((r) => !r.due && r.nextCheckIn! <= horizon).sort((a, b) => a.nextCheckIn!.localeCompare(b.nextCheckIn!) || a.person.name.localeCompare(b.person.name));
  return { due, upcoming, top: due.slice(0, cfg.topN) };
}

export type WaitingOn = 'them' | 'me' | null;
/** "Them": my last logged contact was outbound and is older than waitingOnDays. "Me": their last contact was inbound. Only as accurate as the logged interactions. */
export function waitingOn(p: CrmPerson, today: string, cfg: RankingConfig): WaitingOn {
  if (!p.lastTwoWayAt) return null;
  if (p.lastDirection === 'inbound') return 'me';
  if (p.lastDirection === 'outbound' && diffDays(today, p.lastTwoWayAt) > cfg.waitingOnDays) return 'them';
  return null;
}

export function waitingLists(people: CrmPerson[], today: string, cfg: RankingConfig, owner: Owner | 'both' = 'both') {
  const pool = people.filter((p) => eligibleForToday(p) && (owner === 'both' || p.owner === owner));
  return { waitingOnThem: pool.filter((p) => waitingOn(p, today, cfg) === 'them'), waitingOnMe: pool.filter((p) => waitingOn(p, today, cfg) === 'me') };
}
