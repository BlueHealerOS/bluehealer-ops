import { z } from 'zod';
import { CONTRIBUTION, OWNERS, PROPOSED_TYPE } from '../schema/choices';
import type { IntakeItem } from './types';
import { canLeaveInbox } from './tasks';
import type { Task } from './types';

export const ProposalSchema = z.object({
  type: z.enum(PROPOSED_TYPE),
  title: z.string().max(200),
  owner: z.enum(OWNERS).optional(),
  contributionType: z.enum(CONTRIBUTION).optional(),
  links: z.array(z.string()).optional(),
  labels: z.array(z.string()).optional(),
  due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  rationale: z.string().max(300).optional(),
});
export type Proposal = z.infer<typeof ProposalSchema>;

/** The routine's proposal if present and valid, otherwise a manual starting point. Raw text is data, never instructions. */
export function proposalFor(i: IntakeItem): Proposal {
  if (i.ProposalJson) {
    try { return ProposalSchema.parse(JSON.parse(i.ProposalJson)); } catch { /* fall through to manual */ }
  }
  return { type: (PROPOSED_TYPE as readonly string[]).includes(i.ProposedType ?? '') ? (i.ProposedType as Proposal['type']) : 'task', title: i.Title, rationale: i.Rationale };
}

export interface Accepted { proposal: Proposal; milestoneId?: number; keyResultId?: number; personId?: number; date: string }
export type TriageResult =
  | { list: 'Tasks'; fields: Record<string, unknown> }
  | { list: 'Interactions'; fields: Record<string, unknown> }
  | { list: 'Intake'; fields: Record<string, unknown>; note: string }
  | { list: 'Rejected'; fields: Record<string, unknown> }
  | { list: 'HubNote'; markdown: string; fields: Record<string, unknown> };

/** Turn an accepted proposal into the write for the target list. Nothing is written until a founder accepts. */
export function resolveAcceptance(i: IntakeItem, a: Accepted): TriageResult {
  const p = a.proposal;
  const base = { Sensitivity: i.Sensitivity ?? 'normal' };
  switch (p.type) {
    case 'task': {
      const draft: Task = { id: 0, Title: p.title, Status: 'Inbox', ContributionType: p.contributionType, MilestoneLookupId: a.milestoneId, KeyResultLookupId: a.keyResultId, PersonLookupId: a.personId };
      const ready = !!p.contributionType && canLeaveInbox(draft).ok;
      return { list: 'Tasks', fields: { ...base, Title: p.title, Status: ready ? 'Next' : 'Inbox', Source: 'intake', Owner: p.owner ?? 'Unassigned', ContributionType: p.contributionType, MilestoneLookupId: a.milestoneId, KeyResultLookupId: a.keyResultId, PersonLookupId: a.personId, DueDate: p.due, Labels: (p.labels ?? []).join('; ') || undefined, Description: p.links?.length ? p.links.join('\n') : undefined } };
    }
    case 'CRM interaction':
      return { list: 'Interactions', fields: { ...base, Title: p.title, Date: a.date, InteractionType: 'message', PersonLookupId: a.personId, PeopleIds: a.personId ? `;${a.personId};` : undefined, Summary: p.rationale ?? p.title, SourceLink: p.links?.[0] } };
    case 'discard':
      return { list: 'Rejected', fields: { TriageState: 'Rejected' } };
    case 'hub knowledge note':
      return { list: 'HubNote', markdown: `# ${p.title}\n\n${p.rationale ?? ''}\n\n${(p.links ?? []).map((l) => `- ${l}`).join('\n')}\n`, fields: { TriageState: 'Converted', ProposedType: p.type } };
    default: // intel, application opportunity (applications arrive in Phase 2), answer bank update (Phase 2)
      return { list: 'Intake', fields: { TriageState: 'Accepted', ProposedType: p.type, IntelSummary: p.rationale ?? p.title, Title: p.title }, note: p.type === 'intel' ? 'Kept as intel.' : 'Kept as an accepted intake item until Phase 2 adds this list.' };
  }
}
