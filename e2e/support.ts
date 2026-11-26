import type { Page } from '@playwright/test';
import { provisioned } from '../tests/helpers';
import { applyProvision, planProvision } from '../src/provision/provision';
import { CRM_LISTS } from '../src/crm/schema';
import { etToday } from '../src/domain/time';
import { addDays } from '../src/domain/time';

export const today = () => etToday(new Date());
export { addDays };

/** Fictional fixtures only. Graph is fully mocked; nothing leaves the browser. */
export async function setup(page: Page, opts: { signedIn?: boolean; forbidden?: boolean; seed?: boolean } = {}) {
  const env = await provisioned();
  await applyProvision(env.client, await planProvision(env.client, await env.store.siteId(), CRM_LISTS)); // the four CRM lists, empty
  env.store.invalidate();
  if (opts.seed !== false) {
    const t = today();
    env.fake.seed('Tasks', { Title: 'Prepare benchtop summary', Status: 'Next', Priority: 'P0', Owner: 'Santiago', ThisWeek: true, ContributionType: 'Operations' });
    env.fake.seed('Tasks', { Title: 'Send fictional follow-up', Status: 'Next', Priority: 'P1', Owner: 'Santiago', DueDate: `${addDays(t, -2)}T12:00:00Z`, ContributionType: 'Operations' });
    env.fake.seed('Tasks', { Title: 'Weekly review', Status: 'Next', Priority: 'P2', Owner: 'Santiago', DueDate: `${t}T12:00:00Z`, Recurrence: 'weekly:MO', ContributionType: 'Operations' });
    env.fake.seed('Tasks', { Title: 'Jay only item', Status: 'Next', Priority: 'P1', Owner: 'Jay', DueDate: `${t}T12:00:00Z` });
    env.fake.seed('Tasks', { Title: 'Untyped inbox item', Status: 'Inbox', Owner: 'Santiago' });
    env.fake.seed('Tasks', { Title: 'Waiting on fictional vendor', Status: 'Waiting', Owner: 'Santiago', WaitingOn: 'Example Vendor', WaitingExpected: `${addDays(t, -1)}T12:00:00Z` });
    env.fake.seed('Tasks', { Title: 'Machine proposed task', Status: 'Proposed', Owner: 'Unassigned' });
  }
  env.fake.state.forbidden = opts.forbidden ?? false;
  let graphCalls = 0;
  await page.route('https://graph.microsoft.com/**', async (route) => {
    graphCalls++;
    const req = route.request();
    const h = env.fake.handle(req.method(), req.url(), req.postData() ? JSON.parse(req.postData()!) : undefined, req.headers());
    await route.fulfill({ status: h.status, contentType: 'application/json', headers: h.headers, ...(h.status === 204 ? {} : { body: JSON.stringify(h.body) }) });
  });
  // Any other external request is a test failure waiting to happen: block it.
  await page.route(/^https?:\/\/(?!localhost)/, (route) => route.request().url().startsWith('https://graph.microsoft.com') ? route.fallback() : route.abort());
  if (opts.signedIn !== false) {
    await page.addInitScript(() => {
      sessionStorage.setItem('e2e-account', JSON.stringify({ name: 'Test Founder', username: 'founder@example.test', tenantId: 'e2e' }));
      localStorage.setItem('ops-founder', 'Santiago');
    });
  }
  return { env, graphCalls: () => graphCalls };
}
