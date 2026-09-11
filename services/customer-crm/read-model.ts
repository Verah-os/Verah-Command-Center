import type { SupabaseClient } from "@supabase/supabase-js";
import type { ServiceStage } from "@/types/service-request";

export type Source<T> =
  | { status: "available"; data: T }
  | { status: "unavailable"; reason: "source" | "limit" | "invalid" };
export const available = <T>(data: T): Source<T> => ({
  status: "available",
  data,
});
export const unavailable = (
  reason: "source" | "limit" | "invalid" = "source",
): Source<never> => ({ status: "unavailable", reason });
export type Customer = { id: string; display_name: string; created_at: string };
export type Contact = {
  id: string;
  customer_id: string;
  channel_address: string;
  consent_status: string;
};
export type Vehicle = {
  id: string;
  customer_id: string;
  brand: string;
  model: string;
  plate: string | null;
  year: number | null;
  current_mileage: number | null;
  active: boolean;
};
export type Request = {
  id: string;
  customer_id: string | null;
  vehicle_id: string | null;
  reference_code: string;
  service_stage: ServiceStage;
  created_at: string;
  updated_at: string;
};
export type RequestEvent = {
  id: string;
  service_request_id: string;
  event_type: string;
  actor_role: string;
  channel: string;
  created_at: string;
};
export const openStages: readonly ServiceStage[] = [
  "solicitado",
  "concierge_aceitou",
  "prestador_indicado",
  "aguardando_aprovacao",
  "em_execucao",
];
const stages: readonly string[] = [...openStages, "concluido", "cancelado"];
const uuid = (v: unknown): v is string =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const text = (v: unknown): v is string =>
  typeof v === "string" && v.trim().length > 0;
const date = (v: unknown): v is string =>
  typeof v === "string" && Number.isFinite(Date.parse(v));
type Row = Record<string, unknown>;
type Options = { eq?: [string, string]; ids?: [string, string[]] };
const customerColumns = "id,display_name,created_at";
const contactColumns = "id,customer_id,channel_address,consent_status";
const requestColumns =
  "id,customer_id,vehicle_id,reference_code,service_stage,created_at,updated_at";
const isCustomer = (r: Row) =>
  uuid(r.id) && text(r.display_name) && date(r.created_at);
const isContact = (r: Row) =>
  uuid(r.id) &&
  uuid(r.customer_id) &&
  text(r.channel_address) &&
  ["unknown", "granted", "revoked"].includes(String(r.consent_status));
const isRequest = (r: Row) =>
  uuid(r.id) &&
  (r.customer_id === null || uuid(r.customer_id)) &&
  (r.vehicle_id === null || uuid(r.vehicle_id)) &&
  text(r.reference_code) &&
  stages.includes(String(r.service_stage)) &&
  date(r.created_at) &&
  date(r.updated_at);

// Bounded, complete reads: never turn a PostgREST row cap into a false KPI.
// No shared cache, service-role client, mutation, RPC or provider data.
export async function readRows<T>(
  client: SupabaseClient,
  table: string,
  columns: string,
  valid: (row: Row) => boolean,
  options: Options = {},
): Promise<Source<T[]>> {
  if (options.ids?.[1].length === 0) return available([]);
  const rows: T[] = [];
  const seen = new Set<string>();
  let expected: number | undefined;
  try {
    while (true) {
      let query = client
        .from(table)
        .select(columns, { count: "exact" })
        .order("id", { ascending: true })
        .range(rows.length, rows.length + 199);
      if (options.eq) query = query.eq(...options.eq);
      if (options.ids) query = query.in(...options.ids);
      const { data, error, count } = await query;
      if (error || !Array.isArray(data) || count === null) return unavailable();
      if (!Number.isSafeInteger(count) || count < 0)
        return unavailable("invalid");
      if (count > 5000) return unavailable("limit");
      if (expected !== undefined && count !== expected)
        return unavailable("invalid");
      expected = count;
      for (const value of data as unknown[]) {
        if (!value || typeof value !== "object" || Array.isArray(value))
          return unavailable("invalid");
        const row = value as Row;
        if (!valid(row) || seen.has(String(row.id)))
          return unavailable("invalid");
        seen.add(String(row.id));
        rows.push(row as T);
      }
      if (rows.length === count) return available(rows);
      if (rows.length > count || data.length === 0)
        return unavailable("invalid");
    }
  } catch {
    return unavailable();
  }
}

async function countRows(
  client: SupabaseClient,
  table: string,
  since?: string,
  until?: string,
): Promise<Source<number>> {
  try {
    let query = client.from(table).select("id", { count: "exact", head: true });
    if (since) query = query.gte("created_at", since);
    if (until) query = query.lt("created_at", until);
    const { error, count } = await query;
    return error || count === null || !Number.isSafeInteger(count) || count < 0
      ? unavailable()
      : available(count);
  } catch {
    return unavailable();
  }
}

