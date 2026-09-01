import assert from "node:assert/strict";
import test from "node:test";

import { PolicyExecutorRouter } from "../services/control-plane/executor-router.ts";
import {
  AgentRoleRegistry,
  GuardedControlPlane,
  InMemoryAgentLeaseStore,
} from "../services/control-plane/foundation.ts";
import { OpenHandsExecutor } from "../services/control-plane/openhands-executor.ts";
import {
  createOpenHandsCloudExecutor,
  OpenHandsCloudTransport,
  readOpenHandsCloudConfig,
} from "../services/control-plane/openhands-cloud-transport.ts";

const TEST_KEY = "test-openhands-cloud-key-000000000000";

const ENABLED_ENV = {
  OPENHANDS_CLOUD_TRANSPORT_ENABLED: "true",
  OPENHANDS_CLOUD_API_KEY: TEST_KEY,
};

function config(overrides = {}) {
  const parsed = readOpenHandsCloudConfig({ ...ENABLED_ENV, ...overrides });
  assert.equal(parsed.enabled, true);
  return parsed;
}

function response(status, body = {}) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function fakeCloud(handlers) {
  const calls = [];
  const fetchFn = async (url, init) => {
    calls.push({ url, init });
    for (const handler of handlers) {
      if (
        url.includes(handler.match)
        && init.method === (handler.method ?? "GET")
      ) {
        if (handler.error) throw handler.error;
        return response(handler.status, handler.body ?? {});
      }
    }
    return response(500, { unmatched: url });
  };
  return { calls, fetchFn };
}

const instant = { sleep: async () => undefined };

const happyPath = [
  { match: "/api/v1/users/me", status: 200, body: { id: "user-1" } },
  {
    match: "/api/v1/app-conversations/search",
    status: 200,
    body: { items: [] },
  },
  {
    match: "/api/v1/app-conversations",
    method: "POST",
    status: 201,
    body: { id: "start-task-1" },
  },
  {
    match: "/api/v1/app-conversations/start-tasks",
    status: 200,
    body: {
      items: [
        { id: "start-task-1", status: "READY", app_conversation_id: "conv-1" },
      ],
    },
  },
  {
    match: "/api/v1/app-conversations?ids=conv-1",
    status: 200,
    body: {
      items: [
        {
          id: "conv-1",
          sandbox_id: "sandbox-1",
          execution_status: "finished",
          metrics: { accumulated_cost: 0.0025 },
        },
      ],
    },
  },
  {
    match: "/api/v1/conversation/conv-1/events/search",
    status: 200,
    body: {
      items: [
        { kind: "MessageEvent", source: "user", message: { content: "task" } },
        {
          kind: "MessageEvent",
          source: "assistant",
          message: {
            content: [{
              type: "text",
              text: "Handoff: done. Draft PR: https://github.com/Verah-os/Verah-Command-Center/pull/777",
            }],
          },
        },
      ],
    },
  },
];

function task(overrides = {}) {
  return {
    issueKey: "Verah-os/Verah-Command-Center#147",
    idempotencyKey: "issue-147-cloud-1",
    title: "Cloud executor activation",
    roleId: "coding",
    kind: "isolated_code",
    branchName: "agent/openhands/issue-147",
    effects: ["local_files", "repository_branch", "sandbox"],
    ...overrides,
  };
}

function request(overrides = {}) {
  return {
    task: task(),
    role: {
      id: "coding",
      name: "Software Engineer",
      capabilities: ["backend"],
      reviewStatus: "internal-approved",
    },
    modelRoute: {
      provider: "fixture",
      model: "fixture-model",
      source: "internal",
      rationale: "ci",
    },
    context: ["AGENTS.md", "github:#147"],
    dryRun: true,
    ...overrides,
  };
}

test("config fails closed unless explicitly and safely enabled", () => {
  assert.deepEqual(readOpenHandsCloudConfig({}), {
    enabled: false,
    reason: "flag_disabled",
  });
  assert.equal(
    readOpenHandsCloudConfig({
      ...ENABLED_ENV,
      NODE_ENV: "production",
    }).reason,
    "production_environment",
  );
  assert.equal(
    readOpenHandsCloudConfig({
      OPENHANDS_CLOUD_TRANSPORT_ENABLED: "true",
    }).reason,
    "api_key_missing",
  );
  assert.equal(
    readOpenHandsCloudConfig({
      ...ENABLED_ENV,
      OPENHANDS_CLOUD_BASE_URL: "http://insecure.example.com",
    }).reason,
    "base_url_invalid",
  );
  const parsed = readOpenHandsCloudConfig(ENABLED_ENV);
  assert.equal(parsed.enabled, true);
  assert.equal(parsed.baseUrl, "https://app.all-hands.dev");
  assert.equal(
    readOpenHandsCloudConfig({
      OPENHANDS_CLOUD_TRANSPORT_ENABLED: "true",
      OPENHANDS_API_KEY: TEST_KEY,
    }).enabled,
    true,
  );
});

