import { env } from "@/lib/env";
import { createSupabaseServerClient } from "@/services/supabase/server";
import type { AiAgent } from "@/types/ai-agent";

export type AiTeamStats = {
  total: number;
  online: number;
  running: number;
  error: number;
};

type AiAgentRow = {
  id: string;
  name: string;
  role: string;
  provider: AiAgent["provider"];
  status: AiAgent["status"];
  capabilities: unknown;
  endpoint_url: string | null;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
};

const aiAgentColumns =
  "id,name,role,provider,status,capabilities,endpoint_url,last_seen_at,created_at,updated_at";

function isSupabaseConfigured() {
  return Boolean(env.supabaseUrl && env.supabaseAnonKey);
}

function normalizeCapabilities(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function toAiAgent(row: AiAgentRow): AiAgent {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    provider: row.provider,
    status: row.status,
    capabilities: normalizeCapabilities(row.capabilities),
    endpointUrl: row.endpoint_url,
    lastSeenAt: row.last_seen_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function listAiAgents(): Promise<AiAgent[]> {
  if (!isSupabaseConfigured()) {
    return [];
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("ai_agents")
    .select(aiAgentColumns)
    .order("name", { ascending: true });

  if (error) {
    console.error("Failed to load AI agents", error.message);
    return [];
  }

  return ((data ?? []) as AiAgentRow[]).map(toAiAgent);
}

export async function getAiTeamStats(): Promise<AiTeamStats> {
  const agents = await listAiAgents();

  return {
    total: agents.length,
    online: agents.filter((agent) => agent.status === "online").length,
    running: agents.filter((agent) => agent.status === "running").length,
    error: agents.filter((agent) => agent.status === "error").length
  };
}
