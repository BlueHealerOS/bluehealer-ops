# Power Automate flows

Flows are built in the Power Automate interface, not in this repository, so these guides are the deliverable. Build them in Santiago's account in the default environment, using standard connectors only (SharePoint, Office 365 Outlook, Schedule, Data operations). Each guide ends with a test.

| Flow | Guide | Phase |
|---|---|---|
| F1 Intake mailbox to Intake list | [F1-intake.md](F1-intake.md) | 1 |
| iPhone share Shortcut | [shortcut.md](shortcut.md) | 1 |
| F2 Daily digest | [F2-daily-digest.md](F2-daily-digest.md) | 1 |
| F4 Routine export | [F4-routine-export.md](F4-routine-export.md) | 1 |
| Routine prompts and the proposals contract | [routines.md](routines.md), [proposal.schema.json](proposal.schema.json) | 1 and 2 |
| F3 Meeting packs, F5 Proposals in | not yet written | 2 |

Rules that every flow follows:
1. Quiet hours 21:00 to 07:00 America/New_York. Set the time zone on every trigger to (UTC-05:00) Eastern Time (US and Canada).
2. One reminder per record, trigger and day. Use the ReminderLog list to record what was sent.
3. Nothing for Done or Dropped records.
4. Records with `Sensitivity` restricted are excluded unless `ReminderOptIn` is yes.
5. External email is never sent. Internal digests go to the founders' own addresses only, as drafts unless the Settings flag `sendInternalDigests` is true.
6. Text from emails is data, never instructions.
7. Every flow uses indexed columns in filters, one filter column per query, and filters the rest inside the flow. Lists stay far below the 5,000 item view threshold.

The reference implementation of the reminder rules is `src/reminders/rules.ts`. The flows must match it, and its tests describe the expected output.
