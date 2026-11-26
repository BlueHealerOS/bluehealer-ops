import type { BundleFS } from './fs';
import { parseFrontMatter } from './frontmatter';
import { BundleError, checkVersion, validateAgainst } from './validate';
import type { Bundle, Graph, Manifest, ReviewItem, TraceItem, TraceMeta } from './types';

const parseJson = (text: string, where: string): unknown => {
  try { return JSON.parse(text); } catch { throw new BundleError(`${where} is not valid JSON.`); }
};

/** Version problems in the manifest stop the load; a single bad review, trace or graph file is reported and skipped. */
export async function loadBundle(fs: BundleFS): Promise<Bundle> {
  let manifestText: string;
  try { manifestText = await fs.readText('manifest.json'); } catch { throw new BundleError('This folder has no manifest.json. Open a bundle folder.'); }
  const manifestRaw = parseJson(manifestText, 'manifest.json');
  checkVersion('manifest', manifestRaw, 'manifest.json');
  const manifest = validateAgainst<Manifest>('manifest', manifestRaw, 'manifest.json');
  const problems: string[] = [];

  let graph: Graph | null = null;
  try {
    const g = parseJson(await fs.readText('graph.json'), 'graph.json');
    checkVersion('graph', g, 'graph.json');
    graph = validateAgainst<Graph>('graph', g, 'graph.json');
  } catch (e) { problems.push((e as Error).message); }

  const trace: TraceItem[] = [];
  for (const name of (await fs.list('trace')).filter((n) => n.endsWith('.md'))) {
    const where = `trace/${name}`;
    try {
      const { meta, body } = parseFrontMatter(await fs.readText(where));
      const m = validateAgainst<TraceMeta>('trace', meta, where);
      trace.push({ ...m, body, file: where });
    } catch (e) { problems.push((e as Error).message); }
  }

  const reviews: ReviewItem[] = [];
  for (const name of (await fs.list('review')).filter((n) => /^R-\d+\.json$/.test(n))) {
    const where = `review/${name}`;
    try {
      const r = parseJson(await fs.readText(where), where);
      checkVersion('review', r, where);
      reviews.push(validateAgainst<ReviewItem>('review', r, where));
    } catch (e) { problems.push((e as Error).message); }
  }
  reviews.sort((a, b) => a.id.localeCompare(b.id));
  return { manifest, graph, trace, reviews, problems };
}

export const modelFiles = (b: Bundle) => b.manifest.files.filter((f) => f.kind === 'model' && f.path.endsWith('.glb')).map((f) => f.path);

/** Cheap signature of the files the tab watches. A change means "reload the bundle". */
export async function watchSignature(fs: BundleFS): Promise<string> {
  const names = (await fs.list('review')).filter((n) => /^R-\d+\.json$/.test(n));
  const stamps = await Promise.all([...names.map((n) => `review/${n}`), 'manifest.json', 'graph.json'].map(async (p) => `${p}:${await fs.lastModified(p)}`));
  return stamps.join('|');
}
