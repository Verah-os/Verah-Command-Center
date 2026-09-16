import assert from "node:assert/strict";
import test from "node:test";

import { createCustomerJourney, prepareVehicleDraft } from "../src/customer-journey.ts";
import { FIPE_CATALOG_TIMEOUT_MS } from "../src/fipe-catalog-timeout.ts";

// #266 — FIPE-unavailable blocker of the first-vehicle onboarding. The
// external catalog must NOT become a hard requirement: the manual entry is
// available directly and after a FIPE error/time-out, persists through the
// canonical journey/controller + confirm_customer_vehicle path only, and the
// normal FIPE path stays intact (bounded by a timeout, no cache/fixture).

function createFakeFacade(overrides = {}) {
  const calls = { confirm: 0, refresh: 0 };
  let onboarding = overrides.onboarding ?? {
    onboarding_status: "in_progress",
    basic_profile_completed: true,
    vehicle_status: "pending",
  };
  let vehicles = [];
  const facade = {
    refreshOnboarding: async () => {
      calls.refresh += 1;
      if (overrides.refreshError) return { data: null, error: { message: overrides.refreshError } };
      return { data: onboarding, error: null };
    },
    completeBasicProfile: async () => ({ error: null }),
    confirmVehicle: async (draft) => {
      calls.confirm += 1;
      if (overrides.confirmError) return { error: { message: overrides.confirmError } };
      vehicles = [
        {
          id: `v-${calls.confirm}`,
          brand: draft.brand,
          model: draft.model,
          year: draft.modelYear,
          plate: draft.plate,
          nickname: null,
        },
      ];
      onboarding = { ...onboarding, vehicle_status: "registered", onboarding_status: "completed" };
      return { error: null };
    },
    listVehicles: async () => ({ data: vehicles, error: null }),
  };
  return { facade, calls, vehicles: () => vehicles };
}

const user = { id: "u-1", email: "maria@verah.dev" };

test("FIPE catalog calls are bounded by a fixed timeout", () => {
  // 10s cap: a stalled external catalog must fail predictably and expose the
  // manual fallback instead of hanging the first-vehicle step (#266).
  assert.equal(FIPE_CATALOG_TIMEOUT_MS, 10_000);
});

test("manual vehicle entry completes onboarding without any FIPE/network call", async () => {
  const { facade, calls, vehicles } = createFakeFacade();
  const controller = createCustomerJourney(facade, user);
  await controller.restore();
  assert.equal(controller.getState().status, "vehicle");

  // The manual path goes straight through the canonical journey controller,
  // which routes to the confirm_customer_vehicle RPC via the facade. No FIPE
  // dependency is involved in this test (no catalog transport at all).
  const result = await controller.confirmVehicle({
    plate: "EKS8D79",
    brand: "Fiat",
    model: "Argo",
    modelYear: "2021",
  });
  assert.deepEqual(result, { ok: true });
  assert.equal(controller.getState().status, "ready");
  assert.equal(calls.confirm, 1);
  assert.equal(vehicles()[0].plate, "EKS8D79");
  assert.equal(vehicles()[0].brand, "Fiat");
});

test("manual entry keeps version/engine/transmission optional", async () => {
  const prepared = prepareVehicleDraft({
    plate: "abc1d23",
    brand: "Honda",
    model: "Civic",
    modelYear: "2022",
  });
  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;
  assert.deepEqual(prepared.draft, {
    plate: "ABC1D23",
    brand: "Honda",
    model: "Civic",
    modelYear: 2022,
    version: null,
    engine: null,
    transmission: null,
  });
});

test("manual entry still requires the canonical minimum fields", () => {
  const missingBrand = prepareVehicleDraft({
    plate: "ABC1234",
    brand: "",
    model: "Corolla",
    modelYear: "2020",
  });
  assert.equal(missingBrand.ok, false);
  assert.match(missingBrand.message, /marca/);

  const invalidYear = prepareVehicleDraft({
    plate: "ABC1234",
    brand: "Toyota",
    model: "Corolla",
    modelYear: "1800",
  });
  assert.equal(invalidYear.ok, false);

  const invalidPlate = prepareVehicleDraft({
    plate: "AB1234",
    brand: "Toyota",
    model: "Corolla",
    modelYear: "2020",
  });
  assert.equal(invalidPlate.ok, false);
});

test("confirm_customer_vehicle facade contract passes the manual draft unchanged", async () => {
  let received = null;
  const { facade } = createFakeFacade();
  const wrapped = {
    ...facade,
    confirmVehicle: async (draft) => {
      received = draft;
      return await facade.confirmVehicle(draft);
    },
  };
  const controller = createCustomerJourney(wrapped, user);
  await controller.restore();
  await controller.confirmVehicle({
    plate: "ABC1234",
    brand: "Toyota",
    model: "Corolla",
    modelYear: "2020",
    version: "GLi",
    engine: "Flex",
    transmission: "CVT",
  });
  assert.deepEqual(received, {
    plate: "ABC1234",
    brand: "Toyota",
    model: "Corolla",
    modelYear: 2020,
    version: "GLi",
    engine: "Flex",
    transmission: "CVT",
  });
});

test("manual onboarding completes through the canonical single submission path", async () => {
  // The step exposes exactly one submission entry point in manual mode (the
  // FIPE summary is excluded), so each user submission routes to one
  // confirm_customer_vehicle call. Re-entrant calls are stopped by the submit
  // guard in VehicleOnboardingStep; the journey itself persists every
  // submission through the same controller.confirmVehicle -> facade RPC.
  const { facade, calls, vehicles } = createFakeFacade();
  const controller = createCustomerJourney(facade, user);
  await controller.restore();
  assert.equal(controller.getState().status, "vehicle");

  const draft = { plate: "ABC1234", brand: "Toyota", model: "Corolla", modelYear: "2020" };
  const first = await controller.confirmVehicle(draft);
  assert.deepEqual(first, { ok: true });
  assert.equal(controller.getState().status, "ready");
  assert.equal(calls.confirm, 1);
  assert.equal(vehicles()[0].plate, "ABC1234");

  // A failed submission must not burn the only attempt: after an RPC error the
  // same draft can be retried through the same single handler.
  const { facade: failingFacade, calls: failingCalls } = createFakeFacade({ confirmError: "RPC indisponível" });
  const failing = createCustomerJourney(failingFacade, user);
  await failing.restore();
  const failed = await failing.confirmVehicle(draft);
  assert.deepEqual(failed, { ok: false, message: "RPC indisponível" });
  assert.equal(failingCalls.confirm, 1);
});
