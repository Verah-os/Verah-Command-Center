# Autonomy policy

The explicit skill invocation authorizes one bounded cycle for the issue text
already carrying authorization labels. It does not authorize new scope,
credentials, costs, production, remote database writes, real messages,
financial changes or ruleset changes.

Allowed inside scope:

- read GitHub/repository context;
- reserve one issue;
- create one isolated branch;
- edit and test authorized code;
- create small commits and one draft PR;
- update sanitized issue/PR/handoff records;
- transition to Ready and merge only with `codex:auto-merge` and every release
  gate satisfied.

Use no more than two correction attempts and the configured duration budget.
Never silently broaden scope to keep a cycle moving.
