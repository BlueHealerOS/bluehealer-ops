"""URL canonicalization and source-type detection. Pure functions, no network."""
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode
import re

TRACKING = {"igsh", "igshid", "si", "fbclid", "gclid", "feature", "trk", "trkinfo", "ref", "ref_src", "mc_cid", "mc_eid", "utm_id", "pp", "ab_channel"}
YT_HOSTS = {"youtube.com", "youtu.be", "youtube-nocookie.com"}


def _host(netloc: str) -> str:
    h = netloc.lower().split("@")[-1].split(":")[0]
    for p in ("www.", "m.", "mobile."):
        if h.startswith(p):
            h = h[len(p):]
    return h


def canonicalize(url: str) -> str:
    url = (url or "").strip().rstrip(".,;)")
    if not url:
        return ""
    if "://" not in url:
        url = "https://" + url
    s = urlsplit(url)
    host = _host(s.netloc)
    path = re.sub(r"/{2,}", "/", s.path)
    q = [(k, v) for k, v in parse_qsl(s.query, keep_blank_values=False)
         if k.lower() not in TRACKING and not k.lower().startswith("utm_")]
    if host in YT_HOSTS:
        vid = None
        if host == "youtu.be":
            vid = path.strip("/").split("/")[0]
        else:
            m = re.match(r"^/(shorts|embed|live|v)/([\w-]{6,})", path)
            if m:
                vid = m.group(2)
            else:
                vid = dict(q).get("v")
        if vid:
            return f"https://youtube.com/watch?v={vid}"
    if host == "instagram.com":
        m = re.search(r"/(p|reel|reels|tv)/([\w-]+)", path)
        if m:
            kind = "reel" if m.group(1) in ("reel", "reels") else m.group(1)
            return f"https://instagram.com/{kind}/{m.group(2)}"
        return f"https://instagram.com{path.rstrip('/')}"
    if host.endswith("linkedin.com"):
        return f"https://linkedin.com{path.rstrip('/')}"
    q.sort()
    path = path.rstrip("/") if path != "/" else ""
    return urlunsplit(("https", host, path, urlencode(q), ""))


def host_of(url: str) -> str:
    if not url:
        return ""
    return _host(urlsplit(url if "://" in url else "https://" + url).netloc)


def source_type(url: str | None, attachments: list | None = None) -> str:
    if url:
        h = host_of(url)
        path = urlsplit(url if "://" in url else "https://" + url).path.lower()
        if h in YT_HOSTS:
            return "youtube"
        if h == "instagram.com":
            return "instagram"
        if h.endswith("linkedin.com") or h == "lnkd.in":
            return "linkedin"
        if path.endswith(".pdf"):
            return "pdf"
        return "web"
    if any((a.get("content_type") or "").startswith("image/") for a in (attachments or [])):
        return "image"
    return "text"


if __name__ == "__main__":
    import sys
    for u in sys.argv[1:]:
        print(canonicalize(u), source_type(u))
