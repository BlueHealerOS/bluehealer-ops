# iPhone share sheet Shortcut

Goal: share a link from LinkedIn, Instagram, Google or Safari and have it arrive in Intake.

Build in the Shortcuts app on the iPhone:
1. New Shortcut, name `Send to BlueHealer intake`. Details: turn on "Show in Share Sheet", accepted types: URLs, Text, Articles.
2. Action "Get Name" or "Get Details of Safari Web Page" is not needed. Use the "Shortcut Input" directly.
3. Action "Send Email" (the Mail app, not a third party):
   - To: the intake mailbox address
   - Subject: `[share] ` followed by the Shortcut Input name
   - Body: the Shortcut Input (the URL and any text)
   - Show Compose Sheet: off (sends immediately from the founder's own Mail account to the internal mailbox only)
4. Optional action "Show Notification": `Sent to intake`.

Notes: the mail is sent from the founder's own account, which F1 requires. This is the only place where mail is sent automatically, and the recipient is always the internal intake mailbox. The app itself never sends mail.

Test: share a public page from Safari. The Intake item appears after F1 runs.
