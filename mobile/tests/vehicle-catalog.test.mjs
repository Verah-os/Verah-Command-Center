import assert from "node:assert/strict";
import test from "node:test";

import {
  modelsForBrand,
  vehicleBrands,
} from "../src/vehicle-catalog.ts";

test("vehicle catalog exposes the same guided brands used by the web flow", () => {
  assert.ok(vehicleBrands.includes("Volkswagen"));
  assert.ok(vehicleBrands.includes("Toyota"));
  assert.ok(vehicleBrands.includes("Honda"));
});

test("models are constrained by selected brand", () => {
  assert.ok(modelsForBrand("Volkswagen").includes("Polo"));
  assert.ok(modelsForBrand("Volkswagen").includes("Fox"));
  assert.deepEqual(modelsForBrand("Marca inexistente"), []);
});
