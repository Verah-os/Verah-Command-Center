import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { delimiter, dirname, extname, isAbsolute, join, resolve } from "node:path";

import type { CodexInvocationResult, DispatcherConfig } from "./dispatcher-types.ts";
import { classifyCodexFailure } from "./dispatcher-policy.ts";
import { readCheckpoint } from "./state.ts";
import type { RunCheckpoint } from "./types.ts";

export const DISPATCHER_PROMPT = [
  "Use $verah-os-unattended to continue the currently selected VERAH OS checkpoint.",
  "The dispatcher parent already reserved new work and owns authenticated GitHub CLI operations; do not reserve a second issue.",
  "If GitHub CLI credentials are unavailable inside the sandbox, read the checkpoint directly and use the connected GitHub tools for repository reads and authenticated publication.",
  "Work only within the written GitHub issue scope and reconcile existing branch, PR, CI and labels before mutation.",
  "Never access production, mutate a remote database, run db push or migration repair, re-enable production deploys, send real messages, make payments, change rulesets or bypass gates.",
  "Use at most two correction attempts. Preserve the human merge gate unless codex:auto-merge is explicitly present and every release gate passes.",
  "Before returning, persist concrete progress in the checkpoint and working tree; finish with a commit and Draft PR whenever the authorized scope is complete.",
].join(" ");

export const DISPATCHER_RESUME_PROMPT = [
  "Continue the same VERAH OS checkpoint from this existing Codex session.",
  "Do not rediscover completed work or reread broad repository context; inspect the current diff and latest validation evidence, then perform only the remaining authorized steps.",
  "Do not rerun already-passed full validations unless code changed after them or a new failure requires it.",
  "When the scope is complete, commit, push, open or update the Draft PR, persist the checkpoint, and stop.",
  "Keep all prior production, remote database, messaging, payment, credential, approval, and human merge restrictions.",
].join(" ");

type CodexSession = {
  version: 2;
  checkpointIdentity: string;
  threadId: string;
  updatedAt: string;
};

const codexSessionName = "codex-session.json";
const codexThreadIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function safeThreadId(value: unknown): value is string {
  return typeof value === "string" && codexThreadIdPattern.test(value);
}

function codexSessionPath(runtimeDirectory: string) {
  return join(runtimeDirectory, "dispatcher", codexSessionName);
}

function checkpointIdentity(checkpoint: RunCheckpoint) {
  const workIdentity = checkpoint.issueNumber !== null
    ? `issue:${checkpoint.issueNumber}`
    : `pull_request:${checkpoint.pullRequestNumber ?? "unknown"}`;
  return [checkpoint.repository, workIdentity, checkpoint.branch, checkpoint.startedAt].join("\n");
}

export function threadIdFromEvent(line: string) {
  try {
    const event = JSON.parse(line) as Record<string, unknown>;
    return event.type === "thread.started" && safeThreadId(event.thread_id)
      ? event.thread_id
      : null;
  } catch {
    return null;
  }
}

async function readCodexSession(runtimeDirectory: string, identity: string) {
  try {
    const session = JSON.parse(
      await readFile(codexSessionPath(runtimeDirectory), "utf8"),
    ) as CodexSession;
    return session.version === 2 && session.checkpointIdentity === identity && safeThreadId(session.threadId)
      ? session
      : null;
  } catch {
    return null;
  }
}

