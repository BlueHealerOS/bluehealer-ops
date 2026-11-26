import type { CrmOrg, CrmPerson, RankingConfig } from './types.ts';

/** Lowercased email, or undefined for blanks and placeholders (so they never match each other). */
export function normalizeEmail(e: string | undefined, cfg: Pick<RankingConfig, 'placeholderEmailPatterns'>): string | undefined {
  const v = (e ?? '').trim().toLowerCase();
  if (!v) return undefined;
  if (cfg.placeholderEmailPatterns.some((p) => new RegExp(p, 'i').test(v))) return undefined;
  return v.includes('@') ? v : undefined;
}

const TITLES = new Set(['dr', 'prof', 'mr', 'mrs', 'ms', 'md', 'phd', 'jr', 'sr', 'ii', 'iii', 'mba', 'mph']);
/** Lowercase, no accents or punctuation, "Last, First" reordered, titles and suffixes dropped. */
export function normalizeName(n: string): string {
  let s = n.trim();
  const comma = s.split(',');
  if (comma.length === 2 && comma[0]!.trim() && comma[1]!.trim()) s = `${comma[1]!.trim()} ${comma[0]!.trim()}`;
  s = s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ');
  return s.split(/\s+/).filter((t) => t && !TITLES.has(t)).join(' ');
}

export function normalizeDomain(d: string | undefined): string | undefined {
  const v = (d ?? '').trim().toLowerCase().replace(/^[a-z]+:\/\//, '').replace(/^www\./, '').split(/[/?#]/)[0] ?? '';
  return v || undefined;
}

export interface PersonDuplicate { id: number; name: string; reason: 'email' | 'name and organization' }

/** Duplicate check for a person about to be created: exact normalized email, then same normalized name in the same organization. */
export function findPersonDuplicates(cand: { name: string; email?: string; organizationId?: number; id?: number }, people: CrmPerson[], cfg: RankingConfig): PersonDuplicate[] {
  const e = normalizeEmail(cand.email, cfg), n = normalizeName(cand.name);
  const out: PersonDuplicate[] = [];
  for (const p of people) {
    if (p.id === cand.id) continue;
    if (e && normalizeEmail(p.email, cfg) === e) out.push({ id: p.id, name: p.name, reason: 'email' });
    else if (n && normalizeName(p.name) === n && cand.organizationId !== undefined && p.organizationId === cand.organizationId) out.push({ id: p.id, name: p.name, reason: 'name and organization' });
  }
  return out;
}

export interface DuplicatePair<T> { a: T; b: T; reason: string; suggestionOnly: boolean }

/** Every possible duplicate pair among existing people. One pair per two records, email first. */
export function duplicatePeople(people: CrmPerson[], cfg: RankingConfig): DuplicatePair<CrmPerson>[] {
  const out: DuplicatePair<CrmPerson>[] = [];
  for (let i = 0; i < people.length; i++) for (let j = i + 1; j < people.length; j++) {
    const a = people[i]!, b = people[j]!;
    const ea = normalizeEmail(a.email, cfg);
    if (ea && ea === normalizeEmail(b.email, cfg)) out.push({ a, b, reason: 'same email', suggestionOnly: false });
    else if (a.organizationId === b.organizationId && normalizeName(a.name) && normalizeName(a.name) === normalizeName(b.name)) out.push({ a, b, reason: 'same name in the same organization', suggestionOnly: false });
  }
  return out;
}

/** Organizations sharing a domain are shown as a suggestion only, never for the shared domains listed in config. */
export function duplicateOrgs(orgs: CrmOrg[], cfg: RankingConfig): DuplicatePair<CrmOrg>[] {
  const shared = new Set(cfg.sharedDomains.map((d) => normalizeDomain(d)));
  const out: DuplicatePair<CrmOrg>[] = [];
  for (let i = 0; i < orgs.length; i++) for (let j = i + 1; j < orgs.length; j++) {
    const a = orgs[i]!, b = orgs[j]!, da = normalizeDomain(a.domain);
    if (da && da === normalizeDomain(b.domain) && !shared.has(da)) out.push({ a, b, reason: 'same domain', suggestionOnly: true });
  }
  return out;
}
