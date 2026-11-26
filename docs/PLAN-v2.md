# BlueHealer Ops v2: implementation plan

Status: draft for Santiago's review, 2026-11-26. Branch `plan/v2`. This file plans phases A to D of the v2 task manager build plan. It contains no app code. `docs/SPEC.md` (revision 3) remains the source of truth for requirements that v2 does not change.

Labels used throughout: **verified** (read in current vendor documentation on 2026-11-26, with the source named) and **provisional** (an assumption, with the check that settles it). "I do not know" is written where it applies.

## 1. Context and what already exists

v2 turns the Tasks workspace into a Trello-like board that Jay can adopt on day one, and adds a request button that reaches the intake mailbox. The repository is further along than the v2 build plan assumes, so most work modifies existing files.

| v2 feature | What exists today | Change |
| --- | --- | --- |
| Top bar with workspace tabs | `src/ui/TopBar.tsx` already holds the brand, workspace tabs (Tasks, Engineering, CRM, More), search, Quick add and the notification bell | Keep and extend. `src/ui/Shell.tsx` still renders `Sidebar.tsx`; replace it with a secondary bar inside Tasks. `TabBar.tsx` stays for mobile |
| Engineering tab | The Engineering workspace is built and merged | No change. The v2 plan said "reserve the tab only"; that is out of date. Engineering is out of v2 scope |
| Board | A Board layout exists in `src/ui/TasksPage.tsx` | Rebuild with drag, keyboard moves, quick add per column |
| Today, Waiting, Suggested, Needs attention | Queues in `src/ui/nav.ts` and `src/domain/tasks.ts` | Today is rebuilt. Waiting, Suggested and Needs attention become filter chips |
| Quick add | `src/ui/QuickAdd.tsx`: one field, creates an Inbox task | Replace with the one-line grammar in section 7 |
| Detail drawer | `src/ui/TaskDrawer.tsx` | Extend (checklist, blocked by, history already partly there) |
| Data layer | react-query hooks in `src/ui/data.ts`; `OpsStore` in `src/graph/store.ts`; `GraphClient` in `src/graph/client.ts` | Add cache and write queue (section 5). `GraphClient` already retries 429, 503 and 504, honours `Retry-After`, caps concurrency at 4 and batches 20 |
| Timeline | A milestone timeline exists in `src/ui/MilestonesPage.tsx` | Extend to workstream rows, tasks, gates, dependencies (phase C) |
| Schema and provisioning | `src/schema/lists.ts` (TypeScript and zod), `src/provision/provision.ts` with a read-only plan step | Add columns and choices (section 6) |
| Intake | F1 flow in `docs/flows/F1-intake.md`; Triage page | Add the App request route (section 8) and flow F6 |

Three facts the v2 build plan does not mention and that shape this plan:

1. **No Workstream field exists.** The plan requires one on every card and uses it for timeline rows. Decision taken with Santiago on 2026-11-26: a `Workstream` facet in the existing `Labels` list (value, colour, order, active), plus a `WorkstreamId` number column on Tasks and Milestones. This avoids a fifth lookup column on Tasks (`validateSchema` in `src/schema/lists.ts` caps lookups at four, and SharePoint's lookup threshold is 12 joins per query, verified).
2. **Intake has no `Kind` column.** It has `RawSource` and `ProposedType`. See the deviation in section 6.
3. **Three input documents named in the launch prompt were not available to this session** (the spec revision 2 launch prompt, the 2026-11-22 frontend brief and the decisions file of the same date). Santiago confirmed on 2026-11-26 that revision 3 supersedes revision 2, so this plan relies on `docs/SPEC.md` revision 3, on the implemented tokens in `src/styles/tokens.css` and `src/styles/fonts.css`, and on the text of the v2 build plan. Decisions D7 and D9 are cited only as the v2 build plan states them (D7: This week shows a soft target of 7 per founder, as an indicator; D9: no dependency cycles). The frontend brief and decisions file themselves remain unread by this plan; where they differ from the implemented tokens, the implemented tokens win until a founder says otherwise.

## 2. Requirement traceability

Requirement ids R1 to R24 come from the v2 build plan: R1 to R14 are its requirements table, R15 to R24 are features it specifies elsewhere. Sources are described generically because this repository is public. Tests named here do not exist yet; phase A to D pull requests create them.

| Id | Requirement | Phase | Component (planned path) | Test |
| --- | --- | --- | --- | --- |
| R1 | Trello-style board with drag-and-drop columns, default screen for Tasks | A | `src/ui/board/BoardView.tsx`, `BoardColumn.tsx`, `Card.tsx` | `e2e/board.spec.ts` (drag across five columns, position survives reload) |
| R2 | Only a founder marks Done; automation never closes | A | `src/domain/closeTask.ts`, `src/ui/board/DoneAction.tsx` | `tests/closeTask.test.ts` (Done requires a founder actor; `ClosedBy` set); `e2e/board.spec.ts` (undo in 10 s) |
| R3 | Status columns replace separate tabs; Needs attention and Suggested become filters | A | `src/ui/board/FilterChips.tsx`, `src/ui/nav.ts` | `tests/boardFilters.test.ts`; `e2e/board.spec.ts` |
| R4 | Waiting on item: person, expected event, check-again date | B | `src/ui/board/WaitingDialog.tsx`, `src/domain/waiting.ts` | `tests/waiting.test.ts` (move to Waiting without three fields refused); `e2e/today.spec.ts` |
| R5 | Timeline from milestones and projects down to tasks, past and next | C | `src/ui/timeline/TimelineView.tsx`, `src/domain/timeline.ts` | `tests/timeline.test.ts`; `e2e/timeline.spec.ts` |
| R6 | Every task links to a workstream | A | `Labels` facet `Workstream`, `WorkstreamId` column, `QuickAddLine.tsx` | `tests/quickAdd.test.ts`; `tests/schema.test.ts` |
| R7 | Relationship reminders are touchpoints on CRM records, not cards | B | `src/domain/touchpoints.ts`, `src/ui/CrmPage.tsx` | `tests/touchpoints.test.ts`; `e2e/today.spec.ts` |
| R8 | Request button for problems and ideas | A | `src/ui/request/RequestButton.tsx`, `RequestPanel.tsx`; flow F6 | `tests/request.test.ts`; `e2e/request.spec.ts` |
| R9 | Top bar with workspace tabs | A | `src/ui/Shell.tsx`, `TopBar.tsx`, `TasksSubbar.tsx` | `e2e/shell.spec.ts` (extend existing) |
| R10 | Entry cost: four required fields, one-line quick add | A | `src/domain/quickAdd.ts`, `QuickAddLine.tsx` | `tests/quickAdd.test.ts` (22 lines); `e2e/board.spec.ts` |
| R11 | Speed and keyboard: optimistic updates, Cmd+K, shortcuts | A | `src/data/writeQueue.ts`, `src/ui/cmdk/CommandMenu.tsx`, `useShortcuts.ts` | `tests/writeQueue.test.ts`; `e2e/board.spec.ts` (screen update under 100 ms) |
| R12 | No guilt backlog: aging fade, calm rollover, "what can wait" | B | `src/domain/aging.ts`, `src/ui/today/TodayView.tsx` | `tests/aging.test.ts`; `e2e/today.spec.ts` (no red; 14-day step) |
| R13 | Drag has an alternative: "Move to" menu and keyboard moves | A | `src/ui/board/MoveToMenu.tsx`, `useBoardDnd.ts` | `e2e/board.spec.ts` (keyboard only, Move to); `e2e/a11y.spec.ts` |
| R14 | Red reserved for KPI indicators; tasks stay calm | A (rule), D (KPI strip) | `src/styles/tokens.css`, `Card.tsx`, `TodayView.tsx` | `tests/noRed.test.ts` (card and Today markup carry no danger class); `e2e/today.spec.ts` |
| R15 | Decision kind with its own badge and Deciding filter | A | `src/ui/board/KindBadge.tsx`, `Tasks.Kind` | `tests/boardFilters.test.ts` |
| R16 | Swimlanes toggle by owner or workstream | B | `src/ui/board/Swimlanes.tsx` | `e2e/board.spec.ts` |
| R17 | Today: capacity-aware, capped at 7, built from This week, due today, check-agains and touchpoints | B | `src/domain/today.ts` | `tests/today.test.ts` |
| R18 | Weekly review screen with copyable summary | B | `src/ui/review/WeeklyReview.tsx` | `tests/weeklyReview.test.ts` |
| R19 | Cache privacy: IndexedDB holds normal records only, cleared on sign-out | A | `src/data/cache.ts` | `tests/cache.test.ts` (restricted never written; cleared on sign-out) |
| R20 | Conflicts: ETag on every write, never overwrite silently | A | `src/data/writeQueue.ts`, `src/data/merge.ts` | `tests/writeQueue.test.ts`; `e2e/conflict.spec.ts` |
| R21 | Card order by numeric `SortKey`; a drag writes one item | A | `src/domain/sortKey.ts` | `tests/sortKey.test.ts` |
| R22 | Detail drawer opens without leaving the board; history from versions | A | `src/ui/TaskDrawer.tsx` (extend) | `e2e/board.spec.ts` |
| R23 | Done column shows the last 14 days; older items in an archive view | A | `src/ui/board/ArchiveView.tsx`, `data.ts` | `tests/board.test.ts` |
| R24 | Mobile: bottom tab bar; Today is the default screen on a phone | A (tab bar), B (Today default) | `src/ui/TabBar.tsx`, `router.ts` | `e2e/shell.spec.ts` at 390 px |

Anything not in this table stays out of v2: CRM rebuild beyond touchpoints, Engineering content, OKR and KPI dashboards (except the phase D strip), the answer bank, offline editing, LinkedIn discovery.

## 3. Component tree

State ownership rule: server data lives in the cache (section 5); UI state lives in the URL where it is a filter or layout (route and filters only, never record content), and in component state otherwise.

```
App
 Shell                                  src/ui/Shell.tsx (modified)
  SkipLink
  TopBar                                src/ui/TopBar.tsx (modified: brand, workspace tabs, search, Quick add, Alerts, AvatarMenu)
  main
   TasksWorkspace                       src/ui/TasksPage.tsx (modified)
    TasksSubbar                         src/ui/shell/TasksSubbar.tsx (new: layouts Board, Today, Timeline, List; saved filters)
    FilterChips                         src/ui/board/FilterChips.tsx (Needs attention, Suggested, Deciding, I am waiting on, Waiting on me)
    BoardView                           src/ui/board/BoardView.tsx
     BoardDndProvider                   src/ui/board/useBoardDnd.ts (the only file that imports the drag library)
      BoardColumn x5                    header with count; This week shows count against 7 per founder as an indicator
       Card                             face: title, owner avatar, workstream strip, due chip, checklist n/m, Waiting badge, lock icon
        CardMenu                        Move to, Set waiting, Done
       QuickAddLine                     "Add a card" at the column foot
     Swimlanes                          phase B
    TodayView                           src/ui/today/TodayView.tsx (phase B)
    TimelineView                        src/ui/timeline/TimelineView.tsx (phase C)
    ListView                            existing
   CardDrawer                           src/ui/TaskDrawer.tsx (modified; opens on click or Enter; focus returns to the card on close)
    ChecklistEditor, LinksEditor, BlockedByPicker, HistoryTab, ConflictBanner
   WaitingDialog                        phase B (modal; three required fields)
  TabBar                                mobile bottom tabs, offset above the request button
  CommandMenu                           src/ui/cmdk/CommandMenu.tsx (Ctrl+K on Windows, Cmd+K on macOS; the label follows the platform and both modifiers open it)
  QuickAddGlobal                        `n` anywhere, shares the parser with QuickAddLine
  RequestButton + RequestPanel          src/ui/request/ (48 px round button, bottom right)
  Toasts, LiveRegion                    src/ui/parts.tsx (announce moves, saves and failures)
```

Interaction contracts that tests assert:

- **Keyboard on a card:** Enter opens the drawer; `d` done; `w` waiting; `m` move menu; space picks up, arrows move, space drops, Escape cancels (library behaviour, section 4). `n`, `/`, `?`, `1` to `4` are ignored while an input has focus (the existing handler in `Shell.tsx` already does this).
- **Focus:** closing the drawer or a dialog returns focus to the element that opened it. The request panel opens with the text box focused.
- **Announcements:** every move, close, undo, failed save and conflict is written to one polite live region.
- **Request button on mobile:** sits above `TabBar`, inside the safe area (`env(safe-area-inset-bottom)`).

## 4. Drag and drop: dnd-kit and Atlassian Pragmatic drag and drop

Facts below come from the npm registry (queried 2026-11-26) and the vendors' own documentation pages; the keyboard behaviour of the current dnd-kit line and the accessibility stance of Pragmatic are **verified** as stated on those pages. How either library behaves in our five-column layout is **provisional** until the phase A spike.

| Criterion | dnd-kit (`@dnd-kit/core` 6.3.1, `@dnd-kit/sortable` 10.0.0) | Atlassian Pragmatic drag and drop (`@atlaskit/pragmatic-drag-and-drop` 4.0.0) |
| --- | --- | --- |
| Licence | MIT | Apache-2.0 |
| Last published | December 2024 (stable line); the successor `@dnd-kit/dom` and `@dnd-kit/react` are at 0.5.3 (2026-10-31), not yet 1.0 | 2026-11-19 |
| Keyboard | Built in: Space or Enter picks up and drops, arrow keys move, Escape cancels. Keys are configurable. The vendor notes that ARIA expects both Enter and Space to work | Not built in. The vendor describes the pieces as unopinionated about accessibility, so the app builds keyboard moves itself |
| Screen reader | `@dnd-kit/accessibility` (MIT) provides live-region announcements and instructions, used by default | A separate `@atlaskit/pragmatic-drag-and-drop-live-region` package (Apache-2.0) exists; the app writes the messages |
| Size | Larger (core unpacked about 1 MB on disk; the shipped bundle is far smaller, to measure) | Core about 4.7 kB according to the vendor |
| Multi-column cards | `SortableContext` per column plus a drop target per column; well documented | Hitbox helpers (`pragmatic-drag-and-drop-hitbox`, Apache-2.0) for list reordering; app wires columns |
| Touch | Pointer and touch sensors with activation constraints | Uses native HTML drag and drop, which is weak on touch; I do not know how it behaves in iOS Safari for our layout |
| Maintenance risk | Stable line is a year old; maintained line is pre-1.0 | Actively released |

**Choice (recommended, provisional): `@dnd-kit/core` and `@dnd-kit/sortable`, pinned to exact versions, behind a single adapter `src/ui/board/useBoardDnd.ts`.** Reasons: the v2 plan asks for keyboard pick-up and drop with screen-reader announcements, which dnd-kit ships and Pragmatic leaves to us; touch matters because Today and the board must work on a phone. The adapter is the only file that imports the library, so moving to `@dnd-kit/dom` once it reaches 1.0, or to Pragmatic, is a one-file change. The "Move to" menu stays the primary accessible path, as WCAG 2.2 requires a single-pointer alternative to dragging (this guidance is cited in the v2 plan; I did not re-read it for this document, so it is **provisional**).

**Phase A spike before committing (half a day):** a throwaway branch proves multi-container keyboard moves, an axe pass with zero serious findings on the board, and a touch drag on an iPhone in the installed PWA. If the spike fails, switch to Pragmatic with a hand-built keyboard path (about two extra days).

## 5. Cache and write queue

Goal: Linear-like speed without a sync engine, and no change is ever lost quietly.

### 5.1 Layers

1. **Server state** (`OpsStore`, existing). Add the item ETag: `RawItem` in `src/graph/codec.ts` currently drops `@odata.etag`; keep it as `_etag` on decoded items.
2. **Memory store** (new, `src/data/store.ts`): normalised maps of open tasks, Done items from the last 14 days, workstreams, milestones. It replaces the per-view `useQuery` calls in `src/ui/data.ts`; react-query stays for the smaller lists.
3. **IndexedDB cache** (new, `src/data/cache.ts`): a copy for fast first paint. Raw `indexedDB`, so no new dependency (`idb`, ISC licence, is an optional convenience).
4. **Write queue** (new, `src/data/writeQueue.ts`): applies an edit to the memory store at once, then writes to Graph in the background.

### 5.2 Cache rules (R19)

- Database `ops-cache-v1`; stores `meta`, `tasks`, `workstreams`, `milestones`. Records are keyed by item id and tagged with the signed-in account id.
- **Restricted records are never written.** The write path filters `Sensitivity === 'restricted'` before `put`. They may sit in memory for display (the card shows a lock icon) and are re-read from Graph on reload. Request drafts and Intake items are never cached.
- Cleared on sign-out, on account change, and at start-up when no account is signed in (the MSAL token lives in `sessionStorage`, so closing the tab signs out while IndexedDB would otherwise survive). Expires after 24 hours and on an app version change.
- First paint reads the cache, then revalidates from Graph; a banner shows "Showing saved data while we refresh" until the first Graph read finishes.
- Offline editing stays out of v2: the queue is memory only. A `beforeunload` warning appears while edits are unsaved.

### 5.3 Write queue

States per item: `clean`, `pending` (patch merged, waiting 400 ms), `saving`, `failed`, `conflict`.

1. Edits to the same item within 400 ms are merged into one PATCH (field-wise, last value wins). This keeps a burst of drags well inside throttling (section 11).
2. One in-flight write per item; items run in parallel up to the client's concurrency of 4.
3. Every write sends `If-Match: <etag>` on `PATCH .../items/{id}/fields` (verified: a mismatch returns 412 and the item is not updated). The new ETag after a success is read from the response if present; if not, the queue issues one `GET` of the item (1 resource unit, verified). Which of the two applies is **provisional**; the Phase 0 smoke test settles it. ETag writes use single PATCH requests, not `$batch`, because `If-Match` inside batch sub-requests is not documented on the pages read (**provisional**).
4. **Retry with backoff** reuses `GraphClient`: 429, 503 and 504 retried up to 5 times, honouring `Retry-After` (verified as required by Microsoft), otherwise `500 ms * 2^attempt` capped at 30 s plus jitter. On a network error the queue adds its own backoff of 1, 2, 4, 8, 16, 32 and 60 s, retries immediately on the browser `online` event, and after 8 attempts marks the item `failed`.
5. **Failure is visible, not reverted.** A `failed` card shows a quiet "Not saved. Retry" marker and keeps its on-screen value; the live region announces it; the toolbar shows a count of unsaved cards. Retry is one click.
6. **Conflict (HTTP 412):** the queue re-reads the item and compares three versions: base (the snapshot at the last known ETag), mine (the pending patch) and theirs (the server). If the changed field sets do not overlap, it merges and retries once. If a field overlaps, it applies theirs on screen, keeps mine aside, and shows a banner in the drawer "Jay changed this card first" with "Keep theirs" and "Use mine". Nothing is overwritten without a click.
7. **Done is special (R2):** the queue accepts `Status: Done` only from `closeTask()` in `src/domain/closeTask.ts`, which requires a founder actor and always sets `ClosedBy` and `CompletedAt`. A unit test greps `src/` and fails if any other file writes `Status: 'Done'`. No flow or routine has a write path to the lists in any case.
8. **Undo (10 s):** closing a card shows a toast with Undo; undo writes the previous Status and clears `ClosedBy` and `CompletedAt`, itself through the queue with the then-current ETag.

### 5.4 Card order (R21)

`Tasks.SortKey` is a number. A card dropped between two neighbours gets the midpoint of their keys; at an end it gets the neighbour's key plus or minus 1024. New cards start at the column's maximum plus 1024. When the gap between neighbours falls below `1e-6`, the column is renumbered at spacing 1024 in `$batch` calls of 20 (verified limit), which is rare and shown as a silent background write. A drag therefore writes one item. Whether SharePoint keeps enough decimal precision for a `number` column created with default settings is **provisional**: `provision.ts` creates number columns with `number: {}`, and the smoke test in section 12 checks that `1536.5` round-trips. If not, provisioning sets `decimalPlaces` explicitly.

## 6. Schema diff and status migration

All changes go through `src/schema/lists.ts` and the Admin page's idempotent provisioning (`src/provision/provision.ts`), never by hand. New columns are additive; no column or choice is removed, renamed or reordered.

### 6.1 Schema diff

| List | Column | Type | Indexed | Used by | Notes |
| --- | --- | --- | --- | --- | --- |
| Tasks | `Status` | choice, add `Backlog` and `This week` | already | Board columns | Keep `Inbox`, `Next`, `Proposed`, `Dropped`. Default becomes `Backlog` |
| Tasks | `SortKey` | number | yes | card order | set by the app |
| Tasks | `Kind` | choice: Task, Decision | no | Decision badge | default Task |
| Tasks | `WorkstreamId` | number (item id in `Labels`) | no | workstream strip, timeline rows | required on entry, but a card without one saves and lands in Needs attention |
| Tasks | `WaitingFor` | text, 255 | no | Waiting card face | required when Status is Waiting |
| Tasks | `WaitingOnPersonId`, `WaitingOnOrgId` | number | no | CRM link for "who" | one of the two, or free text in existing `WaitingOn` |
| Tasks | `CheckAgain` | date | no | Today, weekly review | required when Status is Waiting; supersedes `WaitingExpected` |
| Tasks | `LastTouched` | datetime | yes | aging fade | set by the app on every edit |
| Tasks | `ClosedBy` | choice: Santiago, Jay | no | proof a founder closed it | set when Done |
| Tasks | `LooksDone` | boolean | no | "Looks done?" chip on a card | set only by a flow from a routine proposal; a founder accepts (closes) or dismisses (clears) it; never closes a card (R2). Accepted 2026-11-26 |
| Tasks | `RequestedBy` | text, 255 | no | "Waiting on me" filter | free text naming someone outside the founders; no CRM link in v2. Accepted 2026-11-26 |
| Milestones | `WorkstreamId` | number | no | timeline rows | |
| Labels | facet `Workstream` | add to `LABEL_FACET` in `src/schema/choices.ts` | existing | workstream list | values seeded from the Admin page; names are the founders' to choose |
| Intake | `RawSource` | choice, add `app request` | no | triage, F6 | see deviation below |
| Intake | `RequestType` | choice: Problem, Change, Idea | no | email subject, triage | |
| Intake | `Route` | text, 255 | no | email context | URL route and filters only |
| Intake | `AppVersion` | text, 40 | no | email context | commit hash |
| Intake | `Device` | text, 120 | no | email context | browser and device class |

Deviations from the v2 build plan, for Santiago's yes:

- **`ClosedBy` is a choice, not a person column.** A person column is a lookup join (threshold 12, verified) and a second user-resolution call. A founder-name choice matches `Owner` and costs nothing. `LastModifiedBy` in version history is the second proof.
- **`Intake.Kind` is not added.** The existing `RawSource` carries the same meaning; adding a choice avoids a second routing column. Triage shows it as "App request".
- **`WaitingOn` stays text** (`Tasks.WaitingOn`); the CRM link is the two number columns. A true lookup would be Tasks' fifth, breaching the four-lookup rule in `validateSchema`.
- **`Intake.Device`** is added because the build plan lists browser and device as context but names no column.

Index budget: Tasks already indexes `Status`, `DueDate`, `ThisWeek`, `CompletedAt` plus the common `Owner`, `Sensitivity` and `ExtId` (seven). v2 adds `SortKey` and `LastTouched` (nine); `LooksDone` and `RequestedBy` are not indexed. The documented per-list limit on indexed columns is **provisional**: the commonly cited figure is 20, but it was not on the Microsoft pages read for this plan. The smoke test in section 12 creates the nine indexes on a scratch list. Lists stay far below the 5,000-item view threshold (verified; cannot be changed in SharePoint Online), and the app loads open tasks in full and filters in memory, as `docs/PLAN.md` already decides.

### 6.2 Status migration, dry run first

A new `migrateV2` function in `src/provision/migrateV2.ts`, run from the Admin page after provisioning, with the same dry-run-then-apply pattern as imports.

| Existing Status | Condition | New Status | Other writes |
| --- | --- | --- | --- |
| Inbox | any | Backlog | |
| Next | `ThisWeek` is true | This week | |
| Next | `ThisWeek` is false | Backlog | |
| In progress | any | In progress | |
| Waiting | any | Waiting | `CheckAgain` := `WaitingExpected`; `WaitingFor` left empty and flagged in Needs attention (not blocked) |
| Done, Dropped | any | unchanged | `ClosedBy` left empty on old items |
| Proposed | any | unchanged | not a board column; reached through the Suggested filter and Triage |

For every row: `LastTouched` := the item's last-modified time **before** this migration (otherwise the aging fade would treat every card as brand new or as ancient); `SortKey` := position in the column ordered by priority then due date, spaced 1024; `Kind` := Task; `WorkstreamId` left empty (the Needs attention filter then lists every card without one, which is the intended prompt for Jay and Santiago to assign them in one sitting).

The dry run writes nothing and prints a report the founder can download (never committed). Illustrative output with invented numbers:

```
Migration v2: dry run (no writes)
Tasks scanned: 120
  Inbox -> Backlog: 31
  Next (This week) -> This week: 9
  Next (other) -> Backlog: 44
  In progress: 6 (unchanged)
  Waiting: 5 (CheckAgain copied from WaitingExpected: 4; WaitingFor empty: 5, flagged)
  Done / Dropped / Proposed: unchanged
Cards without a workstream after migration: 120 (expected)
Restricted records included: 3 (updated; never cached)
Estimated writes: 120 PATCH in 6 batches of 20; at 2 resource units each, 240 units
```

Apply mode: idempotent (a row already holding a v2 Status is skipped), `$batch` of 20 through `store.updateMany`, resumable after a 429 because the client retries throttled sub-requests, and records a `Settings` row `migrationV2` with the date and counts. **Rollback:** the downloaded report lists item id and previous Status; a "Restore from report" action writes them back. SharePoint version history keeps the previous values as a second path. Each migrated item gains one version, which adds noise to History; this is expected and is mentioned in the Admin page text.

## 7. Quick-add grammar

One line, parsed in the browser by a pure function `parseQuickAdd(line, ctx)` in `src/domain/quickAdd.ts`. It never touches the network. `ctx` carries today's date in America/New_York, the signed-in founder, active workstream names and the people list for the reminder helper.

### 7.1 Grammar

```
line       = { token | word } ;
token      = owner | workstream | kind | wait | date ;
owner      = "@" ( "me" | "santiago" | "jay" | "both" ) ;     (* case-insensitive; "@" must start a word *)
workstream = "#" name ;                                       (* case-insensitive, unique prefix of an active workstream *)
kind       = "!decision" ;
wait       = "wait:" ( bare-word | '"' text '"' ) ;           (* opens the Waiting dialog, prefilled *)
date       = "today" | "tomorrow" | weekday | "next week" | "in " n " days"
           | month-name day | month-name | m "/" d | yyyy "-" mm "-" dd ;
```

Rules:

1. Title = the line with recognised tokens removed, whitespace collapsed, cut at 250 characters (a chip warns when cut). Empty title: nothing is created.
2. Owner defaults to the signed-in founder; two different owners (`@jay @santiago`) mean Both.
3. A bare weekday means the next such day strictly after today. `next week` means next Monday. Month and day without a year use the next occurrence; `12/3` is month first. A month alone (`december`) means its first working day. Times such as `3pm` are not parsed and stay in the title (due dates are dates).
4. An unknown `#name` is not removed: it stays in the title and a warning chip says "No workstream called name". A card saved without a workstream lands in Needs attention, so capture is never blocked.
5. `@` inside a word (`avery@example.com`) is not an owner token.
6. Kind defaults to Task; `!decision` sets Decision.
7. `wait:` never saves directly: it opens the Waiting dialog with who filled in, expected event empty and check-again defaulting to 5 working days.
8. If the line names a person from the CRM and has no action verb (a short built-in verb list, English only), a chip offers "Make this a reminder on Avery Placeholder?" (R7). Accepting writes a touchpoint, not a card.
9. Parsed values appear as removable chips before saving; Enter saves, Escape cancels.

### 7.2 Test lines

Reference date for all expectations: Thursday 2026-11-26 (America/New_York); signed-in founder is Santiago. Names and domains are invented.

| # | Input | Title | Owner | Workstream | Due | Other |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `Reply to Avery @jay #fundraising fri` | Reply to Avery | Jay | Fundraising | 2026-11-27 | |
| 2 | `Draft test protocol` | Draft test protocol | Santiago | none | none | Needs attention |
| 3 | `Book vendor call tomorrow #hardware` | Book vendor call | Santiago | Hardware | 2026-11-27 | |
| 4 | `Review budget notes @both nov 30` | Review budget notes | Both | none | 2026-11-30 | |
| 5 | `Send agenda @santiago #regulatory mon` | Send agenda | Santiago | Regulatory | 2026-11-30 | |
| 6 | `Prepare slides !decision #fundraising` | Prepare slides | Santiago | Fundraising | none | Kind Decision |
| 7 | `Chase quote wait:"Example Vendor" #hardware` | Chase quote | Santiago | Hardware | none | Waiting dialog: who Example Vendor, check again 2026-12-04 |
| 8 | `Fix login typo #workspace` | Fix login typo | Santiago | Workspace and AI (unique prefix) | none | |
| 9 | `Avery Placeholder in december` | Avery Placeholder | n/a | n/a | 2026-12-01 | Offer reminder on person; no card unless declined |
| 10 | `Pay invoice #unknown` | Pay invoice #unknown | Santiago | none | none | warning chip; Needs attention |
| 11 | `Email Jay about Q1 @jay` | Email Jay about Q1 | Jay | none | none | |
| 12 | `Ship build 12/3` | Ship build | Santiago | none | 2026-12-03 | |
| 13 | `Plan trip dec 3 @me` | Plan trip | Santiago | none | 2026-12-03 | |
| 14 | `Meet at 3pm friday` | Meet at 3pm | Santiago | none | 2026-11-27 | time stays in title |
| 15 | `Follow up @jay @santiago` | Follow up | Both | none | none | |
| 16 | `Order parts next week` | Order parts | Santiago | none | 2026-11-30 | |
| 17 | `Write summary today` | Write summary | Santiago | none | 2026-11-26 | |
| 18 | `Review draft in 3 days` | Review draft | Santiago | none | 2026-11-29 | |
| 19 | `Renew licence 2027-01-15 #regulatory` | Renew licence | Santiago | Regulatory | 2027-01-15 | |
| 20 | `Email avery@example.com @jay` | Email avery@example.com | Jay | none | none | address is not a token |
| 21 | `   ` (spaces only) | rejected | | | | nothing created |
| 22 | 300 characters of text | cut at 250 | Santiago | none | none | cut warning |

Workstream names in these lines (Fundraising, Hardware, Regulatory, Workspace and AI) are test fixtures only; the real list is whatever the founders create in the `Workstream` facet.

## 8. Request button

Delivery is option A of the v2 build plan: write an Intake item and let flow F6 email it. This needs no new Graph scope, keeps a record if mail fails, and keeps the app's no-send rule intact. `Mail.Send` is not added (the Graph `Mail.ReadWrite` scope remains for drafts only).

### 8.1 Behaviour

- Component `RequestButton` (48 px round, bottom right on every signed-in page; tooltip "Send a request") opens `RequestPanel` (about 360 px, a full-width sheet on mobile). Also reachable from Cmd+K.
- Fields: type chip (Problem, Change, Idea; default Idea), text (required, plain), Restricted toggle (default off). Placeholder: "What happened, or what would you change? Please leave out amounts and deal terms." The existing deal-data guard (`dealDataProblem` in `src/domain/guards.ts`, used by `OpsStore`) runs on the text; a hit shows a gentle message and blocks sending.
- Send: button or Cmd+Enter. The write is `store.create('Intake', {...})` with `RawSource: 'app request'`, `TriageState: 'New'`, `Source: 'manual'`, `Owner` the sender, `Sensitivity` from the toggle, `Raw` the text, `Title` the first 60 characters (for restricted requests the fixed title "Restricted app request"), `RequestType`, `Route`, `AppVersion`, `Device`. Toast: "Sent to intake. Thank you."
- Context sent: the URL route and filters only, the open card's numeric id (inside the route), the commit hash baked in at build time, browser and device class, time (`ReceivedAt`) and the founder (`Owner`). Never sent: card titles, record content, screenshots.
- Draft text lives in component state above the router (kept while the panel is closed, lost on reload). It is not written to `localStorage`, because it might be restricted.
- Guardrails: one submission per 10 seconds; plain text only; the Send button disables while writing.
- Failure: two failed writes show the fallback `mailto:` link with the text prefilled (non-restricted only; a restricted request is never placed in a `mailto:` URL, and the panel says "Could not save. Please try again.").

### 8.2 After it arrives

Intake item appears in Triage as "App request"; flow F6 emails the intake mailbox (subject `[bluehealer-ops] Problem: <first 60 characters>`, body the text, a context block and a link to the item; restricted requests send a notice with only the link and are excluded from digests); the 18:00 triage routine proposes a title, a type and a priority (proposals only); Santiago accepts it as a card in the relevant workstream or opens a GitHub issue himself; the pull request that fixes it names the request id; a founder closes the Intake item.

### 8.3 Flow F6 and a required change to F1

The F6 guide is `docs/flows/F6-app-request.md` (added in this pull request). It uses standard connectors only (SharePoint trigger "When an item is created", Office 365 Outlook "Send an email from a shared mailbox (V2)"), with the recipient fixed to the intake mailbox and the body sent as plain text. Whether Business Basic includes these standard connectors is **provisional**: Microsoft's licence page read for this plan says the Free Power Automate licence allows cloud flows with standard connectors only and lists premium connectors as paid, but it does not name Business Basic. Santiago settles this by building F6 once (section 12).

**Loop hazard found while planning:** F6 mails the intake mailbox, and F1 (`docs/flows/F1-intake.md`) turns any email from a founder's address in that mailbox into an Intake item. An F6 email sent from a founder's account would pass F1's sender check and create a second Intake item for the same request. It cannot loop, because F1 sets `RawSource` to `email forward` or `share sheet`, so F6 does not fire again. The fix is one step added to F1, written in the F6 guide: if the subject starts with `[bluehealer-ops]`, move the email to `Processed` and terminate. Santiago makes that edit in the flow.

## 9. Test plan

Every pull request: `npm run typecheck`, `npm run lint`, `npm test`, `npm run check:fixtures`, `npm run e2e`, the gitleaks scan and `check:validators` already in `.github/workflows/ci.yml`.

**Unit (vitest, `tests/`):** `quickAdd.test.ts` (the 22 lines of section 7.2), `sortKey.test.ts` (midpoint, ends, rebalance trigger, rebalance output), `writeQueue.test.ts` (coalescing, retry schedule with an injected clock, `Retry-After`, 412 merge, failed marker, only `closeTask` writes Done), `cache.test.ts` (restricted never stored, cleared on sign-out, expiry), `migration.test.ts` (every row of the mapping table; idempotent; dry run writes nothing), `waiting.test.ts`, `aging.test.ts` (7, 14 and 28 day steps), `today.test.ts` (cap 7, sources), `noRed.test.ts`, `request.test.ts` (10-second limit, restricted fixed title, no `mailto:` for restricted, guard blocks deal terms), `schema.test.ts` (extend: lookups still at most four, deny-list still passes, new columns present), `timeline.test.ts` and `deps.test.ts` (cycle refused, phase C).

**Playwright with mocked Graph** (extend `tests/support/fakeGraph.ts` for `@odata.etag`, `If-Match` and 412, and for a `$batch` of 20): `board.spec.ts` (mouse drag across five columns, keyboard-only move, Move to, reload keeps order, quick add under 30 seconds, drawer, Done and undo), `conflict.spec.ts` (second editor changes a card; first sees a banner; nothing lost), `request.spec.ts` (Intake item created with route and version and no card content; restricted flag; throttle; fallback), `today.spec.ts` (phase B), `timeline.spec.ts` (phase C), `a11y.spec.ts` (axe via `@axe-core/playwright`, already a dev dependency, on Board, Today and the request panel: zero serious findings), plus the existing `shell.spec.ts` and `tasks.spec.ts` kept green or updated in the same pull request.

**Performance check:** an e2e assertion that the on-screen update after a move happens in under 100 ms with Graph delayed by 1.5 s (this measures the optimistic path, not Graph).

**Screenshots** at 1440 px and 390 px in each pull request, from fictional fixtures only, stored under `docs/screenshots/` as the brand-shell pull request already does. The existing hygiene check stays: sign-in screen only without a token, secret and PII scan, fictional fixtures only, restricted records never in digests or requests.

**Manual checks per phase (Santiago):** a non-founder Microsoft account is denied by SharePoint; two founders edit one card at once and the second sees the change; a real request reaches the intake mailbox within 5 minutes; the board, keyboard moves, Ctrl+K and Ctrl+Enter (send request) work in Microsoft Edge on Windows, which is Jay's platform. CI runs Chromium, which covers the engine but not the Windows keyboard or Edge itself, so this check is manual.

## 10. Phases A to D

Each phase is one branch and one pull request, merged only by Santiago. The week estimates in the v2 build plan (about two, one, one weeks and "when needed") are its assumptions; I have not measured them and do not add my own.

### Before phase A (no code)
1. Santiago approves this plan and the decisions in section 12.
2. Phase 0 smoke tests in section 12 (indexes, number precision, ETag response, F6 connectors).
3. Santiago builds F6 and edits F1 from `docs/flows/F6-app-request.md`.
4. Jay's Trello or Airtable screenshots (promised) refine the card face; they do not block.
5. The drag library spike (section 4).

### Phase A: board, shell and request button
**Builds:** shell (sub-bar, sidebar removed, mobile tabs), Board with five columns, drag, keyboard and Move to, card and drawer, quick add (column and global), manual Done with undo, cache and write queue, Cmd+K with search and basic actions, shortcuts `n`, `/`, `d`, `m`, `?`, `1` to `4`, request button, filter chips, Decision kind, archive view, schema changes, migration dry run and apply, flow F6 in use.
**Accepted when:** a card moves across all five columns by mouse, by keyboard alone and by Move to, and its position survives a reload; a quick-add line with owner, workstream and date creates a correct card in under 30 seconds; the screen updates in under 100 ms with the write finishing in the background; only a founder action sets Done and `ClosedBy` records who; a request typed in the panel produces an Intake item and an email at the intake mailbox within 5 minutes, with route and version and no card content; a restricted request produces only the notice email; axe reports zero serious findings on Board and the request panel.
**Gate:** Jay uses the board for one week and gives feedback through the request button.

### Phase B: Today, Waiting on and calm design
**Builds:** Today with the "what can wait" step and cap of 7, calm rollover note after day three, Waiting status with its three fields and Check with items (one-click Outlook draft, never sent), aging fade (7, 14, 28 days, thresholds in Settings), reminders as touchpoints on CRM records, weekly review, swimlanes (off by default), Today as default on a phone, "Looks done?" chip and the F5 proposals-in flow guide (open question 6, accepted), and the `RequestedBy` field behind "Waiting on me" (open question 7, accepted).
**Accepted when:** moving to Waiting without the three fields is refused and the Check with item appears in Today on the check-again date; a card untouched for 14 days shows the second aging step; Today shows no red anywhere.

### Phase C: timeline
**Builds:** workstream rows, milestone bars, gate diamonds, expandable dated tasks with undated ones listed beneath, finish-to-start arrows, a today line, baseline ghost bars, completed items muted; dates edited in the drawer.
**Accepted when:** the seeded milestones and gates show on the right dates; done items show muted; a dependency cycle is refused with a clear message.

### Phase D: indicators and polish (when needed)
**Builds:** red KPI indicators only; draggable timeline bars; motion; opt-in screenshot for requests (stored in a founders-only SharePoint folder).
**Accepted when:** both founders have used A to C for two weeks and still want each item. The KPI lists exist in the schema but no KPI screen is built; per the accepted answer to open question 8, phase D builds a minimal indicator strip, not the phase 3 KPI screens of `docs/SPEC.md`.

### New runtime dependencies (all free)

| Package | Version | Licence | Phase | Note |
| --- | --- | --- | --- | --- |
| `@dnd-kit/core` | 6.3.1 (exact pin) | MIT | A | pulls `@dnd-kit/utilities` and `@dnd-kit/accessibility` (both MIT) |
| `@dnd-kit/sortable` | 10.0.0 (exact pin) | MIT | A | |

No other runtime dependency is proposed: IndexedDB uses the browser API, the command menu, date parsing and timeline are hand-built. Optional conveniences, not proposed: `idb` (ISC) for IndexedDB, `cmdk` (MIT) for the menu. No development dependency is added. If the spike chooses Pragmatic instead, the packages are `@atlaskit/pragmatic-drag-and-drop`, its `hitbox` and `live-region` packages (Apache-2.0), still free.

## 11. Platform limits

Sources read on 2026-11-26. "Updated" is the page's own date.

| Limit | Value | Status | Source |
| --- | --- | --- | --- |
| Throttled response | HTTP 429 or 503 with a `Retry-After` header that must be honoured; ignoring it increases throttling | verified | learn.microsoft.com, "Avoid getting throttled or blocked in SharePoint Online" (updated 2026-08-10) |
| Per-user request limit | 3,000 requests per 5 minutes (defaults, may change) | verified | same page |
| Resource unit cost | 1 for a single-item read; 2 for create, update, delete and multi-item reads; batched requests costed individually | verified | same page |
| Graph throttling behaviour | 429 plus `Retry-After`; exponential backoff when the header is absent; each batch sub-request throttled on its own; the batch itself returns 200; SDKs do not retry batched sub-requests | verified | learn.microsoft.com, "Microsoft Graph throttling guidance" |
| `$batch` size | 20 requests per batch | verified | learn.microsoft.com, "Combine multiple HTTP requests using JSON batching" |
| ETag concurrency on list items | `PATCH .../items/{id}/fields` accepts `if-match`; a mismatched ETag returns 412 and the item is not updated | verified | learn.microsoft.com, "Update listItem" (Graph v1.0) |
| List view threshold | 5,000 items; cannot be changed in SharePoint Online | verified | support.microsoft.com, "List View Threshold for large lists and libraries" (updated 2026-11-19) |
| Items per list | 30 million | verified | same page and the SharePoint limits service description |
| Lookup join threshold | 12 per query | verified | support.microsoft.com page above |
| Version history | 50,000 major versions | verified | SharePoint limits service description (updated 2026-10-06) |
| Business Basic limits | Listed in the same plan column as Business Standard and Premium | verified | SharePoint limits service description |
| Indexed columns per list | commonly cited as 20 | provisional | not on the pages read; settle with smoke test 1 |
| Index a column on a populated list | allowed while under the view threshold | provisional | not re-read; smoke test 1 |
| Number column decimal precision | unknown for default settings | provisional | smoke test 2 |
| ETag in the PATCH response | unknown whether the response carries the new `@odata.etag` | provisional | smoke test 3 |
| `If-Match` inside `$batch` | undocumented on the pages read | provisional | plan uses single PATCH |
| Power Automate standard connectors on Business Basic | The Free licence allows cloud flows with standard connectors only (verified, Microsoft Learn "Types of Power Automate licenses", updated 2026-09-22); Business Basic itself is not named there. Santiago believes the plan includes some Power Automate credits or tokens (2026-11-26); credits are not the same as a connector entitlement, so this stays provisional with lower expected risk | provisional | smoke test 4 (build F6 once) |
| Power Automate daily request allowance on Business Basic | not found | provisional | flow volume is a handful of runs a day; check the admin centre |
| "Is HTML = No" and "send from shared mailbox" action available | not checked | provisional | smoke test 4 |
| Library facts (versions, licences, size, keyboard stance) | see section 4 | verified for registry data; provisional for our layout | npm registry and vendor docs, 2026-11-26 |

A page the previous plan had cited, the old large-lists developer guide, now returns "not found"; this plan does not cite it.

## 12. Santiago's manual steps, decisions, questions and risks

### Phase 0 smoke tests (about an hour, in the tenant, on a scratch list and a scratch flow)
1. **Indexes:** create a scratch list with the nine Tasks indexes (including a number and a datetime column); note the limit message if any.
2. **Number precision:** write `1536.5` to a number column through Graph and read it back.
3. **ETag:** `PATCH` an item with `If-Match`; record whether the response carries the new ETag; `PATCH` again with the stale ETag and confirm 412.
4. **Flow connectors:** build F6 from `docs/flows/F6-app-request.md`; confirm the SharePoint trigger, the shared-mailbox send action and plain-text body are available under Business Basic and that an F6 email is sent from the shared mailbox.
5. **F1 edit:** add the `[bluehealer-ops]` subject guard to F1 and send a test request.

### Decisions needing Santiago's yes (preferred option first)
1. Request delivery: Intake list plus flow F6 (preferred), or Graph `Mail.Send`.
2. Columns: Backlog, This week, In progress, Waiting, Done (preferred), or Jay's labels after his references arrive.
3. Top bar plus a sub-bar inside Tasks, sidebar removed (preferred), or keep the sidebar for views inside Tasks.
4. Red reserved for KPI indicators (preferred), or red overdue on tasks too. Note the current app styles overdue chips red (`src/ui/TasksPage.tsx`, line 118); the preferred option changes that. Please also say whether form error messages keep the danger colour; I assume yes, because they are not task state.
5. Drag library: dnd-kit stable line behind an adapter (preferred), subject to the phase A spike, or Pragmatic.
6. Retire the "contribution type required to leave Inbox" rule for board entry (`canLeaveInbox` in `src/domain/tasks.ts`; SPEC.md "Task Manager"). The four required fields do not include it. Preferred: retire the gate, keep the column optional, keep the Needs attention check for unlinked strategic tasks. This changes a SPEC.md rule, so it needs a recorded decision.
7. Workstream as a `Labels` facet with a `WorkstreamId` column (agreed 2026-11-26), and the founders' list of workstream names.
8. Schema deviations in section 6.1: `ClosedBy` as a choice, `RawSource` instead of a new `Intake.Kind`, `Intake.Device`, `WaitingOn` kept as text.

### Open questions
Answers from Santiago on 2026-11-26 are recorded here. Items marked **accepted** follow this plan's proposal; the eight decisions above were not part of that answer and remain open.

1. **Resolved.** The original revision 2 launch prompt, the frontend brief and the decisions file: revision 3 of `docs/SPEC.md` supersedes revision 2. D7 and D9 stay cited from the v2 build plan only (section 1).
2. **Accepted.** Gates MG0 to MG3: a milestone whose `ApprovalGate` is not `none` draws as a diamond. A `Milestones.IsGate` boolean is added only if gates turn out to be a different thing. I still do not know the intended gate list; the phase C acceptance check "the seeded milestones and gates show on the right dates" needs it from the founders.
3. **Partly answered.** Power Automate: Santiago believes the plan includes some credits or tokens. That does not settle whether the shared-mailbox send action and plain-text body are available, so smoke test 4 stays (section 11).
4. **Partly resolved.** Jay uses Windows: shortcut labels show Ctrl on Windows and Cmd on macOS, and Edge on Windows is a manual check (section 9). Still open: Jay's onboarding date.
5. **Accepted.** Swimlanes are off by default; ask Jay after phase A.
6. **Accepted.** "Looks done?" is set by a flow from a routine proposal through the contract in `docs/flows/proposal.schema.json`, into a new `Tasks.LooksDone` boolean (section 6.1). The flow guide for it (F5, proposals in) is not yet written and belongs to phase B.
7. **Accepted.** "Waiting on me" uses a new `Tasks.RequestedBy` text column (section 6.1). "I am waiting on" uses the Waiting fields.
8. **Accepted.** Phase D waits until phases A to C have been used for two weeks; its KPI indicators are then a minimal strip, not the full phase 3 KPI screens of `docs/SPEC.md`.
9. **Accepted.** Keep the unsaved count in the toolbar and the per-card marker as designed (section 5.3); judge from Jay's feedback after phase A.

### Risks
- **Graph latency and throttling:** writes can take a second or more; the queue hides this, coalesces drags and honours `Retry-After`; two users are far below 3,000 requests per 5 minutes. Failed saves stay visible.
- **Scope creep:** the CRM and Engineering tabs attract attention; v2 touches only CRM touchpoints.
- **Copying Trello without its discipline:** counter is the four required fields and the enforced Waiting fields.
- **Single maintainer:** Microsoft Lists remains a working fallback; phase A adds a short runbook section to `docs/SETUP.md`.
- **Migration touches every task:** dry run first, downloadable rollback report, version history as a second path.
- **Library churn:** adapter file limits the blast radius.
- **Public repository:** no real names, contacts, workstream lists or screenshots with data go in tests or fixtures; the hygiene check stays on.

EA impact for this pull request: none.