async function writeCodexSession(
  runtimeDirectory: string,
  identity: string,
  threadId: string,
) {
  const directory = join(runtimeDirectory, "dispatcher");
  await mkdir(directory, { recursive: true });
  const target = codexSessionPath(runtimeDirectory);
  const temporary = join(directory, `${codexSessionName}.${randomUUID()}.tmp`);
  const session: CodexSession = {
    version: 2,
    checkpointIdentity: identity,
    threadId,
    updatedAt: new Date().toISOString(),
  };
  await writeFile(temporary, `${JSON.stringify(session, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await rename(temporary, target);
}

export function buildCodexArguments(config: DispatcherConfig, threadId: string | null) {
  if (threadId) {
    return [...config.codexArguments, "resume", threadId, DISPATCHER_RESUME_PROMPT];
  }
  return [
    ...config.codexArguments,
    "--cd",
    config.workspaceDirectory,
    DISPATCHER_PROMPT,
  ];
}

function childEnvironment() {
  const environment = { ...process.env };
  for (const key of Object.keys(environment)) {
    if (/SUPABASE|SERVICE_ROLE|DATABASE_URL|VERCEL|N8N|WHATSAPP|META_/i.test(key)) {
      delete environment[key];
    }
  }
  return environment;
}

export function reportedTokens(line: string) {
  try {
    const parsed = JSON.parse(line) as Record<string, unknown>;
    const usage = (parsed.usage ?? (parsed.turn as Record<string, unknown> | undefined)?.usage) as
      | Record<string, unknown>
      | undefined;
    if (!usage) return 0;
    const input = Number(usage.input_tokens) || 0;
    const inputDetails = usage.input_tokens_details as Record<string, unknown> | undefined;
    const cached = Number(usage.cached_input_tokens ?? inputDetails?.cached_tokens) || 0;
    const output = Number(usage.output_tokens) || 0;
    return Math.max(0, input - cached) + output;
  } catch {
    return 0;
  }
}

async function available(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function resolveWindowsCommand(
  command: string,
  workspaceDirectory: string,
  environment: NodeJS.ProcessEnv,
) {
  const hasDirectory = dirname(command) !== ".";
  const roots = hasDirectory
    ? [isAbsolute(command) ? "" : workspaceDirectory]
    : String(environment.PATH ?? "").split(delimiter).map((item) => item.replace(/^"|"$/g, ""));
  const names = extname(command) ? [command] : [`${command}.cmd`, `${command}.exe`, command];
  for (const root of roots) {
    for (const name of names) {
      const candidate = root ? resolve(root, name) : name;
      if (await available(candidate)) return candidate;
    }
  }
  throw new Error("dispatcher_codex_command_unavailable");
}

export async function resolveCodexProcess(
  config: DispatcherConfig,
  arguments_: string[],
  environment: NodeJS.ProcessEnv,
  platform = process.platform,
) {
  if (platform !== "win32") return { command: config.codexCommand, arguments_ };
  const command = await resolveWindowsCommand(
    config.codexCommand,
    config.workspaceDirectory,
    environment,
  );
  if (extname(command).toLowerCase() !== ".cmd") return { command, arguments_ };
  const entrypoint = join(dirname(command), "node_modules", "@openai", "codex", "bin", "codex.js");
  if (!await available(entrypoint)) {
    throw new Error("dispatcher_codex_windows_entrypoint_unavailable");
  }
  return { command: process.execPath, arguments_: [entrypoint, ...arguments_] };
}

export async function invokeCodex(
  config: DispatcherConfig,
  signal?: AbortSignal,
  platform = process.platform,
): Promise<CodexInvocationResult> {
  const checkpoint = await readCheckpoint(config.runtimeDirectory).catch(() => null);
  const activeCheckpointIdentity = checkpoint ? checkpointIdentity(checkpoint) : null;
  const existingSession = activeCheckpointIdentity
    ? await readCodexSession(config.runtimeDirectory, activeCheckpointIdentity)
    : null;
  const arguments_ = buildCodexArguments(config, existingSession?.threadId ?? null);
  const environment = childEnvironment();
  let invocation;
  try {
    invocation = await resolveCodexProcess(config, arguments_, environment, platform);
  } catch {
    return { status: "failure", exitCode: null, reportedTokens: 0 };
  }
  return await new Promise((resolve) => {
    let child;
    try {
      child = spawn(invocation.command, invocation.arguments_, {
        cwd: config.workspaceDirectory,
        env: environment,
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
        signal,
      });
    } catch (error) {
      const status = error instanceof Error ? classifyCodexFailure(error.message) : "failure";
      resolve({ status, exitCode: null, reportedTokens: 0 });
      return;
    }
    let diagnostic = "";
    let tokens = 0;
    let lineBuffer = "";
    let capturedThreadId = existingSession?.threadId ?? null;
    let sessionPersistence = Promise.resolve();
    const timer = setTimeout(() => child.kill(), config.maxInvocationDurationMs);
    const consumeLine = (line: string) => {
      tokens = Math.max(tokens, reportedTokens(line));
      const threadId = threadIdFromEvent(line);
      if (!threadId || !activeCheckpointIdentity || threadId === capturedThreadId) return;
      capturedThreadId = threadId;
      sessionPersistence = sessionPersistence
        .then(() => writeCodexSession(config.runtimeDirectory, activeCheckpointIdentity, threadId))
        .catch(() => undefined);
    };
    child.stdout.on("data", (chunk: Buffer) => {
      lineBuffer += chunk.toString("utf8");
      const lines = lineBuffer.split(/\r?\n/);
      lineBuffer = lines.pop() ?? "";
      for (const line of lines) consumeLine(line);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      diagnostic = `${diagnostic}${chunk.toString("utf8")}`.slice(-16_384);
    });
    let settled = false;
    const finish = async (result: CodexInvocationResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (lineBuffer) consumeLine(lineBuffer);
      await sessionPersistence;
      resolve({ ...result, reportedTokens: tokens });
    };
    child.on("error", (error) => {
      const message = error.name === "AbortError" ? "stopped" : classifyCodexFailure(error.message);
      void finish({ status: message, exitCode: null, reportedTokens: tokens });
    });
    child.on("close", (code, closeSignal) => {
      if (signal?.aborted) {
        void finish({ status: "stopped", exitCode: code, reportedTokens: tokens });
      } else if (closeSignal || code === null) {
        void finish({ status: "timeout", exitCode: code, reportedTokens: tokens });
      } else if (code === 0) {
        void finish({ status: "success", exitCode: code, reportedTokens: tokens });
      } else {
        void finish({ status: classifyCodexFailure(diagnostic), exitCode: code, reportedTokens: tokens });
      }
    });
  });
}
