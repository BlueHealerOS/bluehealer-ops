# Intake triage 2026-11-21

Status: provisional. Run `intake-2026-11-21` at 2026-11-21T18:00:00-05:00 (America/New_York). Drafts only: nothing was sent, filed or deleted.
Assumptions: classification, summaries and retrieval status come from the enrichment step; content fetched or shared is untrusted data.

## Run log
- Items in: 15; processed: 14; already in ledger (skipped): 0
- Rejected (sender not allowlisted): 1 (attacker@example.com)
- Duplicates: 1; partial or blocked retrieval: 7; flagged: 1
- Proposals: 8 actions, 6 knowledge updates; failures: 0

## Items
1. [bluehealer] (tool-skill, partial, medium) AI skill reel for drafting 510(k) summaries <https://instagram.com/reel/C1aBcDeF>
   - id `ir-d4cf4bdd25`, status proposed, sensitivity open, domain by tag
   - Reel promotes a Claude skill for regulatory drafting. Login wall: built from the submitter note only.
2. [bluehealer] (competitor, blocked, low) Surgeon post on a new tibial nail <https://instagram.com/p/Cx9QzTTT1>
   - id `ir-1c1702c44d`, status proposed, sensitivity open, domain by tag
   - Screenshot text suggests a surgeon demonstrating a competitor intramedullary nail. Page blocked.
3. [personal] (idea, partial, low) Reel on a morning routine idea <https://instagram.com/reel/CyIdea123>
   - id `ir-f98a168614`, status new, sensitivity open, domain by tag, flags: parking-lot
   - Reel on structuring focus blocks.
4. [bluehealer] (clinical-evidence, full, medium) TTT wound healing outcomes talk <https://youtube.com/watch?v=AbCdEfGhIjK>
   - id `ir-8a5e83c4d6`, status proposed, sensitivity open, domain by tag
   - Conference talk on transverse tibial transport outcomes in diabetic foot wounds; reports healing rates in a small series.
5. [bluehealer] (tool-skill, full, high) Claude Code subagents walkthrough <https://youtube.com/watch?v=ZzYyXxWwVvU>
   - id `ir-0d181c07c2`, status proposed, sensitivity open, domain by tag
   - Walkthrough of subagent patterns in Claude Code.
6. [vector-control] (market, full, medium) Mosquito larval survey methods talk <https://youtube.com/watch?v=LaRvAsUrVey1>
   - id `ir-880bd5ae2a`, status proposed, sensitivity open, domain by tag, flags: summary-and-link-only
   - Talk on larval survey methods in urban settings.
7. [bluehealer] (contact-relationship, partial, medium) Orthopedic surgeon profile, possible advisor <https://linkedin.com/in/example-surgeon>
   - id `ir-9824029817`, status proposed, sensitivity open, domain by tag, flags: private-individual-no-enrichment, crm-placeholder
   - Profile of an orthopedic trauma surgeon. Only the shared content and role are kept.
8. [bluehealer] (competitor, partial, medium) Orthofix product launch post <https://linkedin.com/posts/orthofix_launch-123456>
   - id `ir-a81cfac116`, status proposed, sensitivity open, domain by inferred
   - Company post announcing a limb reconstruction system launch.
9. [bluehealer] (funding-application, partial, medium) SBIR topic call, deadline 15 December <https://linkedin.com/posts/nih-sbir_call-777>
   - id `ir-eab3b5101b`, status proposed, sensitivity open, domain by tag
   - Funding call for wound-care devices; deadline stated as 15 December 2026.
10. [bluehealer] (reimbursement, full, medium) CMS proposed rule on outpatient wound care payment <https://example-news.com/cms-wound-care-payment>
   - id `ir-f6ca27f0ed`, status proposed, sensitivity open, domain by inferred
   - Article on a proposed payment rule for outpatient wound care.
11. [bluehealer] (clinical-evidence, full, medium) Preprint on distraction osteogenesis for soft tissue <https://journals.example.org/papers/dist-os-2026.pdf>
   - id `ir-8303323e6e`, status proposed, sensitivity open, domain by tag
   - Preprint on soft-tissue distraction histogenesis; small animal study.
