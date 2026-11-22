from .base import Sink, SinkDisabled
from .file_sink import FileSink
from .trello_sink import TrelloSink
from .github_issues_sink import GithubIssuesSink

REGISTRY = {"file": FileSink, "trello": TrelloSink, "github-issues": GithubIssuesSink}


def get_sink(cfg: dict) -> Sink:
    name = cfg["sink"]
    return REGISTRY[name](enabled=cfg["sinks"][name].get("enabled", False))
