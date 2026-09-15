import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// #266 — the physical Alpha blocker: "Não foi possível consultar o catálogo
// FIPE agora" left the customer stuck on first-vehicle onboarding with no
// usable manual fallback. These repository-safe assertions pin the contract:
// a bounded, external FIPE call that degrades into direct manual entry
// (plate/brand/model/model-year required, rest optional), persisting only
// through the canonical journey/controller + confirm_customer_vehicle —
// never a fixture, cache or parallel vehicle state.

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("FIPE catalog calls are bounded in the mobile catalog module", async () => {
  const source = await read("mobile/src/fipe-catalog.ts");
  // The edge-function invocation must be time-boxed so a stalled provider
  // fails predictably and exposes manual onboarding.
  assert.match(source, /FIPE_CATALOG_TIMEOUT_MS/);
  assert.match(source, /timeout:\s*FIPE_CATALOG_TIMEOUT_MS/);
  // The configured-but-unavailable provider remains distinguishable from the
  // generic error and keeps the existing customer-facing copy.
  assert.match(source, /O catálogo FIPE ainda não está configurado na VERAH\./);
});

test("timeout policy is a fixed 10s and lives in a pure module", async () => {
  const timeout = await read("mobile/src/fipe-catalog-timeout.ts");
  assert.match(timeout, /FIPE_CATALOG_TIMEOUT_MS\s*=\s*10_000/);
  // No imports at all: the constant is unit-testable in plain Node CI.
  assert.doesNotMatch(timeout, /^\s*import\s/m);
});

test("manual onboarding is a first-class entry option", async () => {
  const step = await read("mobile/src/VehicleOnboardingStep.tsx");
  // Direct "Cadastrar manualmente" option in the initial choice screen.
  assert.match(step, /ChoiceCard/);
  assert.match(step, /Cadastrar manualmente/);
  assert.match(step, /sem depender do catálogo FIPE/);
  // Same fallback surfaces after a FIPE error/timeout, keeping the plate.
  assert.match(step, /mode !== "manual" && error/);
  assert.match(step, /manualWithPlate/);
});

test("manual entry exposes the canonical minimums and leaves the rest optional", async () => {
  const step = await read("mobile/src/VehicleOnboardingStep.tsx");
  const manual = step.slice(step.indexOf('mode === "manual" ? ('), step.indexOf(') : null}'));

  for (const required of ["Fabricante", "Modelo", "Ano/modelo"]) {
    assert.ok(manual.includes(required), `manual form must require: ${required}`);
  }
  // Version, fuel and transmission remain optional.
  for (const optional of ["Versão (opcional)", "Combustível (opcional)", "Câmbio (opcional)"]) {
    assert.ok(manual.includes(optional), `manual form must keep optional: ${optional}`);
  }
});

test("manual path reuses the canonical confirm flow without parallel state", async () => {
  const step = await read("mobile/src/VehicleOnboardingStep.tsx");
  // Saving goes through the exact same journey controller/handler used by the
  // FIPE path; no dedicated RPC/table/cache is introduced.
  assert.match(step, /controller\.confirmVehicle\(/);
  assert.doesNotMatch(step, /AsyncStorage|localStorage/);
  const journey = await read("mobile/src/customer-journey.ts");
  // The manual draft is persisted through confirm_customer_vehicle ("manual"
  // lookup source is the canonical provenance) and never through a fixture.
  assert.match(journey, /confirmVehicle\(prepared\.draft\)/);
  assert.match(journey, /modelYear/);
  assert.doesNotMatch(journey, /vehicleOnboardingCache|fixture/);
});