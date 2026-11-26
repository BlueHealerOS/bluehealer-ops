# Importing the hub registers (Santiago runs this)

Claude Code never runs this against the real hub or the real Lists. It was built and tested only on the invented sample in `fixtures/crm/hub-sample/`. Field mapping: [import-mapping.md](import-mapping.md).

## What it does
- Reads only the frontmatter of `registers/People/*.md` and `registers/Companies/*.md`, 4 KB at a time until the closing `---` line. The rest of a note is never parsed, kept or written anywhere.
- Plans the import and writes one report. The report names real records, so it goes to a folder you choose, never to the console and never into this public repository. Inside the repository only a folder under `imports/` (gitignored) is accepted.
- Applies only after you read the report and pass its hash. Apply creates new organizations, people and "Imported last contact" interactions. It never updates or deletes anything.

## Steps
1. Dry run (first import; the Lists are empty):
   ```bash
   node scripts/crm/import-hub.mjs --hub <path to the hub clone> --out <folder outside this repository> --shared-owner Santiago
   ```
   For a later import, first use Export in the CRM tab to download the people and organizations CSVs, put both files in one folder, and add `--current <that folder>`.
2. Read `import-report-<hash>.md` in the output folder: the counts, why records were not written, and every row. Check the number of people whose owner was defaulted (shared or empty hub owners) and re-run with `--shared-owner Jay` if that is better.
3. Apply, with a Graph access token for your own sign-in (the same kind the provisioning script uses):
   ```bash
   GRAPH_TOKEN=<token> node scripts/crm/import-hub.mjs --hub <path> --out <folder> --shared-owner Santiago --apply --confirm <hash>
   ```
   The script plans again against the live Lists. If the hub or the Lists changed since the report, the hash differs and nothing is written.
4. Run the dry run once more: it should show 0 new people and 0 new organizations.

## Rules the import follows
- Conflicts (same hub path with a different email, a second hub record with the same email, a second organization with the same name) are reported and not written. Fix them in the hub or in the CRM, then run again.
- New people get Stage Mapped, unless the hub note shows a contact in the last 12 months: then Active, with that date as the last contact and one email interaction.
- Hub tier maps to Importance: 1 to 5, 2 to 4, 3 to 3; anything else is 3.
- A person whose relationship type cannot be recognized is skipped and listed, because the type is required.
- Nothing in the CRM holds amounts, shares or terms; the import refuses text with a currency figure.

## If it stops part-way
Run the dry run again. It plans against what now exists and shows only what is missing; apply with the new hash.
