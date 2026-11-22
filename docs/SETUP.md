# Phase 0 setup (Santiago, tenant administrator)

These steps are manual and are done once. Nothing here is automated, because they change tenant settings. Items marked "to verify" were not confirmed against current Microsoft documentation and are settled by the smoke test at the end.

Tenant plan: Microsoft 365 Business Basic. There is no Entra ID P1, so no Conditional Access.

## 1. Confirm multi-factor authentication
Entra admin center, Overview, Properties, Manage security defaults. Security defaults should be on. If they are off, enable per-user MFA for both founders. The app relies on Microsoft 365 for MFA and adds none of its own.

## 2. Create the founders-only site
1. SharePoint admin center, Active sites, Create, Team site. Choose the option without a Microsoft 365 group if it is offered. Name it `BlueHealerOps`, so the address is `https://bluehealer.sharepoint.com/sites/BlueHealerOps`.
2. Owners: Santiago and Jay only. No members, no visitors, no guests.
3. Turn external sharing off for this site (Policies, Sharing, Only people in your organization).
4. Do not break inheritance on any list. Access comes from the site itself, so the two owners are the only people who can open it.

## 3. Register the app in Entra
1. Entra admin center, App registrations, New registration. Name `BlueHealer Ops`. Supported account types: this organization only.
2. Authentication, Add a platform, Single-page application. Redirect URIs: `https://bluehealeros.github.io/bluehealer-ops/` and `http://localhost:5173/bluehealer-ops/`. Do not enable implicit grant. Do not create a client secret.
3. API permissions, Microsoft Graph, Delegated: `User.Read`, `Sites.Selected`, `Mail.ReadWrite`, `Calendars.Read`. Grant admin consent. Do not add `Mail.Send` or `Sites.ReadWrite.All`.
4. Enterprise applications, BlueHealer Ops, Properties: set "Assignment required" to Yes, then assign Santiago and Jay only (to verify that this is available on Business Basic).
5. Note the Directory (tenant) ID and the Application (client) ID. They are identifiers, not secrets.

## 4. Grant the app access to the site only
`Sites.Selected` gives the app nothing until a site grant exists.
1. In Graph Explorer, sign in and consent to `Sites.FullControl.All` for yourself (temporary).
2. `GET https://graph.microsoft.com/v1.0/sites/bluehealer.sharepoint.com:/sites/BlueHealerOps` and copy the `id`.
3. `POST https://graph.microsoft.com/v1.0/sites/{id}/permissions` with this body (replace the client ID):
   ```json
   { "roles": ["owner"], "grantedToIdentities": [{ "application": { "id": "<client id>", "displayName": "BlueHealer Ops" } }] }
   ```
   Provisioning needs to create lists and columns. Whether `write` is enough is to verify (step 9). Start with `owner`.
4. `GET .../sites/{id}/permissions` to confirm the grant.
5. Remove the Graph Explorer consent for `Sites.FullControl.All`.

## 5. Intake mailbox
1. Exchange admin center, Shared mailboxes, add one named `intake` in your domain. A shared mailbox needs no license under 50 GB (to verify).
2. Full Access and Send As: none needed. Full Access for Santiago and Jay only.
3. In Outlook on the web for that mailbox, create the folders `Processed` and `Ignored`.

## 6. Folders for routines
In the BlueHealerOps site, Documents library, create `routine` and inside it `proposals`.

## 7. GitHub
1. Settings, Pages, Source: GitHub Actions.
2. Settings, Branches: protect `main` (pull request required, status checks required, no direct pushes).
3. Open a pull request that sets `config/tenant.json` to the real tenant ID, client ID and site path. Identifiers only.

## 8. Provision the lists
Sign in to the deployed app as Santiago, open Admin, press Dry run, review, then Apply. Run it a second time: it must report that everything is up to date. Then, in Microsoft Lists, open each list, List settings, Versioning settings, and confirm item version history is on (to verify the default).

## 9. Smoke tests that settle the open items
1. Role: after provisioning succeeds with `owner`, change the grant to `write` (delete and re-create it) and press Dry run. If reading and writing items still work, keep `write`. If list creation is the only thing that fails, keep `write` and use `owner` only when the schema changes.
2. Non-founder: sign in with any other account in the tenant. The app must show "Access denied".
3. Date handling: create a task with a due date and confirm the same date shows in Microsoft Lists.
4. Snooze: snooze a reminder, reload, and confirm it stays hidden (this exercises the date filter on ReminderLog).
5. Sign-in return: sign in on the deployed site and confirm you land on the app, not a blank page (the sign-in response arrives in the URL fragment and the app also uses fragment routes; to verify).

## 10. Power Automate and routines
Build the flows from `docs/flows/`. Update the Claude routine prompts from `docs/flows/routines.md`. Known gap: your Claude Microsoft 365 connector already holds `Sites.Read.All`, so the rule that routines read only the export file is a policy, not a technical block.