test("readiness maps cloud states and verifies capacity before ready", async () => {
  const unauthorized = fakeCloud([
    { match: "/api/v1/users/me", status: 401 },
  ]);
  const offline = new OpenHandsCloudTransport(config(), {
    fetchFn: unauthorized.fetchFn,
  });
  assert.equal(await offline.readiness(new AbortController().signal), "offline");

  const limited = fakeCloud([
    { match: "/api/v1/users/me", status: 429 },
  ]);
  assert.equal(
    await new OpenHandsCloudTransport(config(), { fetchFn: limited.fetchFn })
      .readiness(new AbortController().signal),
    "rate_limited",
  );

  const down = fakeCloud([
    { match: "/api/v1/users/me", error: new Error("connection refused") },
  ]);
  assert.equal(
    await new OpenHandsCloudTransport(config(), { fetchFn: down.fetchFn })
      .readiness(new AbortController().signal),
    "offline",
  );

  const busy = fakeCloud([
    { match: "/api/v1/users/me", status: 200, body: {} },
    {
      match: "/api/v1/app-conversations/search",
      status: 200,
      body: {
        items: Array.from({ length: 4 }, (_, index) => ({
          id: `conv-${index}`,
          execution_status: "running",
        })),
      },
    },
  ]);
  assert.equal(
    await new OpenHandsCloudTransport(config(), { fetchFn: busy.fetchFn })
      .readiness(new AbortController().signal),
    "busy",
  );

  const ready = fakeCloud([
    { match: "/api/v1/users/me", status: 200, body: {} },
    { match: "/api/v1/app-conversations/search", status: 200, body: { items: [] } },
  ]);
  assert.equal(
    await new OpenHandsCloudTransport(config(), { fetchFn: ready.fetchFn })
      .readiness(new AbortController().signal),
    "ready",
  );

  const disabled = fakeCloud([]);
  assert.equal(
    await new OpenHandsCloudTransport(
      readOpenHandsCloudConfig({}),
      { fetchFn: disabled.fetchFn },
    ).readiness(new AbortController().signal),
    "offline",
  );
  assert.equal(disabled.calls.length, 0);
});

test("execute drives the full cloud lifecycle with cost, duration and draft PR", async () => {
  const cloud = fakeCloud(happyPath);
  const audit = [];
  const executor = new OpenHandsExecutor(
    new OpenHandsCloudTransport(config(), {
      fetchFn: cloud.fetchFn,
      logger: (event) => audit.push(event),
      ...instant,
    }),
  );
  const result = await executor.execute(request());
  assert.equal(result.status, "completed");
  assert.equal(result.costMicrounits, 2_500);
  assert.equal(typeof result.durationMs, "number");
  assert.match(result.handoff, /Handoff: done/);
  assert.equal(
    result.artifacts?.draftPrUrl,
    "https://github.com/Verah-os/Verah-Command-Center/pull/777",
  );
  assert.deepEqual(result.externalEffects, []);

  const start = cloud.calls.find((call) =>
    call.init.method === "POST" && call.url.includes("/api/v1/app-conversations"));
  assert.ok(start);
  assert.equal(start.init.headers.authorization, `Bearer ${TEST_KEY}`);
  const payload = JSON.parse(start.init.body);
  assert.equal(payload.selected_repository, "Verah-os/Verah-Command-Center");
  assert.equal(payload.selected_branch, "agent/openhands/issue-147");
  const prompt = payload.initial_message.content[0].text;
  assert.match(prompt, /Draft PR/);
  assert.match(prompt, /Never merge/);
  assert.match(prompt, /HUMAN gate/);
  assert.equal(prompt.includes(TEST_KEY), false);

  const serialized = JSON.stringify({ result, audit });
  assert.equal(serialized.includes(TEST_KEY), false);
});

test("execution fails closed without an isolated branch and without HTTP", async () => {
  const cloud = fakeCloud(happyPath);
  const executor = new OpenHandsExecutor(
    new OpenHandsCloudTransport(config(), { fetchFn: cloud.fetchFn, ...instant }),
  );
  const result = await executor.execute(
    request({ task: { ...task(), branchName: undefined } }),
  );
  assert.equal(result.status, "failed");
  assert.equal(result.errorCode, "openhands_cloud_branch_required");
  assert.equal(cloud.calls.length, 0);
});

test("rejected start and failed conversation map to recoverable errors", async () => {
  const rejected = fakeCloud([
    { match: "/api/v1/app-conversations", method: "POST", status: 403 },
  ]);
  const denied = await new OpenHandsExecutor(
    new OpenHandsCloudTransport(config(), { fetchFn: rejected.fetchFn, ...instant }),
  ).execute(request());
  assert.equal(denied.status, "failed");
  assert.equal(denied.errorCode, "openhands_cloud_auth_rejected");

  const errored = fakeCloud([
    {
      match: "/api/v1/app-conversations",
      method: "POST",
      status: 201,
      body: { id: "start-task-1", app_conversation_id: "conv-1" },
    },
    {
      match: "/api/v1/app-conversations?ids=conv-1",
      status: 200,
      body: { items: [{ id: "conv-1", execution_status: "error" }] },
    },
  ]);
  const failed = await new OpenHandsExecutor(
    new OpenHandsCloudTransport(config(), { fetchFn: errored.fetchFn, ...instant }),
  ).execute(request());
  assert.equal(failed.status, "failed");
  assert.equal(failed.errorCode, "openhands_cloud_conversation_failed");
});

