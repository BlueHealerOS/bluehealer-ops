---
type: context file for Claude Code
owner: santiago
status: v2, approved as the specification for the CRM MVP; sanitized copy for a public repository
date: 2026-11-25
inputs: the founders' design meeting of 2026-11-23, the owner's private considerations note (C1 to C13) and decision logs (D1 to D22); only the decision labels are kept here
---
# CRM workspace MVP: context for the build

## 1. Purpose and scope
Build the base CRM in bluehealer-ops (top bar tab "CRM", D20) and the first layer on top of it: Jay's daily ranked "who to contact and why" list. The base comes first because the list is only as good as the records and interactions under it (C1, C7).

The MVP is done when both founders can, from a laptop or phone, add a person in under a minute, log a contact in one click, and open a Today view whose top five they agree with, on real data, without anything written outside the founders-only Lists.

In the MVP: Organizations, People, Interactions; Today (ranked list, waiting on, upcoming); Log contact, Snooze, Mute; duplicate warnings with merge history; hub import as a dry-run report plus a separately approved apply; export one person and delete one person; weekly CSV export; indicators feed and ranking effectiveness for the Monday dashboard; the ranking pilot script.

Not in the MVP (later phases): Partners view and profile (D31, waits for counsel), "introduced by" and "also affiliated" (Phase 2, D30), Investors board, Draft email composer, Claude proposals from Granola and Outlook, Top 5 in the Monday and Friday emails, external discovery (D18), LinkedIn automation, offline mode.

## 2. Decisions this build relies on
D20 to D22 stand. D28 to D33 are the recommended options from the considerations note, taken as working decisions until Santiago edits them:
- D23 Store: founders-only SharePoint Lists through Microsoft Graph. The hub registers are the import source; hub wins on identity fields (D17).
- D24 Ranking: deterministic, explainable, computed in the app; Claude never writes rank or records.
- D25 Importance entered 1 to 5, shown as a 0 to 100 priority score.
- D26 An agreed future check-in date counts as followed up for the zero-breach indicators.
- D27 No amounts, shares or terms anywhere in the CRM.
- D28 The ranking pilot (section 9) runs in parallel with the build and gates go-live and the weight values, not the code. Kill criteria agreed with Jay before go-live.
- D29 Broadcast interactions do not reset the check-in clock.
- D30 "Introduced by" is reinstated in Phase 2 (Person goes to 11 fields then). The MVP stays at 10.
- D31 Partners: non-physician partners first, physician advisors after counsel replies. Not in the MVP.
- D32 Questions to counsel sent separately; nothing in the MVP depends on the answers.
- D33 Ranking effectiveness shown on the dashboard.
- Carried over: single Owner (D2); Engagement status in the same lists, Mapped and Targeted excluded from Today (D15); dedupe flags, never auto-merge (D17); Restricted records excluded from Today, digests and drafts (D19). D2, D15, D16, D17 and D19 still need Jay's formal agreement; the build proceeds on them.

## 3. Architecture
- Code in the public repo `BlueHealerOS/bluehealer-ops`: `src/crm/` (UI), `src/crm/model/` (pure functions: ranking, dedupe, derived fields, waiting-on, effectiveness), `src/crm/graph/` (List client), `config/crm-ranking.json` (weights, versioned), `fixtures/crm/` (invented data), `scripts/crm/` (provisioning, pilot, import, export).
- Data in three SharePoint Lists on the founders-only site the app already uses (Stage 0 confirms which): `CRM Organizations`, `CRM People`, `CRM Interactions`, plus `CRM Merge Log`.
- Data access: Microsoft Graph `sites/{site}/lists/{list}/items` with `expand=fields`, paged through `@odata.nextLink`. Writes use PATCH with `If-Match` on the item eTag; a 412 shows "This record changed. Reload to see the update." No new Graph scopes without asking.
- Records are held in memory for the session only. Nothing from the Lists is written to localStorage, IndexedDB, analytics, logs or the console. Reload re-fetches.
- Fixture mode: when the app runs on localhost with `?fixture=crm`, or in tests, the Graph client is replaced by an in-memory adapter seeded from `fixtures/crm/`. All screenshots and recordings use fixture mode.
- Scale: about 220 people and 148 organizations at import, interactions growing by a few hundred a year. Well under the 5,000-item list view threshold. Respect the 12-lookup limit per query: People uses one lookup (Organization), Interactions uses two (People, Organization).

## 4. Data model (MVP)
Every field names its user. "Required" means required at creation.

