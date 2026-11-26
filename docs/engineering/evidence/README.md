# Evidence for the Engineering workspace MVP

All data is the invented `fixtures/dummy-bracket` bundle. Nothing here comes from a real project.

| File | Shows |
|---|---|
| `shell-tasks-1440.png`, `shell-tasks-390.png` | Top bar with workspace tabs and More menu; mobile tab bar |
| `review-1440.png`, `review-390.png` | Review section: model, pins, queue |
| `trace-graph-1440.png`, `trace-graph-390.png` | Trace graph with the DEMO-DO-002 gap outlined and the DEMO-DI-001 chain highlighted (1440 px) |
| `loop-1-pin-and-item-form.png` | Step 1: pin dropped on the model, item form |
| `loop-2-item-saved-and-seen.png` | Step 2: item saved to `review/R-0003.json`, Seen box ticked |
| `loop-3-claude-reply-shown.png` | Step 3: reply written by the eng-review tools shown in the tab, new model loaded |
| `loop-log.txt` | The commands run and the item file before and after the reply |
| `network.json` | Requests seen from opening the workspace to the end of the loop: same-origin static files only, no fetch, XHR, WebSocket or beacon |

The pictures were produced by a throwaway Playwright script against the e2e build (headless Chromium, software WebGL), with the folder picker replaced by an origin-private folder holding a copy of the bundle. The Claude side of the loop ran the real `eng-bundle` and `eng-review` scripts on a copy of the same files.
