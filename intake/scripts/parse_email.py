"""Parse an intake email (dict) into a draft record. Tolerant of plain forwards."""
import re
from .canonicalize_url import canonicalize, source_type

SUBJECT = re.compile(r"^\s*(?:(?:fw|fwd|re)\s*:\s*)*(?:\[INTAKE\]\s*)?(?:\[(BH|VC|JHU|ME|AUTO)\]\s*)?(.*)$", re.I | re.S)
KEYS = ("URL", "TEXT", "NOTE", "DOMAIN", "SUBMITTER", "TIMESTAMP")
URL_RE = re.compile(r"https?://[^\s<>\"']+")


def parse_body(body: str) -> dict:
    out, cur = {}, None
    for line in (body or "").splitlines():
        m = re.match(r"^(URL|TEXT|NOTE|DOMAIN|SUBMITTER|TIMESTAMP):\s*(.*)$", line)
        if m:
            cur = m.group(1)
            out[cur] = m.group(2).strip()
        elif cur in ("TEXT", "NOTE") and line.strip():
            out[cur] = (out[cur] + "\n" + line.strip()).strip()
    return out


def parse(msg: dict) -> dict:
    subject = msg.get("subject", "")
    sm = SUBJECT.match(subject)
    tag = sm.group(1).upper() if sm and sm.group(1) else None
    title = (sm.group(2) if sm else subject).strip()
    has_tag = bool(re.search(r"\[INTAKE\]", subject, re.I))
    blk = parse_body(msg.get("body", ""))
    if tag is None and blk.get("DOMAIN"):
        d = blk["DOMAIN"].upper()
        tag = d if d in ("BH", "VC", "JHU", "ME", "AUTO") else None
    url = blk.get("URL") or None
    if not url:
        m = URL_RE.search(msg.get("body", ""))
        url = m.group(0) if m else None
    attachments = [{"name": a.get("name", ""), "content_type": a.get("content_type", "")} for a in msg.get("attachments", [])]
    sender = (msg.get("from") or "").strip().lower()
    return {
        "message_id": msg["message_id"],
        "received_at": msg["received_at"],
        "sender": sender,
        "submitter": blk.get("SUBMITTER") or sender.split("@")[0],
        "channel": "share-sheet" if has_tag and blk else "email-forward",
        "tag": tag,
        "title": title,
        "url": url,
        "canonical_url": canonicalize(url) if url else None,
        "source_type": source_type(url, attachments),
        "shared_text": blk.get("TEXT", ""),
        "note": blk.get("NOTE", ""),
        "attachments": attachments,
        "raw_text": "\n".join([msg.get("subject", ""), msg.get("body", "")]),
    }