### CRM Organizations (5 fields)
| Column | Type | Required | Used by |
| Title (name) | text | yes | everywhere |
| OrgType | choice: hospital system, payer, surgeon practice, industry, vendor, investor, accelerator or grantor, counsel, consultant, academic, competitor, government, other | yes | filters |
| Domain | text, lowercased, no scheme | no | dedupe suggestion only |
| RelationshipToBH | choice: customer prospect, partner, vendor, investor, advisor, ecosystem, none yet | no | filters |
| HubPath | text | no | link to the hub note; import identity |

### CRM People (10 user fields, 4 required; plus system fields)
User fields:
| Column | Type | Required | Used by |
| Title (name) | text | yes | everywhere |
| Organization | lookup to CRM Organizations | yes (an "Independent" organization exists for people without one) | company filter, dedupe |
| RelationshipType | choice: investor, advisor, clinical advisor, KOL, customer discovery, hospital, payer, vendor, counsel, consultant, partner, ecosystem, family and friends | yes | cadence, indicators |
| Owner | choice: Santiago, Jay | yes, defaults to the signed-in founder | Today "mine" filter |
| Email | text, lowercased | no | dedupe, export |
| Importance | number 1 to 5, default 3 | no | ranking |
| Comfort | number 1 to 5 | no | intro decisions, shown on the profile; not in the formula |
| AgreedCheckIn | date | no | ranking override, Snooze |
| Stage | choice: Mapped, Targeted, Intro pending, Active, Dormant, Closed, Do not contact; investors additionally Identified, Contacted, Meeting held, Following up, Committed, Passed | yes with default Active for manual add, Mapped for import | Today eligibility, investor filter |
| Sensitivity | choice: Normal, Restricted; default Normal | no | D19 exclusions |

Stage note: the investor stages replace Active for people whose RelationshipType is investor; Paused from the 2026-11-21 spec is folded into Dormant (C6). Mute is Stage = Dormant.

System fields, written only by the app or scripts, never typed: `LastTwoWayAt` (date of the latest non-broadcast interaction), `LastTouchAt` (latest interaction of any type), `LastDirection` (outbound, inbound, two-way), `SourceId` (hub path or import key), `CreatedBy`, `ModifiedBy` (SharePoint built-ins).
`LastTwoWayAt`, `LastTouchAt` and `LastDirection` are denormalized for speed and recomputed from Interactions by a "Recompute" action in Needs attention and by the import script; a mismatch is a Needs attention item.

### CRM Interactions (logged in one click)
| Column | Type | Required | Used by |
| Title (one-line summary) | text, 200 characters | yes | reason text, history |
| Date | date, default today | yes | clocks |
| InteractionType | choice: email, call, meeting, event, message, broadcast | yes, default email | D29 |
| Direction | choice: outbound, inbound, two-way; default two-way for call and meeting, outbound for email and message, outbound for broadcast | yes | waiting on |
| People | multi-lookup to CRM People | yes | everything |
| Organization | lookup, filled from the first person | no | company page |
| FollowUpNeeded | yes or no | no | creates a task if the Tasks list exists (Stage 0) |
| SourceLink | text (Granola note URL, Outlook web link) | no | provenance |
| Sensitivity | choice, inherited as the most restrictive of the people | system | D19 |
Exclusions: no summaries of counsel, equity, tax, banking or deal-structure conversations; link the SharePoint track folder in SourceLink instead. The log form shows this rule in one line.

### CRM Merge Log
Kept record (JSON snapshot of the losing record and its interaction links), merged into, by, at, undone (yes or no). Used by Undo merge.

## 5. Derived values (pure functions in `src/crm/model/`)
- `cadenceDays(person)`: from `config/crm-ranking.json` by RelationshipType. Defaults: investor 14, advisor 30, clinical advisor 30, all others 30, family and friends 30.
- `nextCheckIn(person)`: AgreedCheckIn if set and later than LastTwoWayAt; otherwise LastTwoWayAt plus cadence; if never contacted, today (due now) for Active and investor stages Contacted onward.
- `eligibleForToday(person)`: Stage in Active, Intro pending, or investor stages Identified to Committed; Sensitivity Normal; not Dormant, Closed, Passed, Do not contact, Mapped, Targeted.
- `priorityScore(person, today)`: 8 x Importance + min(40, 20 x daysSinceTwoWay / cadence) + 20 if due. Range 0 to 100. Never-contacted people use daysSinceTwoWay = cadence.
- `reason(person)`: plain sentence from the same inputs, for example "Importance 5. 15 days since last two-way contact, cadence 14. Due. Last: Coffee, discussed bench data (Nov 10)." The reason must be enough to act without opening the profile.
- Order: due first by score descending, then days since contact descending, then name. Not-due eligible people go under Upcoming by next check-in date.
- `waitingOn(person)`: "I am waiting on" if LastDirection is outbound and the last interaction is non-broadcast and older than 3 days; "waiting on me" if LastDirection is inbound. Caveat shown in the view: accurate only for interactions that were logged.
- Indicators: count of eligible investors with nextCheckIn more than 0 days past and daysSinceTwoWay over 14 with no future AgreedCheckIn; same for advisors and clinical advisors over 30. Target zero; red on any breach.
- `effectiveness(history, weeks)`: replays the formula over logged history to reconstruct each working day's Top 5, and reports the share of those people with a two-way interaction within two working days. Labelled "approximate" because it uses current Importance. Shown as a number per week for the last four weeks.
- Weights live in `config/crm-ranking.json` with a `version` and a dated `changelog` array; the Today footer shows the version.

