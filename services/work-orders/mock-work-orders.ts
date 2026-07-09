import type { WorkOrder } from "@/types/work-order";

export const mockWorkOrders: WorkOrder[] = [
  {
    id: "WO-008",
    title: "Work Orders Foundation",
    description:
      "Implementar a fundacao operacional do modulo de Work Orders do VERAH Command Center.",
    category: "Product Operations",
    status: "In Progress",
    priority: "High",
    owner: "Ethan",
    origin: "Manual",
    createdAt: "2026-07-09",
    updatedAt: "2026-07-09"
  },
  {
    id: "WO-CENTER-001",
    title: "GitHub Dashboard Card",
    description: "Transformar o card GitHub do Dashboard em dado real usando a GitHub API.",
    category: "Integration",
    status: "Done",
    priority: "High",
    owner: "Codex",
    origin: "Manual",
    createdAt: "2026-07-07",
    updatedAt: "2026-07-08"
  },
  {
    id: "WO-CENTER-002",
    title: "GitHub Diagnostics",
    description: "Melhorar logs de diagnostico para falhas ao consultar a GitHub API.",
    category: "Observability",
    status: "Review",
    priority: "Medium",
    owner: "Codex",
    origin: "Manual",
    createdAt: "2026-07-08",
    updatedAt: "2026-07-08"
  },
  {
    id: "WO-AIOS-003",
    title: "Dispatcher Operating System",
    description: "Preparar workflows do Dispatcher para roteamento, reviews e sincronizacao do Atlas.",
    category: "Automation",
    status: "Backlog",
    priority: "Critical",
    owner: "Xavier",
    origin: "Dispatcher",
    createdAt: "2026-07-05",
    updatedAt: "2026-07-05"
  },
  {
    id: "WO-DEPLOY-003",
    title: "Auth Dashboard Flow",
    description: "Concluir o fluxo autenticado inicial do VERAH Command Center.",
    category: "Deployment",
    status: "Done",
    priority: "High",
    owner: "Codex",
    origin: "GitHub",
    createdAt: "2026-07-07",
    updatedAt: "2026-07-07"
  },
  {
    id: "WO-OPS-001",
    title: "Partner Onboarding Review",
    description: "Mapear requisitos operacionais para cadastro de parceiros da rede VERAH.",
    category: "Operations",
    status: "Blocked",
    priority: "Medium",
    owner: "Claude",
    origin: "AI",
    createdAt: "2026-07-04",
    updatedAt: "2026-07-06"
  }
];
