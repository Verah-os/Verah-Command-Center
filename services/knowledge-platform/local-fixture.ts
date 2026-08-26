import { DEMO_VEHICLE_REFERENCE } from "../vehicle-intelligence/index.ts";
import { InMemoryKnowledgeRepository } from "./repository.ts";
import type { KnowledgeItem } from "./types.ts";

export const SYNTHETIC_KNOWLEDGE_FIXTURE: readonly KnowledgeItem[] = [
  {
    id: "knowledge.demo.vehicle.polo-2021-2022",
    title: "Fixture sintética — Volkswagen Polo 2021/2022",
    content: "Dado sintético de demonstração: Volkswagen Polo, fabricação 2021, modelo 2022.",
    kind: "evidence",
    topics: [DEMO_VEHICLE_REFERENCE],
    provenance: {
      source: "verah_synthetic_demo_fixture",
      sourceType: "synthetic_fixture",
      version: "1",
      observedAt: "2026-08-21T00:00:00.000Z",
      synthetic: true,
    },
    audiences: ["customer", "concierge", "internal"],
    visibility: "audience_restricted",
    status: "active",
    trust: "trusted_reference",
  },
  {
    id: "knowledge.demo.vehicle.polo-review",
    title: "Inferência sintética — confirmação humana necessária",
    content: "A correspondência da fixture não substitui confirmação humana do veículo.",
    kind: "inference",
    topics: [DEMO_VEHICLE_REFERENCE],
    provenance: {
      source: "verah_synthetic_inference_fixture",
      sourceType: "synthetic_fixture",
      version: "1",
      observedAt: "2026-08-21T00:00:00.000Z",
      synthetic: true,
    },
    audiences: ["concierge", "internal"],
    visibility: "audience_restricted",
    status: "active",
    trust: "trusted_reference",
  },
];

export function createLocalKnowledgeRepository() {
  return new InMemoryKnowledgeRepository(SYNTHETIC_KNOWLEDGE_FIXTURE);
}
