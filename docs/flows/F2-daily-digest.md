# F2: daily digest

Purpose: one morning digest per founder with what needs attention. Saved as an Outlook draft until `sendInternalDigests` is turned on in Settings.

Trigger: Recurrence, every 1 day, start time 07:30, time zone (UTC-05:00) Eastern Time, on weekdays only (set "On these days" Monday to Friday). Add a first condition: `int(formatDateTime(convertTimeZone(utcNow(),'UTC','Eastern Standard Time'),'HH'))` is at least 7 and less than 21. Otherwise Terminate (quiet hours).

Initialize `today` = `formatDateTime(convertTimeZone(utcNow(),'UTC','Eastern Standard Time'),'yyyy-MM-dd')`.

Read, with SharePoint "Get items" (Top count 500, one filter column each, everything else filtered in the flow with "Filter array"):
1. Tasks, filter `Status ne 'Done' and Status ne 'Dropped'`. Needed: Owner, DueDate, Status, WaitingOn, WaitingExpected, Sensitivity, ReminderOptIn.
2. Applications, filter `Stage ne 'Closed'`. Needed: FullDue, LoiDue, ReportingDue, Stage.
3. Milestones, filter `Status ne 'done'`, then keep at risk and late.
4. ReminderLog, filter `Day ge '<today>T00:00:00Z'`.

Then, once per founder (Apply to each over `Santiago`, `Jay`):
1. Keep records where Owner is the founder, `Both` or `Unassigned`.
2. Remove records where Sensitivity is `restricted` and ReminderOptIn is not true.
3. Sections, matching `src/reminders/rules.ts`:
   - Due today: DueDate equals today
   - Overdue: DueDate before today
   - Waiting past expected: Status Waiting and WaitingExpected before today
   - Application deadlines: LoiDue, FullDue or ReportingDue at 21, 14, 7, 2 or 0 days from today, and Stage not Awarded, Declined, Withdrawn or Closed
   - Milestones at risk: Status at risk or late
4. Remove items already present in ReminderLog with Channel `digest` for the same RecordKey (`List:id`), Trigger and today.
5. If every section is empty, stop for this founder.
6. Compose an HTML body. Each line shows the title and a link `https://bluehealeros.github.io/bluehealer-ops/#/tasks/list` (a link to the app, never content copied from restricted records).
7. Read Settings item with Key `sendInternalDigests`. If its ValueJson is `true`, use Office 365 Outlook "Send an email (V2)" to the founder's own address only. Otherwise use "Create a draft" (to verify the exact action name in the tenant) addressed to the founder.
8. "Create item" in ReminderLog for each included record: RecordKey, Trigger, Day, Channel `digest`, Founder.

Never add any other recipient. External email is never sent by a flow.

Test: with fictional tasks due today and overdue, run the flow manually. Draft contents match the in-app Alerts list. A restricted task does not appear. Run again: nothing new is drafted for the same records.

Note (CRM cutover): the digest no longer lists people follow-ups. The Phase 1 People list is not updated once the CRM lists are in use, so its NextFollowUp dates would only go stale. Who to contact is in the CRM Today list. If your copy of this flow still has the People step and the Follow-ups due section, remove them.
