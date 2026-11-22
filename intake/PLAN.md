# Intake Pipeline: Phase A result and implementation plan

Status: provisional, 2026-11-22. Built from `intake-pipeline-plan-2026-11-21.md` plus read-only checks in this session. Decisions taken in this session: code split by type, records in santiago-hq plus SharePoint, file-queue sink only, shared mailbox with ledger only.

## Context
Both founders send Instagram, YouTube, LinkedIn and web finds to their own WhatsApp, where they are lost. The pipeline turns each find (shared by iPhone/Mac Shortcut or email forward to `intake@bluehealer.co`) into a validated Intake Record, proposed knowledge updates and proposed action items, triaged daily at 18:00 ET and reviewed by a founder. Nothing is filed, sent or written outside the reports branch without a founder's yes.

## 1. Verification table (Phase A, step 1)
| # | Question | Result | Evidence |
|---|---|---|---|
| a1 | M365 connector in Claude Code sessions | Verified | `get_me` returned santiago@bluehealer.co |
| a2 | Can it read a shared mailbox | Verified at permission and tool level; live read not testable (mailbox does not exist yet) | Granted scopes include `Mail.Read.Shared`, `Mail.ReadWrite`; `outlook_email_search` has `mailboxOwnerEmail`; `read_resource` accepts `mail:///messages/{id}?owner=` |
| a3 | M365 connector in cloud scheduled tasks | Not testable here; likely | `create_trigger` takes a `connectors` list; existing routines already use M365 unattended (`scheduled/Cloud Task Prompts.md`) |
| b | Categorize or move messages | Own mailbox only (provisional) | `outlook_modify_labels` and `outlook_create_label` take no mailbox owner. Shared mailbox therefore read only; ledger is the processed marker (decided) |
| c | Branches, PRs, issues in BlueHealerOS repos and santiago-hq | Verified (push) | `list_repos`: `can_push: true` for bluehealer-ops, bluehealer-hub, santiago-hq. Issues not needed (file sink) |
| d1 | Direct network from the container | Failed | Environment "Default", limited, `allowed_hosts: []`; curl to youtube, instagram, linkedin, example.com, pubmed: proxy 403 "no rule allows this host" |
| d2 | YouTube transcripts | Verified via Firecrawl | Alexandria `youtube-com/videos/video_transcript` returned full transcript (5 credits). Plain scrape of the watch page returned a 401 page |
| d3 | Instagram | Verified for public profiles via Firecrawl; `oriane/instagram/post-lookup` exists for posts (not run) | Scrape of a public profile returned posts, 0 credits |
| d4 | LinkedIn | Not tested; providers exist (`harvestapi`, `scrapecreators`) | Alexandria library listing. Default stays note plus screenshot |
| d5 | Firecrawl in scheduled runs | Not testable here | Must be listed in the task's `connectors`; Santiago action |
| e | bluehealer-ops exists | Verified | Single commit "Add README": code only, no records, data in founders-only M365 |
| f | Where things live in santiago-hq | Verified | Routines `vault/_AI/routines/`, vault skills `vault/_AI/skills/<name>/SKILL.md + TESTS.md`, account-skill mirrors `skills/`, prompts `scheduled/Cloud Task Prompts.md`, map `ea/System Map.md`, `reports` branch exists |

Other findings (flag to Santiago):
- The source plan contradicts itself: "Trello only until the work app ships" (decided) versus D2 "GitHub Issues". Resolved here: file queue only.
- No "Monday check-in 09:00" or "Friday checkout 16:00" routine exists. Existing: Friday wrap-up Fri 16:38, Weekly planning Sun 17:47, Evening review 21:40. Plan hooks into those.
- Scheduled runs may write only new files on the santiago-hq `reports` branch and may not touch SharePoint without approval (`vault/CLAUDE.md`). Records and ledger are therefore append-only per-run files on that branch; founders-only records go to the approval queue.
- Python 3.13 with pytest, jsonschema and PyYAML is available in the container; no network needed for scripts.