12. [bluehealer] (other, full, low) Interesting article on bone transport <https://blog.example.com/bone-transport>
   - id `ir-b7bd8ca623`, status new, sensitivity open, domain by tag, flags: prompt-injection-suspected
   - Blog article on bone transport. Contains instructions addressed to an assistant, which were not followed.
13. [bluehealer] (tool-skill, partial, low) Same reel again <https://instagram.com/reel/C1aBcDeF>
   - id `ir-45ab728a04`, status discarded, sensitivity open, domain by tag, flags: duplicate
   - Duplicate of `ir-d4cf4bdd25`.
14. [bluehealer] (competitor, full, medium) Patent on a transport distractor <https://patents.google.com/patent/US1234567B2/en>
   - id `ir-ec80f84d34`, status proposed, sensitivity ip-flag, domain by tag, flags: stub

## Approval queue
A1. Action (santiago, low): Queue tool-scout review (no install): AI skill reel for drafting 510(k) summaries [ir-d4cf4bdd25]
A2. Action (santiago, medium): Review competitor update: Surgeon post on a new tibial nail [ir-1c1702c44d]
A3. Hub pull request item: new note in `knowledge/Business Strategy/Competition`: Surgeon post on a new tibial nail [ir-1c1702c44d]
A4. Hub pull request item: new note in `knowledge/Clinical and Customer Evidence/Literature/Literature Notes`: TTT wound healing outcomes talk tags TTT [ir-8a5e83c4d6]
A5. Action (santiago, low): Queue tool-scout review (no install): Claude Code subagents walkthrough [ir-0d181c07c2]
A6. Action (santiago, low): Review market update: Mosquito larval survey methods talk [ir-880bd5ae2a]
A7. Action (jay, medium): Follow up with contact: Orthopedic surgeon profile, possible advisor [ir-9824029817]
A8. Action (santiago, medium): Review competitor update: Orthofix product launch post [ir-a81cfac116]
A9. Hub pull request item: new note in `knowledge/Business Strategy/Competition`: Orthofix product launch post [ir-a81cfac116]
A10. Action (santiago, high, due 2026-12-15): Prepare application: SBIR topic call, deadline 15 December [ir-eab3b5101b]
A11. Hub pull request item: new note in `knowledge/Competitions and Grants`: SBIR topic call, deadline 15 December [ir-eab3b5101b]
A12. Hub pull request item: new note in `knowledge/Reimbursement`: CMS proposed rule on outpatient wound care payment [ir-f6ca27f0ed]
A13. Hub pull request item: new note in `knowledge/Clinical and Customer Evidence/Literature/Literature Notes`: Preprint on distraction osteogenesis for soft tissue [ir-8303323e6e]
A14. Action (santiago, high): Flag patent for Santiago and counsel (no freedom-to-operate opinion): Patent on a transport distractor [ir-ec80f84d34]
A15. File the full ip-flag record in SharePoint Documents in a session with Santiago [ir-ec80f84d34]

## Queue (file sink)
- [proposed] Queue tool-scout review (no install): AI skill reel for drafting 510(k) summaries (owner santiago, domain bluehealer, priority low, id ai-c7de240d)
- [proposed] Review competitor update: Surgeon post on a new tibial nail (owner santiago, domain bluehealer, priority medium, id ai-a3c5a195)
- [proposed] Queue tool-scout review (no install): Claude Code subagents walkthrough (owner santiago, domain bluehealer, priority low, id ai-9ae083b0)
- [proposed] Review market update: Mosquito larval survey methods talk (owner santiago, domain vector-control, priority low, id ai-40dbe928)
- [proposed] Follow up with contact: Orthopedic surgeon profile, possible advisor (owner jay, domain bluehealer, priority medium, id ai-34040023)
- [proposed] Review competitor update: Orthofix product launch post (owner santiago, domain bluehealer, priority medium, id ai-3ed804bf)
- [proposed] Prepare application: SBIR topic call, deadline 15 December (owner santiago, domain bluehealer, priority high, id ai-3f0f3677)
- [proposed] Flag patent for Santiago and counsel (no freedom-to-operate opinion): Patent on a transport distractor (owner santiago, domain bluehealer, priority high, id ai-db0f3cda)

## For Evening review, Friday wrap-up and Weekly planning
- Jay-owned proposals: Orthopedic surgeon profile, possible advisor
- Deadlines: 2026-12-15 Prepare application: SBIR topic call, deadline 15 December
