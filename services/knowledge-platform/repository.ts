import type {
  KnowledgeAudience,
  KnowledgeCitation,
  KnowledgeEvent,
  KnowledgeItem,
  KnowledgeRepository,
  KnowledgeResult,
} from "./types.ts";

export class InMemoryKnowledgeRepository implements KnowledgeRepository {
  private readonly items: KnowledgeItem[] = [];

  constructor(items: readonly KnowledgeItem[] = []) {
    this.ingest(items);
  }

  ingest(items: readonly KnowledgeItem[]) {
    for (const item of items) {
      if (!isValidKnowledgeItem(item)) throw new Error("invalid_knowledge_item");
      this.items.push(cloneItem(item));
    }
  }

  async findByTopic(topic: string) {
    const normalizedTopic = normalizeTopic(topic);
    if (!normalizedTopic) return [];
    return this.items
      .filter((item) => item.topics.some((candidate) => normalizeTopic(candidate) === normalizedTopic))
      .sort((left, right) => left.id.localeCompare(right.id))
      .map(cloneItem);
  }
}

type RetrieveOptions = {
  repository?: KnowledgeRepository | null;
  topic: string;
  audience: KnowledgeAudience;
  onEvent?: (event: KnowledgeEvent) => void;
};

export async function retrieveKnowledge({
  repository,
  topic,
  audience,
  onEvent = () => undefined,
}: RetrieveOptions): Promise<KnowledgeResult> {
  if (!repository) return unavailable("repository_unavailable");

  let candidates: readonly KnowledgeItem[];
  try {
    candidates = await repository.findByTopic(topic);
  } catch {
    onEvent({ code: "repository_unavailable" });
    return unavailable("repository_unavailable");
  }

  const entries = candidates.flatMap((item) => {
    if (!isValidKnowledgeItem(item)) {
      onEvent({ code: "invalid_item_ignored" });
      return [];
    }
    if (item.status !== "active" || !isVisibleTo(item, audience)) return [];
    const citation = toCitation(item);
    return [{
      kind: item.kind,
      content: item.content,
      citation,
      contentTreatment: item.trust === "untrusted_external"
        ? "untrusted_data" as const
        : "reference_data" as const,
      operationalInstruction: null,
    }];
  });

  if (entries.length === 0) return unavailable("no_knowledge");
  return {
    status: "available",
    entries,
    citations: entries.map(({ citation }) => citation),
    reason: "knowledge_available",
  };
}

function unavailable(reason: KnowledgeResult["reason"]): KnowledgeResult {
  return { status: "unavailable", entries: [], citations: [], reason };
}

function isVisibleTo(item: KnowledgeItem, audience: KnowledgeAudience) {
  if (item.visibility === "internal_only") return audience === "internal";
  return item.audiences.includes(audience);
}

function toCitation(item: KnowledgeItem): KnowledgeCitation {
  return {
    knowledgeId: item.id,
    title: item.title,
    ...item.provenance,
  };
}

function isValidKnowledgeItem(value: unknown): value is KnowledgeItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<KnowledgeItem>;
  const provenance = item.provenance;
  return Boolean(
    boundedText(item.id, 160) &&
      boundedText(item.title, 240) &&
      boundedText(item.content, 4_000) &&
      (item.kind === "evidence" || item.kind === "inference") &&
      Array.isArray(item.topics) && item.topics.length > 0 &&
      item.topics.every((topic) => boundedText(topic, 160)) &&
      provenance &&
      boundedText(provenance.source, 240) &&
      ["synthetic_fixture", "internal_record", "external_reference", "vehicle_provider"]
        .includes(provenance.sourceType ?? "") &&
      (provenance.version === undefined || boundedText(provenance.version, 80)) &&
      (provenance.observedAt === undefined || validDate(provenance.observedAt)) &&
      typeof provenance.synthetic === "boolean" &&
      Array.isArray(item.audiences) && item.audiences.length > 0 &&
      item.audiences.every((audience) =>
        ["customer", "concierge", "provider", "internal"].includes(audience)) &&
      (item.visibility === "audience_restricted" || item.visibility === "internal_only") &&
      (item.status === "active" || item.status === "revoked") &&
      (item.trust === "trusted_reference" || item.trust === "untrusted_external")
  );
}

function cloneItem(item: KnowledgeItem): KnowledgeItem {
  return {
    ...item,
    topics: [...item.topics],
    provenance: { ...item.provenance },
    audiences: [...item.audiences],
  };
}

function normalizeTopic(value: string) {
  return typeof value === "string" ? value.trim().toLocaleLowerCase("pt-BR") : "";
}

function boundedText(value: unknown, maxLength: number) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}

function validDate(value: string) {
  return !Number.isNaN(Date.parse(value));
}
