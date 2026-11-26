import { validate_manifest, validate_review, validate_graph, validate_trace } from './schemas/validators.generated.js';

type Kind = 'manifest' | 'review' | 'graph' | 'trace';
type V = ((d: unknown) => boolean) & { errors?: { instancePath: string; message?: string }[] | null };
const validators: Record<Kind, V> = { manifest: validate_manifest as V, review: validate_review as V, graph: validate_graph as V, trace: validate_trace as V };

/** Major version of the schemas this app reads. A bundle with another major version is refused. */
export const SUPPORTED_MAJOR = 0;

export class BundleError extends Error {}

/** Checks the `schema` field first, so an unknown version gets a clear message instead of a list of field errors. */
export function checkVersion(kind: Exclude<Kind, 'trace'>, obj: unknown, where: string): void {
  const s = typeof obj === 'object' && obj !== null ? (obj as { schema?: unknown }).schema : undefined;
  const m = typeof s === 'string' ? /^([a-z]+)\/(\d+)\.(\d+)$/.exec(s) : null;
  if (!m || m[1] !== kind) throw new BundleError(`${where} is not a ${kind} file (its schema field is ${JSON.stringify(s ?? null)}).`);
  if (Number(m[2]) !== SUPPORTED_MAJOR) {
    throw new BundleError(`${where} uses ${kind} version ${m[2]}.${m[3]}. This app reads version ${SUPPORTED_MAJOR}.x. Update the app or regenerate the bundle with a matching version.`);
  }
}

export function validateAgainst<T>(kind: Kind, obj: unknown, where: string): T {
  const v = validators[kind];
  if (!v(obj)) {
    const first = (v.errors ?? []).slice(0, 3).map((e) => `${e.instancePath || '/'} ${e.message ?? 'is invalid'}`).join('; ');
    throw new BundleError(`${where} does not match the ${kind} schema: ${first}`);
  }
  return obj as T;
}
