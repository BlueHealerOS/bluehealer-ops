# BlueHealer Ops: implementation plan

Approved by Santiago, 2026-11-22. Requirements are in `docs/SPEC.md`.

## Context
The founders run operations on a shared Trello board and scattered trackers. This app replaces them with a static web app on GitHub Pages that reads and writes founders-only Microsoft Lists through Microsoft Graph, using the signed-in founder's own token. It has no server, adds no monthly cost, and keeps no data in the public repository. Automation runs on Power Automate and the existing Claude routines.

Repository state today: `BlueHealerOS/bluehealer-ops` is public and holds only `README.md`, which already says no data lives there. The hub `BlueHealerOS/bluehealer-hub` was read only and has not been changed.

## Decisions taken in this session (Santiago, 2026-11-22)
1. **Lists live on a new dedicated site**, `bluehealer.sharepoint.com/sites/BlueHealerOps`, with exactly two owners (Santiago, Jay) and no members, visitors or guests. Access comes by inheritance, so no list needs unique permissions. This changes the spec, which put the lists in the BlueHealer site.
2. **Agent access is a rule, not a technical block.** The Claude Microsoft 365 connector on Santiago's account already holds `Sites.Read.All`, `Files.ReadWrite.All` and `Mail.Send` (checked with `get_granted_scopes`). So the claim "agents never receive a token to the lists" cannot be enforced while that connector exists. Routines are instructed to read only the export file and to write proposals only to the drop folder. SPEC.md records this as a known gap.
3. **Tenant plan is Microsoft 365 Business Basic.** Power Automate for Office 365 with standard connectors is included. There is no Entra ID P1, so Conditional Access is not available, and MFA relies on Security Defaults or per-user MFA. Phase 0 checks which one is on.

## Findings from the hub that change the spec
| Topic | Spec says | Hub has | Plan |
|---|---|---|---|
| Tracks | 10 tracks, including "Technical Development" | 12 `knowledge/` folders: adds `Reimbursement`, uses `Research and Development` (matches SharePoint `04`, `06`) | Use the 12 hub folder names (excluding `handoffs`). Editable in Settings |
| Tier | A, B, C | `tier: 1, 2, 3` (1 is strongest), computed by the evening review; 144 of 174 blank | Store A, B, C in the app. On import, map 1 to A, 2 to B, 3 to C, and blank to blank. Hub tier stays canonical for the computed value; the import report flags differences |
| Relationship | Fixed choice list | Free text (for example "Customer discovery (NSF National I-Corps...)", "Counsel", "Vendor contact") | Import keyword map to choices; anything unmatched is left blank and listed in the dry-run report for founders to set |
| Organization on person | Lookup | Wikilink text `[[Company]]` | Resolve by name or alias against imported Organizations; unresolved names are reported |
| Last contact | From interactions | `last-contact` field exists (218 of 220) | Import as `LastContactSeed`; `LastContact` = max(seed, latest Interaction date) |
| Intro path | Introduced by | `introduced-by`, `intro-channel` (warm-intro, event, inbound, cold, mutual-network), `intro-date` | Add `IntroChannel` and `IntroDate` columns to People |
| Tasks | Replace Trello | SHARED-RULES "Tasks" section names Trello as the shared task system | After Phase 1 ships, a hub pull request amending SHARED-RULES (both founders) is needed. Not done in this work |
| Contact details | | Rules allow work email and phone in register notes; bulk contact exports belong in the CRM | Consistent with the People list. The import JSON stays out of Git |

All 220 people, 148 companies, 266 meetings and 10 decisions are `sensitivity: normal` and `hub_status: Working`, so the import maps `Sensitivity` directly.

## Architecture
- **Frontend**: Vite, React 18, TypeScript (strict), Tailwind, shadcn/ui (Radix primitives), TanStack Query for Graph caching, TanStack Router with hash routing (GitHub Pages has no SPA fallback, and hash routes keep filters out of server logs), `@azure/msal-browser` and `@azure/msal-react`, date-fns with date-fns-tz for America/New_York, `zod` for schema validation, `vite-plugin-pwa` for the PWA. All are open source.
- **Hosting**: GitHub Pages, deployed from `main` by `actions/deploy-pages`. URL: `https://bluehealeros.github.io/bluehealer-ops/` (to verify: the org Pages URL is lowercase).
- **Auth**: Entra single-tenant SPA registration. Authorization code flow with PKCE through MSAL.js, no client secret. Tokens are kept in `sessionStorage`, so closing the tab signs the founder out locally (MSAL default cache option). SPA refresh tokens last 24 hours, so a daily sign-in is expected (to verify). `config/tenant.json` holds the tenant ID, client ID, site hostname and path. These are identifiers, not secrets.
- **Gate**: the router renders only `<SignIn/>` until MSAL has an account and a Graph call to the site succeeds. A 401 or 403 from SharePoint shows "Access denied by SharePoint" and clears the cache. The bundle contains no data and no names. Fixtures stay in tests only.
- **Data**: 16 Microsoft Lists on the BlueHealerOps site, through Graph v1.0 `/sites/{siteId}/lists/{listId}/items`.
- **Fallback**: founders can use the Microsoft Lists web or iPhone app on the same lists. Column display names are readable, and the main relations are true lookups, so items still make sense there.

