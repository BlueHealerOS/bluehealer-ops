import { describe, expect, it } from 'vitest';
import { loadBundle, modelFiles } from '../../src/engineering/load';
import { parseFrontMatter } from '../../src/engineering/frontmatter';
import { BundleError } from '../../src/engineering/validate';
import { fixtureFS, memoryFS } from './helpers';

describe('loadBundle with the dummy bracket fixture', () => {
  it('loads manifest, trace, graph and review items', async () => {
    const b = await loadBundle(fixtureFS());
    expect(b.problems).toEqual([]);
    expect(b.manifest.bundle_id).toBe('dummy-bracket');
    expect(b.manifest.classification).toBe('public-fixture');
    expect(b.trace).toHaveLength(9);
    expect(b.reviews.map((r) => r.id)).toEqual(['R-0001', 'R-0002']);
    expect(b.graph?.gaps).toEqual([{ id: 'DEMO-DO-002', reason: 'no_verification' }]);
    expect(modelFiles(b)).toEqual(['models/bracket.glb']);
  });
  it('uses only DEMO prefixes', async () => {
    const b = await loadBundle(fixtureFS());
    for (const t of b.trace) expect(t.id.startsWith('DEMO-')).toBe(true);
  });
});

describe('versions and validation', () => {
  const base = fixtureFS();
  it('refuses an unknown major version with a clear message', async () => {
    const files = { ...base.files, 'manifest.json': base.files['manifest.json']!.replace('manifest/0.1', 'manifest/1.0') };
    await expect(loadBundle(memoryFS(files))).rejects.toThrow('This app reads version 0.x');
    await expect(loadBundle(memoryFS(files))).rejects.toBeInstanceOf(BundleError);
  });
  it('accepts a newer minor version', async () => {
    const files = { ...base.files, 'manifest.json': base.files['manifest.json']!.replace('manifest/0.1', 'manifest/0.2') };
    await expect(loadBundle(memoryFS(files))).resolves.toBeTruthy();
  });
  it('explains a folder without a manifest', async () => {
    await expect(loadBundle(memoryFS({}))).rejects.toThrow('no manifest.json');
  });
  it('reports a bad review file and still loads the rest', async () => {
    const files = { ...base.files, 'review/R-0001.json': '{"schema":"review/1.0"}' };
    const b = await loadBundle(memoryFS(files));
    expect(b.reviews.map((r) => r.id)).toEqual(['R-0002']);
    expect(b.problems[0]).toContain('review version 1.0');
  });
  it('reports a trace file that breaks the schema', async () => {
    const files = { ...base.files, 'trace/demo-x.md': '---\nid: DEMO-X-1\ntype: nonsense\ntitle: x\nlinks: []\nstatus: draft\n---\n' };
    const b = await loadBundle(memoryFS(files));
    expect(b.trace).toHaveLength(9);
    expect(b.problems.join(' ')).toContain('trace schema');
  });
});

describe('front matter', () => {
  it('reads plain, quoted and list values', () => {
    const { meta, body } = parseFrontMatter("---\nid: A-1\ntitle: 'It''s: fine'\nlinks: [X-1, \"Y-2\"]\nempty: []\n---\nBody text\n");
    expect(meta).toEqual({ id: 'A-1', title: "It's: fine", links: ['X-1', 'Y-2'], empty: [] });
    expect(body).toBe('Body text\n');
  });
  it('rejects anything outside the supported subset', () => {
    expect(() => parseFrontMatter('no front matter')).toThrow('missing front matter');
    expect(() => parseFrontMatter('---\nid: A\n')).toThrow('not closed');
    expect(() => parseFrontMatter('---\n  nested: x\n---\n')).toThrow('unsupported');
  });
  it('keeps markup in the body as plain text', () => {
    const { body } = parseFrontMatter('---\nid: A\n---\n<img src=x onerror=alert(1)>\n');
    expect(body).toContain('<img');
  });
});
