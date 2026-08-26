import type { SandboxProvider } from "./types.ts";

export function createLocalSandboxPaymentProvider({
  failure,
}: {
  failure?: "provider_unavailable" | "provider_declined";
} = {}): SandboxProvider {
  return {
    id: "verah_local_payment_sandbox",
    environment: "sandbox",
    async authorize(input) {
      if (failure) return { status: "failed", reason: failure };
      return {
        status: "confirmed",
        providerReference: `sandbox:${input.operationId}`,
      };
    },
  };
}
