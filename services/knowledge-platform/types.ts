export type KnowledgeKind = "evidence" | "inference";

export type KnowledgeAudience = "customer" | "concierge" | "provider" | "internal";

export type KnowledgeSourceType =
  | "synthetic_fixture"
  | "internal_record"
  | "external_reference"
  | "vehicle_provider";

export type KnowledgeProvenance = {
  source: string;
  sourceType: KnowledgeSourceType;
  version?: string;
  observedAt?: string;
  synthetic: boolean;
};

export type KnowledgeItem = {
  id: string;
  title: string;
  content: string;
  kind: KnowledgeKind;
  topics: string[];
  provenance: KnowledgeProvenance;
  audiences: KnowledgeAudience[];
  visibility: "audience_restricted" | "internal_only";
  status: "active" | "revoked";
  trust: "trusted_reference" | "untrusted_external";
};

export type KnowledgeCitation = KnowledgeProvenance & {
  knowledgeId: string;
  title: string;
};

export type KnowledgeRepository = {
  findByTopic(topic: string): Promise<readonly KnowledgeItem[]>;
};

export type KnowledgeEntry = {
  kind: KnowledgeKind;
  content: string;
  citation: KnowledgeCitation;
  contentTreatment: "reference_data" | "untrusted_data";
  operationalInstruction: null;
};

export type KnowledgeResult = {
  status: "available" | "unavailable";
  entries: KnowledgeEntry[];
  citations: KnowledgeCitation[];
  reason: "knowledge_available" | "no_knowledge" | "repository_unavailable";
};

export type KnowledgeEvent = {
  code: "repository_unavailable" | "invalid_item_ignored";
};
