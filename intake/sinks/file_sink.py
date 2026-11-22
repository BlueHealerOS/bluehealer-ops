from .base import Sink


class FileSink(Sink):
    """Always-available sink: the queue lives inside the daily report. Writes nothing itself."""
    name = "file"

    def propose(self, actions):
        self._require()
        if not actions:
            return "- Empty."
        return "\n".join(f"- [{a['status']}] {a['title']} (owner {a['owner']}, domain {a['domain']}, priority {a['priority']}, id {a['id']})" for a in actions)

    def flush(self, accepted):
        self._require()
        return [f"accepted {a['id']}: {a['title']}" for a in accepted]
