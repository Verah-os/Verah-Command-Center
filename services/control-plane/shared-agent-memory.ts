import { createHash } from "node:crypto";

import type { AgentMemory, AgentTask } from "./types.ts";

export type MemoryDecision = "ADOPT" | "TRIAL" | "HOLD" | "REJECT";

export type CogneeEvidence = {
  decision: MemoryDecision;
  version: string;
  evidenceRef: string;
  deterministicPipelinePassed: boolean;
  crossSessionPrecision: number;
  provenanceRecorded: boolean;
  ttlAdapterValidated: boolean;
  graphLlmDisabled: boolean;
};

export type CogneeGate = {
  enabled: boolean;
  reason:
    | "approved"
    | "decision_not_adopted"
    | "version_not_pinned"
    | "deterministic_pipeline_failed"
    | "cross_session_precision_failed"
    | "provenance_not_recorded"
    | "ttl_adapter_missing"
    | "graph_llm_enabled";
  evidenceRef: string;
};

export const COGNEE_PHASE_0_EVIDENCE: CogneeEvidence = Object.freeze({
  decision: "TRIAL",
  version: "1.5.3",
  evidenceRef: "docs/architecture/decisions/008-control-plane-phase0-component-evaluation.md",
  deterministicPipelinePassed: true,
  crossSessionPrecision: 1,
  provenanceRecorded: false,
  ttlAdapterValidated: false,
  graphLlmDisabled: true,
});

export type CuratedMemoryRecord = {
  id: string;
  content: string;
  sourceRef: string;
  sourceKind: "github" | "supabase" | "repository";
  sourceVersion: string;
  sha256: string;
  observedAt: string;
  expiresAt?: string;
  supersedesId?: string;
  status: "active" | "revoked";
};

export type SemanticMemoryLocator = {
  id: string;
  sourceRef: string;
  sourceVersion: string;
  sha256: string;
};

export type SemanticMemoryQuery = {
  issueKey: string;
  roleId: string;
  kind: string;
  sourceRefs: readonly string[];
};

export type SemanticMemoryBackend = {
  retrieve(query: Readonly<SemanticMemoryQuery>): Promise<readonly SemanticMemoryLocator[]>;
};

export type SharedAgentMemoryOptions = {
  cognee?: SemanticMemoryBackend;
  cogneeEvidence?: CogneeEvidence;
  now?: () => number;
  maxItems?: number;
};

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function isIsoDate(value: string): boolean {
  return value.length > 0 && Number.isFinite(Date.parse(value));
}

function isBoundedLabel(value: string, maxLength: number): boolean {
  return (
    value === value.trim() &&
    value.length > 0 &&
    value.length <= maxLength &&
    !/[\r\n]/.test(value)
  );
}

function validateRecords(records: readonly CuratedMemoryRecord[]): void {
  if (records.length > 100) throw new Error("memory_catalog_too_large");
  const byId = new Map<string, CuratedMemoryRecord>();
  for (const record of records) {
    if (!record.content.trim()) {
      throw new Error("memory_record_required_field_missing");
    }
    if (
      !isBoundedLabel(record.id, 100) ||
      !isBoundedLabel(record.sourceRef, 300) ||
      !isBoundedLabel(record.sourceVersion, 100)
    ) {
      throw new Error("memory_record_label_invalid");
    }
    if (
      !["github", "supabase", "repository"].includes(record.sourceKind) ||
      !["active", "revoked"].includes(record.status)
    ) {
      throw new Error("memory_record_classification_invalid");
    }
    if (record.content.length > 4_000) throw new Error("memory_record_content_too_large");
    if (byId.has(record.id)) throw new Error("memory_record_duplicate");
    if (!/^[a-f0-9]{64}$/i.test(record.sha256) || sha256(record.content) !== record.sha256) {
      throw new Error("memory_record_digest_invalid");
    }
    if (!isIsoDate(record.observedAt) || (record.expiresAt && !isIsoDate(record.expiresAt))) {
      throw new Error("memory_record_timestamp_invalid");
    }
    if (record.expiresAt && Date.parse(record.expiresAt) <= Date.parse(record.observedAt)) {
      throw new Error("memory_record_ttl_invalid");
    }
    byId.set(record.id, record);
  }

  for (const record of records) {
    if (!record.supersedesId) continue;
    const superseded = byId.get(record.supersedesId);
    if (!superseded || superseded.sourceRef !== record.sourceRef || superseded.id === record.id) {
      throw new Error("memory_record_supersession_invalid");
    }
  }
}