## 6. Views and actions
CRM sidebar sections: Today, People, Organizations, Needs attention, Export.

Today
- Toggle "Mine" (default) and "Both founders". The Monday check-in uses Both.
- Top five due with reason and three actions: Log contact, Snooze, Open. "Show all due" expands.
- Waiting on: two short lists, collapsed by default.
- Upcoming: next 14 days.
- Indicators strip: investors over 14 days, advisors over 30 days, effectiveness last week. Wording "due" in the list, "overdue" only in the indicators.
- Log contact: a sheet with summary (required), type, direction, date (default today), follow-up needed. Saving writes the interaction, updates the person's system fields, and the person leaves the top in the same session.
- Snooze: date picker with quick options (after a holiday you choose, 1 week, 2 weeks, 1 month, first of next month); writes AgreedCheckIn.
- Mute: sets Stage to Dormant, with Undo for 10 seconds.

People
- Table with filters: organization, relationship type, owner, stage, importance; search on name, organization and email.
- Add person: one screen with the four required fields visible and the rest under "More". Duplicate check runs on email and on name plus organization before save; a possible duplicate shows the existing record with "Open existing" or "Create anyway".
- Profile: fields, interaction history newest first, next check-in and reason, Log contact, Export, Delete.

Organizations
- Table with filters; organization page lists its people with last contact and importance (the large-company case: many people at one organization), and its interactions.

Needs attention
- Possible duplicates (people: exact normalized email, then same normalized name within the same organization; organizations: same domain shown as a suggestion only, never for shared domains listed in config such as university and hospital system domains; placeholder emails ignored).
- Merge: side-by-side field choice, writes CRM Merge Log, re-points interactions, deletes the losing record to the SharePoint recycle bin. Undo merge restores from the log.
- People with no interaction, missing email, stale system fields (Recompute), Restricted records (founders-only view).

Export
- Export one person (from the profile): JSON with the person, organization and interactions, for an access request.
- Delete one person (from the profile): confirm dialog naming what will be deleted; deletes interactions linked only to that person and removes the person from shared ones; items go to the SharePoint recycle bin. Merge log snapshots of that person are deleted too.
- Weekly CSV export: People, Organizations and Interactions as three CSV downloads, triggered by a founder. Destination is the founders' choice (private hub repo or SharePoint); the app never uploads it.

Accessibility and layout: keyboard reach for every row action, visible focus ring, works at 390 px with Today as a single column and actions in a sheet; UI copy in sentence case, no em dashes.

