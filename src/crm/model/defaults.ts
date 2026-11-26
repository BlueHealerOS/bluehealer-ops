import { addDays, addMonthsClamped } from '../../domain/time.ts';
import type { Direction, InteractionType, Sensitivity } from './types.ts';

export const INTERACTION_TYPES: readonly InteractionType[] = ['email', 'call', 'meeting', 'event', 'message', 'broadcast'];
export const DIRECTIONS: readonly Direction[] = ['outbound', 'inbound', 'two-way'];

/** Two-way for call, meeting and event; outbound for email, message and broadcast. */
export const defaultDirection = (t: InteractionType): Direction => (t === 'call' || t === 'meeting' || t === 'event' ? 'two-way' : 'outbound');

/** The most restrictive wins. */
export const mostRestrictive = (xs: (Sensitivity | undefined)[]): Sensitivity => (xs.includes('Restricted') ? 'Restricted' : 'Normal');

/** Quick snooze choices: 1 week, 2 weeks, 1 month, first of next month. The picker adds "after a date you choose". */
export function quickSnoozeDates(today: string): { label: string; date: string }[] {
  return [
    { label: '1 week', date: addDays(today, 7) },
    { label: '2 weeks', date: addDays(today, 14) },
    { label: '1 month', date: addMonthsClamped(today, 1) },
    { label: 'First of next month', date: addMonthsClamped(today, 1, 1) },
  ];
}
