import assert from "node:assert/strict";
import test from "node:test";

import { prepareServiceRequest } from "../src/service-request.ts";

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
