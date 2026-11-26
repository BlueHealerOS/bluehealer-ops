import type { RankingConfig } from './types.ts';

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

/** Validates the parsed JSON of config/crm-ranking.json. Throws a readable error on any problem. */
export function parseRankingConfig(raw: unknown): RankingConfig {
  const c = raw as Partial<RankingConfig> | null;
  const bad = (m: string): never => { throw new Error(`crm-ranking.json: ${m}`); };
  if (!c || typeof c !== 'object') return bad('not an object');
  if (typeof c.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(c.version)) bad('version must be x.y.z');
  const w = c.weights;
  if (!w || !isNum(w.importance) || !isNum(w.recencyMax) || !isNum(w.recencyPerCadence) || !isNum(w.dueBonus)) bad('weights incomplete');
  const cad = c.cadenceDays;
  if (!cad || !isNum(cad.default) || cad.default < 1) bad('cadenceDays.default missing');
  for (const [k, v] of Object.entries(cad ?? {})) if (!isNum(v) || v < 1) bad(`cadenceDays.${k} must be a positive number`);
  if (!c.breachDays || !isNum(c.breachDays.investor) || !isNum(c.breachDays.advisor)) bad('breachDays incomplete');
  for (const k of ['defaultImportance', 'topN', 'upcomingDays', 'waitingOnDays', 'effectivenessWorkingDays'] as const) if (!isNum(c[k])) bad(`${k} must be a number`);
  if (typeof c.familyInvestorsRestricted !== 'boolean') bad('familyInvestorsRestricted must be boolean');
  if (!Array.isArray(c.sharedDomains) || !Array.isArray(c.placeholderEmailPatterns)) bad('sharedDomains and placeholderEmailPatterns must be arrays');
  for (const p of c.placeholderEmailPatterns ?? []) new RegExp(p); // throws on a bad pattern
  const log = c.changelog;
  if (!Array.isArray(log) || log.length === 0) bad('changelog must have at least one entry');
  if (log?.[log.length - 1]?.version !== c.version) bad('the last changelog entry must match version');
  for (const e of log ?? []) if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date) || !e.change) bad('changelog entries need a date and a change');
  return c as RankingConfig;
}