### Graph scopes (delegated)
| Scope | Why | Phase |
|---|---|---|
| `User.Read` | Profile and identity | 1 |
| `Sites.Selected` | Read and write lists on BlueHealerOps only. Effective access is the intersection of the app grant and the user's own SharePoint rights (Microsoft Learn, "Selected permissions overview": "both the application and user permissions are calculated and then intersected") | 1 |
| `Mail.ReadWrite` | Create Outlook drafts. There is no narrower drafts-only scope. This scope also allows reading mail, so the app code never calls a mail read endpoint, and a test asserts it | 1 |
| `Calendars.Read` | Find Monday, Wednesday and Friday meetings and ad hoc events for agendas | 1 |
| No `Mail.Send`, no `Sites.ReadWrite.All` | | |

**Site grant**: an admin uses Graph Explorer, signed in with `Sites.FullControl.All` consented (admin only), to call `POST /sites/{siteId}/permissions` with `roles` and `grantedToIdentities: [{application: {id: <clientId>}}]`. Allowed roles are read, write, owner and fullcontrol.

**To verify in Phase 0**: whether the `write` role allows creating lists and columns, or whether `owner` is needed. Plan: grant `owner` for provisioning, then step down to `write` once the schema is stable if `write` covers items and version reads. A Phase 0 smoke test (create a scratch list, then delete it by hand) settles this.

`Lists.SelectedOperations.Selected` is not used. One site already scopes access, and community reports of list grants misbehaving are unresolved.

### Microsoft limits and how the design respects them
- **List view threshold 5,000** (fixed in SharePoint Online). Every list stays well under it for years: Interactions grows fastest, at roughly 2,000 a year at most. Every column used in `$filter` is created with `indexed: true`. Graph filters on one indexed field at a time (Graph `listitem-list` docs), so queries filter on one indexed column (for example `Status`, `DueDate`, `Owner`) and the client filters the rest. Queries on non-indexed fields are never sent. Small lists (under 2,000 items) are fully loaded and cached, then filtered in memory. This is the main pattern.
- **Lookup threshold 12** per query (people, lookup and managed metadata columns). Each list has at most 4 single-value lookup columns. Many-to-many relations are stored as an ID list in a text column (`;12;45;`) and resolved on the client.
- **Throttling**: Graph returns 429 or 503 with `Retry-After`. The client honours `Retry-After`, uses exponential backoff with jitter, and runs at most 4 requests at a time. Imports and provisioning use `$batch` (20 requests per batch) with the same handling. Two users stay far below the limits.
- **Version history**: lists created in SharePoint Online have versioning on by default (to verify). Phase 0 confirms it in List settings, Versioning, for each list. The app reads `GET .../items/{id}/versions` (Graph v1.0) for the History panel. Graph cannot set versioning, so provisioning checks it through the SharePoint UI checklist and states that it does so.

## SharePoint list schemas
Conventions:
- Every list has `Title` (built in), `Owner` (choice: Santiago, Jay, Both, Unassigned; indexed), `Sensitivity` (choice: normal, restricted; default normal; indexed), `Labels` (text: free tags separated by `;`), `Track` (multi-choice: the 12 hub tracks), `HubPath` (text), `Source` (choice: manual, intake, meeting, email, agent, Trello import), `ExtId` (text, indexed; import idempotency key, for example `hub:People/Firstname Lastname.md` or `trello:<cardId>`), and `ReminderOptIn` (boolean: lets a restricted record into digests).
- Built-in `Created`, `Modified`, `Author` and `Editor` give the audit trail together with versions.
- "Lookup" means a Graph `lookup` column (`listId`, `columnName: Title`). "IDs" means text holding `;id;id;`.
- `(i)` marks an indexed column.

