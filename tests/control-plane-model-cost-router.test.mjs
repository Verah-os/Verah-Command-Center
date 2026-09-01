import assert from "node:assert/strict";
import test from "node:test";

import {
  CostAwareModelRouter,
  OMNIROUTE_PHASE_0_EVIDENCE,
  assessOmniRouteEvidence,
} from "../services/control-plane/model-cost-router.ts";

const task = {
  issueKey: "Verah-os/Verah-Command-Center#147",
  idempotencyKey: "phase-6",
  title: "Route a coding task",
  roleId: "coding",
  kind: "coding",
};

const role = {
  id: "coding",
  name: "Coding",
  capabilities: ["code"],
  reviewStatus: "internal-approved",
};

const approvedEvidence = {
  decision: "ADOPT",
  snapshot: "0123456789abcdef0123456789abcdef01234567",
  evidenceRef: "pocs/omniroute/out/approved.json",
  passed: 27,
  total: 27,
  canonicalFallbackPassed: true,
  deploymentOverheadMeasured: true,
};

test("Phase 0 TRIAL evidence keeps OmniRoute disabled and selects internal lowest cost", async () => {
  let externalCalls = 0;
  const router = new CostAwareModelRouter(
    [
      { provider: "provider-a", model: "large", priority: 0, estimatedCostMicrounits: 80 },
      { provider: "provider-b", model: "small", priority: 9, estimatedCostMicrounits: 10 },
    ],
    {
      omniRouteEvidence: OMNIROUTE_PHASE_0_EVIDENCE,
      omniRoute: {
        async route() {
          externalCalls += 1;
          throw new Error("must_not_run");
        },
      },
    },
  );

  assert.deepEqual(router.omniRouteGate(), {
    enabled: false,
    reason: "decision_not_adopted",
    evidenceRef: "pocs/omniroute/out/omniroute-evaluation.json",
  });
  assert.deepEqual(await router.route(task, role), {
    provider: "provider-b",
    model: "small",
    source: "internal",
    rationale: "lowest_cost_available;fallbacks=0",
    estimatedCostMicrounits: 10,
    fallbackCount: 0,
  });
  assert.equal(externalCalls, 0);
});

test("internal routing skips unavailable candidates and reports fallback count", async () => {
  const router = new CostAwareModelRouter([
    {
      provider: "provider-a",
      model: "cheap",
      priority: 0,
      estimatedCostMicrounits: 5,
      availability: async () => "rate_limited",
    },
    {
      provider: "provider-b",
      model: "fallback",
      priority: 0,
      estimatedCostMicrounits: 15,
      availability: async () => "available",
    },
  ]);

  const route = await router.route(task, role);
  assert.equal(route.model, "fallback");
  assert.equal(route.fallbackCount, 1);
  assert.equal(route.estimatedCostMicrounits, 15);
});

test("role and task filters fail closed when no candidate is eligible", async () => {
  const router = new CostAwareModelRouter([
    {
      provider: "provider-a",
      model: "research-only",
      priority: 0,
      estimatedCostMicrounits: 1,
      roleIds: ["research"],
      taskKinds: ["research"],
    },
  ]);

  await assert.rejects(() => router.route(task, role), /model_route_not_eligible/);
});

test("all unavailable internal candidates fail closed", async () => {
  const router = new CostAwareModelRouter([
    {
      provider: "provider-a",
      model: "offline",
      priority: 0,
      estimatedCostMicrounits: 1,
      availability: async () => {
        throw new Error("secret provider detail");
      },
    },
  ]);

  await assert.rejects(() => router.route(task, role), /^Error: model_route_unavailable$/);
});

test("OmniRoute requires every adoption condition", () => {
  assert.equal(assessOmniRouteEvidence(approvedEvidence).enabled, true);
  assert.equal(
    assessOmniRouteEvidence({ ...approvedEvidence, snapshot: "latest" }).reason,
    "snapshot_not_pinned",
  );
  assert.equal(
    assessOmniRouteEvidence({ ...approvedEvidence, passed: 26 }).reason,
    "matrix_not_green",
  );
  assert.equal(
    assessOmniRouteEvidence({ ...approvedEvidence, canonicalFallbackPassed: false }).reason,
    "canonical_fallback_failed",
  );
  assert.equal(
    assessOmniRouteEvidence({ ...approvedEvidence, deploymentOverheadMeasured: false }).reason,
    "deployment_overhead_missing",
  );
});

test("approved OmniRoute is used, but malformed or failed routes fall back internally", async () => {
  const candidate = {
    provider: "internal-provider",
    model: "safe-fallback",
    priority: 0,
    estimatedCostMicrounits: 20,
  };
  const approved = new CostAwareModelRouter([candidate], {
    omniRouteEvidence: approvedEvidence,
    omniRoute: {
      async route() {
        return {
          provider: "external-provider",
          model: "routed-model",
          source: "omniroute",
          rationale: "approved external policy",
        };
      },
    },
  });
  assert.equal((await approved.route(task, role)).source, "omniroute");

  const malformed = new CostAwareModelRouter([candidate], {
    omniRouteEvidence: approvedEvidence,
    omniRoute: {
      async route() {
        return { provider: "", model: "", source: "internal", rationale: "" };
      },
    },
  });
  assert.equal((await malformed.route(task, role)).source, "internal");

  const failed = new CostAwareModelRouter([candidate], {
    omniRouteEvidence: approvedEvidence,
    omniRoute: {
      async route() {
        throw new Error("provider credential must not leak");
      },
    },
  });
  assert.equal((await failed.route(task, role)).rationale, "lowest_cost_available;fallbacks=0");
});

test("invalid or duplicate candidates are rejected at construction", () => {
  assert.throws(() => new CostAwareModelRouter([]), /model_candidates_required/);
  assert.throws(
    () =>
      new CostAwareModelRouter([
        { provider: "a", model: "m", priority: 0, estimatedCostMicrounits: 1 },
        { provider: "a", model: "m", priority: 1, estimatedCostMicrounits: 2 },
      ]),
    /model_candidate_duplicate/,
  );
  assert.throws(
    () =>
      new CostAwareModelRouter([
        { provider: "a", model: "m", priority: 0, estimatedCostMicrounits: -1 },
      ]),
    /model_candidate_cost_invalid/,
  );
});
