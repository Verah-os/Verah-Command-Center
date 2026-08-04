import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

const logName = "audit.jsonl";
const rotatedLogName = "audit.previous.jsonl";
const maxBytes = 256 * 1024;

export type AuditEvent = {
  event: string;
  at: string;
  issueNumber?: number | null;
  pullRequestNumber?: number | null;
  branch?: string | null;
  state?: string;
  detail?: string;
};

function sanitize(value: string | undefined) {
  if (!value) return undefined;
  return value
    .replace(/(?:ghp|github_pat|sbp|eyJ)[A-Za-z0-9_.-]{12,}/g, "[redacted]")
    .replace(/[A-Za-z]:\\[^\s"']+/g, "[local-path]")
    .replace(/\b\+?[1-9]\d{9,14}\b/g, "[redacted-phone]")
    .slice(0, 240);
}

export async function appendAuditEvent(runtimeDirectory: string, event: AuditEvent) {
  await mkdir(runtimeDirectory, { recursive: true });
  const path = join(runtimeDirectory, logName);
  try {
    if ((await stat(path)).size >= maxBytes) {
      await rm(join(runtimeDirectory, rotatedLogName), { force: true });
      await rename(path, join(runtimeDirectory, rotatedLogName));
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const safe = {
    event: sanitize(event.event) ?? "unknown",
    at: event.at,
    issueNumber: event.issueNumber ?? null,
    pullRequestNumber: event.pullRequestNumber ?? null,
    branch: sanitize(event.branch ?? undefined) ?? null,
    state: sanitize(event.state) ?? null,
    detail: sanitize(event.detail) ?? null,
  };
  let existing = "";
  try {
    existing = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await writeFile(path, `${existing}${JSON.stringify(safe)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}
