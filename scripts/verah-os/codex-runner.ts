import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { delimiter, dirname, extname, isAbsolute, join, resolve } from "node:path";

import type { CodexInvocationResult, DispatcherConfig } from "./dispatcher-types.ts";
import { classifyCodexFailure } from "./dispatcher-policy.ts";

export const DISPATCHER_PROMPT = [
  "Use $verah-os-unattended to continue the currently selected VERAH OS checkpoint.",
  "The dispatcher parent already reserved new work and owns authenticated GitHub CLI operations; do not reserve a second issue.",
  "If GitHub CLI credentials are unavailable inside the sandbox, read the checkpoint directly and use the connected GitHub tools for repository reads and authenticated publication.",
  "Work only within the written GitHub issue scope and reconcile existing branch, PR, CI and labels before mutation.",
  "Never access production, mutate a remote database, run db push or migration repair, re-enable production deploys, send real messages, make payments, change rulesets or bypass gates.",
  "Use at most two correction attempts. Preserve the human merge gate unless codex:auto-merge is explicitly present and every release gate passes.",
].join(" ");

function childEnvironment() {
  const environment = { ...process.env };
  for (const key of Object.keys(environment)) {
    if (/SUPABASE|SERVICE_ROLE|DATABASE_URL|VERCEL|N8N|WHATSAPP|META_/i.test(key)) {
      delete environment[key];
    }
  }
  return environment;
}

function reportedTokens(line: string) {
  try {
    const parsed = JSON.parse(line) as Record<string, unknown>;
    const usage = (parsed.usage ?? (parsed.turn as Record<string, unknown> | undefined)?.usage) as
      | Record<string, unknown>
      | undefined;
    if (!usage) return 0;
    const input = Number(usage.input_tokens) || 0;
    const cached = Number(usage.cached_input_tokens) || 0;
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
  const arguments_ = [
    ...config.codexArguments,
    "--cd",
    config.workspaceDirectory,
    DISPATCHER_PROMPT,
  ];
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
    const timer = setTimeout(() => child.kill(), config.maxInvocationDurationMs);
    child.stdout.on("data", (chunk: Buffer) => {
      lineBuffer += chunk.toString("utf8");
      const lines = lineBuffer.split(/\r?\n/);
      lineBuffer = lines.pop() ?? "";
      for (const line of lines) tokens = Math.max(tokens, reportedTokens(line));
    });
    child.stderr.on("data", (chunk: Buffer) => {
      diagnostic = `${diagnostic}${chunk.toString("utf8")}`.slice(-16_384);
    });
    let settled = false;
    const finish = (result: CodexInvocationResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    child.on("error", (error) => {
      const message = error.name === "AbortError" ? "stopped" : classifyCodexFailure(error.message);
      finish({ status: message, exitCode: null, reportedTokens: tokens });
    });
    child.on("close", (code, closeSignal) => {
      if (signal?.aborted) {
        finish({ status: "stopped", exitCode: code, reportedTokens: tokens });
      } else if (closeSignal || code === null) {
        finish({ status: "timeout", exitCode: code, reportedTokens: tokens });
      } else if (code === 0) {
        finish({ status: "success", exitCode: code, reportedTokens: tokens });
      } else {
        finish({ status: classifyCodexFailure(diagnostic), exitCode: code, reportedTokens: tokens });
      }
    });
  });
}
