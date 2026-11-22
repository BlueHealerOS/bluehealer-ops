# F4: routine export

Purpose: give the 18:00 triage routine and the morning brief a small file to read, so routines never need to read the lists. Restricted records are excluded.

Trigger: Recurrence, daily at 17:45, time zone Eastern, plus a fuller export on Fridays at 14:45.

1. SharePoint "Get items" on Intake, filter `TriageState eq 'New'`.
2. "Get items" on Tasks, filter `Status ne 'Done' and Status ne 'Dropped'`. Keep id, Title, Owner, Status, DueDate only.
3. "Get items" on Milestones and People, keep id, Title, Owner only (People: names only, no emails or phone numbers).
4. For each collection, "Filter array": remove rows where Sensitivity is `restricted` and ReminderOptIn is not true.
5. "Compose" a JSON object:
   ```json
   { "generated": "<ISO time>", "tasks": [], "milestones": [], "people": [], "intake": [{ "id": 1, "title": "", "raw": "" }] }
   ```
   The shape matches `buildRoutineExport` in `src/reminders/rules.ts`.
6. SharePoint "Create file" in `Documents/routine`, name `export-<yyyy-MM-dd>.json`. If the file exists, use "Update file".

Test: run manually with a restricted task in the list. The file does not contain its title. The Intake item from F1 appears.
