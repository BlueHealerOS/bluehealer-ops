# Stage 3 evidence

Fixture mode (invented people, organizations and interactions, date fixed at 2026-11-23) and the synthetic hub sample in `fixtures/crm/hub-sample/`. Nothing was read from or written to SharePoint, and the real hub was not read.

- `needs-attention-duplicates-*`: a seeded duplicate listed in Needs attention (1440 and 390 px).
- `merge-sheet-*`: the side-by-side merge sheet, with the other record's importance chosen.
- `delete-sheet-*`: Delete one person, naming what will be deleted.
- `export-*`: the weekly CSV export page.
- `merge-undo-390.webm`: merge two duplicates, then Undo merge restores both records and their interactions.
- `import-dry-run.txt`: the console output of the import dry run on the synthetic hub sample (counts and hash only), and the refusals of `--apply`.
- `import-report-sample.md`: the report that run wrote, for the invented sample.

Regenerate the pictures with `npm run build:e2e && CRM_EVIDENCE=1 npx playwright test e2e/crmEvidenceStage3.spec.ts --trace off`.
