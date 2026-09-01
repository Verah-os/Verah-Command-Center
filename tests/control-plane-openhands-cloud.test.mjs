import assert from "node:assert/strict";
import test from "node:test";

import {
  createControlPlaneExecutorRouter,
} from "../services/control-plane/composition.ts";
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
const TEST_GH_TOKEN = "test-github-token-000000000000";

const ENABLED_ENV = {
  OPENHANDS_CLOUD_TRANSPORT_ENABLED: "true",
  OPENHANDS_CLOUD_API_KEY: TEST_KEY,
  GITHUB_TOKEN: TEST_GH_TOKEN,
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
        const body = handler.bodyFn ? handler.bodyFn() : handler.body ?? {};
        return response(handler.status, body);
      }
    }
    return response(500, { unmatched: url });
  };
  return { calls, fetchFn };
}

const instant = { sleep: async () => undefined };

function hangUntilAbort(signal) {
  return new Promise((_resolve, reject) => {
    signal.addEventListener(
      "abort",
      () => reject(new Error("openhands_aborted")),
      { once: true },
    );
  });
}

function draftPr(number = 777, overrides = {}) {
  return {
    draft: true,
    html_url: `https://github.com/Verah-os/Verah-Command-Center/pull/${number}`,
    head: {
      ref: "agent/openhands/issue-147",
      repo: { full_name: "Verah-os/Verah-Command-Center" },
      ...overrides.head,
    },
    ...overrides,
  };
}

const verifiedPr = {
  match: "/repos/Verah-os/Verah-Command-Center/pulls",
  status: 200,
  body: [draftPr()],
};

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
  verifiedPr,
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

