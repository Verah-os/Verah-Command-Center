import { getSupabaseClient } from "./supabase";

export type FipeCatalogOption = {
  id: string;
  name: string;
};

export type FipeVehicleDetail = {
  brand: string;
  model: string;
  modelYear: number;
  fuel: string | null;
  codeFipe: string | null;
  price: string | null;
  referenceMonth: string | null;
};

type CatalogAction = "brands" | "models" | "years" | "detail";
type CatalogArgs = {
  action: CatalogAction;
  brandId?: string;
  modelId?: string;
  yearId?: string;
};

type FunctionEnvelope = {
  ok?: boolean;
  data?: unknown;
  error?: string;
};

function firstString(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function normalizeOptions(value: unknown): FipeCatalogOption[] {
  const rows = Array.isArray(value)
    ? value
    : value && typeof value === "object"
      ? ((value as Record<string, unknown>).data ?? (value as Record<string, unknown>).items ?? [])
      : [];

  if (!Array.isArray(rows)) return [];

  return rows.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const id = firstString(row, ["id", "code", "value", "codigo"]);
    const name = firstString(row, ["name", "label", "nome", "model", "brand"]);
    return id && name ? [{ id, name }] : [];
  });
}

async function invokeCatalog(args: CatalogArgs) {
  const client = getSupabaseClient();
  if (!client) throw new Error("A conexão com a VERAH não está configurada neste build.");

  const { data, error } = await client.functions.invoke<FunctionEnvelope>("vehicle-fipe-catalog", {
    body: args,
  });

  if (error) throw new Error("Não foi possível consultar o catálogo FIPE agora.");
  if (!data?.ok) {
    if (data?.error === "provider_not_configured") {
      throw new Error("O catálogo FIPE ainda não está configurado no backend da VERAH.");
    }
    if (data?.error === "provider_error") {
      throw new Error("A FIPE API recusou a consulta. Tente novamente em instantes.");
    }
    throw new Error("Não foi possível consultar o catálogo FIPE agora.");
  }
  return data.data;
}

export async function listFipeBrands() {
  return normalizeOptions(await invokeCatalog({ action: "brands" }));
}

export async function listFipeModels(brandId: string) {
  return normalizeOptions(await invokeCatalog({ action: "models", brandId }));
}

export async function listFipeYears(brandId: string, modelId: string) {
  return normalizeOptions(await invokeCatalog({ action: "years", brandId, modelId }));
}

export async function getFipeVehicleDetail(
  brandId: string,
  modelId: string,
  yearId: string,
): Promise<FipeVehicleDetail> {
  const value = await invokeCatalog({ action: "detail", brandId, modelId, yearId });
  if (!value || typeof value !== "object") throw new Error("A FIPE API retornou dados inválidos.");
  const row = value as Record<string, unknown>;
  const brand = firstString(row, ["brand", "marca"]);
  const model = firstString(row, ["model", "modelo"]);
  const modelYearRaw = row.modelYear ?? row.model_year ?? row.anoModelo ?? row.ano_modelo;
  const modelYear = Number(modelYearRaw);
  if (!brand || !model || !Number.isInteger(modelYear)) {
    throw new Error("A FIPE API retornou dados incompletos para este veículo.");
  }
  return {
    brand,
    model,
    modelYear,
    fuel: firstString(row, ["fuel", "combustivel"]),
    codeFipe: firstString(row, ["codeFipe", "code_fipe", "codigoFipe"]),
    price: firstString(row, ["price", "preco", "valor"]),
    referenceMonth: firstString(row, ["referenceMonth", "reference_month", "mesReferencia"]),
  };
}
