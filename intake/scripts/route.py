"""Deterministic routing: classification input (from the enrichment step) to a validated-shape record."""
import hashlib, re
from .safety import find_injection
from .canonicalize_url import host_of

SENSITIVITY_RANK = {"open": 0, "founders-only": 1, "ip-flag": 2}


def _h(*parts, n=8) -> str:
    return hashlib.sha1("|".join(parts).encode()).hexdigest()[:n]


def record_id(message_id: str) -> str:
    return "ir-" + _h(message_id, n=10)


def _owner(rule_owner: str, submitter: str) -> str:
    if rule_owner == "submitter":
        s = submitter.lower()
        return "jay" if s.startswith("jay") else "santiago" if s.startswith("santiago") else "unassigned"
    return rule_owner


def _action(rid, domain, key, rule, title, submitter, rationale, due=None):
    return {
        "id": "ai-" + _h(rid, key), "title": rule["title"].format(title=title), "domain": domain,
        "owner": _owner(rule.get("owner", "unassigned"), submitter), "suggested_due": due,
        "priority": rule.get("priority", "low"), "source_intake_id": rid, "rationale": rationale,
        "status": "proposed", "sink_ref": None,
    }


def build_record(p: dict, enrich: dict, cfg: dict, ledger, run_id: str) -> dict:
    rid = record_id(p["message_id"])
    tagmap = cfg["subject_tags"]
    if p["tag"] and tagmap.get(p["tag"]):
        domain, dsrc = tagmap[p["tag"]], "tag"
    else:
        domain, dsrc = enrich.get("domain_guess", "unknown"), "inferred"
    category = enrich.get("category", "other")
    if category not in cfg["category_rules"]:
        category = "other"
    sens = enrich.get("sensitivity", "open")
    if host_of(p["url"] or "") in cfg["patent_hosts"]:
        sens = "ip-flag"
    flags = []
    texts = [p["raw_text"], p["shared_text"], p["note"], enrich.get("summary", "")] + enrich.get("fetched_text", [])
    if find_injection(texts, cfg["injection_patterns"]):
        flags.append("prompt-injection-suspected")
    dup = ledger.duplicate_of(p["canonical_url"])
    if dup:
        flags.append("duplicate")
    shared_text, note, attachments = p["shared_text"], p["note"], p["attachments"]
    if domain in cfg["summary_only_domains"]:
        shared_text, note, attachments = "", "", []
        flags.append("summary-and-link-only")
    if p["source_type"] == "linkedin" and category == "contact-relationship":
        flags.append("private-individual-no-enrichment")
    rec = {
        "id": rid, "message_id": p["message_id"], "run_id": run_id, "received_at": p["received_at"],
        "submitter": p["submitter"], "channel": p["channel"], "source_type": p["source_type"],
        "source_url": p["canonical_url"], "title": p["title"], "shared_text": shared_text, "note": note,
        "attachments": attachments, "domain": domain, "domain_source": dsrc, "category": category,
        "summary": enrich.get("summary", "I do not know: no summary was retrieved."),
        "why_it_matters": enrich.get("why_it_matters", ""), "sources": enrich.get("sources", [p["canonical_url"]] if p["canonical_url"] else []),
        "retrieval_status": enrich.get("retrieval_status", "blocked"), "sensitivity": sens,
        "confidence": enrich.get("confidence", "low"), "duplicate_of": dup, "flags": flags,
        "proposed_actions": [], "knowledge_updates": [], "status": "new",
    }
    if dup:
        rec["status"] = "discarded"
        return rec
    if "prompt-injection-suspected" in flags:
        return rec  # flagged only: no proposals from suspicious content
    _propose(rec, enrich, cfg, p)
    rec["status"] = "proposed" if rec["proposed_actions"] or rec["knowledge_updates"] else "new"
    return rec


def _propose(rec, enrich, cfg, p):
    rid, domain, title = rec["id"], rec["domain"], rec["title"]
    if rec["sensitivity"] == "ip-flag":
        rec["proposed_actions"].append(_action(rid, domain, "patent", cfg["patent_action"], title, rec["submitter"], "Patent find: for Santiago and counsel. No freedom-to-operate opinion."))
        return
    if domain == "unknown":
        rec["proposed_actions"].append(_action(rid, domain, "domain", cfg["unknown_domain_action"], title, rec["submitter"], "Domain could not be inferred."))
        return
    rule = cfg["category_rules"].get(rec["category"], {})
    if rule.get("action"):
        a = rule["action"]
        due = enrich.get("deadline") if a.get("due_from") == "deadline" else None
        rec["proposed_actions"].append(_action(rid, domain, rec["category"], a, title, rec["submitter"], f"Category rule: {rec['category']}.", due))
    dest = rule.get("hub_destination")
    if dest and domain in cfg["knowledge_domains"]:
        if any(dest.startswith(f) for f in cfg["forbidden_destination_prefixes"]):
            rec["flags"].append("forbidden-destination-dropped")
        else:
            tags = [t for t, rx in rule.get("tag_patterns", {}).items() if re.search(rx, " ".join([title, rec["summary"], rec["shared_text"], rec["note"]]), re.I)]
            rec["knowledge_updates"].append({"id": "ku-" + _h(rid, dest), "intake_id": rid, "destination": dest, "kind": "new-note", "title": title, "tags": tags, "status": "proposed"})
    if rule.get("parking_lot"):
        rec["flags"].append("parking-lot")
    if rule.get("crm_placeholder"):
        rec["flags"].append("crm-placeholder")
    if rule.get("note_only"):
        rec["flags"].append("hiring-note")


def redact_for_hq(rec: dict) -> dict:
    """Records that are founders-only or ip-flag leave only a stub in santiago-hq."""
    if rec["sensitivity"] == "open":
        return rec
    r = dict(rec)
    r.update(summary="Withheld (" + rec["sensitivity"] + "). Full record to be filed in SharePoint Documents after founder approval.",
             why_it_matters="", shared_text="", note="", attachments=[])
    r["flags"] = rec["flags"] + ["stub"]
    return r
