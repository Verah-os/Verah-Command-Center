import assert from "node:assert/strict";
import test from "node:test";

import { createCustomerJourney } from "../src/customer-journey.ts";
import {
  MAX_VEHICLE_DOCUMENT_BYTES,
  registerVehicleDocumentSafely,
  sortVehicleDocuments,
  validateVehicleDocumentInput,
  vehicleDocumentIdempotencyKey,
  VEHICLE_DOCUMENT_KINDS,
  VEHICLE_DOCUMENT_MIME_TYPES,
} from "../src/vehicle-documents.ts";

const today = "2026-09-09";

function blob(size = 1024, type = "application/pdf") {
  return new Blob([new Uint8Array(size)], { type });
}

const validInput = {
  documentKind: "nota_fiscal",
  documentDate: "2026-09-01",
  fileName: "  nota-123.pdf  ",
  mimeType: "application/pdf",
  reference: "  123  ",
  note: "  Manutenção anual  ",
  idempotencyKey: "vehicle-document:nota_fiscal:2026-09-01:nota-123.pdf:1024",
};

test("accepts a valid document input and normalizes payload fields", () => {
  const result = validateVehicleDocumentInput(validInput, 1024, today, "v-1");
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.documentKind, "nota_fiscal");
  assert.equal(result.data.fileName, "nota-123.pdf");
  assert.equal(result.data.reference, "123");
  assert.equal(result.data.note, "Manutenção anual");
  assert.equal(result.data.sizeBytes, 1024);
  assert.equal(result.data.vehicleId, "v-1");
});

test("rejects invalid documents locally without calling the storage/RPC", async () => {
  const cases = [
    { input: { ...validInput, documentKind: "recibo" }, size: 1024, message: /tipo de documento/ },
    { input: { ...validInput, documentDate: "2026-09-10" }, size: 1024, message: /data válida/ },
    { input: { ...validInput, fileName: "   " }, size:  1024, message: /nome do arquivo/ },
    { input: { ...validInput, mimeType: "text/plain" }, size:  1024, message: /não suportado/ },
    { input: { ...validInput, mimeType: "" }, size:  1024, message: /não suportado/ },
    { input: { ...validInput }, size: MAX_VEHICLE_DOCUMENT_BYTES + 1, message: /10 MiB/ },
    { input: { ...validInput, reference: "x".repeat(81) }, size:  1024, message: /80/ },
    { input: { ...validInput, note: "y".repeat(161) }, size:  1024, message: /160/ },
    { input: { ...validInput, idempotencyKey: "   " }, size:  1024, message: /erro ao preparar/ },
    { input: { ...validInput, idempotencyKey: "k".repeat(201) }, size:  1024, message: /nome do arquivo é muito longo/ },
  ];
  for (const { input, size, message } of cases) {
    const result = validateVehicleDocumentInput(input, size, today, "v-1");
    assert.equal(result.ok, false, `expected rejection for ${input.documentKind || input.fileName || input.mimeType}`);
    assert.match(result.message, message);
  }
});

test("uploads to the private server-minted path and never builds a public URL", async () => {
  const uploads = [];
  const store = {
    register: async () => ({
      data: { documentId: "doc-1", storageBucket: "vehicle-documents", storagePath: "123e4567-e89b-12d3-a456-426614174000", fileName: "nota-123.pdf", mimeType: "application/pdf", sizeBytes: 1024 },
      error: null,
    }),
    upload: async (bucket, path, bytes, contentType) => {
      uploads.push({ bucket, path, bytes, contentType });
      return { error: null };
    },
    remove: async () => ({ error: null }),
  };
  const result = await registerVehicleDocumentSafely(store, "v-1", validInput, blob(1024), today);
  assert.equal(result.ok, true);
  assert.equal(uploads.length, 1);
  assert.equal(uploads[0].bucket, "vehicle-documents");
  assert.match(uploads[0].path, /^[0-9a-f-]{36}$/);
  assert.equal(uploads[0].bytes.size, 1024);
  assert.equal(uploads[0].contentType, "application/pdf");
});

