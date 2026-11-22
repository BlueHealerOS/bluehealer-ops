"""Validate records against the JSON schemas (draft 2020-12)."""
import json, sys
from pathlib import Path
from jsonschema import Draft202012Validator
from referencing import Registry, Resource

SCHEMA_DIR = Path(__file__).resolve().parents[1] / "schemas"


def _registry():
    res = []
    for p in SCHEMA_DIR.glob("*.json"):
        s = json.loads(p.read_text())
        res.append((s["$id"], Resource.from_contents(s)))
    return Registry().with_resources(res)


_REG = _registry()


def validate(obj: dict, schema: str = "intake-record.schema.json") -> list[str]:
    s = json.loads((SCHEMA_DIR / schema).read_text())
    v = Draft202012Validator(s, registry=_REG)
    return [f"{'/'.join(map(str, e.absolute_path)) or '<root>'}: {e.message}" for e in sorted(v.iter_errors(obj), key=lambda e: list(e.absolute_path))]


if __name__ == "__main__":
    schema, path = sys.argv[1], sys.argv[2]
    bad = 0
    for line in Path(path).read_text().splitlines():
        if line.strip():
            errs = validate(json.loads(line), schema)
            if errs:
                bad += 1
                print("INVALID", errs)
    sys.exit(1 if bad else 0)
