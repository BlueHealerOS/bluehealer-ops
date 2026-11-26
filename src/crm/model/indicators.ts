import { daysSinceTwoWay, eligibleForToday, nextCheckIn } from './ranking.ts';
import type { CrmPerson, RankingConfig } from './types.ts';

export interface Indicators { investors: CrmPerson[]; advisors: CrmPerson[] }

/**
 * Zero-breach indicators. A breach is an eligible person whose check-in is more than 0 days past, with more than the
 * limit of days since two-way contact and no future agreed check-in (D26). Investors over 14 days; advisors and clinical advisors over 30.
 */
export function indicators(people: CrmPerson[], today: string, cfg: RankingConfig): Indicators {
  const breach = (p: CrmPerson, limit: number) => {
    const next = nextCheckIn(p, today, cfg), days = daysSinceTwoWay(p, today);
    return next !== undefined && next < today && days !== undefined && days > limit && !(p.agreedCheckIn && p.agreedCheckIn > today);
  };
  const pool = people.filter(eligibleForToday);
  return {
    investors: pool.filter((p) => p.relationshipType === 'investor' && breach(p, cfg.breachDays.investor)),
    advisors: pool.filter((p) => (p.relationshipType === 'advisor' || p.relationshipType === 'clinical advisor') && breach(p, cfg.breachDays.advisor)),
  };
}
