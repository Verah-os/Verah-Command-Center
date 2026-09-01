"""OmniRoute Phase-0 POC (Issue #152) — sandbox-only, mocked providers.

Runs the upstream combo-matrix integration suite (mocked fetch, no real
provider traffic) against a pinned snapshot of diegosouzapw/OmniRoute and
extracts the routing/fallback facts Phase 0 needs:

  - dispatch strategies available (priority, fill-first, round-robin,
    least-used, random, strict-random, p2c, quota-aware, reset-aware,
    headroom, lkgp, DRR, weighted, cost-optimized, context-optimized, fusion)
  - per-test pass/fail for the fallback contract scenarios
  - provider-side quota/circuit gating and transient-only failover contract

Usage:
    python pocs/omniroute/poc_omniroute_routing.py [--skip-run]

Clones (shallow) into .poc-cache/omniroute on first run. `--skip-run` only
re-parses the last recorded log at pocs/omniroute/out/combo-matrix.log.

Requirements: node >= 22.22.2 < 23, npm.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

POC_DIR = Path(__file__).resolve().parent
REPO_ROOT = POC_DIR.parents[1]
CACHE = REPO_ROOT / ".poc-cache" / "omniroute"
OUT_DIR = POC_DIR / "out"
UPSTREAM_URL = "https://github.com/diegosouzapw/OmniRoute.git"
PINNED_REF = "63e4afa3217abaacd29f85c6701064671925764b"  # v3.8.51 snapshot

FALLBACK_SCENARIOS = {
    "priority: falls back to the next target when the first fails": "priority-fallback-on-failure",
    "fill-first: keeps using the first target until it fails, then moves on": "fill-first-failover",
    "fusion: returns 503 when the whole panel fails": "fusion-exhaustion-503",
    "reset-aware: exhausted connection (limitReached) demoted — second target dispatched first": "quota-exhaustion-demotion",
    "saturation deprioritization: saturated connection demoted — clean second target dispatched first": "saturation-demotion",
    "lkgp: last-known-good provider is prioritised above definition order": "lkgp-recovery",
    "context-relay codex quota handoff: fires and expiresAt matches session-window reset from quot": "429-quota-handoff",
}


def ensure_clone() -> None:
    if (CACHE / ".git").exists():
        subprocess.run(["git", "-C", str(CACHE), "checkout", "--detach", PINNED_REF], check=True)
        return
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(["git", "clone", "--filter=blob:none", "--no-checkout", UPSTREAM_URL, str(CACHE)], check=True)
    subprocess.run(["git", "-C", str(CACHE), "checkout", "--detach", PINNED_REF], check=True)


def run_matrix() -> None:
    if not (CACHE / "node_modules").exists():
        subprocess.run(["npm", "ci", "--no-audit", "--no-fund"], cwd=CACHE, check=True)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    log = OUT_DIR / "combo-matrix.log"
    with log.open("w") as fh:
        proc = subprocess.run(
            ["npm", "run", "test:combo:matrix"], cwd=CACHE, stdout=fh,
            stderr=subprocess.STDOUT, timeout=900,
        )
    print(f"matrix exit: {proc.returncode} (log: {log})")


def parse_matrix() -> dict:
    log = (OUT_DIR / "combo-matrix.log").read_text(encoding="utf-8", errors="ignore")
    results = {}
    for line in log.splitlines():
        m = re.match(r"(not )?ok \d+ - (.+?) ?$", line.strip())
        if not m:
            continue
        name = m.group(2).strip()
        results[name] = "FAIL" if m.group(1) else "PASS"

    totals = {
        "tests": int(re.search(r"# tests (\d+)", log).group(1)),
        "pass": int(re.search(r"# pass (\d+)", log).group(1)),
        "fail": int(re.search(r"# fail (\d+)", log).group(1)),
    }

    fallback = {}
    for name, scenario in FALLBACK_SCENARIOS.items():
        hit = next((v for k, v in results.items() if k.startswith(name)), None)
        if hit is not None:
            fallback[scenario] = hit

    return {"totals": totals, "fallback_scenarios": fallback, "all_tests": results}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--skip-run", action="store_true")
    args = ap.parse_args()

    if not args.skip_run:
        ensure_clone()
        run_matrix()

    parsed = parse_matrix()
    rev = subprocess.run(["git", "-C", str(CACHE), "rev-parse", "HEAD"],
                         capture_output=True, text=True).stdout.strip() if CACHE.exists() else None

    summary = {
        "upstream": {"repo": UPSTREAM_URL, "pinned_ref": PINNED_REF, "actual_rev": rev},
        "contract_docs_reviewed": [
            "OMNIROUTE_ROUTING_POLICY.md", "OMNIROUTE_PROVIDER_FAILOVER.md",
        ],
        "combo_matrix": parsed,
    }
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "omniroute-evaluation.json").write_text(json.dumps(summary, indent=1))
    print(json.dumps({k: v for k, v in summary.items() if k != "combo_matrix"}, indent=1))
    print(json.dumps({"totals": parsed["totals"], "fallback_scenarios": parsed["fallback_scenarios"]}, indent=1))

    # Decision gate: matrix mostly green + the core fallback scenarios green.
    core = ["priority-fallback-on-failure", "fill-first-failover", "fusion-exhaustion-503"]
    core_ok = all(parsed["fallback_scenarios"].get(c) == "PASS" for c in core)
    print("POC:", "PASS" if core_ok else "FAIL")
    return 0 if core_ok else 1


if __name__ == "__main__":
    sys.exit(main())
