# Live smoke test of the CRM on the real site (Santiago runs this)

About 15 minutes, once, after the four CRM lists are provisioned and before the hub import. It uses two invented people and no real data. Claude Code never runs it: it needs your own sign-in to the real site.

## Why it exists
The CRM was built and tested against a model of Microsoft Graph, not against SharePoint. Four behaviours are assumptions until this test runs:

| # | Assumption | Tested in step |
| --- | --- | --- |
| A1 | Reading a list item returns its `eTag`. | 5 |
| A2 | A write with `If-Match` fails with 412 when the item changed since it was read. | 5 |
| A3 | A multi-person lookup (the People column of an interaction) accepts a list of ids. | 4 |
| A4 | Deleting an item through Graph sends it to the SharePoint recycle bin. | 6 and 7 |

## Before you start
- [ ] The provisioning dry run reports 0 changes ([provisioning-checklist.md](provisioning-checklist.md)).
- [ ] You are signed in to the live app in a normal browser window, not the fixture mode: the CRM tab must not show the blue "Fixture mode" banner.
- [ ] Two browser tabs on the app are ready for step 5.
- [ ] Use only these invented values: `Smoke Test One` and `Smoke Test Two`, with the addresses `smoke.one@example.com` and the same address for the second person (that is the point of step 3).

To look at an item in SharePoint, open the site, choose Site contents, then the list. If a column is not in the view, open the item, or use Edit current view to add it.

## Steps
1. **Empty lists load.** Open CRM, then Today. Expect the page to load with no red error, and "Nobody is due". If it says a CRM list does not exist, provisioning is incomplete.
2. **Add a person.** CRM, People, Add person. Name `Smoke Test One`, Relationship type `advisor`, leave Owner and Organization as they are, open More and enter the email. Add person. Expect the profile to open. In `CRM People` the item should show Stage `Active`, Importance `3`, Sensitivity `Normal`, your name as Owner, and the Organization `Independent` (the app creates it in `CRM Organizations` the first time).
3. **Duplicate warning.** Add person again: `Smoke Test Two`, `advisor`, the same email. While you type, a "Possible duplicate: Smoke Test One (email)" note appears. Add person: a "Possible duplicate" sheet opens. Choose Create anyway. Expect the second profile to open.
4. **Log a contact with two people (A3).** On `Smoke Test One`, choose Log contact. Summary `Smoke test call`, Type `call`, tick "Follow-up needed (creates a task)". Open More, "Also with", choose `Smoke Test Two`. Save contact. Expect the confirmation message. Then check:
   - `CRM Interactions` has one item and its People column shows both names. If the column is empty, A3 failed.
   - On both people, `LastTwoWayAt` and `LastTouchAt` are today and `LastDirection` is `two-way`.
   - The `Tasks` list has "Follow up with Smoke Test One", Contribution type `Relationship`, and `ExtId` `crm-person:<the id>`.
5. **Two tabs, one record (A1 and A2).** Open `Smoke Test One` in both tabs. In tab A: Edit, set Importance to `4`, Save. In tab B, which has not been reloaded: Edit, set Stage to `Dormant`, Save. Expect tab B to show **"This record changed. Reload to see the update."** with a Reload button, and the item in SharePoint to still say Stage `Active`. If tab B saves silently, A1 or A2 failed.
   - Optional, to tell A1 from A2: in browser developer tools, Network tab, find the request to `items?$expand=fields` and check that its response has an `eTag` key (A1), and that the save request has an `If-Match` header (A2). Do not copy the values.
6. **Merge and undo (A4).** Reload. Open Needs attention. Under Possible duplicates choose Merge for the two smoke test people, keep `Smoke Test One`, Merge records. Expect the confirmation, one person fewer in People, and the interaction on `Smoke Test One` only. Open the site's Recycle bin: `Smoke Test Two` is there (A4). Back in Needs attention, Recent merges, choose Undo merge. Expect both people back, each with the "Smoke test call", and the interaction's People column showing both again. `Smoke Test Two` now has a new item id; that is expected.
7. **Delete (A4).** Open `Smoke Test Two`, choose Delete. The sheet lists what goes. Delete person. Expect the person to leave People and the Recycle bin to show the deleted items. The shared interaction stays and now names only `Smoke Test One`.
8. **Exports.** On `Smoke Test One` choose Export: a JSON file downloads and holds the person, the organization and the interaction. In CRM, Export, download the three CSV files and open each in a spreadsheet: names and accents display correctly and nothing starts with a stray symbol.
9. **Clean up.** Delete what the test made: the `Smoke Test One` person, any remaining test interaction, every item in `CRM Merge Log`, and the "Follow up with Smoke Test One" task. Keep the `Independent` organization: the import reuses it. Items you delete go to the recycle bin; they can stay there.

## Results

| # | Passed? | If it failed: what it means and where the fix is |
| --- | --- | --- |
| A1 | | The item `eTag` is not read, so saves go through without a check. Fix: `decodeItem` in `src/graph/codec.ts` (which field carries the eTag). |
| A2 | | `If-Match` is not enforced on the fields update. Fix: `patchPath` and the headers in `src/crm/graph/graphRepo.ts` (for example update the item instead of its fields). |
| A3 | | The multi-person lookup is rejected or stored empty. Fix: `encodeFields` in `src/graph/codec.ts` (the shape of the value for a multi-value lookup). |
| A4 | | Deleted items are not in the recycle bin. Then Delete, Merge and Undo merge need different wording and a different safety net: stop and tell Claude before using them on real data. |

## What to send back
For each row: pass or fail, and the exact text of any error message. Please do not send screenshots that show other lists, and never real names or addresses. Every failure above is a small, isolated change; none needs the data layer redesigned.

## When to run it again
After any change to `src/crm/graph/` or `src/graph/codec.ts`, or if Microsoft changes how list items are served.