function transport(env, handlers, options = {}) {
  const cloud = fakeCloud(handlers);
  const executor = new OpenHandsExecutor(
    new OpenHandsCloudTransport(config(env), {
      fetchFn: cloud.fetchFn,
      ...instant,
      ...options,
    }),
  );
  return { cloud, executor };
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
  assert.equal(
    readOpenHandsCloudConfig({
      OPENHANDS_CLOUD_TRANSPORT_ENABLED: "true",
      OPENHANDS_CLOUD_API_KEY: TEST_KEY,
    }).reason,
    "github_token_missing",
  );
  const parsed = readOpenHandsCloudConfig(ENABLED_ENV);
  assert.equal(parsed.enabled, true);
  assert.equal(parsed.baseUrl, "https://app.all-hands.dev");
  assert.equal(
    readOpenHandsCloudConfig({
      OPENHANDS_CLOUD_TRANSPORT_ENABLED: "true",
      OPENHANDS_CLOUD_API_KEY: TEST_KEY,
      GH_TOKEN: TEST_GH_TOKEN,
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

test("execute drives the full cloud lifecycle with verified draft PR", async () => {
  const audit = [];
  const { cloud, executor } = transport({}, happyPath, {
    logger: (event) => audit.push(event),
  });
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

  const verification = cloud.calls.find((call) =>
    call.url.includes("/repos/Verah-os/Verah-Command-Center/pulls"));
  assert.ok(verification);
  assert.equal(verification.init.headers.authorization, `Bearer ${TEST_GH_TOKEN}`);

  const serialized = JSON.stringify({ result, audit });
  assert.equal(serialized.includes(TEST_KEY), false);
  assert.equal(serialized.includes(TEST_GH_TOKEN), false);
});

test("execution fails closed without an isolated branch and without HTTP", async () => {
  const { cloud, executor } = transport({}, happyPath);
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

test("completion requires exactly one verified draft PR on the lease branch", async () => {
  const finishing = (verification) => {
    const handlers = happyPath.filter((handler) => handler !== verifiedPr);
    if (verification) handlers.push(verification);
    return transport({}, handlers);
  };
  const cases = [
    { expected: "openhands_cloud_draft_pr_unverified", verification: null },
    { expected: "openhands_cloud_draft_pr_missing", verification: { match: "/pulls", status: 200, body: [] } },
    { expected: "openhands_cloud_draft_pr_missing", verification: { match: "/pulls", status: 200, body: [{ ...draftPr(), draft: false }] } },
    { expected: "openhands_cloud_draft_pr_ambiguous", verification: { match: "/pulls", status: 200, body: [draftPr(777), draftPr(778)] } },
    {
      expected: "openhands_cloud_draft_pr_missing",
      verification: {
        match: "/pulls",
        status: 200,
        body: [{
          head: { ref: "agent/openhands/other", repo: { full_name: "Verah-os/Verah-Command-Center" } },
          draft: true,
        }],
      },
    },
    {
      expected: "openhands_cloud_draft_pr_missing",
      verification: {
        match: "/pulls",
        status: 200,
        body: [draftPr(777, { head: { ref: "agent/openhands/issue-147", repo: { full_name: "fork/Verah-Command-Center" } } })],
      },
    },
  ];
  for (const { expected, verification } of cases) {
    const { executor } = finishing(verification);
    const result = await executor.execute(request());
    assert.equal(result.status, "failed");
    assert.equal(result.errorCode, expected);
    assert.equal(result.artifacts?.draftPrUrl, undefined);
  }

  const { executor } = finishing({
    match: "/pulls",
    status: 200,
    body: [draftPr(777), { ...draftPr(778), draft: false }],
  });
  const ok = await executor.execute(request());
  assert.equal(ok.status, "completed");
  assert.equal(
    ok.artifacts?.draftPrUrl,
    "https://github.com/Verah-os/Verah-Command-Center/pull/777",
  );
});

test("assistant-mentioned PR URLs are never trusted for the artifact", async () => {
  const misleading = [
    ...happyPath.filter((handler) => handler !== verifiedPr),
    {
      match: "/conversation/conv-1/events/search",
      status: 200,
      body: {
        items: [{
          kind: "MessageEvent",
          source: "assistant",
          message: {
            content: "Handoff mentions https://github.com/other/repo/pull/1",
          },
        }],
      },
    },
    verifiedPr,
  ];
  const { executor } = transport({}, misleading);
  const result = await executor.execute(request());
  assert.equal(result.status, "completed");
  assert.equal(
    result.artifacts?.draftPrUrl,
    "https://github.com/Verah-os/Verah-Command-Center/pull/777",
  );
});

test("cancellation pauses the sandbox when its id is known", async () => {
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
        await hangUntilAbort(signal);
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

test("cancellation terminates the conversation even before a sandbox id exists", async () => {
  const started = Promise.withResolvers();
  const cloud = fakeCloud([
    {
      match: "/api/v1/app-conversations",
      method: "POST",
      status: 201,
      body: { app_conversation_id: "conv-1" },
    },
    {
      match: "/api/v1/app-conversations?ids=conv-1",
      status: 200,
      body: { items: [{ id: "conv-1", execution_status: "running" }] },
    },
    { match: "/api/v1/app-conversations/conv-1", method: "DELETE", status: 200 },
  ]);
  const executor = new OpenHandsExecutor(
    new OpenHandsCloudTransport(config(), {
      fetchFn: cloud.fetchFn,
      sleep: async (_ms, signal) => {
        started.resolve();
        await hangUntilAbort(signal);
      },
    }),
    { executionTimeoutMs: 5_000 },
  );
  const running = executor.execute(request());
  await started.promise;
  await executor.cancel("issue-147-cloud-1");
  const result = await running;
  assert.equal(result.errorCode, "openhands_cancelled");
  assert.ok(cloud.calls.some((call) =>
    call.init.method === "DELETE"
    && call.url.includes("/api/v1/app-conversations/conv-1")));
});

test("cancellation recovers the conversation id from a pending start-task", async () => {
  const started = Promise.withResolvers();
  let polls = 0;
  const cloud = fakeCloud([
    {
      match: "/api/v1/app-conversations",
      method: "POST",
      status: 201,
      body: { id: "start-task-1" },
    },
    {
      match: "/api/v1/app-conversations/start-tasks",
      status: 200,
      bodyFn: () => {
        polls += 1;
        return polls < 2
          ? { items: [{ id: "start-task-1", status: "WORKING" }] }
          : {
            items: [{
              id: "start-task-1",
              status: "READY",
              app_conversation_id: "conv-1",
            }],
          };
      },
    },
    { match: "/api/v1/app-conversations/conv-1", method: "DELETE", status: 200 },
  ]);
  const executor = new OpenHandsExecutor(
    new OpenHandsCloudTransport(config(), {
      fetchFn: cloud.fetchFn,
      sleep: async (_ms, signal) => {
        started.resolve();
        await hangUntilAbort(signal);
      },
    }),
    { executionTimeoutMs: 5_000 },
  );
  const running = executor.execute(request());
  await started.promise;
  await executor.cancel("issue-147-cloud-1");
  const result = await running;
  assert.equal(result.errorCode, "openhands_cancelled");
  assert.ok(polls >= 2);
  assert.ok(cloud.calls.some((call) =>
    call.init.method === "DELETE"
    && call.url.includes("/api/v1/app-conversations/conv-1")));
});

test("cancellation reports honestly when remote termination cannot be confirmed", async () => {
  const started = Promise.withResolvers();
  const audit = [];
  const cloud = fakeCloud([
    {
      match: "/api/v1/app-conversations",
      method: "POST",
      status: 201,
      body: { id: "start-task-1" },
    },
    {
      match: "/api/v1/app-conversations/start-tasks",
      status: 200,
      body: { items: [{ id: "start-task-1", status: "WORKING" }] },
    },
  ]);
  const executor = new OpenHandsExecutor(
    new OpenHandsCloudTransport(config(), {
      fetchFn: cloud.fetchFn,
      logger: (event) => audit.push(event),
      sleep: async (_ms, signal) => {
        started.resolve();
        await hangUntilAbort(signal);
      },
    }),
    { executionTimeoutMs: 5_000 },
  );
  const running = executor.execute(request());
  await started.promise;
  await executor.cancel("issue-147-cloud-1");
  const result = await running;
  assert.equal(result.errorCode, "openhands_cancelled");
  assert.equal(cloud.calls.some((call) => call.init.method === "DELETE"), false);
  assert.ok(audit.some((event) =>
    event.type === "openhands_cloud_cancel_unconfirmed"));
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

test("runtime composition activates the fallback from the environment", () => {
  assert.equal(createControlPlaneExecutorRouter({}), null);
  assert.equal(
    createControlPlaneExecutorRouter({ ...ENABLED_ENV, NODE_ENV: "production" }),
    null,
  );
  const router = createControlPlaneExecutorRouter(ENABLED_ENV, {
    openhands: { fetchFn: async () => response(500) },
  });
  assert.ok(router instanceof PolicyExecutorRouter);
});

test("fallback: environment-wired router selects OpenHands Cloud when the primary is down", async () => {
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
  const router = createControlPlaneExecutorRouter(ENABLED_ENV, {
    primaryCandidates: [
      { executor: codex, priority: 1, estimatedCostMicrounits: 10 },
    ],
    openhands: { fetchFn: cloud.fetchFn, ...instant },
  });
  assert.ok(router);
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

test("composition never invokes the fallback while any primary is available", async () => {
  const cloud = fakeCloud(happyPath);
  const codex = {
    id: "codex",
    async availability() {
      return "available";
    },
    async execute() {
      return {
        status: "completed",
        handoff: "primary result",
        externalEffects: [],
      };
    },
  };
  const router = createControlPlaneExecutorRouter(ENABLED_ENV, {
    primaryCandidates: [
      { executor: codex, priority: 1, estimatedCostMicrounits: 10 },
    ],
    openhands: { fetchFn: cloud.fetchFn, ...instant },
  });
  assert.ok(router);
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
  assert.equal(run.status, "completed");
  assert.equal(run.executorId, "codex");
  assert.equal(cloud.calls.length, 0);
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
