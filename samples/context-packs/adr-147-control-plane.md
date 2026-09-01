# ADR — AI Control Plane (EPIC #147)

Status: proposed

## Context
VERAH operates an autonomous engineering factory. GitHub remains the queue and
operational source of truth; the Control Plane manages policies, leases and
gates. Executors (Codex, OpenHands, Gemini) are interchangeable adapters.

## Decision
GitHub -> Langflow/Control Plane -> Agent Role -> Model Router -> Executor -> PR/CI/Audit.
Agent Role is a specialty; Model is the reasoning engine; Executor is the
runtime. Autonomy belongs to the system, not to any single agent.
