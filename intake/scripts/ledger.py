"""Processed-message ledger. Append-only: every run writes a new file; the ledger is the union of all files."""
import json
from pathlib import Path


class Ledger:
    def __init__(self, directory):
        self.dir = Path(directory)
        self.messages: dict[str, dict] = {}
        self.urls: dict[str, str] = {}
        self.new: list[dict] = []
        if self.dir.exists():
            for f in sorted(self.dir.glob("*.jsonl")):
                for line in f.read_text().splitlines():
                    if line.strip():
                        self._index(json.loads(line))

    def _index(self, e: dict):
        self.messages[e["message_id"]] = e
        if e.get("canonical_url") and e.get("outcome") == "processed":
            self.urls.setdefault(e["canonical_url"], e["record_id"])

    def seen(self, message_id: str) -> bool:
        return message_id in self.messages

    def duplicate_of(self, canonical_url: str | None):
        return self.urls.get(canonical_url) if canonical_url else None

    def add(self, entry: dict):
        self._index(entry)
        self.new.append(entry)

    def write_new(self, date: str) -> Path | None:
        """Write this run's entries to a new file; never modifies an existing file."""
        if not self.new:
            return None
        self.dir.mkdir(parents=True, exist_ok=True)
        n = 1
        while True:
            p = self.dir / (f"{date}.jsonl" if n == 1 else f"{date}-{n}.jsonl")
            try:
                with open(p, "x") as fh:
                    for e in self.new:
                        fh.write(json.dumps(e, sort_keys=True) + "\n")
                return p
            except FileExistsError:
                n += 1
