import assert from "node:assert/strict";
import test from "node:test";

import {
  createFixtureProductSquadAgents,
  CrossFunctionalProductSquad,
} from "../services/control-plane/product-squad.ts";

const task = (overrides = {}) => ({
  issueKey: "Verah-os/Verah-Command-Center#147",
  idempotencyKey: "phase5-fixture",
  title: "Plan an isolated customer journey improvement",
  roleId: "product",
  kind: "isolated_ui",
  branchName: "codex/147-phase5-product-squads",
  effects: ["local_files", "sandbox"],
  contextRefs: ["github:issue:147", "docs:product-constraint"],
  ...overrides,
});

test("Research informs independent Design and Product contributions", async () => {
  const agents = createFixtureProductSquadAgents();
  const calls = [];
  const observed = agents.map((agent) => ({
    ...agent,
    async contribute(context) {
      calls.push(agent.roleId);
      if (agent.roleId !== "research") {
        assert.deepEqual(context.priorContributions.map((item) => item.roleId), ["research"]);
      }
      return agent.contribute(context);
    },
  }));
  const result = await new CrossFunctionalProductSquad(observed).plan(task());
  assert.equal(result.status, "ready");
  assert.equal(calls[0], "research");
  assert.deepEqual(new Set(calls.slice(1)), new Set(["design", "product"]));
  assert.deepEqual(result.contributions.map((item) => item.roleId), ["research", "design", "product"]);
  assert.equal(result.contextRefs.length, 3);
  assert.equal(result.contributions.every((item) => item.externalEffects.length === 0), true);
  assert.deepEqual(result.contributions[1].artifacts[0].evidenceRefs, task().contextRefs);
});

test("missing canonical evidence stops after Research and fails closed", async () => {
  const calls = [];
  const agents = createFixtureProductSquadAgents().map((agent) => ({
    ...agent,
    async contribute(context) { calls.push(agent.roleId); return agent.contribute(context); },
  }));
  const result = await new CrossFunctionalProductSquad(agents)
    .plan(task({ contextRefs: [] }));
  assert.equal(result.status, "blocked");
  assert.equal(result.blocker, "squad_research_blocked");
  assert.deepEqual(calls, ["research"]);
});

test("agents cannot invent evidence outside the canonical task context", async () => {
  const researchAgents = createFixtureProductSquadAgents();
  researchAgents[0] = {
    ...researchAgents[0],
    async contribute(context) {
      return {
        roleId: "research",
        agentId: "custom-research",
        targetIssueKey: context.issueKey,
        status: "ready",
        artifacts: [{
          kind: "research_brief",
          summary: "Invented evidence",
          evidenceRefs: ["invented:source"],
        }],
        decisions: {},
        risks: [],
        externalEffects: [],
      };
    },
  };
  assert.equal(
    (await new CrossFunctionalProductSquad(researchAgents).plan(task())).blocker,
    "squad_research_blocked",
  );

  const designAgents = createFixtureProductSquadAgents();
  const design = designAgents[1];
  designAgents[1] = {
    ...design,
    async contribute(context) {
      const contribution = await design.contribute(context);
      return {
        ...contribution,
        artifacts: [{ ...contribution.artifacts[0], evidenceRefs: ["invented:design-source"] }],
      };
    },
  };
  assert.equal(
    (await new CrossFunctionalProductSquad(designAgents).plan(task())).blocker,
    "squad_design_blocked",
  );
});

test("unknown artifact kinds remain invalid and fail closed", async () => {
  const agents = createFixtureProductSquadAgents();
  const product = agents[2];
  agents[2] = {
    ...product,
    async contribute(context) {
      const contribution = await product.contribute(context);
      return {
        ...contribution,
        artifacts: [{ ...contribution.artifacts[0], kind: "totally_invalid" }],
      };
    },
  };
  const result = await new CrossFunctionalProductSquad(agents).plan(task());
  assert.equal(result.status, "blocked");
  assert.equal(result.blocker, "squad_product_blocked");
});

test("missing, pending, throwing or side-effecting agents block the squad", async () => {
  const base = createFixtureProductSquadAgents();
  const missing = await new CrossFunctionalProductSquad(base.filter((item) => item.roleId !== "design"))
    .plan(task());
  assert.equal(missing.blocker, "squad_design_blocked");

  const pendingAgents = createFixtureProductSquadAgents();
  pendingAgents[2] = {
    ...pendingAgents[2],
    async contribute(context) {
      return { ...(await base[2].contribute(context)), status: "pending" };
    },
  };
  assert.equal((await new CrossFunctionalProductSquad(pendingAgents).plan(task())).blocker, "squad_product_blocked");

  const throwingAgents = createFixtureProductSquadAgents();
  throwingAgents[1] = { ...throwingAgents[1], async contribute() { throw new Error("offline"); } };
  assert.equal((await new CrossFunctionalProductSquad(throwingAgents).plan(task())).blocker, "squad_design_blocked");

  const unsafeAgents = createFixtureProductSquadAgents();
  unsafeAgents[1] = {
    ...unsafeAgents[1],
    async contribute(context) {
      return { ...(await base[1].contribute(context)), externalEffects: ["production_deploy"] };
    },
  };
  assert.equal((await new CrossFunctionalProductSquad(unsafeAgents).plan(task())).blocker, "squad_design_blocked");
});

test("conflicting cross-functional decisions are escalated, never silently resolved", async () => {
  const agents = createFixtureProductSquadAgents();
  for (const index of [1, 2]) {
    const original = agents[index];
    agents[index] = {
      ...original,
      async contribute(context) {
        return {
          ...(await original.contribute(context)),
          decisions: { launch_scope: index === 1 ? "pilot" : "public" },
        };
      },
    };
  }
  const result = await new CrossFunctionalProductSquad(agents).plan(task());
  assert.equal(result.status, "blocked");
  assert.equal(result.blocker, "squad_conflict_unresolved");
});

test("squad context is immutable and sensitive text is sanitized", async () => {
  const agents = createFixtureProductSquadAgents();
  const original = agents[0];
  agents[0] = {
    ...original,
    async contribute(context) {
      assert.equal(Object.isFrozen(context), true);
      assert.equal(Object.isFrozen(context.evidenceRefs), true);
      return original.contribute(context);
    },
  };
  const result = await new CrossFunctionalProductSquad(agents).plan(task({
    title: "Plan with token ghp_abcdefghijklmnopqrstuvwxyz123456",
  }));
  assert.equal(result.status, "ready");
  assert.equal(result.contributions.some((item) => item.artifacts.some((artifact) =>
    artifact.summary.includes("ghp_"))), false);
});
