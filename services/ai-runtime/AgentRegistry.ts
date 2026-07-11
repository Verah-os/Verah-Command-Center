import type { AgentAdapter } from "@/services/ai-runtime/adapters/AgentAdapter";

export class AgentRegistry {
  private readonly adapters = new Map<string, AgentAdapter>();

  register(adapter: AgentAdapter): void {
    this.adapters.set(adapter.agentId, adapter);
  }

  resolve(agentId: string): AgentAdapter | undefined {
    return this.adapters.get(agentId);
  }

  list(): AgentAdapter[] {
    return Array.from(this.adapters.values());
  }
}
