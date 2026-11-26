import type { CrmInteraction, CrmPerson, Direction } from './types.ts';

export interface SystemFields { lastTwoWayAt?: string; lastTouchAt?: string; lastDirection?: Direction }

const later = (a: CrmInteraction, b: CrmInteraction) => (a.date !== b.date ? (a.date > b.date ? a : b) : a.id > b.id ? a : b);

/**
 * System fields for one person from the interactions that include them.
 * LastTouchAt is the latest interaction of any type. LastTwoWayAt and LastDirection come from the latest
 * non-broadcast interaction (D29: broadcasts never reset the check-in clock).
 */
export function deriveSystemFields(personId: number, interactions: CrmInteraction[]): SystemFields {
  let touch: CrmInteraction | undefined, twoWay: CrmInteraction | undefined;
  for (const i of interactions) {
    if (!i.peopleIds.includes(personId)) continue;
    touch = touch ? later(touch, i) : i;
    if (i.type !== 'broadcast') twoWay = twoWay ? later(twoWay, i) : i;
  }
  return { lastTouchAt: touch?.date, lastTwoWayAt: twoWay?.date, lastDirection: twoWay?.direction };
}

/** Latest non-broadcast interaction per person, for reason text. */
export function lastInteractions(interactions: CrmInteraction[]): Map<number, CrmInteraction> {
  const out = new Map<number, CrmInteraction>();
  for (const i of interactions) {
    if (i.type === 'broadcast') continue;
    for (const p of i.peopleIds) { const cur = out.get(p); out.set(p, cur ? later(cur, i) : i); }
  }
  return out;
}

/** People whose stored system fields differ from the interactions (a Needs attention item). */
export function staleSystemFields(people: CrmPerson[], interactions: CrmInteraction[]): { person: CrmPerson; expected: SystemFields }[] {
  const out: { person: CrmPerson; expected: SystemFields }[] = [];
  for (const person of people) {
    const e = deriveSystemFields(person.id, interactions);
    if (e.lastTwoWayAt !== person.lastTwoWayAt || e.lastTouchAt !== person.lastTouchAt || e.lastDirection !== person.lastDirection) out.push({ person, expected: e });
  }
  return out;
}
