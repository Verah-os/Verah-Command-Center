import assert from "node:assert/strict";
import test from "node:test";

import { prepareServiceRequest } from "../src/service-request.ts";
import {
  projectRefFromUrl,
  resolveVerahEnvironmentDescriptor,
} from "../src/config.ts";

const base = {
  vehicleId: "vehicle-1",
  state: "sp",
  city: "Franca",
  address: "Rua Acácio de Lima, 452",
  report: "O carro começou a falhar e acendeu uma luz no painel.",
  urgency: "media",
  pickupSource: "manual_address",
};

test("normalizes and accepts manual pickup address", () => {
  const result = prepareServiceRequest(base);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.draft.state, "SP");
  assert.equal(result.draft.pickupSource, "manual_address");
  assert.equal(result.draft.latitude, null);
});

test("manual address remains a full fallback", () => {
  const result = prepareServiceRequest({ ...base, address: "Rua 1" });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.message, /endereço/);
});

test("device location requires valid coordinates", () => {
  const invalid = prepareServiceRequest({
    ...base,
    address: "",
    pickupSource: "device_location",
    latitude: null,
    longitude: null,
  });
  assert.equal(invalid.ok, false);

  const valid = prepareServiceRequest({
    ...base,
    address: "",
    pickupSource: "device_location",
    latitude: -20.5386,
    longitude: -47.4008,
  });
  assert.equal(valid.ok, true);
});

test("rejects too-short customer report", () => {
  const result = prepareServiceRequest({ ...base, report: "barulho" });
  assert.equal(result.ok, false);
});

// #266 — the mobile build must expose a non-secret, smoke-friendly descriptor
// of the canonical Alpha/staging backend it was wired to, and fail closed when
// the configured environment is forbidden (never production).
test("derives the canonical project ref from a hosted Supabase URL", () => {
  assert.equal(
    projectRefFromUrl("https://wxnklnbntgpcncajzpsj.supabase.co"),
    "wxnklnbntgpcncajzpsj",
  );
  assert.equal(projectRefFromUrl("http://127.0.0.1:54321"), null);
  assert.equal(projectRefFromUrl(""), null);
  assert.equal(projectRefFromUrl("https://evil.example.com"), null);
});

test("resolveVerahEnvironmentDescriptor exposes a non-secret channel descriptor", () => {
  const descriptor = resolveVerahEnvironmentDescriptor({
    EXPO_PUBLIC_SUPABASE_URL: "https://wxnklnbntgpcncajzpsj.supabase.co",
    EXPO_PUBLIC_SUPABASE_ANON_KEY: "anon-jwt",
    EXPO_PUBLIC_SUPABASE_ENVIRONMENT: "staging",
  });
  assert.deepEqual(descriptor, {
    channel: "mobile",
    environment: "staging",
    projectRef: "wxnklnbntgpcncajzpsj",
    url: "https://wxnklnbntgpcncajzpsj.supabase.co",
  });
});

test("resolveVerahEnvironmentDescriptor fails closed without a backend contract", () => {
  assert.equal(resolveVerahEnvironmentDescriptor({}), null);
  assert.equal(
    resolveVerahEnvironmentDescriptor({
      EXPO_PUBLIC_SUPABASE_URL: "https://wxnklnbntgpcncajzpsj.supabase.co",
      EXPO_PUBLIC_SUPABASE_ANON_KEY: "service_role_secret",
      EXPO_PUBLIC_SUPABASE_ENVIRONMENT: "staging",
    }),
    null,
  );
});

test("resolveVerahEnvironmentDescriptor fails closed on a forbidden environment", () => {
  assert.equal(
    resolveVerahEnvironmentDescriptor({
      EXPO_PUBLIC_SUPABASE_URL: "https://wxnklnbntgpcncajzpsj.supabase.co",
      EXPO_PUBLIC_SUPABASE_ANON_KEY: "anon-jwt",
      EXPO_PUBLIC_SUPABASE_ENVIRONMENT: "production",
    }),
    null,
  );
  assert.equal(
    resolveVerahEnvironmentDescriptor({
      EXPO_PUBLIC_SUPABASE_URL: "https://wxnklnbntgpcncajzpsj.supabase.co",
      EXPO_PUBLIC_SUPABASE_ANON_KEY: "anon-jwt",
      EXPO_PUBLIC_SUPABASE_ENVIRONMENT: "live",
    }),
    null,
  );
});
