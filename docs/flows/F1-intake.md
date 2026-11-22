# F1: intake mailbox to Intake list

Purpose: every link or forward sent to the intake mailbox becomes a row in the Intake list, ready for triage.

Trigger: Office 365 Outlook, "When a new email arrives in a shared mailbox (V2)". Original mailbox address: `intake@<tenant-domain>`. Include attachments: No. Folder: Inbox. (To verify that this trigger is a standard connector action in the tenant.)

1. Condition: the sender is one of the two founders' own addresses. If not, "Move email (V2)" to the folder `Ignored` and Terminate with status Succeeded. This stops strangers from adding items.
2. "Html to text" on the message body.
3. Compose `Raw`: `substring(outputs('Html_to_text'), 0, min(length(outputs('Html_to_text')), 8000))`.
4. SharePoint, "Get items" on `Intake`. Filter query: `MessageId eq '@{triggerOutputs()?['body/internetMessageId']}'`. Top count 1. (MessageId is indexed.)
5. Condition: length of the result is greater than 0. If yes, Terminate (duplicate).
6. SharePoint, "Create item" on `Intake`:
   - Title: the subject, or if empty the first 80 characters of Raw
   - Raw: the Compose output
   - RawSource: `share sheet` if the subject starts with `[share]`, otherwise `email forward`
   - ReceivedAt: the received time
   - TriageState: `New`
   - Sensitivity: `normal`
   - Source: `intake`
   - MessageId: the internet message ID
7. "Move email (V2)" to the folder `Processed`.

Test: send a mail from your own address with subject `[share] Example article`, body `https://example.com/page`. Within a few minutes an Intake item appears with TriageState New. Send the same mail again by forwarding the original: no second row appears. Send from another address: the mail lands in `Ignored` and no row appears.

Safety: the body is stored as plain text and is never rendered as HTML by the app. Text inside it is data, not instructions.