export async function readMetrics(client: SupabaseClient, now = new Date()) {
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  ).toISOString();
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  ).toISOString();
  const [customers, newCustomers, vehicles, requests] = await Promise.all([
    countRows(client, "customers"),
    countRows(client, "customers", start, end),
    countRows(client, "customer_vehicles"),
    readRows<Pick<Request, "id" | "customer_id" | "service_stage">>(
      client,
      "service_requests",
      "id,customer_id,service_stage",
      (r) =>
        uuid(r.id) &&
        (r.customer_id === null || uuid(r.customer_id)) &&
        stages.includes(String(r.service_stage)),
    ),
  ]);
  const open =
    requests.status === "available"
      ? requests.data.filter((r) => openStages.includes(r.service_stage))
      : null;
  return {
    customers,
    newCustomers,
    vehicles,
    openRequests: open ? available(open.length) : unavailable(),
    activeCustomers:
      open && customers.status === "available"
        ? available(
            new Set(open.flatMap((r) => (r.customer_id ? [r.customer_id] : [])))
              .size,
          )
        : unavailable(),
    period: start,
  };
}
export type Metrics = Awaited<ReturnType<typeof readMetrics>>;

export async function readDirectory(client: SupabaseClient) {
  const [customers, contacts] = await Promise.all([
    readRows<Customer>(client, "customers", customerColumns, isCustomer),
    readRows<Contact>(client, "customer_channels", contactColumns, isContact, {
      eq: ["channel_type", "whatsapp"],
    }),
  ]);
  return { customers, contacts };
}
export type Directory = Awaited<ReturnType<typeof readDirectory>>;
const normalized = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
export function searchDirectory(directory: Directory, term: string, page = 1) {
  if (directory.customers.status !== "available") return null;
  const query = normalized(term.slice(0, 120));
  const digits = query.replace(/\D/g, "");
  const contacts =
    directory.contacts.status === "available" ? directory.contacts.data : [];
  const matches = directory.customers.data
    .filter(
      (customer) =>
        normalized(customer.display_name).includes(query) ||
        contacts.some(
          (contact) =>
            contact.customer_id === customer.id &&
            (normalized(contact.channel_address).includes(query) ||
              (digits.length >= 3 &&
                !/[a-z]/i.test(query) &&
                contact.channel_address.replace(/\D/g, "").includes(digits))),
        ),
    )
    .sort(
      (a, b) =>
        Date.parse(b.created_at) - Date.parse(a.created_at) ||
        a.id.localeCompare(b.id),
    );
  const pages = Math.max(1, Math.ceil(matches.length / 25));
  const current = Math.min(
    pages,
    Math.max(1, Number.isSafeInteger(page) ? page : 1),
  );
  return {
    rows: matches.slice((current - 1) * 25, current * 25),
    total: matches.length,
    pages,
    page: current,
  };
}

export async function readCustomer(client: SupabaseClient, id: string) {
  if (!uuid(id)) return { status: "not_found" as const };
  const customer = await readRows<Customer>(
    client,
    "customers",
    customerColumns,
    isCustomer,
    { eq: ["id", id] },
  );
  if (customer.status === "unavailable")
    return { status: "unavailable" as const };
  if (customer.data.length !== 1 || customer.data[0].id !== id)
    return { status: "not_found" as const };
  const [contacts, vehicles, requests] = await Promise.all([
    readRows<Contact>(
      client,
      "customer_channels",
      contactColumns,
      (r) => isContact(r) && r.customer_id === id,
      { eq: ["channel_type", "whatsapp"], ids: ["customer_id", [id]] },
    ),
    readRows<Vehicle>(
      client,
      "customer_vehicles",
      "id,customer_id,brand,model,year,plate,current_mileage,active",
      (r) =>
        uuid(r.id) &&
        r.customer_id === id &&
        text(r.brand) &&
        text(r.model) &&
        (r.plate === null || typeof r.plate === "string") &&
        (r.year === null || Number.isInteger(r.year)) &&
        (r.current_mileage === null ||
          (typeof r.current_mileage === "number" &&
            Number.isFinite(r.current_mileage) &&
            r.current_mileage >= 0)) &&
        typeof r.active === "boolean",
      { eq: ["customer_id", id] },
    ),
    readRows<Request>(
      client,
      "service_requests",
      requestColumns,
      (r) => isRequest(r) && r.customer_id === id,
      { eq: ["customer_id", id] },
    ),
  ]);
  let events: Source<RequestEvent[]> = unavailable();
  if (requests.status === "available") {
    // Keep IN filters below URL limits. All chunks must succeed, otherwise no timeline.
    const ids = requests.data.map((r) => r.id);
    const collected: RequestEvent[] = [];
    events = available(collected);
    for (let offset = 0; offset < ids.length; offset += 50) {
      const chunk = ids.slice(offset, offset + 50);
      const part = await readRows<RequestEvent>(
        client,
        "service_request_events",
        "id,service_request_id,event_type,actor_role,channel,created_at",
        (r) =>
          uuid(r.id) &&
          chunk.includes(String(r.service_request_id)) &&
          text(r.event_type) &&
          ["customer", "concierge", "provider", "admin", "system"].includes(
            String(r.actor_role),
          ) &&
          ["app", "whatsapp", "system"].includes(String(r.channel)) &&
          date(r.created_at),
        { ids: ["service_request_id", chunk] },
      );
      if (part.status === "unavailable") {
        events = part;
        break;
      }
      collected.push(...part.data);
      if (collected.length > 5000) {
        events = unavailable("limit");
        break;
      }
    }
    collected.sort(
      (a, b) =>
        Date.parse(b.created_at) - Date.parse(a.created_at) ||
        a.id.localeCompare(b.id),
    );
  }
  return {
    status: "available" as const,
    customer: customer.data[0],
    contacts,
    vehicles,
    requests,
    events,
  };
}
export type CustomerDetail = Extract<
  Awaited<ReturnType<typeof readCustomer>>,
  { status: "available" }
>;