| List | Columns |
|---|---|
| **Tasks** | Description (multi-line text), Status (i) (choice: Proposed, Inbox, Next, In progress, Waiting, Done, Dropped), Priority (choice: P0, P1, P2, P3), DueDate (i) (dateTime, date only), StartDate, EstimateMinutes (number), Recurrence (text, RRULE subset: daily, weekly by day, monthly by day), ContributionType (choice: Milestone, Key result, Application, Fundraising follow-up, Relationship, Operations), Milestone (lookup to Milestones), KeyResult (lookup to KeyResults), Application (lookup to Applications), Person (lookup to People), OrgIds (IDs), BlockedByIds (IDs), Links (multi-line text, JSON of {label, url}), Checklist (multi-line text, JSON), WaitingOn (text), WaitingExpected (dateTime), OutcomeNote (multi-line text), DropReason (text), Context (choice), Effort (choice: 15 min, 1 hour, half day, multi-day), ThisWeek (i) (boolean), TodayDate (dateTime: the day pulled into Today), Agenda (boolean), MeetingId (number), CompletedAt (i) (dateTime), RecurrenceParentId (number) |
| **Milestones** | Description, TargetDate (i), BaselineDate, Status (i) (choice: not started, on track, at risk, late, done), DependsOnIds (IDs), ApprovalGate (choice: none, Jay, Santiago, Both), ApprovedDate, EvidenceLinks (JSON), ObjectiveIds (IDs) |
| **Objectives** | Quarter (i) (text, `2027-Q1`), Approver (choice), Status (choice: draft, active, done, dropped) |
| **KeyResults** | Objective (lookup), MetricDefinition, Baseline, Target, Current (number), Unit (text), Confidence (choice: on track, at risk, off track), CheckIns (multi-line JSON {date, value, confidence, note}) |
| **KPIs** | Definition, Frequency (choice: weekly, monthly, quarterly), KpiSource (choice: manual, computed), ComputedKey (text: a key into the app's metric registry), TargetLow, TargetHigh (number), Unit |
| **KPIMeasurements** | KPI (lookup) (i), PeriodStart (i) (dateTime), Value (number), Note |
| **Organizations** | OrgType (i) (choice: hospital system, payer, surgeon practice, industry, vendor, investor, accelerator or grantor, counsel, consultant, academic, competitor), Website (hyperlink), Aliases (text) |
| **People** | Organization (lookup), Role, Email (i) (text), Phone, LinkedIn (hyperlink), RelationshipType (i) (choice: customer discovery, clinical advisor, KOL, payer, hospital, vendor, investor, counsel, consultant, partner), IntroducedBy (lookup to People), IntroChannel (choice), IntroDate, Tier (choice: A, B, C), CadenceDays (number), LastContactSeed (dateTime), LastContact (i) (dateTime, maintained by the app on interaction save), NextFollowUp (i) (dateTime), Stage (i) (choice: union of all stage sets; the app limits it by RelationshipType), NextStep (text, 255), Aliases |
| **Interactions** | Date (i), InteractionType (choice: email, call, meeting, event, message), PeopleIds (IDs), Person (lookup: primary person, for the fallback UI), Summary (multi-line, 2,000 characters), FollowUpTaskId (number), SourceLink (hyperlink) |
| **Programs** | Organization (lookup), ProgramType (choice: grant, SBIR or STTR, competition, accelerator, fellowship, pitch event, prize), Benefit (text; descriptive only, no award amounts, per SHARED-RULES), Eligibility, Url, Cycle (text) |
| **Applications** | Program (lookup), Cycle, Stage (i) (choice: Scouted, Qualifying, Preparing, Submitted, Under review, Awarded, Declined, Withdrawn, Reporting, Closed), LoiDue, FullDue (i), InterviewDate, ReportingDue, Materials (JSON checklist), FolderLink (hyperlink), Result (text), AnswersUsedIds (IDs) |
| **AnswerBank** | QuestionPattern, Canonical, ShortVersion, LongVersion (multi-line), WordCount (number), LastVerified (i), VerifiedBy (choice), SourceLinks (JSON), AnswerStatus (choice: current, needs review, retired) |
| **Intake** | Raw (multi-line, 8,000 characters, plain text), RawSource (choice: share sheet, email forward, meeting, quick add, Trello import, routine), ReceivedAt (i), TriageState (i) (choice: New, Proposed, Accepted, Rejected, Converted), ProposedType (choice: task, CRM interaction, intel, application opportunity, answer bank update, hub knowledge note, discard), ProposalJson (multi-line), Rationale (text), ResultListName, ResultItemId, IntelSummary, MessageId (i) (text, dedupe) |
| **Meetings** | MeetingKind (choice: Monday check-in, Wednesday vendor review, Friday checkout, ad hoc), Start (i), CalendarEventId (text), NoteLink (hyperlink: Granola or hub path), AgendaJson, ActionsCreated (boolean) |
| **Labels** | Facet (i) (choice: Track, Context, Effort, Relationship type, Tag), Value, Color, SortOrder, Active |
| **Settings** | Key (i), ValueJson (multi-line), Scope (choice: global, Santiago, Jay). Holds saved views, Today cap (default 7), the "send internal digests" flag (default false), quiet hours, Reminder ledger reference, stage sets |
| **ReminderLog** (added) | RecordKey (i) (text `List:id`), Trigger, Day (i) (date), Channel (choice: app, digest), SnoozedUntil, Founder. Enforces "one reminder per record, trigger and day" for flows and the app |

This makes 17 lists (16 from the spec plus ReminderLog).

**Stage sets** are stored in Settings, keyed by RelationshipType:
- investor: Identified, Contacted, Meeting held, Following up, Committed, Closed, Passed, Paused
- customer discovery, payer, hospital: Identified, Contacted, Meeting held, Following up, Engaged, Dormant
- other types: Active, Dormant

**Not stored anywhere** (validated in code): amount, valuation, terms, cap table, equity, bank or wire details, accreditation, tax, identity or compensation data.
- The schema test fails if any column name or choice matches a deny pattern (`amount|valuation|equity|cap.?table|wire|bank|ssn|salary|accredit|term sheet`).
- A text-content guard warns in the UI and blocks saving a Summary or NextStep that contains a currency figure (`$` or `USD` followed by digits), with a message pointing to `Documents/09 Pitch and Investors`.

**Provisioning**: `schema/lists.json`, validated by zod, is the single source. An Admin page runs `provision(schema)`. For each list it calls `GET /sites/{id}/lists?$filter=displayName eq 'X'`, then creates the list (`POST /lists` with `columns` and `list.template: genericList`) or diffs and adds missing columns (`POST /lists/{id}/columns`) and choice values (`PATCH /columns/{id}`). It never deletes or renames. It creates lookup targets first (topological order), writes a provisioning record to Settings (schema hash and date), shows a dry-run diff before applying, and is idempotent.

## Auth flow
1. App load: `PublicClientApplication.initialize()` then `handleRedirectPromise()`.
2. No account: show the sign-in screen only. "Sign in with Microsoft" calls `loginRedirect` with the scopes `User.Read` and `Sites.Selected` (iOS PWAs handle redirect better than popup).
3. The account must belong to the tenant (`tid` check). The app then makes a probe call, `GET /sites/{hostname}:/sites/BlueHealerOps`. A 403 or 404 shows the access-denied screen, which is the real control.
4. `Mail.ReadWrite` and `Calendars.Read` are requested incrementally the first time a founder opens the composer or the agendas (`acquireTokenSilent`, falling back to `acquireTokenRedirect`).
5. Sign out: `logoutRedirect` plus a TanStack Query cache clear.

## Reminder and intake flows
All flows are owned by Santiago's account, live in the default environment and use only standard connectors (SharePoint, Office 365 Outlook, Schedule, Data operations). Each guide in `docs/flows/` gives the trigger, each action with exact settings, the expressions, and a test procedure. Packages are exported as `.zip` only if they contain no tenant data (to verify; connection references contain IDs, so the guides are the deliverable and packages are optional).

### F1 Intake mailbox to Intake list (Phase 1)
Shared mailbox `intake@<tenant-domain>`. A shared mailbox is free and needs no license (to verify for Business Basic). Only Santiago and Jay get Full Access.
1. Trigger: Office 365 Outlook "When a new email arrives in a shared mailbox (V2)" (to verify that it is a standard connector).
2. Condition: sender is Santiago's or Jay's address. Otherwise move the message to an `Ignored` folder and stop. This stops strangers from injecting intake items.
3. Html to text on the body, then truncate to 8,000 characters.
4. SharePoint "Get items" on Intake with filter `MessageId eq '<internetMessageId>'`. If an item exists, stop (dedupe).
5. SharePoint "Create item" on Intake: Title = subject (or the first URL), Raw = text, RawSource = share sheet (subject starts with `[share]`) or email forward, ReceivedAt = received time, TriageState = New, Sensitivity = normal, MessageId.
6. Move the email to a `Processed` folder.

The iPhone Shortcut ("Send to BlueHealer intake") takes the share-sheet URL and text and sends mail to `intake@` with subject `[share] <title>` from the founder's own Mail account. The guide is in `docs/flows/shortcut.md`.

### F2 Daily digest (Phase 1)
Recurrence weekdays 07:30, time zone (UTC-05:00) Eastern. One run loops over the founders [Santiago, Jay].
1. "Get items" queries on indexed columns, filtered in the flow:
   - Tasks with Status not Done or Dropped and DueDate on or before today, Owner in (founder, Both)
   - Tasks Waiting with WaitingExpected before today
   - Applications with FullDue, LoiDue or ReportingDue in {T-21, T-14, T-7, T-2, T-0}
   - People with NextFollowUp on or before today
   - Milestones with Status at risk or late
2. Filter array: remove `Sensitivity eq restricted` unless `ReminderOptIn`.
3. Filter array against ReminderLog for today. Append ReminderLog rows for the items included.
4. Compose an HTML table with deep links `https://.../#/tasks/123` (IDs only).
5. If Settings `send_internal_digests` is false: Office 365 Outlook "Draft an email message" (to verify that the action exists in the tenant). Otherwise "Send an email (V2)" to the founder only. The send branch is fixed to the founder's own address; the guide forbids any other recipient.
6. Quiet hours: the trigger time is 07:30 by design, and the flow checks `convertTimeZone(utcNow())` hour < 21 and ≥ 7, then exits otherwise.

### F3 Meeting packs (Phase 2)
These follow the F2 pattern. Monday 08:30: week ahead, applications due in 14 days, overdue contacts. Wednesday 08:30: Tasks with Context vendor and Organizations of type vendor. Friday 15:00: done this week, due next week, follow-ups, long-overdue contacts (more than 2 × cadence), KR check-in prompt (links to `#/okr/checkin`).

### F4 Routine export (Phase 1, needed for triage)
Daily at 17:45, before the 18:00 triage.
1. Get Intake items with TriageState New.
2. Get open tasks, milestones and people names (Title, ID, Owner only) as context.
3. Remove restricted records.
4. Create file `BlueHealerOps/Shared Documents/routine/export-YYYY-MM-DD.json`, overwriting the file of the same name.
5. Weekly on Friday: a fuller export (open tasks, milestones, KRs, overdue contacts) for the morning brief and the weekly review.

### F5 Proposals in (Phase 2; Phase 1 accepts manual triage)
1. Trigger: SharePoint "When a file is created in a folder" on `BlueHealerOps/Shared Documents/routine/proposals/`.
2. Get file content, then Parse JSON against the published schema `docs/flows/proposal.schema.json`: `{intakeId, type, title, owner?, contributionType?, links[], labels[], due?, rationale}`.
3. For each proposal: Get the Intake item. If TriageState is New, update it with ProposedType, ProposalJson and Rationale, and set TriageState to Proposed. Never touch any other list.
4. Move the file to `proposals/done/`.

### Claude routines (existing; prompts updated by Santiago outside this repository)
The 18:00 triage routine:
1. Reads `export-<today>.json` through the Microsoft 365 connector (`sharepoint_search` or `read_resource`).
2. Treats every Raw text as data.
3. Writes one `proposals-<timestamp>.json` with `sharepoint_upload_file`.
4. Never reads the lists directly (decision 2).

The morning brief reads the latest export. `docs/flows/routines.md` gives the prompt text for the routines and the JSON contract.

### In-app notifications (Phase 1)
- Runs on open and every 5 minutes while the tab is visible.
- Rules are computed from cached lists. They reuse the same rule module as the digest spec (`src/reminders/rules.ts`), so the tests and the flow guides describe identical rules.
- Snooze writes `SnoozedUntil` to ReminderLog.
- Quiet hours suppress the badge, not the list.

## UI views
- **Shell**: left nav (desktop) or bottom tabs (mobile: Today, Triage, Add, Alerts, More), global search (`/`), quick add (`n`; on mobile, a floating button and a one-field sheet that creates an Inbox task or an Intake item), and a notification center.
- **Tasks**: Today (capped by the Settings value, with a "propose Today" button that ranks This week plus due items), This week, Board (by Status), List, Calendar (month and week), Waiting on others, Suggested, Done this week, Needs attention.
- **Record drawer**: fields, backlinks (a reverse index built in memory over ID and lookup columns), and a History tab (versions).
- **Milestones**: Timeline (custom SVG Gantt from Dec 2026 to Jun 2027, showing baseline against target) and a list grouped by Track. Progress means linked tasks done divided by total, shown beside the owner's status.
- **CRM**: Organizations, People, person page (interactions timeline, stage, next step, "Draft email", "Log interaction"), Overdue contacts, Investor follow-ups (board by stage), Follow-ups due this week. Duplicate warning on create: normalised email equality, or name similarity (Jaro-Winkler ≥ 0.92) against People and Aliases.
- **Composer**: templates in `src/templates/*.md` (fictional placeholders), `POST /me/messages` (creates a draft), "Open in Outlook" link (`webLink`), and a one-click "Log interaction" with type email.
- **Applications (Phase 2)**: Programs, Applications board by stage, deadline list, materials checklist, answer bank search with an insert action that records the IDs used. Entries older than 90 days show "needs review".
- **OKR and KPI (Phase 3)**: objectives with KRs, check-in form, KPI chart (a lightweight SVG sparkline and line chart, no heavy dependency), metric registry for computed KPIs.
- **Meetings**: list of calendar events from `GET /me/calendarView` for the next 14 days matched to the meeting kinds. The agenda builder collects tasks flagged Agenda, overdue items and decisions needed (tasks labelled `decision`). Afterwards the founder enters action lines, which become tasks in one step, and adds the note link.
- **Triage**: card per Intake item with the proposal pre-filled. Actions: Accept, Edit and accept, Convert type, Reject (one click each, keyboard `a`, `e`, `c`, `r`). Accepting creates the target record and sets ResultListName and ResultItemId. Hub notes export as a markdown download.
- **Admin**: Provision (dry run, then apply), Import People and Companies JSON (dry run report, then import), Import Trello JSON, Seed February milestones (six drafts), Versioning checklist.
- **Settings**: labels and facets, Today cap, stage sets, saved and pinned views, digest flag (with a confirmation that names "internal founders only").
- **Filtering**: facet bar. AND across facets, OR within a facet. The URL query holds facet values and IDs only. The ten default views are seeded into Settings.

Accessibility: Radix primitives, visible focus, contrast checked in CI, and an axe pass in Playwright on the main views.

## Imports
- **Hub People and Companies**: Santiago runs `scripts/hub-export.mjs` (in the repository, no data) locally against his hub clone. It writes `hub-export.json` (frontmatter only, no note bodies) outside the repository. The Admin page loads the file (it is read in the browser, never uploaded anywhere else). The dry-run report shows creates, updates by `ExtId`, unresolved organizations, unmapped relationships, tier conversions and possible duplicates. Import uses `$batch`. It is idempotent on `ExtId` and never overwrites a field a founder edited after the last import (it compares `Modified` with the import timestamp).
- **Trello**: board JSON export, read in the browser. Open cards become Intake items with RawSource Trello import, Title = card name, Raw = description and the card URL, and `ExtId: trello:<id>`. Labels map to Tags. Done or archived cards are skipped. Dry run first.
- `.gitignore` covers `*.json` exports outside `schema/`, `config/` and `fixtures/`. CI fails if `hub-export*.json` or `trello*.json` is tracked.

## Test strategy
- **Unit (Vitest)**: reminder rules (quiet hours, T-21 to T-0, one per record, trigger and day, restricted exclusion), stage-set logic, recurrence, ranking for Today, contribution-type gate (Inbox to Next requires a type; strategic types require a link), schema validation and the deny-list, import mappers (tier, relationship, organization resolution), duplicate detection, currency guard, export filter (restricted never in export, digest or pack payloads).
- **Graph mock**: MSW handlers backed by an in-memory list store built from `fixtures/` (fictional people such as "Avery Placeholder" at `example.com`). They emulate 429 responses, paging (`@odata.nextLink`), the one-indexed-filter rule, and 403 for the non-founder case.
- **Playwright** (`--trace off`), against `vite preview` with MSAL mocked by a test auth adapter:
  - (a) no token renders only the sign-in screen, and the DOM and network contain no list calls
  - (b) 403 renders access denied
  - (c) the Phase 1 acceptance journey (below)
  - (d) investor journey with no amount field present (DOM scan)
  - (e) mobile viewport for Today, Triage, quick add and alerts
  - (f) an axe check
- **CI** (`.github/workflows/ci.yml`): typecheck, eslint, vitest, playwright, gitleaks (`gitleaks/gitleaks-action`, free for org public repos; to verify licence terms), and `scripts/check-fixtures.mjs`. The fixtures check rejects real-looking emails (any domain other than `example.com`/`.org`/`.net`), the bluehealer.co domain, phone numbers outside 555-01xx, and any name on a denylist built at CI time from nothing in the repo; it uses a fictional-name allowlist plus a pattern check instead. CI also checks that no `.env` file exists.
- **Manual checks per phase**: a non-founder tenant account (a test account created and then removed, or an existing Business Basic seat) gets access denied, and the demo script is run on Pages.

## Deployment
- `deploy.yml` on push to `main`: build with `base: '/bluehealer-ops/'` and deploy with `actions/deploy-pages`. PWA manifest and service worker: the service worker precaches only the app shell, and Graph responses are never cached by the service worker (Phase 3 adds an opt-in, session-scoped read cache in memory or `sessionStorage`).
- Branch protection on `main` (Santiago): require pull requests and passing CI, with no direct pushes.

## Cost (target zero incremental)
| Component | Assumption | Verify |
|---|---|---|
| GitHub Pages and Actions | Free for public repositories | Org plan has Pages enabled |
| Entra app registration | Free | None |
| SharePoint site and Lists | Included in Business Basic storage | Tenant storage headroom |
| Shared mailbox | Free under 50 GB with no license | Exchange admin shows no license needed |
| Power Automate | Included with Business Basic, standard connectors only; 6,000 requests per user per day limit (to verify current figure) | Each flow stays under a few hundred actions per run |
| Claude routines | Existing subscription | None |
| npm dependencies, gitleaks | Open source | Licences listed in each pull request |

## Santiago's tenant admin steps (`docs/SETUP.md`, Phase 0)
1. Confirm MFA: Entra admin center, Overview, Properties, Security defaults is on (or per-user MFA for both accounts).
2. Create the site `BlueHealerOps` as a team site without a Microsoft 365 group (communication site or "Team site, no group" via the SharePoint admin center), so there are no group members. Owners are Santiago and Jay. Remove the default Members and Visitors groups' contents, and turn off external sharing for this site.
3. Register the app in Entra:
   - Single tenant.
   - SPA redirect URIs: `https://bluehealeros.github.io/bluehealer-ops/` and `http://localhost:5173/`.
   - Delegated API permissions: User.Read, Sites.Selected, Mail.ReadWrite, Calendars.Read.
   - Grant admin consent.
   - Under "Assignment required", set Enterprise app, Properties, Assignment required = Yes, and assign only Santiago and Jay. This is a second gate that is free on Business Basic (to verify).
4. Grant the site permission: in Graph Explorer, consent `Sites.FullControl.All` for yourself temporarily, call `POST /sites/{BlueHealerOps id}/permissions` with role `owner` for the app's client ID, confirm with GET, then remove the Graph Explorer consent.
5. Create the shared mailbox `intake@<tenant-domain>`, give Full Access to both founders, and create the `Processed` and `Ignored` folders.
6. Create the folders `Shared Documents/routine/` and `routine/proposals/` on BlueHealerOps.
7. GitHub: Settings, Pages, Source = GitHub Actions. Branch protection on `main`.
8. Put the tenant ID, client ID and site ID into `config/tenant.json` in a pull request (identifiers only).
9. After provisioning, check versioning is on for each list (Admin page checklist).
10. Build flows F1, F2 and F4 from the guides (Phase 1), and F3 and F5 later (Phase 2). Update the Claude routine prompts from `docs/flows/routines.md`.

## Phased build order and acceptance checks
Each phase is one branch and one draft pull request until CI is green. Each updates SPEC.md and README and includes `docs/demo/phase-N.md`.

**Phase 0 (manual)**: the steps above. Accepted when the probe call succeeds for both founders, a non-founder gets 403, and the scratch-list test settles whether `write` or `owner` is needed.

**Phase 1 (MVP, about 2 weeks; it can be split into 1a and 1b pull requests if large)**
- **1a**: scaffold, CI, deploy, auth gate, Graph client, schema and provisioning, Settings, Labels, filters, Tasks with all views, recurrence, notifications, ReminderLog.
- **1b**: Milestones with timeline and seed, CRM (organizations, people, interactions, stages, overdue, investor board, duplicates), composer drafts, Intake and Triage, Meetings and agendas, imports, flow guides F1, F2, F4 and the Shortcut guide.
- **Acceptance checks**:
  - The Playwright journey: an intake item (mock of F1 output) appears in Triage, is accepted as a task, is linked to a milestone, and shows in Today on its due date. The in-app reminder fires, completion updates milestone progress, and a KR prompt appears if linked.
  - Investor journey: stages Identified, Contacted, Meeting held, Following up; a draft created (`POST /me/messages` asserted); interaction logged; DOM scan finds no amount field.
  - Live: a real iPhone share reaches Intake through F1. Restricted-exclusion unit tests pass for the export and digest payloads. A non-founder manual check is done.

**Phase 2**
- **Scope**: Programs, Applications, AnswerBank (insert, record usage, 90-day review); F3 and F5 guides with the proposal schema; Triage consuming proposals; Needs attention list; KR prompts on Friday.
- **Acceptance**: a fictional proposals file in the mock is ingested, then accepted. Deadline T-rules are tested. The answer is inserted and recorded.

**Phase 3**
- **Scope**: Objectives, KRs, KPIs, measurements, computed metrics (investor meetings per week, overdue contacts, applications submitted), charts, analytics page, opt-in PWA offline read cache (session-scoped by default).
- **Acceptance**: computed KPI tests on fixtures, and an offline test showing no record content in persistent storage unless the opt-in is on.

### Requirement to phase and test map (summary; the full matrix goes in PLAN.md)
| Requirement | Phase | Test |
|---|---|---|
| Sign-in-only without token | 1a | Playwright (a) |
| Founders-only via SharePoint | 0, 1a | Manual non-founder check, Playwright (b) |
| Restricted excluded from digests, packs and exports | 1a, 1b, 2 | Unit export and digest filter |
| No deal amounts | 1a | Schema deny-list unit, DOM scan, currency guard unit |
| Contribution gate | 1a | Unit and Playwright |
| Reminder rules and quiet hours | 1a | Unit |
| Provisioning idempotent | 1a | Unit against the mock (run twice, no diff) |
| Imports dry run | 1b | Unit mappers, Playwright admin |
| Draft-never-send | 1b | Unit: the Graph client has no `/send` path; lint rule bans the string `sendMail` |
| Version history panel | 1b | Playwright with mocked versions |
| Proposals ingestion | 2 | Mock flow output and Triage |
| KPIs computed | 3 | Unit |

## Open questions and assumptions
1. **Git branch**: the launch prompt names `plan/spec`. This session is limited to pushing `claude/dazzling-carson-7wb70t`. Plan: commit SPEC.md and PLAN.md there and open a draft pull request only when asked. Say if `plan/spec` is wanted, and I will push it with your permission.
2. **To verify (Phase 0 smoke tests, since Microsoft Learn could not be fetched directly from this container; checked through a scraping service instead)**:
   - whether the `write` role covers list creation
   - default versioning on Graph-created lists
   - "Draft an email message" action in Power Automate
   - that the shared-mailbox trigger is standard
   - the Power Automate request limits for Business Basic
   - "Assignment required" on Business Basic
3. **Assumption**: `Owner` is a choice column, not a person column. This keeps lookups under the threshold and matches the "Both" and "Unassigned" values.
4. **Assumption**: decisions needed in agendas come from tasks labelled `decision`. The hub `registers/Decisions` stays canonical and is linked by path only.
5. **Assumption**: Meetings in the app are agenda shells. Hub meeting notes are not imported. 266 exist, linked by HubPath on demand.
6. **Open**: should Jay's routines (if any) use the same export file? The plan assumes yes, read-only.
7. **Open**: a hub pull request to amend SHARED-RULES "Tasks" (Trello to the ops app) and to optionally add `ops_id`. It needs both founders and is outside this work.
8. **Known gap (decision 2)**: the agent restriction is a policy control. Review it if Microsoft or Anthropic offer per-site consent for the connector.

## Files the first commit adds (on approval)
- `docs/SPEC.md`: the launch prompt, revision 3, with decisions 1 to 3, the hub findings table and the resolved items.
- `docs/PLAN.md`: this plan, expanded with full column tables (types, required, defaults, index flags), the full requirement matrix, and the per-flow step lists.
- No code and no data.

## Verification of this plan session
- `git diff` shows only `docs/SPEC.md` and `docs/PLAN.md`.
- Grep the two files for `@`, phone patterns, and real person or company names from the hub. The only names allowed are the founders and BlueHealer, which are already public in the README context.
- Santiago reviews and approves.
