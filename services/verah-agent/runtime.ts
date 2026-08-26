import { customerPilotDemo } from "../../lib/customer-pilot-demo.ts";
import {
  createLocalVehicleIntelligenceProvider,
  defaultVehicleIntelligencePolicy,
  resolveVehicleIntelligence,
} from "../vehicle-intelligence/index.ts";
import type {
  VehicleIntelligenceProvider,
  VehicleIntelligenceResult,
} from "../vehicle-intelligence/index.ts";
import {
  createLocalKnowledgeRepository,
  retrieveKnowledge as retrieveKnowledgePlatform,
} from "../knowledge-platform/index.ts";
import type {
  KnowledgeEntry,
  KnowledgeRepository,
  KnowledgeResult,
} from "../knowledge-platform/index.ts";

export type VerahAgentDependencies = {
  vehicleProviders?: VehicleIntelligenceProvider[];
  knowledgeRepository?: KnowledgeRepository | null;
};

export type VerahAgentResponse = {
  runtime: "deterministic_sandbox";
  vehicleReference: string;
  knownFacts: string[];
  evidence: Array<Pick<KnowledgeEntry, "content" | "citation">>;
  inference: string[];
  missingInformation: string[];
  questions: string[];
  riskSignals: string[];
  requiresProfessionalReview: boolean;
  explanation: string;
  nextStep: string;
  offer: "Posso cuidar disso para você.";
  ignoredUntrustedEntries: number;
  handoff: ReturnType<typeof prepareServiceRequest>;
};

export async function getVehicleContext(
  vehicleReference: string,
  providers: VehicleIntelligenceProvider[] = [createLocalVehicleIntelligenceProvider()],
): Promise<VehicleIntelligenceResult> {
  return resolveVehicleIntelligence({
    request: { vehicleReference },
    providers,
    policy: defaultVehicleIntelligencePolicy,
  });
}

export async function retrieveKnowledge(
  vehicleReference: string,
  repository: KnowledgeRepository | null = createLocalKnowledgeRepository(),
): Promise<KnowledgeResult> {
  return retrieveKnowledgePlatform({
    repository,
    topic: vehicleReference,
    audience: "customer",
  });
}

export function triageSymptoms(message: string) {
  const normalized = message.toLocaleLowerCase("pt-BR");
  const riskSignals = [
    /vibra/.test(normalized) ? "Vibração percebida no volante" : null,
    /volante|direção/.test(normalized) ? "Sintoma relacionado à direção" : null,
    /barulho|ruído/.test(normalized) ? "Ruído recorrente em piso irregular" : null,
  ].filter((signal): signal is string => Boolean(signal));

  return {
    inference: [
      "O relato é compatível com uma necessidade de avaliação de suspensão/direção, mas não identifica a causa.",
    ],
    missingInformation: [
      "A origem mecânica do barulho",
      "Se há condição segura para continuar dirigindo",
      "Quais peças, se alguma, precisam de serviço",
    ],
    questions: [
      "Quando o barulho começou e ele está ficando mais frequente?",
      "A vibração aparece em alguma velocidade, ao frear ou o tempo todo?",
      "A direção ficou pesada, imprecisa ou apareceu alguma luz no painel?",
    ],
    riskSignals,
    requiresProfessionalReview: riskSignals.length > 0,
  };
}

export function prepareServiceRequest({
  authorized,
  vehicleReference,
}: {
  authorized: boolean;
  vehicleReference: string;
}) {
  const route = "/demo/cliente/piloto" as const;
  const scene = "intake" as const;
  if (!authorized) {
    return { status: "authorization_required" as const, route, scene, serviceRequestId: null };
  }
  if (vehicleReference !== customerPilotDemo.vehicle.id) {
    return { status: "vehicle_unavailable" as const, route, scene, serviceRequestId: null };
  }
  return {
    status: "prepared" as const,
    route,
    scene,
    serviceRequestId: customerPilotDemo.id,
  };
}

export async function runVerahAgentDemo(
  input: { message: string; vehicleReference: string },
  dependencies: VerahAgentDependencies = {},
): Promise<VerahAgentResponse> {
  const [vehicleContext, knowledge] = await Promise.all([
    getVehicleContext(input.vehicleReference, dependencies.vehicleProviders),
    retrieveKnowledge(input.vehicleReference, dependencies.knowledgeRepository),
  ]);
  const triage = triageSymptoms(input.message);
  const permittedEntries = knowledge.entries.filter(
    (entry) => entry.contentTreatment === "reference_data",
  );
  const evidence = permittedEntries
    .filter((entry) => entry.kind === "evidence")
    .map(({ content, citation }) => ({ content, citation }));
  const knowledgeInferences = permittedEntries
    .filter((entry) => entry.kind === "inference")
    .map(({ content }) => content);
  const knownFacts = vehicleContext.status === "available" && vehicleContext.vehicle
    ? [
        `Veículo identificado: ${vehicleContext.vehicle.brand} ${vehicleContext.vehicle.model} ${vehicleContext.vehicle.manufactureYear}/${vehicleContext.vehicle.modelYear}.`,
        `Contexto proveniente de fixture local sintética: ${vehicleContext.observations[0].evidence.source}.`,
      ]
    : [];

  return {
    runtime: "deterministic_sandbox",
    vehicleReference: input.vehicleReference,
    knownFacts,
    evidence,
    inference: [...knowledgeInferences, ...triage.inference],
    missingInformation: triage.missingInformation,
    questions: triage.questions,
    riskSignals: triage.riskSignals,
    requiresProfessionalReview: triage.requiresProfessionalReview,
    explanation:
      "Eu consigo organizar o relato e o contexto disponível, mas não confirmar a causa nem afirmar que é seguro continuar usando o carro sem avaliação profissional.",
    nextStep:
      "O próximo passo seguro é uma avaliação profissional. Se a vibração aumentar, a direção mudar ou surgir dificuldade para controlar o carro, pare em local seguro e procure ajuda humana.",
    offer: "Posso cuidar disso para você.",
    ignoredUntrustedEntries: knowledge.entries.length - permittedEntries.length,
    handoff: prepareServiceRequest({
      authorized: false,
      vehicleReference: input.vehicleReference,
    }),
  };
}