test("cleans up logically when the upload fails", async () => {
  const removed = [];
  const store = {
    register: async () => ({
      data: { documentId: "doc-1", storageBucket: "vehicle-documents", storagePath: "path-uuid", fileName: "a.pdf", mimeType: "application/pdf", sizeBytes: 1024 },
      error: null,
    }),
    upload: async () => ({ error: { message: "storage quota exceeded" } }),
    remove: async (documentId) => {
      removed.push(documentId);
      return { error: null };
    },
  };
  const result = await registerVehicleDocumentSafely(store, "v-1", validInput, blob(1024), today);
  assert.equal(result.ok, false);
  assert.match(result.message, /quota/);
  assert.deepEqual(removed, ["doc-1"]);
});

test("treats 409 already-exists upload as an idempotent success without cleanup", async () => {
  const removed = [];
  const store = {
    register: async () => ({
      data: { documentId: "doc-1", storageBucket: "vehicle-documents", storagePath: "path-uuid", fileName: "a.pdf", mimeType: "application/pdf", sizeBytes: 1024 },
      error: null,
    }),
    upload: async () => ({ error: { message: "The resource already exists", statusCode:  409 } }),
    remove: async (documentId) => {
      removed.push(documentId);
      return { error: null };
    },
  };
  const result = await registerVehicleDocumentSafely(store, "v-1", validInput, blob(1024), today);
    assert.equal(result.ok, false);
    assert.deepEqual(removed, []);
    assert.match(result.message, /already exists/);
});

test("derives a deterministic idempotency key from the selected file", () => {
  const key = vehicleDocumentIdempotencyKey({
    documentKind: "nota_fiscal",
    documentDate: "2026-09-01",
    fileName: " nota.pdf ",
    mimeType: "application/pdf",
    idempotencyKey: "",
  }, 2048);
  assert.equal(key, "vehicle-document:nota_fiscal:2026-09-01:nota.pdf:2048");
});

test("sorts documents by date desc then created desc", () => {
  const base = { vehicleId: "v-1", documentKind: "nota_fiscal", documentDate: "2026-09-01", reference: null, note: null, fileName: "a.pdf", mimeType: "application/pdf", sizeBytes: 100, storageBucket: "vehicle-documents", storagePath: "p-1", status: "active" };
  const documents = sortVehicleDocuments([
    { ...base, id: "old-created", createdAt: "2026-09-01T10:00:00Z" },
    { ...base, id: "new-created", createdAt: "2026-09-02T10:00:00Z" },
    { ...base, id: "newer-date", documentDate: "2026-09-02", createdAt: "2026-09-01T10:00:00Z" },
  ]);
  assert.deepEqual(documents.map((document) => document.id), ["newer-date", "new-created", "old-created"]);
});

test("controller registers a document with the normalized payload", async () => {
  const calls = { register: 0, list: 0, remove:  0 };
  const facade = {
    refreshOnboarding: async () => ({ data: { onboarding_status: "completed", basic_profile_completed: true, vehicle_status: "registered" }, error: null }),
    startOnboarding: async () => ({ error: null }),
    completeBasicProfile: async () => ({ error: null }),
    confirmVehicle: async () => ({ error: null }),
    deactivateVehicle: async () => ({ error: null }),
    replaceVehicle: async () => ({ error: null }),
    listVehicles: async () => ({ data: [{ id: "v-1", brand: "Honda", model: "Civic", year: 2022, plate: "ABC1D23", nickname: null }], error: null }),
    listServiceRequests: async () => ({ data: [], error: null }),
    registerMileage: async () => ({ data: null, error: null }),
    listMileage: async () => ({ data: [], error: null }),
    registerFuel: async () => ({ data: null, error: null }),
    listFuel: async () => ({ data: [], error: null }),
    registerVehicleDocument: async (vehicleId, input, bytes) => {
      calls.register += 1;
      return { ok: true, data: { documentId: "doc-1", storageBucket: "vehicle-documents", storagePath: "p-1", fileName: input.fileName, mimeType: input.mimeType, sizeBytes: input.sizeBytes } };
    },
    listVehicleDocuments: async (vehicleId) => {
      calls.list += 1;
      return { data: [], error: null };
    },
    removeVehicleDocument: async (documentId) => {
      calls.remove +=  1;
      return { error: null };
    },
  };
  const controller = createCustomerJourney(facade, { id: "u-1", email: "maria@verah.dev" });
  await controller.restore();
  const bytes = blob(2048);
  const result = await controller.registerVehicleDocument("v-1", { ...validInput, documentKind: "nota_fiscal", fileName: "  fatura.pdf  ", mimeType: "image/png" }, bytes);
  assert.equal(result.ok, true);
  assert.equal(calls.register, 1);
});

