import assert from "node:assert/strict";
import test from "node:test";

import {
  chargingTypeLabel,
  formatEnergyEfficiency,
  formatEnergyQuantity,
  mergeEnergyHistory,
} from "../src/customer-journey.ts";

// The unified energy screen merges combustion (liters) and electric (kWh)
// records into a single unit-correct history: liters never become kWh and the
// recorded units/efficiency strings must stay channel-specific..

test("mergeEnergyHistory combines fuel and charging logs sorted newest first", () => {
  const fuelLogs = [
    { id: "f1", vehicleId: "v-1", recordedAt: "2026-01-10T10:00:00Z", odometerValue: 50000, liters:  40, totalAmount:  340, fuelType: "gasolina", consumptionKmpl: 12.5, note: null, createdAt: "" },
    { id: "f2", vehicleId: "v-1", recordedAt: "2026-03-10T10:00:00Z", odometerValue: 50500, liters:  41, totalAmount:  350, fuelType: "etanol", consumptionKmpl: null, note: "posto", createdAt: "" },
  ];
  const chargingLogs = [
    { id: "c1", vehicleId: "v-1", recordedAt: "2026-02-10T10:00:00Z", odometerValue: 50200, kwh:  38, totalAmount:  98, batteryPercent: 87, chargingType: "recarga_rapida", consumptionKmKwh:  7.4, note: null, createdAt: "" },
  ];
  const merged = mergeEnergyHistory(fuelLogs, chargingLogs);
  assert.equal(merged.length, 3);
  assert.deepEqual(merged.map((entry) => entry.id), ["f2", "c1", "f1"]);
  assert.deepEqual(merged.map((entry) => entry.kind), ["fuel", "charging", "fuel"]);
  assert.equal(merged[0].quantity, 41);
  assert.equal(merged[0].unit, "L");
  assert.equal(merged[1].quantity, 38);
  assert.equal(merged[1].unit, "kWh");
  assert.equal(merged[1].batteryPercent, 87);
  assert.equal(merged[1].chargingType, "recarga_rapida");
  assert.equal(merged[2].fuelType, "gasolina");
});

test("formatEnergyQuantity and formatEnergyEfficiency keep fuel/charging units apart", () => {
  assert.equal(formatEnergyQuantity(40.5, "L"), "40,5 L");
  assert.equal(formatEnergyQuantity(38, "kWh"), "38 kWh");
  const fuelEntry = {
    kind: "fuel",
    id: "f",
    recordedAt: "",
    odometerValue: 0,
    quantity: 40,
    unit: "L",
    totalAmount: 0,
    fuelType: "gasolina",
    chargingType: null,
    batteryPercent: null,
    efficiency: 12.5,
    note: null,
  };
  const chargingEntry = {
    kind: "charging",
    id: "c",
    recordedAt: "",
    odometerValue: 0,
    quantity: 30,
    unit: "kWh",
    totalAmount: 0,
    chargingType: "outro",
    batteryPercent: null,
    efficiency: 6.2,
    note: null,
  };
  assert.match(formatEnergyEfficiency(fuelEntry), /km\/L/);
  assert.match(formatEnergyEfficiency(chargingEntry),/km\/kWh/);
  assert.equal(formatEnergyEfficiency({ ...fuelEntry, efficiency: null }), "Sem intervalo válido para calcular consumo.");
});

test("chargingTypeLabel renders known and unknown charging types safely", () => {
  assert.equal(chargingTypeLabel("recarga_domestica"), "Recarga doméstica");
  assert.equal(chargingTypeLabel("recarga_publica"), "Recarga pública");
  assert.equal(chargingTypeLabel("recarga_rapida"), "Recarga rápida");
  assert.equal(chargingTypeLabel("outro"), "Outro");
  assert.equal(chargingTypeLabel(null), "Recarga");
  assert.equal(chargingTypeLabel(undefined), "Recarga");
});