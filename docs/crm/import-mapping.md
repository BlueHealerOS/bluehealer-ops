# Hub import: field mapping proposal (Stage 0)

Status: Tier to Importance confirmed by Santiago on 2026-11-26. Shared or empty owners: default to the importing founder, with a `--shared-owner` flag (see import-runbook.md). Implemented in `src/crm/import/plan.ts`. Field names only. No values from the hub appear here.
Source: the YAML frontmatter of the `registers/People` and `registers/Companies` notes of the hub (read from the first 15 files of each, key names only; 220 and 148 notes exist). Note bodies are never read.
Target: the CRM list fields of `docs/crm/CONTEXT.md` section 4. The hub wins on identity fields (D17).

## Companies to CRM Organizations
| Hub key | CRM field | Rule |
| file name | Title | File name without `.md`. |
| website | Domain | Lowercase host only. Written only if it looks like a web address; the value pattern is a URL. |
| type | (none) | Note type marker. A map-of-content note is skipped. |
| relationship | OrgType and RelationshipToBH | Free text. Matched by keyword to the OrgType choices; unmatched goes to `other` and is listed in the report. RelationshipToBH from the same text where a keyword fits, else `none yet`. |
| file path | HubPath | Path of the hub note; also the import identity (`SourceId`). |
| owner, sensitivity | (none in the Organization) | Used only to carry Restricted onto the people of that organization if needed. Organizations have no Owner or Sensitivity in the MVP. |
| aliases | (none) | Used by the dry run for matching only. |
| status, hub_status, last_verified, last_editor, migrated_from, source, phone, email | (none) | Not imported. Reported as unmapped. |

## People to CRM People
| Hub key | CRM field | Rule |
| file name | Title | File name without `.md`. |
| organization | Organization | A wikilink or plain name to a company note. Resolved against the imported Organizations by name; unresolved goes to the `Independent` organization and is listed. |
| relationship | RelationshipType | Free text matched by keyword to the 13 choices; unmatched is reported and left for a founder to set (required field, so the record is `skipped` until set). |
| owner | Owner | Hub values name a founder, a shared marker or nothing. A founder name maps directly; shared or empty maps to the founder running the import and is flagged. |
| email | Email | Lowercased. Placeholder values are ignored. |
| sensitivity | Sensitivity | `restricted` maps to Restricted, everything else to Normal. |
| last-contact | LastTwoWayAt, and an Interaction "Imported last contact" | Date, `YYYY-MM-DD`. Within 12 months: Stage Active plus one email interaction, direction two-way. Older or absent: Stage Mapped. |
| tier | Importance | Hub tier is a small integer where 1 is strongest. Proposed mapping for Santiago to confirm: 1 to 5, 2 to 4, 3 to 3, absent to default 3. |
| role, phone, linkedin, aliases, intro-channel, intro-date, introduced-by, meetings, contact-source | (none) | Not in the 10-field MVP model. `introduced-by` returns in Phase 2 (D30). Reported as unmapped, never dropped silently from the report. |
| status, hub_status, last_verified, last_editor, migrated_from, source, type | (none) | Not imported. |
| file path | HubPath is not a People field; `SourceId` holds the hub path | Import identity for re-runs. |

## Matching and conflicts
- Identity: `SourceId` equal to the hub path means the same record. Otherwise the dedupe rules apply (exact normalized email, then same normalized name in the same organization).
- Hub wins on identity fields (Title, Email, Organization). A different value in the Lists is a `conflict` row. Founder-edited fields (Importance, Comfort, AgreedCheckIn, Stage after import) are never overwritten.

## Value patterns seen (general terms only)
- Dates are `YYYY-MM-DD`. Some notes have empty values.
- Links to other notes are wikilinks, sometimes quoted.
- Several keys hold free text or lists in square brackets. Aliases are a bracketed list.
- Roughly half of the sampled people notes have an email; a minority have a phone number.
- Some keys appear in every note and carry no CRM meaning (provenance and review markers).

## Open questions
1. Tier to Importance mapping above. Confirm or replace.
2. Owner for shared or empty hub owners (Q5 and D2).
3. Whether notes with a restricted marker should be imported at all, or listed in the report only.
