import { applyProvision, planProvision } from '../../src/provision/provision.ts';
import { FixtureRepo } from '../../src/crm/graph/fixtureRepo.ts';
import { GraphRepo } from '../../src/crm/graph/graphRepo.ts';
import { interactionToFields, orgToFields, personToFields } from '../../src/crm/graph/mappers.ts';
import type { CrmRepo } from '../../src/crm/graph/repo.ts';
import { CrmService } from '../../src/crm/service.ts';
import { CRM_INTERACTIONS, CRM_LISTS, CRM_ORGANIZATIONS, CRM_PEOPLE, type CrmListName } from '../../src/crm/schema.ts';
import { provisioned } from '../helpers.ts';
import { cfg, fx } from './helpers.ts';

export interface Harness { name: string; repo: CrmRepo; touch(list: CrmListName, id: number): void; setTasksList(on: boolean): void; service: CrmService; raw?: ReturnType<typeof provisioned> extends Promise<infer E> ? E : never }

/** Monday 2026-11-23, midday Eastern. */
export const NOW = new Date('2026-11-23T17:00:00Z');

export async function makeFixtureHarness(): Promise<Harness> {
  const repo = new FixtureRepo();
  return { name: 'fixture repo', repo, touch: (l, i) => repo.touch(l, i), setTasksList: (on) => { repo.hasTasksList = on; }, service: new CrmService(repo, cfg, () => NOW) };
}
/** The Graph repository over the in-memory fake Graph, with the Phase 1 lists and the CRM lists provisioned. */
export async function makeGraphHarness(): Promise<Harness> {
  const env = await provisioned();
  const plan = await planProvision(env.client, await env.store.siteId(), CRM_LISTS);
  await applyProvision(env.client, plan);
  env.store.invalidate();
  const repo = new GraphRepo(env.store);
  let tasksOn = true;
  return {
    name: 'graph repo', repo, raw: env,
    touch: (l, i) => env.fake.touch(l, i),
    setTasksList: (on) => {
      if (on === tasksOn) return;
      tasksOn = on;
      const lists = env.fake.state.lists;
      if (!on) { const i = lists.findIndex((x) => x.displayName === 'Tasks'); lists.splice(i, 1); } else lists.push({ id: 'list-tasks', displayName: 'Tasks', columns: [], items: [], nextId: 1 });
      env.store.invalidate();
    },
    service: new CrmService(repo, cfg, () => NOW),
  };
}
export const harnesses = [['fixture repo', makeFixtureHarness], ['graph repo', makeGraphHarness]] as const;

/** Writes the 4 organizations, 20 people and 40 interactions through the repository, in id order, so ids match the fixtures. */
export async function seed(repo: CrmRepo): Promise<void> {
  for (const o of fx.orgs) { const r = await repo.create(CRM_ORGANIZATIONS, orgToFields(o)); if (r.id !== o.id) throw new Error('seed: organization id drifted'); }
  for (const p of fx.people) { const r = await repo.create(CRM_PEOPLE, personToFields(p)); if (r.id !== p.id) throw new Error('seed: person id drifted'); }
  for (const i of fx.interactions) { const r = await repo.create(CRM_INTERACTIONS, interactionToFields(i)); if (r.id !== i.id) throw new Error('seed: interaction id drifted'); }
}
