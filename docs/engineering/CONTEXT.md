# Engineering workspace: specification for the MVP

Public copy of the specification. Private repository names, internal decision text and personal paths are left out; the technical content is unchanged.

## 1. Purpose
Add an Engineering workspace to bluehealer-ops. The tab is for seeing and reading engineering work (3D models, trace graph, review items). Claude Code is for editing and running tools. Both work on the same local folder at the same time: the tab writes review comments and checkbox states, Claude Code reads them, acts, and replies.

## 2. Design decisions
- Shell: a top bar with workspace tabs (Tasks, Engineering, CRM, More) replaces the sidebar-only shell. The left sidebar stays and shows the sections of the active workspace. Earlier shell rules do not bind where they conflict with this specification.
- Hosting: the app stays on GitHub Pages from this public repository, with the minimum necessary in it: application code, the schemas and one invented fixture. Anything sensitive or proprietary lives in private repositories or in the company document sites, and reaches the tab only as a local folder opened on the owner's computer.
- Skills: two in-house skills, `eng-bundle` and `eng-review`, run in the owner's private engineering tools sandbox provided they meet the safety rules in section 8.

## 3. Where things live
- This public repository: code, JSON schemas, `fixtures/dummy-bracket/` (invented data only).
- A private repository (later, not in the MVP): real bundles, trace files and review items.
- Company document sites: released documents and licensed standards. The tab never calls them for engineering data in the MVP.
- The owner's computer: the opened folder. Nothing in it is uploaded.

## 4. How it works
1. Claude Code runs `eng-bundle`, which writes a bundle folder (models, calculations, trace files, manifest, graph).
2. The owner opens the folder in the Engineering tab, inspects the model, drops pins and writes review items.
3. Claude Code runs `eng-review`, which reads open items, does the work, replies in the item file and proposes resolved.
4. The tab notices the changed files and shows the reply. Only the owner sets Resolved.

## 5. Bundle layout
```
<bundle>/
  manifest.json          list of every file, with type, tool, hash and time
  models/*.glb           display meshes (STEP stays upstream; GLB only in the MVP)
  calcs/*.json           hand calculation results with units
  trace/*.md             one trace item per file, YAML front matter
  graph.json             generated from trace/ and manifest.json; never edited by hand
  review/<id>.json       one review item per file
```
All schemas carry `"schema": "<name>/0.1"`. Breaking changes raise the version; the tab refuses unknown major versions with a clear message.

## 6. Schemas v0.1 (to be written as JSON Schema in `src/engineering/schemas/`)

### manifest/0.1
```json
{
  "schema": "manifest/0.1",
  "bundle_id": "dummy-bracket",
  "title": "Dummy L-bracket (invented data)",
  "classification": "public-fixture | private",
  "created": "2026-11-25T14:02:00-05:00",
  "files": [
    { "path": "models/bracket.glb", "kind": "model", "tool": "build123d", "sha256": "...", "source": ["src/bracket.py"], "created": "..." }
  ]
}
```
`kind` is one of `model`, `calc`, `fea`, `trace`, `graph`, `plot`, `doc`. `source` lists the inputs a file was derived from; it drives staleness and provenance later.

### review/0.1
```json
{
  "schema": "review/0.1",
  "id": "R-0001",
  "title": "Root fillet looks tight",
  "status": "open | agent_replied | proposed_resolved | resolved | wont_fix",
  "checked": false,
  "anchor": {
    "type": "model | trace | calc | file",
    "file": "models/bracket.glb",
    "part": "bracket-arm",
    "point": [12.0, 0.0, 4.5],
    "camera": { "position": [80, 60, 80], "target": [0, 0, 0], "fov": 45 },
    "trace_id": null
  },
  "thread": [
    { "author": "santiago", "at": "2026-11-25T14:10:00-05:00", "text": "Check the fillet radius against the hand calc." },
    { "author": "claude", "at": "2026-11-25T14:20:00-05:00", "text": "Raised the radius to 3 mm and regenerated the model; see calc C-002.", "links": ["calcs/c-002.json"] }
  ],
  "rev": 3,
  "updated": "2026-11-25T14:20:00-05:00"
}
```
Rules: `rev` increases by one on every write, by either side. Only the `santiago` author may set `resolved` or `wont_fix`; Claude may set `agent_replied` or `proposed_resolved`. `checked` is the checkbox in the queue and means "I have looked at this", not "resolved".

### trace item front matter (trace/*.md)
```yaml
---
id: DEMO-DI-001
type: user_need | design_input | design_output | verification | validation | risk | risk_control
title: Safety factor of 2 or more on yield
links: [DEMO-UN-001]
status: draft | approved
---
Free text body.
```
`links` point upstream (an input links to its need, an output to its input, a verification to the output it verifies).

### graph/0.1
```json
{
  "schema": "graph/0.1",
  "generated": "...",
  "nodes": [ { "id": "DEMO-DI-001", "type": "design_input", "title": "...", "file": "trace/demo-di-001.md" } ],
  "edges": [ { "from": "DEMO-DI-001", "to": "DEMO-UN-001", "type": "traces_to" } ],
  "gaps": [ { "id": "DEMO-DO-002", "reason": "no_verification" } ]
}
```
Gap rules in v0.1: a design output with no verification; a design input with no design output; a user need with no design input.

