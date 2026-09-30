import { requireRole } from "@/services/auth/profile";
import { createSupabaseServerClient } from "@/services/supabase/server";
import { readHomologationEvidence, type Evidence } from "./evidence";

export const statuses = [
  "candidate",
  "documents_pending",
  "under_review",
  "pilot_approved",
  "approved",
  "suspended",
  "rejected",
  "expired",
] as const;
export const reviews = [
  "pending",
  "verified",
  "rejected",
  "expired",
  "not_applicable",
] as const;
export type Provider = {
  id: string;
  name: string;
  trade_name: string | null;
  city: string;
  status: string;
};
export type Profile = {
  provider_id: string;
  homologation_status: string;
  critical_operational_block: boolean;
  next_review_at: string | null;
  status_reason: string | null;
};
export type ChecklistItem = {
  item_code: string;
  is_required_for_pilot: boolean;
  evidence_required: boolean;
  review_status: string;
  evidence_ref: string | null;
  valid_until: string | null;
  note: string | null;
};
export type Category = {
  category_code: string;
  authorization_status: string;
  valid_until: string | null;
  reason: string | null;
};
export type Detail = {
  provider: Provider;
  profile: Profile | null;
  checklist: ChecklistItem[];
  categories: Category[];
  evidence: Evidence[];
};

function read<T>({ data, error }: { data: T | null; error: unknown }): T {
  if (error || data === null)
    throw new Error(
      "Não foi possível ler a homologação. Isso não significa ausência de prestadores ou requisitos. Tente novamente.",
    );
  return data;
}

export async function listHomologationProviders(): Promise<Provider[]> {
  await requireRole(["admin"]);
  const client = await createSupabaseServerClient();
  return read(
    await client
      .from("service_providers")
      .select("id,name,trade_name,city,status")
      .order("name"),
  ) as Provider[];
}

export async function getHomologationDetail(id: string): Promise<Detail> {
  await requireRole(["admin"]);
  const client = await createSupabaseServerClient();
  const results = await Promise.all([
    client
      .from("service_providers")
      .select("id,name,trade_name,city,status")
      .eq("id", id)
      .single(),
    client
      .from("provider_homologation_profiles")
      .select(
        "provider_id,homologation_status,critical_operational_block,next_review_at,status_reason",
      )
      .eq("provider_id", id),
    client
      .from("provider_homologation_checklist_items")
      .select(
        "item_code,is_required_for_pilot,evidence_required,review_status,evidence_ref,valid_until,note",
      )
      .eq("provider_id", id)
      .order("item_code"),
    client
      .from("provider_category_authorizations")
      .select("category_code,authorization_status,valid_until,reason")
      .eq("provider_id", id)
      .order("category_code"),
    client.from("service_attachments")
      .select("id,status,created_at,declared_mime_type,size_bytes")
      .eq("homologation_provider_id", id)
      .order("created_at", { ascending: false }),
  ]);
  return {
    provider: read(results[0]) as Provider,
    profile: (read(results[1]) as Profile[])[0] ?? null,
    checklist: read(results[2]) as ChecklistItem[],
    categories: read(results[3]) as Category[],
    evidence: read(results[4]) as Evidence[],
  };
}

const approved = (status: string) =>
  status === "pilot_approved" || status === "approved";
const current = (date: string | null) =>
  date === null || Date.parse(date) > Date.now();
export function approvalBlockers(detail: Detail): string[] {
  const blockers: string[] = [];
  if (!detail.profile)
    blockers.push("Inicie o perfil e o checklist canônicos.");
  if (detail.provider.status !== "active")
    blockers.push("Prestador não está ativo.");
  if (detail.profile?.critical_operational_block)
    blockers.push("Bloqueio operacional crítico ativo.");
  const mandatory = detail.checklist.filter(
    (item) => item.is_required_for_pilot,
  );
  if (!mandatory.length) blockers.push("Checklist obrigatório ausente.");
  if (
    mandatory.some(
      (item) =>
        item.review_status !== "verified" ||
        !current(item.valid_until) ||
        (item.evidence_required && !item.evidence_ref),
    )
  )
    blockers.push(
      "Requisitos obrigatórios pendentes, vencidos ou sem evidência.",
    );
  if (
    !detail.categories.some(
      (category) =>
        approved(category.authorization_status) &&
        current(category.valid_until),
    )
  )
    blockers.push("Nenhuma categoria autorizada e válida.");
  return blockers;
}

