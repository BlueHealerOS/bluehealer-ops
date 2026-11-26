import { dealDataProblem } from '../../domain/guards.ts';
import { interactionToFields, orgToFields, personToFields } from '../graph/mappers.ts';
import type { CrmRepo } from '../graph/repo.ts';
import { CRM_INTERACTIONS, CRM_ORGANIZATIONS, CRM_PEOPLE } from '../schema.ts';
import { assertConfirm, type ImportPlan } from './plan.ts';

export interface ApplyResult { orgs: number; people: number; interactions: number }

/**
 * Writes the new rows of a plan, through any CrmRepo. It refuses unless the confirmation hash equals the plan's hash, creates organizations,
 * then people, then one "Imported last contact" interaction for each Active person, and never updates or deletes anything.
 * If it stops part-way, running the same import again plans against what now exists and creates only what is missing.
 */
export async function applyImportPlan(plan: ImportPlan, repo: CrmRepo, confirm: string | undefined, existing: { independentId?: number }): Promise<ApplyResult> {
  assertConfirm(plan, confirm);
  for (const p of plan.creates.people) for (const v of [p.name, p.email, p.sourceId]) { const bad = dealDataProblem(v); if (bad) throw new Error(`Refusing ${p.sourceId}: ${bad}`); }
  const orgIds = new Map<string, number>();
  for (const o of plan.creates.orgs) orgIds.set(o.hubPath, (await repo.create(CRM_ORGANIZATIONS, orgToFields({ name: o.name, orgType: o.orgType, domain: o.domain, relationshipToBH: o.relationshipToBH, hubPath: o.hubPath }))).id);
  let independentId = existing.independentId;
  if (plan.needsIndependent && independentId === undefined) independentId = (await repo.create(CRM_ORGANIZATIONS, orgToFields({ name: 'Independent', orgType: 'other' }))).id;
  let interactions = 0;
  for (const p of plan.creates.people) {
    const organizationId = 'hubPath' in p.org ? orgIds.get(p.org.hubPath)! : 'existingId' in p.org ? p.org.existingId : independentId!;
    const row = await repo.create(CRM_PEOPLE, personToFields({
      name: p.name, organizationId, relationshipType: p.relationshipType, owner: p.owner, email: p.email, importance: p.importance, stage: p.stage, sensitivity: p.sensitivity, sourceId: p.sourceId,
      ...(p.lastContact ? { lastTwoWayAt: p.lastContact, lastTouchAt: p.lastContact, lastDirection: 'two-way' as const } : {}),
    }));
    if (p.lastContact) {
      await repo.create(CRM_INTERACTIONS, interactionToFields({ summary: 'Imported last contact', date: p.lastContact, type: 'email', direction: 'two-way', peopleIds: [row.id], organizationId, sensitivity: p.sensitivity }));
      interactions++;
    }
  }
  return { orgs: plan.creates.orgs.length + (plan.needsIndependent && existing.independentId === undefined ? 1 : 0), people: plan.creates.people.length, interactions };
}