export function assessCogneeEvidence(evidence: CogneeEvidence): CogneeGate {
  const base = { evidenceRef: evidence.evidenceRef };
  if (evidence.decision !== "ADOPT") {
    return { ...base, enabled: false, reason: "decision_not_adopted" };
  }
  if (!/^\d+\.\d+\.\d+$/.test(evidence.version)) {
    return { ...base, enabled: false, reason: "version_not_pinned" };
  }
  if (!evidence.deterministicPipelinePassed) {
    return { ...base, enabled: false, reason: "deterministic_pipeline_failed" };
  }
  if (!Number.isFinite(evidence.crossSessionPrecision) || evidence.crossSessionPrecision !== 1) {
    return { ...base, enabled: false, reason: "cross_session_precision_failed" };
  }
  if (!evidence.provenanceRecorded) {
    return { ...base, enabled: false, reason: "provenance_not_recorded" };
  }
  if (!evidence.ttlAdapterValidated) {
    return { ...base, enabled: false, reason: "ttl_adapter_missing" };
  }
  if (!evidence.graphLlmDisabled) {
    return { ...base, enabled: false, reason: "graph_llm_enabled" };
  }
  return { ...base, enabled: true, reason: "approved" };
}

function sanitizeMemoryText(value: string): string {
  return value
    .replace(/Bearer\s+[^\s]+/gi, "Bearer [redacted]")
    .replace(/\b(?:sk|ghp|github_pat)_[A-Za-z0-9_-]+\b/g, "[redacted]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted-email]")
    .slice(0, 2_000);
}

function renderRecord(record: CuratedMemoryRecord): string {
  return [
    `UNTRUSTED_MEMORY_DATA source=${record.sourceKind}:${record.sourceRef}`,
    `version=${record.sourceVersion} sha256=${record.sha256}`,
    sanitizeMemoryText(record.content),
  ].join("\n");
}

export class GatedSharedAgentMemory implements AgentMemory {
  readonly #records: ReadonlyMap<string, CuratedMemoryRecord>;
  readonly #superseded: ReadonlySet<string>;
  readonly #cognee?: SemanticMemoryBackend;
  readonly #gate: CogneeGate;
  readonly #now: () => number;
  readonly #maxItems: number;

  constructor(records: readonly CuratedMemoryRecord[], options: SharedAgentMemoryOptions = {}) {
    validateRecords(records);
    this.#records = new Map(records.map((record) => [record.id, Object.freeze({ ...record })]));
    this.#superseded = new Set(
      records.flatMap((record) => (record.supersedesId ? [record.supersedesId] : [])),
    );
    this.#cognee = options.cognee;
    this.#gate = assessCogneeEvidence(options.cogneeEvidence ?? COGNEE_PHASE_0_EVIDENCE);
    this.#now = options.now ?? Date.now;
    this.#maxItems = options.maxItems ?? 10;
    if (!Number.isSafeInteger(this.#maxItems) || this.#maxItems < 1 || this.#maxItems > 20) {
      throw new Error("memory_max_items_invalid");
    }
  }

  cogneeGate(): CogneeGate {
    return { ...this.#gate };
  }

  async loadContext(task: AgentTask): Promise<readonly string[]> {
    const requestedRefs = new Set(
      (task.contextRefs ?? []).slice(0, 50).filter((value) => isBoundedLabel(value, 300)),
    );
    if (requestedRefs.size === 0) return [];

    const active = [...this.#records.values()].filter(
      (record) =>
        record.status === "active" &&
        !this.#superseded.has(record.id) &&
        (!record.expiresAt || Date.parse(record.expiresAt) > this.#now()) &&
        requestedRefs.has(record.sourceRef),
    );
    const byId = new Map(active.map((record) => [record.id, record]));
    const selected: CuratedMemoryRecord[] = [];

    if (this.#cognee && this.#gate.enabled) {
      try {
        const safeQuery = Object.freeze({
          issueKey: task.issueKey,
          roleId: task.roleId,
          kind: task.kind,
          sourceRefs: Object.freeze([...requestedRefs]),
        });
        const locators = await this.#cognee.retrieve(safeQuery);
        for (const locator of locators.slice(0, 50)) {
          const record = byId.get(locator.id);
          if (
            record &&
            locator.sourceRef === record.sourceRef &&
            locator.sourceVersion === record.sourceVersion &&
            locator.sha256 === record.sha256 &&
            !selected.includes(record)
          ) {
            selected.push(record);
          }
        }
      } catch {
        // Cognee is a disposable semantic index; canonical records remain available.
      }
    }

    for (const record of active.sort((left, right) => left.id.localeCompare(right.id))) {
      if (!selected.includes(record)) selected.push(record);
    }
    return Object.freeze(selected.slice(0, this.#maxItems).map(renderRecord));
  }
}
