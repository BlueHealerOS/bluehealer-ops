// Fixture mode: invented data only, in memory. Loaded by dynamic import and only in dev and e2e builds, never in production.
import type { CrmInteraction, CrmOrg, CrmPerson } from '../model/types.ts';
import { FixtureRepo } from '../graph/fixtureRepo.ts';
import orgs from '../../../fixtures/crm/organizations.json';
import people from '../../../fixtures/crm/people.json';
import interactions from '../../../fixtures/crm/interactions.json';
import expected from '../../../fixtures/crm/expected-today.json';

/** The date the fixtures are written for. Fixture mode freezes the clock here so screenshots and tests are stable. */
export const FIXTURE_NOW = new Date(`${expected.today}T17:00:00Z`);
export function createFixtureRepo() {
  const repo = new FixtureRepo({ orgs: orgs as CrmOrg[], people: people as unknown as CrmPerson[], interactions: interactions as unknown as CrmInteraction[] });
  (globalThis as unknown as { __crmFixtureRepo?: FixtureRepo }).__crmFixtureRepo = repo; // lets e2e tests simulate another founder's save
  return repo;
}
