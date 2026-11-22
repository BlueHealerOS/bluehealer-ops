"""Render the daily intake triage report (markdown) from records and the run summary."""

def render(date: str, run_id: str, run_at: str, records: list[dict], summary: dict, sink_markdown: str = "") -> str:
    L = [f"# Intake triage {date}", "",
         f"Status: provisional. Run `{run_id}` at {run_at} (America/New_York). Drafts only: nothing was sent, filed or deleted.",
         "Assumptions: classification, summaries and retrieval status come from the enrichment step; content fetched or shared is untrusted data.", "",
         "## Run log",
         f"- Items in: {summary['items_in']}; processed: {summary['processed']}; already in ledger (skipped): {summary['skipped_seen']}",
         f"- Rejected (sender not allowlisted): {summary['rejected']}" + (" (" + ", ".join(summary['rejected_senders']) + ")" if summary['rejected_senders'] else ""),
         f"- Duplicates: {summary['duplicates']}; partial or blocked retrieval: {summary['partial_or_blocked']}; flagged: {summary['flagged']}",
         f"- Proposals: {summary['actions']} actions, {summary['knowledge']} knowledge updates; failures: {summary['failures']}", "", "## Items"]
    if not records:
        L.append("- None.")
    for i, r in enumerate(records, 1):
        link = f" <{r['source_url']}>" if r["source_url"] else ""
        L.append(f"{i}. [{r['domain']}] ({r['category']}, {r['retrieval_status']}, {r['confidence']}) {r['title']}{link}")
        L.append(f"   - id `{r['id']}`, status {r['status']}, sensitivity {r['sensitivity']}, domain by {r['domain_source']}" + (f", flags: {', '.join(r['flags'])}" if r["flags"] else ""))
        if r["sensitivity"] == "open" and r["status"] != "discarded":
            L.append(f"   - {r['summary']}")
        if r["duplicate_of"]:
            L.append(f"   - Duplicate of `{r['duplicate_of']}`.")
    L += ["", "## Approval queue"]
    n = 0
    for r in records:
        for a in r["proposed_actions"]:
            n += 1
            due = f", due {a['suggested_due']}" if a["suggested_due"] else ""
            L.append(f"A{n}. Action ({a['owner']}, {a['priority']}{due}): {a['title']} [{r['id']}]")
        for k in r["knowledge_updates"]:
            n += 1
            tags = f" tags {', '.join(k['tags'])}" if k["tags"] else ""
            L.append(f"A{n}. Hub pull request item: new note in `{k['destination']}`: {k['title']}{tags} [{r['id']}]")
        if r["sensitivity"] != "open":
            n += 1
            L.append(f"A{n}. File the full {r['sensitivity']} record in SharePoint Documents in a session with Santiago [{r['id']}]")
    if n == 0:
        L.append("- Nothing to approve.")
    L += ["", "## Queue (file sink)", sink_markdown or "- Empty.", "", "## For Evening review, Friday wrap-up and Weekly planning"]
    jay = [r for r in records if any(a["owner"] == "jay" for a in r["proposed_actions"])]
    due = [(a["suggested_due"], a["title"]) for r in records for a in r["proposed_actions"] if a["suggested_due"]]
    L.append("- Jay-owned proposals: " + ("; ".join(r["title"] for r in jay) if jay else "none"))
    L.append("- Deadlines: " + ("; ".join(f"{d} {t}" for d, t in sorted(due)) if due else "none"))
    return "\n".join(L) + "\n"