## 7. Import from the hub (dry-run first)
- `scripts/crm/import-hub.mjs --hub <path> --out <gitignored dir>` reads frontmatter only from `registers/People/*.md` and `registers/Companies/*.md`, maps fields (mapping table written in Stage 0 and approved by Santiago), normalizes, and runs the dedupe rules against each other and against the current Lists (read-only Graph call with Santiago's signed-in token, or an exported CSV if the script cannot sign in).
- Output: a report with counts and a row per record: new, match (with which field), conflict (identity field differs), skipped (with reason). Imported people get Stage Mapped by default unless the hub note shows a contact in the last 12 months, in which case Active, with that date as LastTwoWayAt and an Interaction "Imported last contact" of type email, direction two-way.
- `--apply` writes only after Santiago has read the report and typed the report's hash as `--confirm <hash>`. Santiago runs `--apply` himself. Claude Code never runs it.
- The script never reads note bodies, never writes to the hub, and writes nothing inside the repo except to the gitignored `imports/` folder.

## 8. Safety and privacy rules
- Public repo: code, schemas, config, invented fixtures only. No real names, emails, organizations, notes or hub content in code, tests, fixtures, commit messages, pull request text, CI logs, screenshots or recordings. Fixture names are obviously invented (for example "Avery Fixture, Example Capital").
- `.gitignore` covers `imports/`, `exports/`, `pilot/`, `*.csv` outside `fixtures/`. A CI check fails on any CSV or JSON under those paths and on email-like strings outside `fixtures/crm/` and test files using the `example.com` domain.
- Network: only the Microsoft sign-in and Graph endpoints the app already uses; the whole-app CSP from the Engineering context applies. No email is sent; no Outlook or calendar access is added in the MVP.
- No Claude, routine or agent writes to the CRM Lists. Claude Code works on code and fixtures only.
- Restricted records: excluded from Today, indicators, effectiveness and CSV export unless "Include restricted" is ticked by a founder.
- Notes stay factual and professional, as if the person could read them; the log form says so.
- Nothing auto-completes: follow-ups and tasks are closed by a founder.

## 9. Ranking pilot (D28; runs in parallel with Stages 1 and 2)
- `scripts/crm/rank-local.mjs <csv>` reads a CSV Santiago keeps in the gitignored `pilot/` folder on his Mac (columns: name, organization, relationship type, owner, importance, last two-way date, agreed date, stage), runs the same `src/crm/model` functions, and prints the top 10 due with reasons and the upcoming list. It writes nothing and makes no network calls.
- For two weeks Santiago runs it before the Monday check-in and the Friday checkout and reads the top 10 to Jay; they note where it disagrees with their judgment. Weight changes go into `config/crm-ranking.json` with a changelog entry.
- Go-live gate: the founders agree the top five on two consecutive Mondays, and Jay has set the kill criterion (proposal for him: after four weeks live, if fewer than half of the weekly Top 5 are contacted within two working days, simplify before building Phase 2).

## 10. Build stages
- Stage 0 Inventory and model (report, then stop): what exists in the repo (shell, routes, auth, Graph client, Tasks list), the Lists site and granted scopes, Business Basic limits that matter; hub frontmatter field mapping proposal; `src/crm/model` with unit tests; `rank-local.mjs`; fixture set. Size estimate for Stages 1 to 3.
- Stage 1 Data layer: List schemas as JSON in `docs/crm/lists/`, a provisioning script or click-through checklist that Santiago runs or approves; Graph adapter and in-memory fixture adapter behind one interface; eTag handling; system-field updates on log; recompute.
- Stage 2 UI: CRM tab and sidebar in the shell; Today, People, Organizations, profiles, add and log flows, Snooze and Mute, duplicate check on create; indicators strip.
- Stage 3 Data hygiene and import: Needs attention with merge and undo; export one, delete one, weekly CSV; effectiveness; `import-hub.mjs` dry-run and gated apply.
Each stage is one pull request on its own branch (`feat/crm-stage0` to `feat/crm-stage3`), reviewed and merged by Santiago before the next starts.

## 11. Acceptance (with evidence in the pull requests)
1. Model tests pass for: due and not due; agreed date suppresses until the date; broadcast does not reset the clock; never-contacted ordering; Restricted, Mapped, Dormant excluded; tie-breaks; indicator counts; effectiveness replay on a fixed fixture history.
2. In fixture mode (20 people, 4 organizations, 40 interactions), Today shows the expected order recorded in `fixtures/crm/expected-today.json`.
3. Log contact on the first person removes them from the top five without reload; a 412 conflict shows the reload message.
4. Add person on a 390 px viewport takes under 60 seconds with only required fields (screen recording, fixture mode).
5. A seeded duplicate is flagged on create and in Needs attention; merge then Undo merge restores both records and their interactions.
6. Export one person produces complete JSON; Delete one person removes the person and solo interactions.
7. Import dry-run on a synthetic hub folder in `fixtures/crm/hub-sample/` produces the expected report; `--apply` refuses without the matching hash.
8. The network panel shows only sign-in and Graph calls; nothing from the Lists in localStorage or IndexedDB.
9. CI guard and lint pass; keyboard-only use reaches every action with a visible focus ring.
10. Go-live (after merge, by the founders): pilot gate in section 9 met, then the dry-run report reviewed and the apply run by Santiago.

## 12. Open points
- Q1 Which SharePoint site hosts the Lists, and whether the app's current Graph scopes cover list creation (Stage 0).
- Q2 Whether a Tasks list and create-task code exist for FollowUpNeeded; if not, the flag shows in Needs attention only.
- Q3 Whether family investors default to Restricted (D19); proposal: yes.
- Q4 Shared domains list for the dedupe exception: start with universities and hospital systems found in the import.
- Q5 Jay's agreement on D2, D15, D16, D17, D19 and his kill criterion before go-live.
