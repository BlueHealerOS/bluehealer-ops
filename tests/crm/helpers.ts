import { readFileSync } from 'node:fs';
import { parseRankingConfig } from '../../src/crm/model/config.ts';
import type { CrmInteraction, CrmOrg, CrmPerson, RankingConfig } from '../../src/crm/model/types.ts';

const read = <T>(f: string): T => JSON.parse(readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8')) as T;
export const cfg: RankingConfig = parseRankingConfig(read('config/crm-ranking.json'));
export const fx = {
  people: read<CrmPerson[]>('fixtures/crm/people.json'),
  orgs: read<CrmOrg[]>('fixtures/crm/organizations.json'),
  interactions: read<CrmInteraction[]>('fixtures/crm/interactions.json'),
  expected: read<{ today: string; due: { id: number; score: number }[]; top: number[]; mineSantiago: number[]; mineJay: number[]; upcoming: number[]; excluded: number[]; waitingOnThem: number[]; waitingOnMe: number[]; indicators: { investors: number[]; advisors: number[] } }>('fixtures/crm/expected-today.json'),
};
export const person = (o: Partial<CrmPerson> = {}): CrmPerson => ({ id: 1, name: 'Test Person', organizationId: 1, relationshipType: 'advisor', owner: 'Santiago', stage: 'Active', sensitivity: 'Normal', importance: 3, ...o });
export const interaction = (o: Partial<CrmInteraction> = {}): CrmInteraction => ({ id: 1, summary: 'Test', date: '2026-11-01', type: 'email', direction: 'two-way', peopleIds: [1], ...o });
