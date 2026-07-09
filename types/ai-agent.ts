export type AiAgentStatus = "online" | "offline" | "idle" | "running" | "error";

export type AiAgentProvider = "openai" | "anthropic" | "google" | "codex" | "human" | "external";

export type AiAgent = {
  id: string;
  name: string;
  role: string;
  provider: AiAgentProvider;
  status: AiAgentStatus;
  capabilities: string[];
  endpointUrl: string | null;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
};