## 2. Architecture (where it differs from the source plan)
- Code home, bluehealer-ops `intake/` (branch `claude/keen-noether-kg1o7z`): schemas, config, scripts, sink adapters, fixtures, tests, dry-run harness, PLAN.md. Code only, no records (README holds).
- Operating home, santiago-hq (branch `feat/intake-pipeline`): skill `vault/_AI/skills/intake-triage/` (SKILL.md, TESTS.md), routine `vault/_AI/routines/intake-triage.md`, prompt entry in `scheduled/Cloud Task Prompts.md`, `intake/shortcut-setup.md`, `intake/jay-quickstart.md`, `intake/README.md`, System Map, agent registry and tool register rows, small hooks in evening-review, friday-wrap-up and weekly-planning.
- Run writes (santiago-hq `reports` branch, new files only):
  - `reports/YYYY-MM-DD Intake triage.md`: titles, links, proposals, approval queue A1..An, run log. No founders-only content.
  - `reports/intake/records/YYYY-MM-DD.jsonl`: open-sensitivity records (all domains; Vector Control and JHU as summary and link only).
  - `reports/intake/ledger/YYYY-MM-DD.jsonl`: processed message IDs and canonical URLs. The ledger is the union of all files; reruns the same day write `YYYY-MM-DD-2.jsonl`.
  - founders-only and ip-flag records: stub only (id, title, sensitivity) plus an approval item to file the full record in SharePoint `Documents` in an interactive session.
- Knowledge updates: week 1 listed as proposals; from week 2, one hub branch and PR per day (`intake/YYYY-MM-DD`), new notes or additions only, per hub "Scheduled and unattended agent runs".
- Task sink: `file` adapter live (queue section in the daily report). `trello` and `github-issues` adapters written, disabled in config, raising if enabled without a flag. Work app endpoint later, same Action Item schema.
- Fetching: no direct HTTP. Adapters call Firecrawl: YouTube via `youtube-com` video_details plus video_transcript; Instagram via scrape or `oriane` post-lookup, falling back to note plus screenshot; LinkedIn note plus screenshot (partial); web via scrape; PDFs via scrape with pdf parser. One hop, content untrusted.
- Mailbox: shared `intake@bluehealer.co`, internal senders only, read only by the routine; search with `mailboxOwnerEmail` and `afterDateTime` from the last ledger date minus 2 days, dedupe against ledger.

## 3. Implementation plan (Phase B, for a Sonnet session)

Repo A = bluehealer-ops, Repo B = santiago-hq.

