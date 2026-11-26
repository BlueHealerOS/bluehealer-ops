export type Vec3 = [number, number, number];
export type ReviewStatus = 'open' | 'agent_replied' | 'proposed_resolved' | 'resolved' | 'wont_fix';
export type TraceType = 'user_need' | 'design_input' | 'design_output' | 'verification' | 'validation' | 'risk' | 'risk_control';

export interface Manifest {
  schema: string; bundle_id: string; title: string; classification: 'public-fixture' | 'private'; created: string;
  files: { path: string; kind: string; tool: string; sha256: string; source?: string[]; created: string }[];
}
export interface ReviewItem {
  schema: string; id: string; title: string; status: ReviewStatus; checked: boolean;
  anchor: { type: 'model' | 'trace' | 'calc' | 'file'; file: string; part?: string | null; point?: Vec3 | null; camera?: { position: Vec3; target: Vec3; fov: number } | null; trace_id?: string | null };
  thread: { author: 'santiago' | 'claude'; at: string; text: string; links?: string[] }[];
  rev: number; updated: string;
}
export interface TraceMeta { id: string; type: TraceType; title: string; links: string[]; status: 'draft' | 'approved' }
export interface TraceItem extends TraceMeta { body: string; file: string }
export interface Graph {
  schema: string; generated: string;
  nodes: { id: string; type: TraceType; title: string; file: string }[];
  edges: { from: string; to: string; type: 'traces_to' }[];
  gaps: { id: string; reason: 'no_verification' | 'no_design_output' | 'no_design_input' }[];
}
export interface Bundle {
  manifest: Manifest; graph: Graph | null; trace: TraceItem[]; reviews: ReviewItem[];
  /** Files that could not be read or failed validation. Shown to the user; never fatal for the rest of the bundle. */
  problems: string[];
}
