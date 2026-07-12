import { runMockServiceCopilot } from "./mock-service-copilot";
import type { ServiceCopilotInput } from "./types";

export function analyzeServiceRequest(input: ServiceCopilotInput) {
  return runMockServiceCopilot(input);
}
