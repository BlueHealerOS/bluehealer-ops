import json
from pathlib import Path
from intake.dryrun import run

FIX = Path(__file__).parent / "fixtures"
GOLDEN = Path(__file__).parent / "golden" / "sample-report.md"


def _cases():
    return {p.stem: json.loads(p.read_text()) for p in sorted(FIX.glob("*.json"))}


def test_fixture_mix():
    names = list(_cases())
    assert len(names) >= 12
    for pre, n in [("instagram", 3), ("youtube", 3), ("linkedin", 3)]:
        assert sum(pre in x for x in names) == n


def test_dryrun_routes_validates_and_is_idempotent(tmp_path):
    r = run(FIX, tmp_path)
    assert r["errors"] == []
    by_msg = {x["message_id"]: x for x in r["records"]}
    ids = {}
    for name, c in _cases().items():
        e, mid = c["expected"], c["email"]["message_id"]
        if e.get("rejected"):
            assert mid not in by_msg
            assert c["email"]["from"] in r["summary"]["rejected_senders"]
            continue
        rec = by_msg[mid]; ids[name] = rec["id"]
        for k in ("domain", "category", "domain_source", "retrieval_status", "sensitivity", "status", "source_type"):
            if k in e:
                assert rec[k] == e[k], (name, k)
        assert len(rec["proposed_actions"]) == e["actions"], name
        assert len(rec["knowledge_updates"]) == e["knowledge"], name
        for f in e.get("flags", []):
            assert f in rec["flags"], (name, f)
        if "due" in e:
            assert rec["proposed_actions"][0]["suggested_due"] == e["due"]
        if "owner" in e:
            assert rec["proposed_actions"][0]["owner"] == e["owner"]
        if "ku_tags" in e:
            assert rec["knowledge_updates"][0]["tags"] == e["ku_tags"]
        if e.get("shared_text_blank"):
            assert rec["shared_text"] == "" and rec["note"] == ""
    # duplicate points at the first record
    assert by_msg["<m14@x>"]["duplicate_of"] == ids["01-instagram-tool-reel"]
    # injected instructions are not followed and never reach proposals or the report queue
    inj = by_msg["<m13@x>"]
    assert inj["proposed_actions"] == [] and inj["knowledge_updates"] == []
    props = json.dumps([(x["proposed_actions"], x["knowledge_updates"]) for x in r["shareable"]])
    assert "evil@example.com" not in props and "wire funds" not in props
    assert "evil@example.com" not in r["report"] and "wire funds" not in r["report"]
    # firewall: founders-only/ip-flag content withheld; VC has no knowledge updates
    ip = by_msg["<m15@x>"]
    stub = next(s for s in r["shareable"] if s["id"] == ip["id"])
    assert stub["summary"].startswith("Withheld") and stub["note"] == ""
    assert all(not k for x in r["records"] if x["domain"] != "bluehealer" for k in [x["knowledge_updates"]])
    # second run creates nothing new
    r2 = run(FIX, tmp_path)
    assert r2["summary"]["processed"] == 0 and r2["summary"]["skipped_seen"] == 15 and r2["records"] == []
    assert len(list((tmp_path / "records").glob("*.jsonl"))) == 1
    lines = [l for f in (tmp_path / "ledger").glob("*.jsonl") for l in f.read_text().splitlines()]
    assert len(lines) == 15  # no duplicate ledger entries


def test_report_matches_golden(tmp_path):
    r = run(FIX, tmp_path)
    assert r["report"] == GOLDEN.read_text()
