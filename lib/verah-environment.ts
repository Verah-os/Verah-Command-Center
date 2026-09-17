// Canonical cross-channel backend resolution.
//
// One VERAH product, one canonical non-production backend. Web (Next.js) and
// Mobile (Expo) must be wired to the same Supabase project during Alpha; this
// pure module derives non-secret diagnostics (environment label and project
// ref from the URL) and fails closed whenever a channel points at a forbidden
// or incompatible environment. No keys are ever accepted here.

export type VerahRuntimeEnvironment = "alpha" | "staging" | "qa";
export type VerahChannel = "web" | "mobile";

export const CANONICAL_ALPHA_PROJECT_REF = "wxnklnbntgpcncajzpsj";

// Enforced at client construction, including web-only deployments where the
// cross-channel CI comparison cannot see the EAS environment.
export function requireCanonicalWebEnvironment(source: VerahEnvironmentSource) {
  const result = resolveVerahEnvironment({ ...source, environment: source.environment || "staging" }, "web");
  if (!result.ok) throw new Error(result.message);
  if (result.descriptor.projectRef && result.descriptor.projectRef !== CANONICAL_ALPHA_PROJECT_REF) {
    throw new Error(`Backend Alpha incorreto: ${result.descriptor.projectRef}. Esperado: ${CANONICAL_ALPHA_PROJECT_REF}.`);
  }
  return result.descriptor;
}

export const ALPHA_ENVIRONMENTS: readonly VerahRuntimeEnvironment[] = [
  "alpha",
  "staging",
  "qa",
] as const;

const ALLOWED_ENVIRONMENTS = new Set<string>(ALPHA_ENVIRONMENTS);
const FORBIDDEN_ENVIRONMENT =
  /^(production|prod|live|main)(\s|$)/i;

const HOSTED_URL = /^https:\/\/([a-z0-9-]+)\.supabase\.co(\/|$)/;
const LOCAL_URL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/;

export type VerahEnvironmentSource = {
  supabaseUrl: string;
  anonKey: string;
  environment?: string;
};

export type VerahEnvironmentDescriptor = {
  channel: VerahChannel;
  environment: VerahRuntimeEnvironment;
  projectRef: string | null;
  url: string;
};

export type VerahEnvironmentResult =
  | { ok: true; descriptor: VerahEnvironmentDescriptor }
  | { ok: false; message: string };

export type VerahEnvironmentPairResult =
  | {
      ok: true;
      web: VerahEnvironmentDescriptor;
      mobile: VerahEnvironmentDescriptor;
    }
  | { ok: false; message: string };

export function projectRefFromUrl(url: string): string | null {
  const value = (url ?? "").trim();
  if (!value) return null;
  const hosted = HOSTED_URL.exec(value);
  if (hosted) return hosted[1];
  return null;
}

export function isLocalSupabaseUrl(url: string): boolean {
  return LOCAL_URL.test((url ?? "").trim());
}

function normalizedOrigin(url: string): string | null {
  const value = (url ?? "").trim();
  if (HOSTED_URL.test(value)) return `hosted:${projectRefFromUrl(value)}`;
  if (LOCAL_URL.test(value)) {
    try {
      const parsed = new URL(value);
      return `local:${parsed.host}`;
    } catch {
      return null;
    }
  }
  return null;
}

function resolveEnvironmentLabel(raw: string): {
  environment: VerahRuntimeEnvironment;
  message: string | null;
} {
  const label = (raw ?? "staging").trim().toLowerCase();
  if (FORBIDDEN_ENVIRONMENT.test(label)) {
    return {
      environment: "staging",
      message: `Ambiente "${label}" fora do canônico Alpha/staging.`,
    };
  }
  if (!ALLOWED_ENVIRONMENTS.has(label)) {
    return {
      environment: "staging",
      message: `Ambiente "${label}" não reconhecido.`,
    };
  }
  return { environment: label as VerahRuntimeEnvironment, message: null };
}

export function resolveVerahEnvironment(
  source: VerahEnvironmentSource,
  channel: VerahChannel,
): VerahEnvironmentResult {
  const url = (source.supabaseUrl ?? "").trim();
  const anonKey = (source.anonKey ?? "").trim();
  if (!url || !anonKey) {
    return {
      ok: false,
      message: `Canal ${channel} sem backend canônico configurado.`,
    };
  }
  if (!HOSTED_URL.test(url) && !LOCAL_URL.test(url)) {
    return {
      ok: false,
      message: `Canal ${channel} com URL de Supabase inválida.`,
    };
  }
  if (/service_role/i.test(anonKey)) {
    return {
      ok: false,
      message: `Canal ${channel} com chave de privilégio em contrato público.`,
    };
  }
  const label = resolveEnvironmentLabel(source.environment ?? "");
  if (label.message) {
    return { ok: false, message: `Canal ${channel}: ${label.message}` };
  }
  return {
    ok: true,
    descriptor: {
      channel,
      environment: label.environment,
      projectRef: projectRefFromUrl(url),
      url,
    },
  };
}

export function compareVerahEnvironments(
  webSource: VerahEnvironmentSource,
  mobileSource: VerahEnvironmentSource,
): VerahEnvironmentPairResult {
  const web = resolveVerahEnvironment(webSource, "web");
  const mobile = resolveVerahEnvironment(mobileSource, "mobile");
  if (!web.ok) return { ok: false, message: web.message };
  if (!mobile.ok) return { ok: false, message: mobile.message };
  const webOrigin = normalizedOrigin(web.descriptor.url);
  const mobileOrigin = normalizedOrigin(mobile.descriptor.url);
  if (webOrigin === null || mobileOrigin === null) {
    return { ok: false, message: "Não foi possível derivar o backend canônico." };
  }
  if (web.descriptor.environment !== mobile.descriptor.environment) {
    return {
      ok: false,
      message:
        `Drift de ambiente entre canais: web=${web.descriptor.environment} ` +
        `mobile=${mobile.descriptor.environment}.`,
    };
  }
  if (webOrigin !== mobileOrigin) {
    return {
      ok: false,
      message:
        `Drift de backend entre canais: web=${webOrigin} mobile=${mobileOrigin}.`,
    };
  }
  return { ok: true, web: web.descriptor, mobile: mobile.descriptor };
}
