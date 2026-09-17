import assert from "node:assert/strict";
import test from "node:test";
import { loadTs } from "./helpers/load-ts.mjs";
import { requireCanonicalWebEnvironment } from "../lib/verah-environment.ts";
import { prepareServiceRequest } from "../mobile/src/service-request.ts";

const url = "https://wxnklnbntgpcncajzpsj.supabase.co";
test("web runtime rejects a different hosted backend even without EAS variables", () => {
  assert.equal(requireCanonicalWebEnvironment({ supabaseUrl: url, anonKey: "test" }).projectRef, "wxnklnbntgpcncajzpsj");
  assert.throws(() => requireCanonicalWebEnvironment({ supabaseUrl: "https://other.supabase.co", anonKey: "test" }), /Backend Alpha incorreto/);
  assert.throws(() => requireCanonicalWebEnvironment({ supabaseUrl: url, anonKey: "test", environment: "production" }), /fora do canônico/);
  assert.throws(() => requireCanonicalWebEnvironment({ supabaseUrl: "", anonKey: "" }), /sem backend/);
  assert.equal(requireCanonicalWebEnvironment({ supabaseUrl: "http://127.0.0.1:54321", anonKey: "test" }).projectRef, null);
});

function transport() {
  const rows = [];
  let fail = false;
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "customer-user" } } }) },
    rpc: async () => ({ data: [], error: null }),
    from(table) {
      let inserted;
      return {
        select() { return this; }, eq() { return this; },
        async maybeSingle() {
          return { error: null, data: table === "customers" ? { id: "customer", display_name: "Synthetic" } : { id: "vehicle", brand: "Toyota", model: "Corolla", year: 2022, plate: "ABC1234" } };
        },
        insert(value) { assert.equal(table, "service_requests"); inserted = value; return this; },
        async single() {
          const row = { ...inserted, id: "request", created_at: new Date().toISOString() };
          rows.push(row);
          return { data: row, error: null };
        },
        async order() {
          assert.equal(table, "service_requests");
          return fail ? { data: null, error: { message: "permission denied" } } : { data: rows, error: null };
        },
      };
    },
  };
  return { client, rows, setFailure: () => { fail = true; } };
}

test("real mobile insert -> real concierge list returns the SAME canonical row; query errors never become zero", async () => {
  const db = transport();
  const mobile = loadTs("mobile/src/service-request-supabase.ts", {
    "./supabase": { getSupabaseClient: () => db.client }, "./service-request": { prepareServiceRequest },
  });
  const concierge = loadTs("services/service-requests/service-requests-service.ts", {
    "@/lib/env": { env: { supabaseUrl: url, supabaseAnonKey: "test" } },
    "@/services/supabase/server": { createSupabaseServerClient: async () => db.client },
  });
  assert.deepEqual(await concierge.listConciergeServiceRequests(), []);
  const result = await mobile.createMobileServiceRequest({ vehicleId: "vehicle", state: "SP", city: "Franca", address: "Rua de Teste, 100", pickupSource: "manual_address", report: "O veículo começou a apresentar uma falha.", urgency: "media" });
  assert.equal(result.ok, true);
  const [request] = await concierge.listConciergeServiceRequests();
  assert.equal(request.id, result.request.id);
  assert.equal(request.customerId, "customer");
  assert.equal(request.vehicleId, "vehicle");
  assert.equal(db.rows[0].created_by, "customer-user");
  assert.equal(request.serviceStage, "solicitado");
  assert.equal(request.requiresHumanReview, true);
  assert.equal(db.rows.length, 1);
  db.setFailure();
  await assert.rejects(concierge.listConciergeServiceRequests(), /fila não foi carregada/);
  await assert.rejects(concierge.getConciergeStats(), /fila não foi carregada/);
});

