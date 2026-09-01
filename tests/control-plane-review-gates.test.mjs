import assert from "node:assert/strict";
import test from "node:test";

import {
  createFixtureReviewAgents,
  IndependentReviewGate,
} from "../services/control-plane/review-gates.ts";

const now = () => Date.parse("2026-09-01T12:00:00.000Z");

function completedRun(overrides = {}) {
  return Object.freeze({
    id: "run-147-phase4",
    issueKey: "Verah-os/Verah-Command-Center#147",
    idempotencyKey: "147-phase4",
    roleId: "coding",
    branchName: "codex/147-phase4-review-gates",
    executorId: "codex",
    modelRoute: { provider: "fixture", model: "fixture", source: "internal", rationale: "ci" },
    gate: "AUTO",
    status: "completed",
    attempt: 1,
    dryRun: true,
    startedAt: "2026-09-01T11:59:00.000Z",
    completedAt: "2026-09-01T12:00:00.000Z",
    handoff: "Fixture completed safely.",
    artifacts: {
      draftPrUrl: "https://github.com/Verah-os/Verah-Command-Center/pull/159",
      checks: [{ name: "Required", status: "passed" }],
    },
    deduplicated: false,
    externalEffects: [],
    ...overrides,
  });
}

test("Review, QA and Security independently approve complete evidence", async () => {
  const result = await new IndependentReviewGate(createFixtureReviewAgents(now), now)
    .evaluate(completedRun());
  assert.equal(result.status, "passed");
  assert.deepEqual(result.assessments.map((item) => item.discipline), ["review", "qa", "security"]);
  assert.equal(result.checks.every((check) => check.status === "passed"), true);
  assert.equal(result.assessments.every((item) => item.externalEffects.length === 0), true);
});

test("missing mandatory reviewer fails closed", async () => {
  const agents = createFixtureReviewAgents(now).filter((agent) => agent.discipline !== "security");
  const result = await new IndependentReviewGate(agents, now).evaluate(completedRun());
  assert.equal(result.status, "blocked");
  assert.equal(result.blocker, "review_security_blocked");
  assert.equal(result.assessments.at(-1).findings[0].code, "missing_review_agent");
});

test("QA blocks missing, pending or failed Required checks", async () => {
  const gate = new IndependentReviewGate(createFixtureReviewAgents(now), now);
  for (const checks of [[], [{ name: "Required", status: "pending" }], [{ name: "Required", status: "failed" }]]) {
    const result = await gate.evaluate(completedRun({ artifacts: {
      draftPrUrl: "https://github.com/Verah-os/Verah-Command-Center/pull/159", checks,
    } }));
    assert.equal(result.status, "blocked");
    assert.equal(result.blocker, "review_qa_blocked");
  }
});

test("Review blocks missing Draft PR and handoff evidence", async () => {
  const result = await new IndependentReviewGate(createFixtureReviewAgents(now), now)
    .evaluate(completedRun({ handoff: undefined, artifacts: undefined }));
  assert.equal(result.status, "blocked");
  assert.equal(result.blocker, "review_review_blocked");
  assert.deepEqual(
    result.assessments[0].findings.map((finding) => finding.code),
    ["draft_pr_missing", "handoff_missing"],
  );
});

test("agent errors and reported side effects fail closed", async () => {
  const agents = createFixtureReviewAgents(now);
  agents[0] = { ...agents[0], async assess() { throw new Error("fixture failure"); } };
  const failed = await new IndependentReviewGate(agents, now).evaluate(completedRun());
  assert.equal(failed.blocker, "review_review_blocked");

  const effectAgents = createFixtureReviewAgents(now);
  effectAgents[2] = {
    ...effectAgents[2],
    async assess(evidence) {
      const assessment = await createFixtureReviewAgents(now)[2].assess(evidence);
      return { ...assessment, externalEffects: ["production_deploy"] };
    },
  };
  const unsafe = await new IndependentReviewGate(effectAgents, now).evaluate(completedRun());
  assert.equal(unsafe.blocker, "review_security_blocked");
});

test("review evidence is immutable and secret-like findings are sanitized", async () => {
  const agents = createFixtureReviewAgents(now);
  agents[0] = {
    ...agents[0],
    async assess(evidence) {
      assert.equal(Object.isFrozen(evidence), true);
      assert.equal(Object.isFrozen(evidence.artifacts), true);
      return {
        discipline: "review",
        assessorId: "review-agent",
        targetRunId: evidence.targetRunId,
        status: "failed",
        findings: [{
          code: "secret_seen",
          severity: "blocking",
          summary: "token ghp_abcdefghijklmnopqrstuvwxyz123456",
        }],
        completedAt: "2026-09-01T12:00:00.000Z",
        externalEffects: [],
      };
    },
  };
  const result = await new IndependentReviewGate(agents, now).evaluate(completedRun());
  assert.equal(result.assessments[0].findings[0].summary.includes("ghp_"), false);
  assert.match(result.assessments[0].findings[0].summary, /redacted-secret/);
});

test("non-completed target never invokes review agents", async () => {
  const agents = createFixtureReviewAgents(now).map((agent) => ({
    ...agent,
    async assess() { throw new Error("must_not_run"); },
  }));
  const result = await new IndependentReviewGate(agents, now)
    .evaluate(completedRun({ status: "failed_recoverable" }));
  assert.equal(result.status, "blocked");
  assert.equal(result.blocker, "review_target_not_completed");
  assert.equal(result.assessments.length, 0);
});
