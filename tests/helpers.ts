import { GraphClient } from '../src/graph/client';
import { OpsStore } from '../src/graph/store';
import { createFakeGraph } from './support/fakeGraph';
import { LISTS } from '../src/schema/lists';
import { applyProvision, planProvision } from '../src/provision/provision';

export function makeEnv(init = {}) {
  const fake = createFakeGraph(init);
  const client = new GraphClient({ getToken: async () => 'test-token', fetchFn: fake.fetchFn, sleep: async () => {} });
  const store = new OpsStore(client, { siteHostname: 'tenant.example.test', sitePath: '/sites/Ops' });
  return { fake, client, store };
}
export async function provisioned(init = {}) {
  const env = makeEnv(init);
  const plan = await planProvision(env.client, await env.store.siteId(), LISTS);
  await applyProvision(env.client, plan);
  env.store.invalidate();
  return env;
}
