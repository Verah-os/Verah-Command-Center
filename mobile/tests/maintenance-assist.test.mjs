import assert from "node:assert/strict";
import test from "node:test";

import {
  applyMaintenanceAssistedDraft,
  buildMaintenanceAssistedDraft,
  shouldConfirmAssistedSave,
} from "../src/maintenance-assist.ts";

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

test("applying the assisted draft populates editable fields first without clobbering user edits", () => {
  const draft = buildMaintenanceAssistedDraft({
    note: "Troca de óleo",
    today: "2026-09-09",
    hasReceiptFile: true,
  });
  // Simulate fields the user has already typed before using the assisted draft:
  const userTyped = {
    type: "troca de óleo",
    description: "",
    date: "",
    km: "85000",
    amount: "300,00",
    nextDate: "",
    nextKm: "",
  };
  const applied = applyMaintenanceAssistedDraft(userTyped, draft);
  // The draft fills notification/date placeholder only: km/amount typed by the user
  // are preserved so the final save uses the currently edited (latest) values.
  assert.equal(applied.type, "troca de óleo");
  assert.equal(applied.km, "85000");
  assert.equal(applied.amount, "300,00");
  assert.equal(applied.date, "2026-09-09");
  assert.equal(applied.description, "Nota do recibo: Troca de óleo");
  assert.notEqual(applied, userTyped);  // fresh values, never stale closures
  assert.deepEqual(Object.keys(applied).sort(), Object.keys(userTyped).sort());
});

test("assisted save requires explicit confirmation only when active draft presentes", () => {
  const draft = buildMaintenanceAssistedDraft({ note: "Troca", today: "2026-09-09", hasReceiptFile: true });
  assert.equal(shouldConfirmAssistedSave(draft, true), true);
  assert.equal(shouldConfirmAssistedSave(null, true), false);
  assert.equal(shouldConfirmAssistedSave(draft, false), false);
  // Draft without receipt note has no assisted fields: no extra confirmation needed.
  const emptyDraft = buildMaintenanceAssistedDraft({ note: "", today: "2026-09-09", hasReceiptFile: false });
  assert.equal(shouldConfirmAssistedSave(emptyDraft, true), true);
});