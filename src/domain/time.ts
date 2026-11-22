// All business dates are America/New_York calendar days, written YYYY-MM-DD.
const TZ = 'America/New_York';

const partsFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', weekday: 'short',
});

export function etParts(now: Date): { date: string; hour: number; weekday: number } {
  const p: Record<string, string> = {};
  for (const x of partsFmt.formatToParts(now)) p[x.type] = x.value;
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday ?? '');
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), weekday: wd };
}
export const etToday = (now: Date) => etParts(now).date;

const toUtc = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
const fromUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function addDays(d: string, n: number): string {
  return fromUtc(toUtc(d) + n * 86_400_000);
}
export function diffDays(a: string, b: string): number {
  return Math.round((toUtc(a) - toUtc(b)) / 86_400_000);
}
/** 0 = Sunday. */
export const weekdayOf = (d: string) => new Date(toUtc(d)).getUTCDay();
/** Monday of the week containing d. */
export function mondayOf(d: string): string {
  const w = weekdayOf(d);
  return addDays(d, w === 0 ? -6 : 1 - w);
}
export function addMonthsClamped(d: string, months: number, dayOfMonth?: number): string {
  const y = Number(d.slice(0, 4)), m = Number(d.slice(5, 7)) - 1, day = dayOfMonth ?? Number(d.slice(8, 10));
  const total = y * 12 + m + months;
  const ny = Math.floor(total / 12), nm = total % 12;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return `${ny}-${String(nm + 1).padStart(2, '0')}-${String(Math.min(day, last)).padStart(2, '0')}`;
}

/** Quiet hours 21:00 to 07:00 Eastern. */
export function inQuietHours(now: Date): boolean {
  const h = etParts(now).hour;
  return h >= 21 || h < 7;
}

/** SharePoint date-only values: write noon UTC so no timezone west of UTC+12 shifts the day. */
export const toGraphDate = (d: string) => `${d}T12:00:00Z`;
export const fromGraphDate = (v: unknown): string | undefined => (typeof v === 'string' && v.length >= 10 ? v.slice(0, 10) : undefined);
