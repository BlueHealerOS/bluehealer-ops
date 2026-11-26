# Hub import report f6d48a5afb70fc00

Date 2026-11-23. Ranking config 1.0.0. Shared or empty hub owners default to Santiago.

## Counts

- Organizations: 5 new, 1 match, 1 conflict, 1 skipped
- People: 9 new, 2 match, 2 conflict, 2 skipped
- New people: 3 Active (contact in the last 12 months), 6 Mapped, 1 Restricted
- Interactions to create ("Imported last contact"): 3
- New people with the owner defaulted to Santiago: 2
- New people placed in Independent (no organization found): 5

## Why records were not written

- organization conflict: same name as another hub organization: 1
- organization match: same hub path: 1
- organization skipped: map of content, not an organization: 1
- person conflict: email differs from the record at this hub path: 1
- person conflict: same email as another hub person: 1
- person match: same email: 1
- person match: same hub path: 1
- person skipped: map of content, not a person: 1
- person skipped: relationship type not recognized: 1

## Rows

| Kind | Hub path | Status | Note |
| --- | --- | --- | --- |
| organization | registers/Companies/Example Capital Partners.md | new |  |
| organization | registers/Companies/Example Health System.md | new |  |
| organization | registers/Companies/Fixture Devices Inc.md | new |  |
| organization | registers/Companies/Matched Org.md | match | same hub path |
| organization | registers/Companies/MOC Companies.md | skipped | map of content, not an organization |
| organization | registers/Companies/Twin Org.md | new |  |
| organization | registers/Companies/Twin-Org.md | conflict | same name as another hub organization |
| organization | registers/Companies/Unknown Kind Co.md | new | type not recognized, set to other |
| person | registers/People/Avery New.md | new |  |
| person | registers/People/Blake Old.md | new |  |
| person | registers/People/Casey Shared.md | new | owner defaulted to Santiago; placed in Independent |
| person | registers/People/Devon Blank.md | new | owner defaulted to Santiago |
| person | registers/People/Emery Restricted.md | new |  |
| person | registers/People/Finley Unknown.md | skipped | relationship type not recognized |
| person | registers/People/Gray Matched.md | match | same hub path |
| person | registers/People/Harper Email.md | match | same email |
| person | registers/People/Indigo Conflict.md | conflict | email differs from the record at this hub path |
| person | registers/People/Jordan Dup One.md | new | placed in Independent |
| person | registers/People/Jordan Dup Two.md | conflict | same email as another hub person |
| person | registers/People/Kai Placeholder.md | new | placed in Independent |
| person | registers/People/Lane Unresolved Org.md | new | placed in Independent |
| person | registers/People/MOC People.md | skipped | map of content, not a person |
| person | registers/People/Morgan Family.md | new | placed in Independent |

Conflicts are not written. Apply creates only the new rows: add `--apply --confirm f6d48a5afb70fc00`.
