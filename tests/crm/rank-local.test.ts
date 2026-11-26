import { execFileSync, spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const script = new URL('../../scripts/crm/rank-local.mjs', import.meta.url).pathname;
const sample = new URL('../../fixtures/crm/pilot-sample.csv', import.meta.url).pathname;

describe('rank-local.mjs', () => {
  it('prints the top due list with reasons and the upcoming list for the sample CSV', () => {
    const out = execFileSync('node', [script, sample, '--today', '2026-11-23'], { encoding: 'utf8' });
    expect(out).toContain('Ranking v1.0.0 for 2026-11-23');
    expect(out).toMatch(/1\. Blake Sample .* score 92/);
    expect(out).toMatch(/3\. Gray Sample[\s\S]*4\. Avery Fixture/);
    expect(out).toContain('Upcoming, next 14 days');
  });
  it('filters by owner', () => {
    const out = execFileSync('node', [script, sample, '--today', '2026-11-23', '--owner', 'Jay'], { encoding: 'utf8' });
    expect(out).toContain('Blake Sample');
    expect(out).not.toContain('Emery Fixture');
  });
  it('fails with a readable message on a missing file or bad date', () => {
    expect(spawnSync('node', [script], { encoding: 'utf8' }).status).toBe(2);
    expect(spawnSync('node', [script, sample, '--today', 'tomorrow'], { encoding: 'utf8' }).status).toBe(2);
    expect(spawnSync('node', [script, '/nonexistent.csv'], { encoding: 'utf8' }).status).toBe(1);
  });
});