## 7. Viewer stack
- 3D: three.js with GLTFLoader, OrbitControls, one clipping plane, point-to-point measure, part tree from GLB node names, pins rendered as HTML overlays. Clicking a pin restores its saved camera.
- Graph: Cytoscape.js, four-column layout (need, input, output, verification), click to highlight everything upstream and downstream, gaps outlined in the danger colour.
- Both bundled with the app through npm and Vite, pinned versions, no CDN at runtime.
- Deferred: STEP in the browser (occt-import-js is LGPL-2.1; licence review first), FEA fields (vtk.js), KiCanvas, evidence and coupling panels.

## 8. Safety rules
### Web app
- The Engineering workspace makes no network requests. Engineering code must not call `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource` or `navigator.sendBeacon`; a lint rule or test enforces it.
- A Content Security Policy meta tag for the whole app: `default-src 'self'`; `connect-src` limited to `'self'` and the Microsoft sign-in and Graph endpoints the app already uses; no third-party script or font origins.
- Folder access only through the File System Access API after a user gesture; the folder handle is kept in IndexedDB on the device. Nothing from the folder is written to `localStorage`, analytics or logs.
- Model and trace text is rendered as text, never as HTML (no `innerHTML` with file content). Markdown bodies go through a sanitiser or are shown as plain text.
- CI fails if any `.glb`, `.step`, `.stp`, `review/*.json` or `graph.json` is committed outside `fixtures/`. Bundle folders are in `.gitignore`.

### Skills (engineering tools sandbox, project scope)
- Live in `.claude/skills/eng-bundle/` and `.claude/skills/eng-review/` of the engineering tools sandbox. No user-scope installs, no `npx skills add`, no `-g` or `-y`, no piping scripts to a shell.
- Python dependencies (build123d, pint, trimesh or equivalent for GLB export) in the project virtual environment, pinned in a requirements file with hashes where available. No new MCP servers.
- No network access at run time. No `ANTHROPIC_API_KEY`. No credentials in any file.
- Invented or public data only until the owner decides otherwise. The skills refuse to write into the public repo except under `fixtures/`, and refuse any path inside a synced document folder.
- `eng-review` edits only `review/*.json`, files the review asks for, and the bundle it was pointed at. It never sets `resolved`. It writes with the `rev` check in section 9.
- Every number it reports traces to a calculation file; FEA is screening only and must be compared with the hand calculation (sandbox rule).

## 9. Concurrency between the tab and Claude Code
- One file per review item keeps conflicts small.
- Before writing, each side re-reads the file; if `rev` changed since it was loaded, it does not overwrite. The tab shows "This item changed. Reload to see the update." Claude re-reads and merges its reply into the latest thread.
- The tab checks `lastModified` of open review files every 3 seconds while visible, and on window focus.

## 10. Fixture: dummy L-bracket (invented, public material data)
- Geometry (build123d): base 60 x 20 x 6 mm, upright arm 60 mm tall, 20 mm wide, 6 mm thick, inside fillet 2 mm, two 5 mm holes. Driven parameters: arm length, thickness, fillet radius.
- Material: aluminium 6061-T6, yield 276 MPa (public handbook value).
- Load case C-001: 200 N at the arm tip, cantilever. Hand calculation: bending stress = 6FL / (b t^2) = 6 x 200 x 60 / (20 x 36) = 100 MPa; safety factor = 2.76.
- Trace items (prefix DEMO, never real DHF prefixes):
  - DEMO-UN-001 Carries the service load; DEMO-UN-002 Fits the mounting envelope.
  - DEMO-DI-001 Safety factor of 2 or more on yield (links UN-001); DEMO-DI-002 Fits a 70 mm envelope (links UN-002).
  - DEMO-DO-001 Thickness 6 mm (links DI-001); DEMO-DO-002 Aluminium 6061-T6 (links DI-001); DEMO-DO-003 Overall height 66 mm (links DI-002).
  - DEMO-VER-001 Hand calculation C-001 (links DO-001); DEMO-VER-002 Envelope check (links DO-003).
  - Deliberate gap: DEMO-DO-002 has no verification.
- Review items: R-0001 on the inside fillet (open), R-0002 on the material choice (open).

## 11. MVP acceptance
1. The owner opens `fixtures/dummy-bracket` in the Engineering tab, in Chrome and in the Claude desktop built-in browser (or the documented fallback works there).
2. They drop a pin on the bracket, writes an item and ticks a checkbox; the item file appears in `review/`.
3. Claude Code runs `eng-review`, changes the fillet parameter, regenerates the bundle and replies; the tab shows the reply and the new model without a full reload.
4. The trace graph shows the DEMO-DO-002 gap; clicking DEMO-DI-001 highlights its chain.
5. Network panel shows no requests from the Engineering workspace. CI guard and lint rule pass.
6. Keyboard-only use reaches every tab, sidebar item, pin and queue item with a visible focus ring.
