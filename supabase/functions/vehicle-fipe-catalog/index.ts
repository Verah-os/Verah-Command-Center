import "jsr:@supabase/functions-js/edge-runtime.d.ts";

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

const API_BASE = "https://fipe.api.br/api/v2/cars";
const jsonHeaders = {
  "Content-Type": "application/json",
  "Cache-Control": "private, max-age=60",
};

type RequestBody = {
  action?: "brands" | "models" | "years" | "detail";
  brandId?: string | number;
  modelId?: string | number;
  yearId?: string;
};

function respond(message: string, status: number) {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: jsonHeaders,
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return respond("method_not_allowed", 405);

  const token = Deno.env.get("FIPE_API_TOKEN");
  if (!token) return respond("provider_not_configured", 503);

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return respond("invalid_json", 400);
  }

  let path = "";
  if (body.action === "brands") {
    path = "/brands";
  } else if (body.action === "models") {
    if (body.brandId === undefined || body.brandId === null) return respond("brand_id_required", 400);
    path = `/brands/${encodeURIComponent(String(body.brandId))}/models`;
  } else if (body.action === "years") {
    if (body.brandId === undefined || body.brandId === null) return respond("brand_id_required", 400);
    if (body.modelId === undefined || body.modelId === null) return respond("model_id_required", 400);
    path = `/brands/${encodeURIComponent(String(body.brandId))}/models/${encodeURIComponent(String(body.modelId))}/years`;
  } else if (body.action === "detail") {
    if (body.brandId === undefined || body.brandId === null) return respond("brand_id_required", 400);
    if (body.modelId === undefined || body.modelId === null) return respond("model_id_required", 400);
    if (!body.yearId) return respond("year_id_required", 400);
    path = `/brands/${encodeURIComponent(String(body.brandId))}/models/${encodeURIComponent(String(body.modelId))}/years/${encodeURIComponent(body.yearId)}`;
  } else {
    return respond("unsupported_action", 400);
  }

  try {
    const upstream = await fetch(`${API_BASE}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });

    const text = await upstream.text();
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { message: text.slice(0, 300) };
    }

    if (!upstream.ok) {
      console.error("FIPE provider error", upstream.status);
      return new Response(
        JSON.stringify({ ok: false, error: "provider_error", providerStatus: upstream.status }),
        { status: upstream.status === 429 ? 429 : 502, headers: jsonHeaders },
      );
    }

    return new Response(JSON.stringify({ ok: true, data: payload }), {
      status: 200,
      headers: jsonHeaders,
    });
  } catch (error) {
    console.error("FIPE request failed", error instanceof Error ? error.message : "unknown");
    return respond("provider_unavailable", 502);
  }
});