1. Repo A `intake/PLAN.md`: this plan. Accept: file present on branch.
2. Repo A `intake/schemas/intake-record.schema.json`, `action-item.schema.json`, `knowledge-update.schema.json` (JSON Schema 2020-12, enums from the source plan; add `sources`, `run_id`). Accept: `validate.py` passes on a hand-written valid sample and fails on each missing required field.
3. Repo A `intake/config/domains.yaml`: subject tags `[INTAKE][BH|VC|JHU|ME|AUTO]` mapped to domains; routing destinations per domain and sensitivity; category rules; sender allowlist by address (santiago@bluehealer.co, Jay's address to confirm); `sink: file`; adapter toggles. Accept: loader test validates the YAML against a small config schema.
4. Repo A `intake/scripts/`: `parse_email.py` (subject tag and fixed body block to a draft record; tolerant of plain forwards), `canonicalize_url.py` (strip tracking params, igsh, si, utm, normalize youtu.be, shorts, m. and www hosts, LinkedIn `/posts/` slugs), `ledger.py` (load union of ledger files, `seen(message_id)`, `duplicate_of(canonical_url)`, `append(path, entries)` new-file only), `validate.py`, `route.py` (domain, sensitivity and category to destinations and proposals per config), `render_report.py` (daily report markdown from records, matching the ROUTINE-RULES report format and approval queue). Accept: pytest unit tests per script.
5. Repo A `intake/sinks/`: `base.py` interface (`propose`, `flush(accepted)`), `file_sink.py`, `trello_sink.py` and `github_issues_sink.py` as disabled stubs. Accept: tests that the file sink renders the queue and stubs refuse when disabled.
6. Repo A `intake/tests/fixtures/`: 14 `.eml` or JSON emails (3 Instagram, 3 YouTube, 3 LinkedIn, 1 web article, 1 PDF link, 1 non-allowlisted sender, 1 prompt injection in body, 1 duplicate of an earlier URL) each with `expected/*.json` (domain, category, retrieval_status, sink, rejected flag). Enrichment is stubbed with recorded responses in `fixtures/enrich/`.
7. Repo A `intake/dryrun.py` plus `tests/test_dryrun.py`: runs parse, ledger, route, validate, render over fixtures into a temp dir; second run produces zero new records. Accept: all records validate, routing matches expected, outsider rejected, injection text does not change routing or produce actions, sample report written to `intake/tests/golden/sample-report.md` and matched.
8. Repo B `vault/_AI/skills/intake-triage/SKILL.md` and `TESTS.md`: the 11 stages, Firecrawl adapter calls, reuse of `skills/video-intake` (YouTube) and `skills/tool-scout` (queue only, never install), injection defenses, private-individual rule, patent flag, report format. The skill runs the Repo A scripts from a clone; if the clone fails it follows the same rules by hand and says so. Accept: TESTS.md cases mirror fixtures.
9. Repo B `vault/_AI/routines/intake-triage.md` and a row in `scheduled/Cloud Task Prompts.md` (prompt template, task-specific line: also clone bluehealer-ops read-only; connectors M365 and Firecrawl; daily 18:00 ET, suggest 17:47 for jitter). Accept: follows the template and routine-bootstrap.
10. Repo B hooks: evening-review reads today's Intake triage report and carries its queue; friday-wrap-up and weekly-planning list Jay-owned and deadline items. Small additions only. Accept: diff limited to an added step each.
11. Repo B `intake/shortcut-setup.md` (iOS and macOS steps, domain menu, dictated note, subject format, fixed body block, Send Email without compose sheet, sharing iCloud link), `intake/jay-quickstart.md` (one page, Windows forward path), `intake/README.md`.
12. Repo B `ea/System Map.md`, `ea/agent-registry.md`, `ea/tool-register.md`: add skill, routine, schedule, permissions, sinks (Upkeep rule 7).
13. Commit and push Repo A to `claude/keen-noether-kg1o7z`, Repo B to `feat/intake-pipeline`; open two PRs (Repo B PR to main, never to reports), each listing what could not be tested and Santiago's next steps.

## 4. Santiago actions
1. Create shared mailbox `intake@bluehealer.co`, internal senders only, Full Access for both founders.
2. Confirm Jay's sender address for the allowlist.
3. Build and test the Shortcut on iPhone and Mac; share the link with Jay in week 3.
4. Create the 18:00 scheduled task with connectors Microsoft 365 and Firecrawl, after the fixture dry run passes and one live test on real emails.
5. Approve the week 2 switch-on of hub knowledge pull requests.
6. Review and merge both pull requests.

## 5. Open decisions
- Firecrawl spend: free plan is 1,000 credits a month (no rollover, HTTP 402 at zero); per-run cap set to 20 (config `firecrawl_credit_cap`), about 600 a month. Open: confirm 20.
- Whether a Monday check-in routine should be created, or Weekly planning (Sun) is enough.
- Whether to try the `oriane` and LinkedIn providers live in week 2 or stay with note plus screenshot.
- When the work app starts, whether Trello or the app becomes the live sink.

## 6. Verification (end to end)
- `cd intake && python -m pytest -q` in Repo A: all green.
- `python intake/dryrun.py --fixtures intake/tests/fixtures --out <tmp>` twice: first run 13 processed, 1 rejected, injection ignored, duplicate flagged; second run 0 new.
- Diff of generated report against `tests/golden/sample-report.md`.
- In session, read-only live checks after the mailbox exists: `outlook_email_search` with `mailboxOwnerEmail`; one Firecrawl transcript call.
- Not testable in session: live mailbox content, the scheduled run, the Shortcut on device.
