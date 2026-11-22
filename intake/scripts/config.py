"""Configuration loader with minimal structural validation."""
from pathlib import Path
import yaml

DEFAULT = Path(__file__).resolve().parents[1] / "config" / "domains.yaml"
REQUIRED = ["allowlist", "subject_tags", "summary_only_domains", "knowledge_domains", "category_rules", "sink", "sinks", "injection_patterns", "patent_hosts", "firecrawl_credit_cap"]
DOMAINS = {"bluehealer", "vector-control", "jhu", "personal", "unknown"}
CATEGORIES = {"competitor", "market", "clinical-evidence", "regulatory", "reimbursement", "funding-application", "contact-relationship", "hiring", "tool-skill", "idea", "other"}


class ConfigError(ValueError):
    pass


def load(path=DEFAULT) -> dict:
    cfg = yaml.safe_load(Path(path).read_text())
    missing = [k for k in REQUIRED if k not in cfg]
    if missing:
        raise ConfigError(f"missing keys: {missing}")
    if any("@" not in a for a in cfg["allowlist"]):
        raise ConfigError("allowlist must hold addresses only")
    bad = [v for v in cfg["subject_tags"].values() if v is not None and v not in DOMAINS]
    if bad:
        raise ConfigError(f"unknown domain in subject_tags: {bad}")
    unknown = set(cfg["category_rules"]) - CATEGORIES
    if unknown:
        raise ConfigError(f"unknown categories: {unknown}")
    cap = cfg["firecrawl_credit_cap"]
    if not isinstance(cap, int) or isinstance(cap, bool) or not 0 < cap <= 100:
        raise ConfigError("firecrawl_credit_cap must be an integer from 1 to 100")
    if cfg["sink"] not in cfg["sinks"]:
        raise ConfigError("sink not defined in sinks")
    if not cfg["sinks"][cfg["sink"]].get("enabled"):
        raise ConfigError("selected sink is not enabled")
    return cfg
