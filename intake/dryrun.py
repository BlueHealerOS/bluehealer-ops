"""Dry run of the deterministic pipeline over fixtures (enrichment is stubbed from the fixture files).

Usage: python intake/dryrun.py --fixtures intake/tests/fixtures --out DIR [--run-at 2026-11-21T18:00:00-05:00]
"""
import argparse, json, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from intake.scripts import config as cfgmod
from intake.scripts.ledger import Ledger
from intake.scripts.parse_email import parse
from intake.scripts.route import build_record, redact_for_hq
from intake.scripts.validate import validate
from intake.scripts.render_report import render
from intake.sinks import get_sink


def run(fixtures: Path, out: Path, run_at: str = "2026-11-21T18:00:00-05:00", cfg: dict | None = None) -> dict:
    cfg = cfg or cfgmod.load()
    date = run_at[:10]
    out = Path(out)
    ledger = Ledger(out / "ledger")
    cases = [json.loads(p.read_text()) | {"_file": p.name} for p in sorted(Path(fixtures).glob("*.json"))]
    cases.sort(key=lambda c: (c["email"]["received_at"], c["email"]["message_id"]))
    n_prev = len(list((out / "reports").glob(f"{date} Intake triage*.md"))) if (out / "reports").exists() else 0
    run_id = f"intake-{date}" + (f"-{n_prev + 1}" if n_prev else "")
    s = dict(items_in=len(cases), processed=0, skipped_seen=0, rejected=0, rejected_senders=[], duplicates=0, partial_or_blocked=0, flagged=0, actions=0, knowledge=0, failures=0)
    records, errors = [], []
    for c in cases:
        m = c["email"]
        if ledger.seen(m["message_id"]):
            s["skipped_seen"] += 1
            continue
        p = parse(m)
        if p["sender"] not in cfg["allowlist"]:
            s["rejected"] += 1
            s["rejected_senders"].append(p["sender"])
            ledger.add({"message_id": m["message_id"], "record_id": None, "canonical_url": None, "outcome": "rejected", "processed_at": run_at})
            continue
        rec = build_record(p, c.get("enrich", {}), cfg, ledger, run_id)
        errs = validate(rec)
        if errs:
            s["failures"] += 1
            errors.append((c["_file"], errs))
            continue
        ledger.add({"message_id": m["message_id"], "record_id": rec["id"], "canonical_url": rec["source_url"], "outcome": "processed", "processed_at": run_at})
        s["processed"] += 1
        s["duplicates"] += "duplicate" in rec["flags"]
        s["partial_or_blocked"] += rec["retrieval_status"] != "full"
        s["flagged"] += bool(set(rec["flags"]) & {"prompt-injection-suspected", "forbidden-destination-dropped"})
        s["actions"] += len(rec["proposed_actions"])
        s["knowledge"] += len(rec["knowledge_updates"])
        records.append(rec)
    shareable = [redact_for_hq(r) for r in records]
    for r in shareable:
        assert not validate(r), r["id"]
    sink = get_sink(cfg)
    queue = sink.propose([a for r in shareable for a in r["proposed_actions"]])
    report = render(date, run_id, run_at, shareable, s, queue)
    if shareable:
        (out / "records").mkdir(parents=True, exist_ok=True)
        with open(out / "records" / f"{run_id}.jsonl", "x") as fh:
            for r in shareable:
                fh.write(json.dumps(r, sort_keys=True) + "\n")
    ledger.write_new(date)
    (out / "reports").mkdir(parents=True, exist_ok=True)
    rp = out / "reports" / (f"{date} Intake triage.md" if not n_prev else f"{date} Intake triage {n_prev + 1}.md")
    with open(rp, "x") as fh:
        fh.write(report)
    return {"summary": s, "records": records, "shareable": shareable, "errors": errors, "report_path": rp, "report": report}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--fixtures", default="intake/tests/fixtures")
    ap.add_argument("--out", required=True)
    ap.add_argument("--run-at", default="2026-11-21T18:00:00-05:00")
    a = ap.parse_args()
    r = run(Path(a.fixtures), Path(a.out), a.run_at)
    print(json.dumps(r["summary"], indent=2))
    sys.exit(1 if r["errors"] else 0)
