# Provisioning the CRM lists (Santiago runs this)

Claude Code never runs provisioning. Nothing here deletes, renames or edits an existing list. Only four new lists are created: `CRM Organizations`, `CRM People`, `CRM Interactions`, `CRM Merge Log`. The Phase 1 lists (People, Organizations, Interactions and the rest) are not touched.
Schemas: [lists/README.md](lists/README.md) and one JSON file per list in [lists/](lists/). The schema version printed below must match the one in that README.

## Before you start
- [ ] You are on the founders-only site that already holds the app's lists, and your account can add lists there. If the app's own Admin page can create lists for you, you have the right.
- [ ] Nobody else is signed in as an owner of the site who should not see CRM data. Permissions on the new lists are inherited from the site: confirm the site is founders only (Santiago and Jay).
- [ ] Node 22 is installed (`node --version`).

## Option A: the script (recommended)
1. Get a Microsoft Graph access token for your own sign-in that can write to the site (Sites.Selected with write on this site). Put it in the shell for this one command; do not save it in a file or paste it anywhere.
2. Print the schema version with no network call:
   ```bash
   node scripts/crm/provision-lists.mjs --version
   ```
3. Dry run. It only reads and prints what it would create:
   ```bash
   GRAPH_TOKEN=<token> node scripts/crm/provision-lists.mjs
   ```
   Expect `4 lists to create` and `Dry run only`. A 403 here means your grant cannot write to the site; stop and use Option B.
4. Create the lists, passing the version the dry run printed:
   ```bash
   GRAPH_TOKEN=<token> node scripts/crm/provision-lists.mjs --apply --confirm <version>
   ```
5. Run the dry run again. It must report `0 change(s) planned`.

## Option B: click-through in SharePoint
Create each list as a blank list, with the exact name and column internal names from [lists/README.md](lists/README.md). Create `CRM Organizations` first, then `CRM People`, then `CRM Interactions` and `CRM Merge Log`.
- [ ] Column names have no spaces (the internal name must equal the display name).
- [ ] Choice columns use exactly the listed choices and defaults.
- [ ] `Organization` on People is a lookup to `CRM Organizations` (Title). On Interactions, `People` is a lookup to `CRM People` that allows several values, and `Organization` is a lookup to `CRM Organizations`.
- [ ] Number columns `Importance` and `Comfort` have minimum 1 and maximum 5.
- [ ] `Email` and `SourceId` on People are indexed.
- [ ] Required columns are marked required.

## Check afterwards
- [ ] Four new lists exist and each shows only the founders in its permissions.
- [ ] `CRM People` has 14 columns including Title; `CRM Interactions` has 9; `CRM Organizations` has 5; `CRM Merge Log` has 7.
- [ ] The dry run reports 0 changes.
- [ ] Run the [live smoke test](live-smoke-test.md) with two invented people, before the import.
- [ ] The lists are empty. Importing is a separate step (Stage 3) that you run yourself.

## If something goes wrong
Delete only the four `CRM ...` lists in SharePoint (they are new and empty) and start again. Never delete the Phase 1 lists.
