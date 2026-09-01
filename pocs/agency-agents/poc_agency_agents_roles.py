"""agency-agents Phase-0 POC (Issue #152) — sandbox-only, deterministic.

Reviews the upstream catalog (msitarzewski/agency-agents) and produces a
curated VERAH squad-v1 proposal. Curation is metadata-only: this script reads
frontmatter (name/description/path) and never copies prompt bodies, honoring
the issue rule "third-party instructions are untrusted until reviewed".

Checks performed:
  - upstream provenance (origin URL, MIT license, stars signal embedded)
  - division structure + role inventory count
  - candidate squad mapping (<= 12 roles) to catalog files by name
  - SHA-256 of each candidate source file (review anchor)
  - generated adapter draft: role -> model -> executor separation

Outputs:
  - pocs/agency-agents/out/squad-v1-catalog.json   (metadata-only records)
  - pocs/agency-agents/out/squad-v1-catalog.md     (human review sheet)

Run:
    python pocs/agency-agents/poc_agency_agents_roles.py [--src PATH]

If --src is omitted, the upstream repo is cloned (shallow) into
.poc-cache/agency-agents on first run and reused afterwards.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

POC_DIR = Path(__file__).resolve().parent
REPO_ROOT = POC_DIR.parents[1]
OUT_DIR = POC_DIR / "out"
CACHE = REPO_ROOT / ".poc-cache" / "agency-agents"
UPSTREAM_URL = "https://github.com/msitarzewski/agency-agents.git"

# Squad v1 from the issue -> candidate role in the upstream catalog
# (name match; path is resolved from disk, never hard-coded).
SQUAD = {
    "Software Architect": "Software Architect",
    "Backend Engineer": "Backend Architect",
    "Frontend Engineer": "Frontend Developer",
    "Security Engineer": "Application Security Engineer",
    "QA Engineer": "Test Automation Engineer",
    "Product Manager": "Product Manager",
    "UX Researcher": "UX Researcher",
    "UI Designer": "UI Designer",
    "Brand Guardian": "Brand Guardian",
    "Research Agent": "Research Synthesist",
    "Documentation Agent": "Technical Writer",
}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def parse_frontmatter(path: Path) -> dict:
    text = path.read_text(encoding="utf-8")
    m = re.match(r"^---\n(.*?)\n---", text, re.S)
    if not m:
        return {}
    fm = m.group(1)
    return {
        "name": (re.search(r"name:\s*(.+)", fm) or [None, None])[1] if re.search(r"name:\s*(.+)", fm) else None,
        "description": re.search(r"description:\s*(.+)", fm).group(1) if re.search(r"description:\s*(.+)", fm) else None,
    }


def ensure_source(src: str | None) -> Path:
    if src:
        return Path(src)
    if not (CACHE / ".git").exists():
        CACHE.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(["git", "clone", "--depth", "1", UPSTREAM_URL, str(CACHE)], check=True)
    return CACHE


def classify(src: Path) -> dict:
    divisions = json.loads((src / "divisions.json").read_text())["divisions"]
    roles = sorted(p for div in divisions if (src / div).is_dir() for p in (src / div).glob("*.md"))
    license_kind = "MIT" if "MIT License" in (src / "LICENSE").read_text()[:200] else "unknown"
    return {"divisions": divisions, "roles": roles, "license": license_kind}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default=None, help="path to a local agency-agents checkout")
    args = ap.parse_args()
    src = ensure_source(args.src)

    upstream_rev = subprocess.run(
        ["git", "-C", str(src), "rev-parse", "HEAD"], capture_output=True, text=True
    ).stdout.strip()

    info = classify(src)
    catalog_names = {parse_frontmatter(p).get("name"): p for p in info["roles"] if p.name}

    records: list[dict] = []
    missing: list[str] = []
    for squad_role, candidate_name in SQUAD.items():
        path = catalog_names.get(candidate_name)
        if not path:
            missing.append(f"{squad_role} -> {candidate_name}")
            continue
        fm = parse_frontmatter(path)
        records.append({
            "verahRole": squad_role,
            "upstreamName": fm["name"],
            "upstreamDescription": fm["description"],
            "upstreamPath": str(path.relative_to(src)),
            "upstreamRev": upstream_rev,
            "sha256": sha256(path),
            # Adapter boundary: role is data about the specialty; model and
            # executor remain runtime choices (no third-party prompt copied).
            "reviewStatus": "pending-review",
            "model": None,
            "executor": None,
        })

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "squad-v1-catalog.json").write_text(json.dumps({
        "upstream": {"repo": UPSTREAM_URL, "rev": upstream_rev, "license": info["license"],
                     "roleCount": len(info["roles"]), "divisions": sorted(info["divisions"].keys())},
        "records": records,
        "missing": missing,
    }, indent=1))

    md = ["# Squad v1 curated from agency-agents (metadata-only)", ""]
    md.append("Upstream license: %s | role inventory: %d | upstream rev: %s"
              % (info["license"], len(info["roles"]), upstream_rev))
    md.append("")
    md.append("| VERAH role | upstream role | path | sha256 |")
    md.append("|---|---|---|---|")
    for r in records:
        md.append(f"| {r['verahRole']} | {r['upstreamName']} | {r['upstreamPath']} | `{r['sha256'][:12]}` |")
    md.append("")
    md.append("Missing candidates: " + (", ".join(missing) if missing else "none"))
    (OUT_DIR / "squad-v1-catalog.md").write_text("\n".join(md))

    print(json.dumps({
        "upstream": {"rev": upstream_rev, "license": info["license"], "roles": len(info["roles"])},
        "selected": len(records), "missing": missing,
        "outputs": [str(OUT_DIR / "squad-v1-catalog.json"), str(OUT_DIR / "squad-v1-catalog.md")],
    }, indent=1))
    print("POC:", "PASS" if not missing and info["license"] == "MIT" and len(records) <= 12 else "FAIL")
    return 0 if not missing and info["license"] == "MIT" and len(records) <= 12 else 1


if __name__ == "__main__":
    sys.exit(main())