test("controller lists only active documents sorted desc", async () => {
  const base = { vehicleId: "v-1", documentKind: "nota_fiscal", documentDate: "2026-09-01", reference: null, note: null, fileName: "a.pdf", mimeType: "application/pdf", sizeBytes: 100, storageBucket: "vehicle-documents", storagePath: "p-1", status: "active", createdAt: "2026-09-01T10:00:00Z" };
  const facade = {
    refreshOnboarding: async () => ({ data: { onboarding_status: "completed", basic_profile_completed: true, vehicle_status: "registered" }, error: null }),
    startOnboarding: async () => ({ error: null }),
    completeBasicProfile: async () => ({ error: null }),
    confirmVehicle: async () => ({ error: null }),
    deactivateVehicle: async () => ({ error: null }),
    replaceVehicle: async () => ({ error: null }),
    listVehicles: async () => ({ data: [{ id: "v-1", brand: "Honda", model: "Civic", year: 2022, plate: "ABC1D23", nickname: null }], error: null }),
    listServiceRequests: async () => ({ data: [], error: null }),
    registerMileage: async () => ({ data: null, error: null }),
    listMileage: async () => ({ data: [], error: null }),
    registerFuel: async () => ({ data: null, error: null }),
    listFuel: async () => ({ data: [], error: null }),
    listVehicleDocuments: async () => ({
      data: [
        { ...base, id: "old", createdAt: "2026-09-01T10:00:00Z" },
        { ...base, id: "removed", status: "removed" },
        { ...base, id: "new", documentDate: "2026-09-05", createdAt: "2026-09-04T10:00:00Z" },
      ],
      error: null,
    }),
  };
  const controller = createCustomerJourney(facade, { id: "u-1", email: "maria@verah.dev" });
  await controller.restore();
  const result = await controller.listVehicleDocuments("v-1");
  assert.equal(result.ok, true);
  assert.deepEqual(result.data.map((document) => document.id), ["new", "old"]);
});

test("controller surfaces removal errors without crashing", async () => {
  const facade = {
    refreshOnboarding: async () => ({ data: { onboarding_status: "completed", basic_profile_completed: true, vehicle_status: "registered" }, error: null }),
    startOnboarding: async () => ({ error: null }),
    completeBasicProfile: async () => ({ error: null }),
    confirmVehicle: async () => ({ error: null }),
    deactivateVehicle: async () => ({ error: null }),
    replaceVehicle: async () => ({ error: null }),
    listVehicles: async () => ({ data: [{ id: "v-1", brand: "Honda", model: "Civic", year: 2022, plate: "ABC1D23", nickname: null }], error: null }),
    listServiceRequests: async () => ({ data: [], error: null }),
    registerMileage: async () => ({ data: null, error: null }),
    listMileage: async () => ({ data: [], error: null }),
    registerFuel: async () => ({ data: null, error: null }),
    listFuel: async () => ({ data: [], error: null }),
    removeVehicleDocument: async () => ({ error: { message: "Vehicle document authorization required." } } ),
  };
  const controller = createCustomerJourney(facade, { id: "u-1", email: "maria@verah.dev" });
  await controller.restore();
  const result = await controller.removeVehicleDocument("doc-1");
  assert.equal(result.ok, false);
  assert.equal(result.message, "Vehicle document authorization required.");
});