function value(form: FormData, name: string, required = false): string {
  const entry = form.get(name);
  const result = typeof entry === "string" ? entry.trim() : "";
  if (required && !result)
    throw new Error("Preencha os campos obrigatórios e a justificativa.");
  return result;
}
function date(form: FormData, name: string): string | null {
  const input = value(form, name);
  if (!input) return null;
  const utc = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input)
    ? `${input}:00Z`
    : input;
  if (!Number.isFinite(Date.parse(utc))) throw new Error("Data inválida.");
  return new Date(utc).toISOString();
}

// Every operation uses the current authenticated session and the existing audited RPC.
// No table writes, service-role clients or caller-controlled RPC names.
export async function operateHomologation(form: FormData): Promise<void> {
  await requireRole(["admin"]);
  const id = value(form, "provider_id", true);
  if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id))
    throw new Error("Prestador inválido.");
  const detail = await getHomologationDetail(id);
  const client = await createSupabaseServerClient();
  const operation = value(form, "operation", true);
  let rpc: string;
  let args: Record<string, unknown>;
  if (operation === "initialize") {
    if (detail.profile)
      throw new Error("O perfil já existe. Recarregue a página.");
    rpc = "upsert_provider_homologation_profile";
    args = {
      p_provider_id: id,
      p_legal_name: value(form, "legal_name", true),
      p_trade_name: detail.provider.trade_name,
      p_registration_reference: value(form, "registration_reference", true),
      p_operational_address: {
        address: value(form, "address", true),
        city: detail.provider.city,
      },
      p_responsible_person: { name: value(form, "responsible_person", true) },
      p_contacts: { contact: value(form, "contact", true) },
      p_specialties: [],
      p_service_regions: [detail.provider.city],
      p_operational_hours: {},
      p_approximate_capacity: null,
      p_warranty_policy: null,
      p_warranty_days: null,
      p_receives_vehicles: false,
      p_internal_notes: value(form, "reason", true),
    };
  } else {
    if (!detail.profile)
      throw new Error("Inicie o perfil antes de revisar a homologação.");
    const reason = value(form, "reason", operation !== "initialize_checklist");
    if (operation === "initialize_checklist") {
      if (detail.checklist.length) throw new Error("O checklist já existe. Recarregue a página.");
      rpc = "initialize_provider_homologation_checklist";
      args = { p_provider_id: id };
    } else if (operation === "checklist") {
      const item = detail.checklist.find(
        (item) => item.item_code === value(form, "item_code", true),
      );
      const status = value(form, "status", true);
      if (!item || !reviews.includes(status as (typeof reviews)[number]))
        throw new Error("Revisão inválida.");
      const evidence = value(form, "evidence_ref");
      if (evidence) await readHomologationEvidence(id, evidence);
      rpc = "review_provider_checklist_item";
      args = {
        p_provider_id: id,
        p_item_code: item.item_code,
        p_status: status,
        p_evidence_ref: value(form, "evidence_ref") || null,
        p_valid_until: date(form, "valid_until"),
        p_note: reason,
        p_required_for_pilot: item.is_required_for_pilot,
      };
    } else if (operation === "category" || operation === "status") {
      const status = value(form, "status", true);
      if (!statuses.includes(status as (typeof statuses)[number]))
        throw new Error("Estado inválido.");
      if (operation === "category") {
        rpc = "set_provider_category_authorization";
        args = {
          p_provider_id: id,
          p_category_code: value(form, "category_code", true),
          p_status: status,
          p_valid_until: date(form, "valid_until"),
          p_reason: reason,
        };
      } else {
        const blockers = approvalBlockers(detail);
        if (approved(status) && blockers.length)
          throw new Error(blockers.join(" "));
        const nextReview = date(form, "next_review_at");
        if (approved(status) && !current(nextReview))
          throw new Error("A próxima revisão deve estar no futuro.");
        rpc = "set_provider_homologation_status";
        args = {
          p_provider_id: id,
          p_status: status,
          p_reason: reason,
          p_next_review_at: nextReview,
        };
      }
    } else if (operation === "block") {
      const blocked = value(form, "blocked", true);
      if (blocked !== "true" && blocked !== "false")
        throw new Error("Bloqueio inválido.");
      rpc = "set_provider_operational_block";
      args = {
        p_provider_id: id,
        p_blocked: blocked === "true",
        p_reason: reason,
      };
    } else throw new Error("Operação inválida.");
  }
  const { error, data } = await client.rpc(rpc, args);
  if (error || !data)
    throw new Error(
      "Operação não confirmada. Confira os requisitos, a evidência privada do próprio prestador e sua autorização Admin; recarregue antes de tentar novamente.",
    );
}
