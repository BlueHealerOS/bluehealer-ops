"""Task sink interface. One setting selects the adapter; the work app endpoint can be added later without changing records."""
from abc import ABC, abstractmethod


class SinkDisabled(RuntimeError):
    pass


class Sink(ABC):
    name = "base"

    def __init__(self, enabled: bool = False):
        self.enabled = enabled

    def _require(self):
        if not self.enabled:
            raise SinkDisabled(f"sink '{self.name}' is disabled in configuration")

    @abstractmethod
    def propose(self, actions: list[dict]) -> str: ...

    @abstractmethod
    def flush(self, accepted: list[dict]) -> list[str]: ...
