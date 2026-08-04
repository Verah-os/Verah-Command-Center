# Failure and resume policy

Persist only a sanitized local checkpoint containing issue number, branch,
base SHA, state, attempt count and timestamps. GitHub remains the operational
record; the existing Control Plane remains the domain model.

Count a correction attempt only after a completed validation fails and code is
changed. Retry at most twice. Do not count runner queues, Docker startup or
network availability as code corrections.

On interruption, verify the checkpoint against GitHub and git before resuming.
On divergence, ambiguous ownership, expired budget or second failed correction,
stop, add `codex:blocked`, clear `codex:in-progress` when safe and publish a
sanitized blocker report. The local `STOP` file always blocks new cycles until
an explicit `pnpm verah:resume`.
