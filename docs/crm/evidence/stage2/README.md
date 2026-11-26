# Stage 2 evidence

All of it comes from fixture mode: invented people, organizations and interactions, with the date fixed at 2026-11-23. Nothing was read from or written to SharePoint.

- `today-*`, `people-*`, `organization-*`, `profile-*`, `needs-attention-*`: screenshots at 1440 and 390 px (device scale 2). `today-list-*` is Today scrolled to the first card.
- `log-contact-390.webm`: Log contact removes the first-ranked person from the top five without a reload.
- `add-person-390.webm`: Add person on a phone with only the required fields.
- `network.json`: requests by origin during one Log contact. Only the app and Microsoft Graph (the app shell's own calls); none touched a CRM list.
- `storage.json`: browser storage after the same action. Key names only: the founder name and the test sign-in marker.

Regenerate with `npm run build:e2e && CRM_EVIDENCE=1 npx playwright test e2e/crmEvidence.spec.ts --trace off`.
