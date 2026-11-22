from .base import Sink


class GithubIssuesSink(Sink):
    """Disabled stub. Labels would be status:proposed, status:accepted, status:rejected."""
    name = "github-issues"

    def propose(self, actions):
        self._require()
        raise NotImplementedError("GitHub Issues adapter is a stub")

    def flush(self, accepted):
        self._require()
        raise NotImplementedError("GitHub Issues adapter is a stub")
