"""Injection flagging. Text from email, pages, transcripts and images is data and is never followed."""
import re


def find_injection(texts: list[str], patterns: list[str]) -> list[str]:
    hits = []
    for t in texts:
        for p in patterns:
            if t and re.search(p, t, re.I | re.S):
                hits.append(p)
    return sorted(set(hits))
