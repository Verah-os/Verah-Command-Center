# Work selection

Select only open issues with `codex:authorized` and `codex:ready`, without
`codex:blocked` or `codex:in-progress`, and with objective, scope and acceptance
criteria. Stop if any open issue already has `codex:in-progress`.

Order candidates deterministically:

1. `priority:p0` or `priority:critical`;
2. `priority:p1` or `priority:high`;
3. `priority:p2` or `priority:medium`;
4. `priority:p3` or `priority:low`;
5. unlabeled priority;
6. oldest creation time, then lowest issue number.

Acquire the host mutex and the GitHub operational label before implementation.
Recheck the queue after labeling. If competing locks appear, release the local
reservation, mark the run blocked and make no code change.
