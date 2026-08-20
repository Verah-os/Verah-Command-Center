# Codex token tooling for VERAH

This repository includes an opt-in setup for four complementary tools. The goal is to reduce unnecessary context usage without interrupting the active VERAH delivery queue.

## Tools

- **CodeBurn** — observes Codex session token/cost usage locally and helps identify waste. It does not proxy Codex traffic.
- **Graphify** — builds a persistent knowledge graph for the repository so Codex can query structure instead of repeatedly re-reading the codebase. Installed project-scoped under Codex/Agent Skills locations.
- **Ponytail** — Codex plugin focused on shorter, more selective coding-agent output. Its lifecycle hooks must be reviewed/trusted in Codex after installation.
- **Headroom** — optional compression/proxy layer for Codex. It is installed by the setup script, but the current Codex session is not automatically rerouted. Start a fresh optimized session with the launcher script.

## Windows setup

From the repository root in PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-codex-token-tooling.ps1
```

Then restart Codex. Open `/hooks` and review/trust Ponytail's two hooks.

## Daily usage

For a normal Codex session, keep using Codex as usual. Graphify is available as `$graphify .`.

To start a fresh session routed through Headroom:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run-codex-optimized.ps1
```

Token visibility:

```powershell
codeburn overview --provider codex
codeburn optimize --provider codex
```

## Safety and rollback

The setup deliberately does not stop or mutate an already-running Codex task. Headroom is opt-in per new wrapped session. If a Headroom-wrapped session behaves unexpectedly, stop it and run:

```powershell
headroom unwrap codex
```

Ponytail can be removed with Codex's plugin management commands. Graphify can be removed with its uninstall command. CodeBurn only reads local session data unless you explicitly invoke one of its apply/guard actions.

Before enabling any automatic CodeBurn fixes, review them with:

```powershell
codeburn optimize --apply --dry-run
```
