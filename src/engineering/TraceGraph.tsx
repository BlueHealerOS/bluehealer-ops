import { useEffect, useMemo, useRef, useState } from 'react';
import cytoscape, { type Core } from 'cytoscape';
import type { Bundle, TraceType } from './types';

const COLUMN: Record<TraceType, number> = { user_need: 0, design_input: 1, design_output: 2, verification: 3, validation: 3, risk: 3, risk_control: 3 };
const COLUMN_LABEL = ['User needs', 'Design inputs', 'Design outputs', 'Verification'];
export const TYPE_LABEL: Record<TraceType, string> = {
  user_need: 'User need', design_input: 'Design input', design_output: 'Design output', verification: 'Verification', validation: 'Validation', risk: 'Risk', risk_control: 'Risk control',
};
const GAP_LABEL = { no_verification: 'No verification', no_design_output: 'No design output', no_design_input: 'No design input' } as const;
const token = (name: string, fallback: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

/** Everything upstream and downstream of one item, following the links of the graph. */
export function chainOf(id: string, edges: { from: string; to: string }[]): Set<string> {
  const seen = new Set([id]);
  const walk = (start: string, next: (e: { from: string; to: string }) => [string, string]) => {
    const stack = [start];
    while (stack.length) {
      const cur = stack.pop()!;
      for (const e of edges) { const [a, b] = next(e); if (a === cur && !seen.has(b)) { seen.add(b); stack.push(b); } }
    }
  };
  walk(id, (e) => [e.from, e.to]); // upstream: an output to its input to its need
  walk(id, (e) => [e.to, e.from]); // downstream: a need to its inputs, outputs and verifications
  return seen;
}

export default function TraceGraph({ bundle }: { bundle: Bundle }) {
  const el = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const graph = bundle.graph;
  const gaps = useMemo(() => new Map((graph?.gaps ?? []).map((g) => [g.id, g.reason])), [graph]);
  const body = useMemo(() => new Map(bundle.trace.map((t) => [t.id, t])), [bundle.trace]);

  useEffect(() => {
    if (!el.current || !graph) return;
    const danger = token('--color-danger', '#b42318'), primary = token('--color-primary', '#2f80c9'), ink = token('--color-ink', '#414042'), hair = token('--color-hairline', '#dcdce0');
    const rows = [0, 0, 0, 0];
    const nodes = [...graph.nodes].sort((a, b) => a.type.localeCompare(b.type) || a.id.localeCompare(b.id)).map((n) => {
      const col = COLUMN[n.type];
      const gap = gaps.get(n.id);
      return { data: { id: n.id, label: `${n.id}\n${n.title}${gap ? `\n[${GAP_LABEL[gap]}]` : ''}`, gap: gap ? 1 : 0 }, position: { x: col * 260, y: 60 + rows[col]!++ * 84 }, classes: gap ? 'gap' : '' };
    });
    const heads = COLUMN_LABEL.map((l, i) => ({ data: { id: `head-${i}`, label: l }, position: { x: i * 260, y: 0 }, classes: 'head', selectable: false, grabbable: false }));
    const cy = cytoscape({
      container: el.current, elements: { nodes: [...heads, ...nodes], edges: graph.edges.map((e, i) => ({ data: { id: `e${i}`, source: e.to, target: e.from } })) },
      layout: { name: 'preset' }, userZoomingEnabled: true, boxSelectionEnabled: false, autoungrabify: true,
      style: [
        { selector: 'node', style: { shape: 'round-rectangle', width: 210, height: 56, 'background-color': '#ffffff', 'border-width': 1.5, 'border-color': hair, label: 'data(label)', 'text-wrap': 'wrap', 'text-max-width': '190px', 'font-size': 11, color: ink, 'text-valign': 'center', 'text-halign': 'center', 'font-family': 'system-ui, sans-serif' } },
        { selector: 'node.head', style: { 'background-opacity': 0, 'border-width': 0, 'font-size': 13, 'font-weight': 700, height: 28, events: 'no' } },
        { selector: 'node.gap', style: { 'border-width': 4, 'border-color': danger, 'border-style': 'solid' } },
        { selector: 'edge', style: { width: 1.5, 'line-color': '#9a9aa3', 'curve-style': 'taxi', 'taxi-direction': 'horizontal', 'target-arrow-shape': 'none' } },
        { selector: '.dim', style: { opacity: 0.22 } },
        { selector: 'node.chain', style: { 'background-color': '#e8f2fb', 'border-color': primary, 'border-width': 3 } },
        { selector: 'node.gap.chain', style: { 'border-color': danger } },
        { selector: 'node.sel', style: { 'border-width': 5, 'border-color': primary } },
        { selector: 'edge.chain', style: { 'line-color': primary, width: 3 } },
      ],
    });
    cy.on('tap', 'node', (ev) => { if (!ev.target.hasClass('head')) setSelected(ev.target.id()); });
    cy.on('tap', (ev) => { if (ev.target === cy) setSelected(null); });
    cy.fit(undefined, 24);
    cyRef.current = cy;
    return () => { cy.destroy(); cyRef.current = null; };
  }, [graph, gaps]);

  useEffect(() => {
    const cy = cyRef.current; if (!cy || !graph) return;
    cy.elements().removeClass('dim chain sel');
    if (!selected) return;
    const chain = chainOf(selected, graph.edges);
    cy.nodes().filter((n) => !n.hasClass('head')).forEach((n) => { if (chain.has(n.id())) n.addClass('chain'); else n.addClass('dim'); });
    cy.edges().forEach((e) => { if (chain.has(e.source().id()) && chain.has(e.target().id())) e.addClass('chain'); else e.addClass('dim'); });
    cy.getElementById(selected).addClass('sel');
  }, [selected, graph]);

  if (!graph) return <p className="card text-sm" role="alert">This bundle has no readable graph.json. Regenerate it with eng-bundle.</p>;
  const sel = selected ? body.get(selected) : null;
  const selNode = selected ? graph.nodes.find((n) => n.id === selected) : null;
  const chain = selected ? chainOf(selected, graph.edges) : null;

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-muted">Click an item to highlight everything upstream and downstream of it. Items with a red outline and a bracketed note have a gap.</p>
      <div className="overflow-x-auto rounded-card border border-hairline bg-surface">
        <div ref={el} role="img" aria-label={`Trace graph with ${graph.nodes.length} items and ${graph.gaps.length} gaps. The list below has the same items.`} style={{ height: 460, minWidth: 900 }} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <section aria-labelledby="items-h" className="card">
          <h2 id="items-h" className="mb-2 text-title">Items</h2>
          <ul className="space-y-1">
            {[...graph.nodes].sort((a, b) => COLUMN[a.type] - COLUMN[b.type] || a.id.localeCompare(b.id)).map((n) => (
              <li key={n.id}>
                <button className="nav-link w-full text-left" aria-pressed={selected === n.id} onClick={() => setSelected(selected === n.id ? null : n.id)}>
                  <span className="min-w-0 flex-1"><span className="block text-xs text-ink-muted">{n.id} · {TYPE_LABEL[n.type]}</span><span className="block">{n.title}</span></span>
                  {gaps.has(n.id) && <span className="chip chip-danger">{GAP_LABEL[gaps.get(n.id)!]}</span>}
                </button>
              </li>
            ))}
          </ul>
        </section>
        <div className="space-y-4">
          <section aria-labelledby="detail-h" className="card" aria-live="polite">
            <h2 id="detail-h" className="mb-2 text-title">{selNode ? selNode.id : 'Details'}</h2>
            {selNode ? (
              <div className="space-y-1 text-sm">
                <p className="font-semibold">{selNode.title}</p>
                <p className="text-ink-muted">{TYPE_LABEL[selNode.type]}{sel ? ` · ${sel.status}` : ''}</p>
                {sel?.body && <p className="whitespace-pre-wrap">{sel.body}</p>}
                <p className="text-ink-muted">Chain: {chain ? [...chain].filter((c) => c !== selNode.id).sort().join(', ') || 'none' : ''}</p>
              </div>
            ) : <p className="text-sm text-ink-muted">Select an item to see its chain.</p>}
          </section>
          <section aria-labelledby="gaps-h" className="card">
            <h2 id="gaps-h" className="mb-2 text-title">Gaps ({graph.gaps.length})</h2>
            {graph.gaps.length === 0 ? <p className="text-sm text-ink-muted">No gaps found.</p> : (
              <ul className="space-y-1 text-sm">{graph.gaps.map((g) => <li key={g.id}><button className="underline" onClick={() => setSelected(g.id)}>{g.id}</button>: {GAP_LABEL[g.reason]}</li>)}</ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
