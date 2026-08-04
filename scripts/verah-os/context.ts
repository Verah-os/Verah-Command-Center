import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

import type { ContextDocument } from "./types.ts";

async function markdownFiles(directory: string) {
  try {
    return (await readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => join(directory, entry.name));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export async function readOperatingContext(workspaceDirectory: string) {
  const candidates = [
    ...(await markdownFiles(join(workspaceDirectory, "docs", "architecture", "decisions"))),
    ...(await markdownFiles(join(workspaceDirectory, "docs", "handoffs"))),
    join(workspaceDirectory, "docs", "verah-os", "roadmap.md"),
  ];
  const documents: ContextDocument[] = [];
  for (const path of [...new Set(candidates)].sort()) {
    try {
      const content = await readFile(path);
      documents.push({
        path: relative(workspaceDirectory, path).replaceAll("\\", "/"),
        bytes: content.byteLength,
        sha256: createHash("sha256").update(content).digest("hex"),
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return documents;
}
