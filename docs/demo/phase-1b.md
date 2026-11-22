# Demo script: Phase 1b

Run on the GitHub Pages deployment after the Phase 1a demo.

## Setup and imports (Admin)
1. On the hub clone, run `node scripts/hub-export.mjs <hub-dir> <path outside this repository>/hub-export.json`. It writes frontmatter only and refuses to write inside the repository.
2. Admin, choose the hub export file. Read the dry run (new, fill, unresolved organizations, unmapped relationships, tier conversions, possible duplicates). Press Import now. Run it again: everything is unchanged.
3. Admin, choose a Trello board export: the dry run counts open cards. Import: they appear in Triage.
4. Admin, Seed end-of-February milestones: six drafts appear on Milestones for confirmation.

## Phase 1 acceptance journey
1. From the iPhone, share a link with the `Send to BlueHealer intake` Shortcut. Within a few minutes it appears in Triage (flow F1 must be running).
2. Triage: choose type task, contribution type Milestone, pick the milestone, set a due date of today, Accept.
3. Today: the task appears. Alerts: a "Due today" reminder shows.
4. Milestones: the milestone shows "0 of 1 tasks done". Mark the task done in Today, return to Milestones: "1 of 1 tasks done".

## Investor follow-up
1. Relationships, New person: choose relationship type investor. Stages offered are Identified to Paused. There is no amount, valuation or terms field anywhere.
2. Investor follow-ups: move the person from Identified to Contacted (edit, change Pipeline stage, Save).
3. Draft email tab: choose a template, Save draft in Outlook. Open Outlook: the draft is there and nothing was sent.
4. Log this interaction: add a follow-up date. A task "Follow up with ..." is created, Last contact updates, and the person's Next follow-up is set.

## Meetings
1. Meetings: your Outlook events for the next 14 days appear. Create agenda for the Monday check-in: flagged, overdue and decision items are collected.
2. Type action items, one per line, and press Create tasks from actions: they land in Inbox.
