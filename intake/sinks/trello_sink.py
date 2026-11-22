from .base import Sink


class TrelloSink(Sink):
    """Disabled stub. Target board: BlueHealer Business Functions. Enable only by explicit decision."""
    name = "trello"

    def propose(self, actions):
        self._require()
        raise NotImplementedError("Trello adapter is a stub")

    def flush(self, accepted):
        self._require()
        raise NotImplementedError("Trello adapter is a stub")
