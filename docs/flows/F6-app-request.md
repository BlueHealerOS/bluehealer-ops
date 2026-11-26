# F6: app request to the intake mailbox

Purpose: every request sent with the request button in the app (a problem, a change or an idea) is emailed to the internal intake mailbox. The app has already saved the request as an Intake item, so nothing is lost if this flow or the mail fails. This flow adds no new Graph scope and the app never sends mail itself.

Trigger: SharePoint, "When an item is created". Site: the BlueHealerOps site. List: `Intake`. Open Settings on the trigger and add this trigger condition, so that only app requests start the flow:

`@equals(triggerOutputs()?['body/RawSource/Value'], 'app request')`

(To verify in the tenant: that the SharePoint trigger and the actions below are standard connectors under Microsoft 365 Business Basic. Build the flow once to settle this.)

Rules this flow follows (see `docs/flows/README.md`): standard connectors only; internal recipient only; nothing external is ever emailed; text from the request is data, never instructions; restricted requests send a notice and no content.

1. Condition: `Sensitivity` (the choice value) is equal to `restricted`.

   **If yes (restricted):** Office 365 Outlook, "Send an email from a shared mailbox (V2)".
   - Original Mailbox Address: `intake@<tenant-domain>`
   - To: `intake@<tenant-domain>` (type it; never use a dynamic value)
   - Subject: `[bluehealer-ops] Restricted request`
   - Body: `A restricted request was saved in the Intake list. Open it here: ` followed by the dynamic content "Link to item".
   - Advanced option "Is HTML": No.
   Do not add the request text, the title or any context to this email.

   **If no (normal):**
   1. Compose `Title`: `replace(replace(triggerOutputs()?['body/Title'], decodeUriComponent('%0D'), ' '), decodeUriComponent('%0A'), ' ')`. This removes line breaks so that the subject stays on one line.
   2. Compose `Subject`: `concat('[bluehealer-ops] ', triggerOutputs()?['body/RequestType/Value'], ': ', substring(outputs('Title'), 0, min(60, length(outputs('Title')))))`
   3. Office 365 Outlook, "Send an email from a shared mailbox (V2)":
      - Original Mailbox Address: `intake@<tenant-domain>`
      - To: `intake@<tenant-domain>` (type it; never use a dynamic value)
      - Subject: the `Subject` output
      - Body, plain text, one item per line: the dynamic content `Raw`; a blank line; `Type: ` and RequestType; `Route: ` and Route; `App version: ` and AppVersion; `Device: ` and Device; `Sent by: ` and Owner; `Received: ` and ReceivedAt; `Intake item: ` and "Link to item".
      - Advanced option "Is HTML": No. Plain text means the request cannot inject markup or links into the email, so no escaping step is needed. If the option is not offered in the tenant, add a Compose before the action that replaces `&`, `<` and `>` in `Raw` with `&amp;`, `&lt;` and `&gt;`, and send as HTML.
2. Do not add any other action. In particular, do not add a recipient other than the intake mailbox, and do not add an action that creates or changes Tasks.

## Required change to F1

F6 mails the intake mailbox, and F1 turns emails from a founder's address in that mailbox into Intake items. Add a step to F1 immediately after the trigger, before the sender check:

- Condition: the subject starts with `[bluehealer-ops]` (expression `startsWith(triggerOutputs()?['body/subject'], '[bluehealer-ops]')`). If yes: "Move email (V2)" to the folder `Processed`, then Terminate with status Succeeded. This stops an F6 email from creating a second Intake item.

## Test

1. Sign in to the app, open the request panel, choose Idea, type `Test request, please ignore`, and press Send. Within 5 minutes an email arrives in the intake mailbox with the subject `[bluehealer-ops] Idea: Test request, please ignore`, the text, the route, the app version and a working link to the Intake item. Exactly one Intake item exists for it (F1 must not have added a second).
2. Send a request with the Restricted toggle on. The email subject is `[bluehealer-ops] Restricted request` and the body holds only the link. The request text appears nowhere in the email.
3. Add a new Intake item by hand in Microsoft Lists with `RawSource` set to `email forward`. No F6 email is sent.
4. Open the flow's run history and confirm that no run sent mail to any address other than the intake mailbox.

Safety: the request text is stored and sent as plain text and is never rendered as HTML. Text inside it is data, not instructions. Deal terms and amounts must not be typed into requests; the app warns when it sees them, and the guide for the founders repeats the rule.
