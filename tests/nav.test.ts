import { describe, expect, it } from 'vitest';
import { DEFAULT_VIEWS } from '../src/domain/filters';
import { QUEUES, queueLabel, statusLabel, triageStateLabel } from '../src/ui/nav';

describe('display labels', () => {
  it('shows Suggested for the stored Proposed value and leaves other values alone', () => {
    expect(statusLabel('Proposed')).toBe('Suggested');
    expect(triageStateLabel('Proposed')).toBe('Suggested');
    expect(statusLabel('Next')).toBe('Next');
    expect(statusLabel(undefined)).toBe('');
  });
  it('keeps route keys unchanged while renaming labels', () => {
    expect(QUEUES.map((q) => q[0])).toContain('hygiene');
    expect(QUEUES.map((q) => q[0])).toContain('proposed');
    expect(queueLabel('hygiene')).toBe('Needs attention');
    expect(queueLabel('proposed')).toBe('Suggested');
    expect(DEFAULT_VIEWS.find((v) => v.path === '/tasks/proposed')?.name).toBe('Suggested');
  });
});
