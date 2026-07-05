import type { CommandModule } from "@/types/module";

export const modules: CommandModule[] = [
  {
    slug: "dashboard",
    title: "Dashboard",
    description: "Executive operating view across VERAH OS.",
    owner: "Xavier",
    status: "ready",
    primaryAction: "Review operating state",
    metrics: [
      { label: "Active streams", value: "11" },
      { label: "Open risks", value: "4" },
      { label: "Automation health", value: "92%" }
    ]
  },
  {
    slug: "roadmap",
    title: "Roadmap",
    description: "Strategic roadmap, sequencing and release readiness.",
    owner: "Claude",
    status: "attention",
    primaryAction: "Prioritize next milestone",
    metrics: [
      { label: "Milestones", value: "7" },
      { label: "Blocked", value: "2" },
      { label: "Next review", value: "Today" }
    ]
  },
  {
    slug: "projects",
    title: "Projects",
    description: "Execution portfolio for VERAH initiatives.",
    owner: "Xavier",
    status: "ready",
    primaryAction: "Open portfolio",
    metrics: [
      { label: "Active", value: "6" },
      { label: "At risk", value: "1" },
      { label: "Delivered", value: "3" }
    ]
  },
  {
    slug: "work-orders",
    title: "Work Orders",
    description: "Codex-ready work orders and acceptance criteria.",
    owner: "Codex",
    status: "ready",
    primaryAction: "Generate work order",
    metrics: [
      { label: "Ready", value: "5" },
      { label: "In review", value: "2" },
      { label: "Done", value: "8" }
    ]
  },
  {
    slug: "github",
    title: "GitHub",
    description: "Repository, PR and issue command surface.",
    owner: "Codex",
    status: "attention",
    primaryAction: "Review PR pipeline",
    metrics: [
      { label: "Open PRs", value: "3" },
      { label: "Open issues", value: "12" },
      { label: "Needs review", value: "2" }
    ]
  },
  {
    slug: "atlas",
    title: "Atlas",
    description: "Single source of truth for strategy and architecture.",
    owner: "Xavier",
    status: "ready",
    primaryAction: "Sync Atlas",
    metrics: [
      { label: "Domains", value: "13" },
      { label: "ADRs", value: "1" },
      { label: "Pending sync", value: "2" }
    ]
  },
  {
    slug: "dispatcher",
    title: "Dispatcher",
    description: "AI task intake, classification and routing.",
    owner: "n8n",
    status: "ready",
    primaryAction: "Inspect routing",
    metrics: [
      { label: "Routes", value: "5" },
      { label: "Failures", value: "0" },
      { label: "Latency", value: "1.4s" }
    ]
  },
  {
    slug: "ai-team",
    title: "AI Team",
    description: "Claude, Codex, Gemini and Ethan operating assignments.",
    owner: "Xavier",
    status: "ready",
    primaryAction: "Balance agents",
    metrics: [
      { label: "Agents", value: "4" },
      { label: "Assigned", value: "9" },
      { label: "Blocked", value: "1" }
    ]
  },
  {
    slug: "automation",
    title: "Automation",
    description: "n8n workflows, webhooks and production controls.",
    owner: "n8n",
    status: "attention",
    primaryAction: "Open runbook",
    metrics: [
      { label: "Workflows", value: "6" },
      { label: "Active", value: "1" },
      { label: "Draft", value: "5" }
    ]
  },
  {
    slug: "analytics",
    title: "Analytics",
    description: "Operating intelligence and executive signals.",
    owner: "Gemini",
    status: "empty",
    primaryAction: "Connect data source",
    metrics: [
      { label: "Sources", value: "0" },
      { label: "Dashboards", value: "0" },
      { label: "Signals", value: "0" }
    ]
  },
  {
    slug: "settings",
    title: "Settings",
    description: "Credentials, routing rules and workspace controls.",
    owner: "Xavier",
    status: "ready",
    primaryAction: "Review configuration",
    metrics: [
      { label: "Secrets", value: "External" },
      { label: "Auth", value: "Supabase" },
      { label: "Mode", value: "Ops" }
    ]
  }
];

export function getModule(slug: string) {
  return modules.find((module) => module.slug === slug);
}
