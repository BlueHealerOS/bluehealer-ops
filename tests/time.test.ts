import { describe, expect, it } from 'vitest';
import { addDays, addMonthsClamped, diffDays, etParts, inQuietHours, mondayOf } from '../src/domain/time';

describe('time (America/New_York)', () => {
  it('reads Eastern date and hour across the winter offset', () => {
    expect(etParts(new Date('2026-12-01T04:30:00Z'))).toMatchObject({ date: '2026-11-30', hour: 23 });
    expect(etParts(new Date('2026-12-01T12:30:00Z'))).toMatchObject({ date: '2026-12-01', hour: 7, weekday: 2 });
  });
  it('reads Eastern date across the summer offset', () => {
    expect(etParts(new Date('2027-07-01T03:59:00Z'))).toMatchObject({ date: '2027-06-30', hour: 23 });
  });
  it('applies quiet hours 21:00 to 07:00', () => {
    expect(inQuietHours(new Date('2026-12-01T02:00:00Z'))).toBe(true); // 21:00 ET
    expect(inQuietHours(new Date('2026-12-01T11:59:00Z'))).toBe(true); // 06:59 ET
    expect(inQuietHours(new Date('2026-12-01T12:00:00Z'))).toBe(false); // 07:00 ET
    expect(inQuietHours(new Date('2026-12-01T01:59:00Z'))).toBe(false); // 20:59 ET
  });
  it('does day arithmetic', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(diffDays('2027-01-02', '2026-12-30')).toBe(3);
    expect(mondayOf('2026-11-22')).toBe('2026-11-16'); // Sunday belongs to the previous week
    expect(mondayOf('2026-11-23')).toBe('2026-11-23');
    expect(addMonthsClamped('2027-01-31', 1)).toBe('2027-02-28');
    expect(addMonthsClamped('2026-11-15', 1, 31)).toBe('2026-12-31');
  });
});