test("cancellation pauses the sandbox and returns a recoverable result", async () => {
  const started = Promise.withResolvers();
  const cloud = fakeCloud([
    {
      match: "/api/v1/app-conversations",
      method: "POST",
      status: 201,
      body: { id: "start-task-1", app_conversation_id: "conv-1" },
    },
    {
      match: "/api/v1/app-conversations?ids=conv-1",
      status: 200,
      body: {
        items: [{
          id: "conv-1",
          sandbox_id: "sandbox-1",
          execution_status: "running",
        }],
      },
    },
    { match: "/api/v1/sandboxes/sandbox-1/pause", method: "POST", status: 200 },
  ]);
  const executor = new OpenHandsExecutor(
    new OpenHandsCloudTransport(config(), {
      fetchFn: cloud.fetchFn,
      sleep: async (_ms, signal) => {
        started.resolve();
        await new Promise((resolve, reject) => {
          signal.addEventListener(
            "abort",
            () => reject(new Error("openhands_aborted")),
            { once: true },
          );
        });
      },
    }),
    { executionTimeoutMs: 5_000 },
  );
  const running = executor.execute(request());
  await started.promise;
  await executor.cancel("issue-147-cloud-1");
  const result = await running;
  assert.equal(result.status, "failed");
  assert.equal(result.errorCode, "openhands_cancelled");
  assert.ok(cloud.calls.some((call) =>
    call.init.method === "POST"
    && call.url.includes("/api/v1/sandboxes/sandbox-1/pause")));
});

test("factory returns no executor when configuration is absent", () => {
  assert.equal(createOpenHandsCloudExecutor({}), null);
  assert.equal(
    createOpenHandsCloudExecutor({ ...ENABLED_ENV, NODE_ENV: "production" }),
    null,
  );
  const executor = createOpenHandsCloudExecutor(ENABLED_ENV, {
    fetchFn: async () => response(500),
  });
  assert.ok(executor instanceof OpenHandsExecutor);
});

test("fallback: router selects OpenHands Cloud when the primary executor is down", async () => {
  const cloud = fakeCloud(happyPath);
  const codex = {
    id: "codex",
    executions: 0,
    async availability() {
      return "unavailable";
    },
    async execute() {
      this.executions += 1;
      return { status: "failed", errorCode: "should_not_run", externalEffects: [] };
    },
  };
  const openhands = new OpenHandsExecutor(
    new OpenHandsCloudTransport(config(), { fetchFn: cloud.fetchFn, ...instant }),
  );
  const router = new PolicyExecutorRouter([
    { executor: codex, priority: 1, estimatedCostMicrounits: 10 },
    { executor: openhands, priority: 2, estimatedCostMicrounits: 20 },
  ]);
  const leases = new InMemoryAgentLeaseStore();
  const plane = new GuardedControlPlane(
    new AgentRoleRegistry(),
    leases,
    { async route() { return request().modelRoute; } },
    { async loadContext() { return ["AGENTS.md", "github:#147"]; } },
    router,
    { enabled: true, killSwitch: false, dryRun: true },
  );
  const run = await plane.run(task());
  assert.equal(run.status, "completed");
  assert.equal(run.executorId, "openhands");
  assert.equal(run.modelRoute.model, "fixture-model");
  assert.equal(run.costMicrounits, 2_500);
  assert.equal(typeof run.executorDurationMs, "number");
  assert.equal(
    run.artifacts?.draftPrUrl,
    "https://github.com/Verah-os/Verah-Command-Center/pull/777",
  );
  assert.deepEqual(run.externalEffects, []);
  assert.equal(codex.executions, 0);
  assert.equal(leases.audit.at(-1).type, "lease_released");
});

test("fail-closed transport keeps the queue blocked without manual intervention", async () => {
  const cloud = fakeCloud([]);
  const disabledOpenhands = new OpenHandsExecutor(
    new OpenHandsCloudTransport(readOpenHandsCloudConfig({}), {
      fetchFn: cloud.fetchFn,
    }),
  );
  const router = new PolicyExecutorRouter([
    { executor: disabledOpenhands, priority: 1, estimatedCostMicrounits: 20 },
  ]);
  const leases = new InMemoryAgentLeaseStore();
  const plane = new GuardedControlPlane(
    new AgentRoleRegistry(),
    leases,
    { async route() { return request().modelRoute; } },
    { async loadContext() { return []; } },
    router,
    { enabled: true, killSwitch: false, dryRun: true },
  );
  const run = await plane.run(task());
  assert.equal(run.status, "blocked");
  assert.equal(run.blocker, "executor_unavailable");
  assert.equal(cloud.calls.length, 0);
  assert.equal(leases.audit.at(-1).type, "lease_released");
});
