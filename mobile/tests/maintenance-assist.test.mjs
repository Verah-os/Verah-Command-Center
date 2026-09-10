import assert from "node:assert/strict";
import test from "node:test";

import { buildMaintenanceAssistedDraft } from "../src/maintenance-assist.ts";

test("assisted draft is fail-closed: no km/value/next fields are extrapolated", () => {
  const draft = buildMaintenanceAssistedDraft({
    note: "Troca de óleo, R$ 300",
    today: "2026-09-09",
    hasReceiptFile: true,
  });
  assert.equal(draft.requiresConfirmation, true);
  assert.equal(draft.hasReceiptFile, true);
  assert.equal(draft.km, "");
  assert.equal(draft.amount, "");
  assert.equal(draft.nextKm, "");
  assert.equal(draft.nextDate, "");
  assert.equal(draft.date, "2026-09-09");
  assert.equal(draft.description, "Nota do recibo: Troca de óleo, R$ 300");
});

test("assisted draft without note falls back to receipt hint", () => {
  const draft = buildMaintenanceAssistedDraft({
    note: "",
    today: "2026-09-09",
    hasReceiptFile: false,
  });
  assert.equal(draft.hasReceiptFile, false);
  assert.equal(draft.requiresConfirmation, true);
  assert.equal(draft.description, "Recibo anexado como documento privado do veículo.");
  assert.equal(draft.km, "");
});

test("assisted draft never derives odometer/value/date from the photo", () => {
  for (const note of [
    "odômetro 85000, valor R$ 300, data 2026-08-01, próxima 2026-09-01",
    "km: 85000 | R$ 300 | troca filtro",
  ]) {
    const draft = buildMaintenanceAssistedDraft({ note, today: "2026-09-09", hasReceiptFile: true });
    assert.equal(draft.km, "", `km for "${note}"`);
    assert.equal(draft.amount, "", `amount for "${note}"`);
    assert.equal(draft.nextKm, "", `nextKm for "${note}"`);
    assert.equal(draft.nextDate, "", `nextDate for "${note}"`);
    assert.equal(draft.date, "2026-09-09");
    assert.equal(draft.requiresConfirmation, true);
  }
});