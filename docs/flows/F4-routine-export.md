# F4: routine export

Purpose: give the 18:00 triage routine and the morning brief a small file to read, so routines never need to read the lists. Restricted records are excluded.

Trigger: Recurrence, daily at 17:45, time zone Eastern, plus a fuller export on Fridays at 14:45.

1. SharePoint "Get items" on Intake, filter `TriageState eq 'New'`.
2. "Get items" on Tasks, filter `Status ne 'Done' and Status ne 'Dropped'`. Keep id, Title, Owner, Status, DueDate only.
3. "Get items" on Milestones, keep id, Title, Owner only. Then "Get items" on **CRM People**, keep id, Title, Owner only (names only: never Email, never anything else from the record). Both are the founders-only site's lists.
4. For each collection, "Filter array": remove rows where Sensitivity is `restricted` and ReminderOptIn is not true. **CRM People is different**: it has no ReminderOptIn column and writes `Normal` and `Restricted`, so remove every row whose Sensitivity is `Restricted`, with no exception.
5. "Compose" a JSON object:
   ```json
   { "generated": "<ISO time>", "tasks": [], "milestones": [], "people": [], "intake": [{ "id": 1, "title": "", "raw": "" }] }
   ```
   The shape matches `buildRoutineExport` in `src/reminders/rules.ts`.
6. SharePoint "Create file" in `Documents/routine`, name `export-<yyyy-MM-dd>.json`. If the file exists, use "Update file".

Test: run manually with a restricted task in the list. The file does not contain its title. The Intake item from F1 appears. Also run it with a Restricted person in CRM People: the file does not contain their name, and no email address appears anywhere in it.

CRM cutover: this guide used to read the Phase 1 People list. Change step 3 on the day the hub import is applied to the CRM lists. Before that day CRM People is empty, so the file would list no people. The output shape does not change, so the routines need no edit. `buildRoutineExport` in `src/reminders/rules.ts` is the reference for the shape and for the Restricted rule.
