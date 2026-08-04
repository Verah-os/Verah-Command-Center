import { spawn } from "node:child_process";

import type { CodexInvocationResult, DispatcherConfig } from "./dispatcher-types.ts";
import { classifyCodexFailure } from "./dispatcher-policy.ts";

export const DISPATCHER_PROMPT = [
  "Use $verah-os-unattended to continue the currently selected VERAH OS checkpoint.",
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
    return ["input_tokens", "output_tokens", "cached_input_tokens"]
      .reduce((sum, key) => sum + (Number(usage[key]) || 0), 0);
  } catch {
    return 0;
  }
}

export async function invokeCodex(
  config: DispatcherConfig,
  signal?: AbortSignal,
): Promise<CodexInvocationResult> {
  const arguments_ = [
    ...config.codexArguments,
    "--cd",
    config.workspaceDirectory,
    DISPATCHER_PROMPT,
  ];
  return await new Promise((resolve) => {
    const child = spawn(config.codexCommand, arguments_, {
      cwd: config.workspaceDirectory,
      env: childEnvironment(),
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      signal,
    });
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
