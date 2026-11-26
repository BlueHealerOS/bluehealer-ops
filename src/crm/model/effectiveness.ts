import { addDays, mondayOf, weekdayOf } from '../../domain/time.ts';
import { deriveSystemFields } from './derived.ts';
import { rankToday } from './ranking.ts';
import type { CrmInteraction, CrmPerson, RankingConfig } from './types.ts';

const isWorkday = (d: string) => { const w = weekdayOf(d); return w >= 1 && w <= 5; };
export function addWorkingDays(d: string, n: number): string {
  let cur = d;
  for (let left = n; left > 0;) { cur = addDays(cur, 1); if (isWorkday(cur)) left--; }
  return cur;
}

export interface WeekEffectiveness { weekStart: string; top: number; contacted: number; share: number | null }

/**
 * APPROXIMATE. Replays the formula for each working day using the interactions dated before that day, then counts how many of
 * that day's Top N had a non-broadcast interaction within the next working days. It uses current Importance, Stage and agreed dates,
 * so it is not a record of what was shown. Reports the last `weeks` complete weeks, newest first. Days whose window has not closed are skipped.
 */
export function effectiveness(people: CrmPerson[], interactions: CrmInteraction[], today: string, cfg: RankingConfig, weeks = 4): WeekEffectiveness[] {
  const out: WeekEffectiveness[] = [];
  for (let k = 1; k <= weeks; k++) {
    const weekStart = addDays(mondayOf(today), -7 * k);
    let top = 0, contacted = 0;
    for (let i = 0; i < 5; i++) {
      const day = addDays(weekStart, i);
      const end = addWorkingDays(day, cfg.effectivenessWorkingDays);
      if (end >= today) continue;
      const before = interactions.filter((x) => x.date < day);
      const asOf = people.map((p) => ({ ...p, ...deriveSystemFields(p.id, before) }));
      for (const r of rankToday(asOf, day, cfg).top) {
        top++;
        if (interactions.some((x) => x.type !== 'broadcast' && x.date >= day && x.date <= end && x.peopleIds.includes(r.person.id))) contacted++;
      }
    }
    out.push({ weekStart, top, contacted, share: top ? Math.round((contacted / top) * 100) / 100 : null });
  }
  return out;
}
