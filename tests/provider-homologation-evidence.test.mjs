import assert from "node:assert/strict";
import test from "node:test";
import * as crypto from "node:crypto";
import { loadTs } from "./helpers/load-ts.mjs";

const provider = "a4444444-4444-4444-8444-444444444444";
const id = "b4444444-4444-4444-8444-444444444444";
function setup({ role = "admin", fail, row = {} } = {}) {
  const calls = [];
  const file = new File(["%PDF-local-test"], "test.pdf", { type: "application/pdf" });
  const hash = crypto.createHash("sha256").update("%PDF-local-test").digest("hex");
  const client = {
    async rpc(name, args) {
      calls.push({ name, args });
      if (fail === "reserve" && name.startsWith("reserve")) return { error: new Error("private") };
      if (fail === "finish" && args.p_available) return { error: new Error("private") };
      return { data: name.startsWith("reserve") ? { id, storage_path: `provider-homologation/${provider}/${id}` } : id };
    },
    storage: { from(bucket) {
      assert.equal(bucket, "service-attachments");
      return {
        async upload(path, bytes, options) {
          calls.push({ name: "upload", path, options });
          return fail === "upload" ? { error: new Error("private") } : { data: { path } };
        },
        async download(path) {
          calls.push({ name: "download", path });
          return fail === "read" ? { error: new Error("private") } : { data: fail === "integrity" ? new Blob(["corruption"]) : file };
        },
      };
    } },
    from() {
      return { select() { return this; }, eq() { return this; }, async single() {
        return fail === "metadata" ? { error: new Error("denied") } : { data: {
          storage_bucket: "service-attachments", storage_path: `provider-homologation/${provider}/${id}`,
          visibility: "operations", status: "available", homologation_provider_id: provider,
          size_bytes: file.size, checksum_sha256: hash, ...row,
        } };
      } };
    },
  };
  const service = loadTs("services/provider-homologation/evidence.ts", {
    "node:crypto": crypto,
    "@/services/auth/profile": { requireRole: async (roles) => { if (!roles.includes(role)) throw new Error("denied"); } },
    "@/services/supabase/server": { createSupabaseServerClient: async () => client },
  });
  const form = new FormData();
  form.set("provider_id", provider); form.set("reason", "Local test provenance"); form.set("file", file);
  return { service, calls, form };
}
test("upload reserves owned pending evidence, reads bytes, then confirms; never approves", async () => {
  const db = setup();
  assert.equal(await db.service.uploadHomologationEvidence(db.form), id);
  assert.deepEqual(db.calls.map(c => c.name), ["reserve_provider_homologation_evidence", "upload", "download", "finish_provider_homologation_evidence"]);
  assert.equal(db.calls[0].args.p_provider_id, provider);
  assert.equal(db.calls[1].options.upsert, false);
  assert.equal(db.calls[3].args.p_available, true);
});
for (const fail of ["reserve", "upload", "read", "integrity", "finish"]) {
  test(`${fail}: never reports upload success`, async () => {
    const db = setup({ fail });
    await assert.rejects(db.service.uploadHomologationEvidence(db.form), /não confirmada/);
    if (fail !== "reserve") assert.equal(db.calls.at(-1).args.p_available, false);
    if (["upload", "read", "integrity"].includes(fail)) assert.ok(!db.calls.some(c => c.args?.p_available === true));
  });
}
for (const role of ["provider", "customer", "concierge", null]) {
  test(`${role}: cannot upload or read evidence`, async () => {
    const db = setup({ role });
    await assert.rejects(db.service.uploadHomologationEvidence(db.form), /denied/);
    await assert.rejects(db.service.readHomologationEvidence(provider, id), /denied/);
    assert.equal(db.calls.length, 0);
  });
}
for (const row of [{ status: "pending" }, { status: "rejected" }, { homologation_provider_id: id }, { visibility: "all" }]) {
  test(`read rejects invalid ownership/availability ${JSON.stringify(row)}`, async () => {
    const db = setup({ row });
    await assert.rejects(db.service.readHomologationEvidence(provider, id), /não confirmada/);
    assert.equal(db.calls.length, 0);
  });
}
for (const fail of ["metadata", "read", "integrity"]) {
  test(`read ${fail} is explicit failure`, async () => {
    await assert.rejects(setup({ fail }).service.readHomologationEvidence(provider, id), /não confirmada/);
  });
}
test("invalid file and provider rejected before storage or reservation", async () => {
  for (const [key, value] of [["provider_id", "bad"], ["reason", ""], ["file", new File(["x"], "bad.html", { type: "text/html" })], ["file", new File([], "empty.pdf", { type: "application/pdf" })]]) {
    const db = setup(); db.form.set(key, value);
    await assert.rejects(db.service.uploadHomologationEvidence(db.form));
    assert.equal(db.calls.length, 0);
  }
});
test("download route fails with explicit non-success and no-store", async () => {
  const route = loadTs("app/(command)/prestadores/evidencias/[id]/route.ts", {
    "@/services/auth/profile": { requireRole: async () => {} },
    "@/services/provider-homologation/evidence": { readHomologationEvidence: async () => { throw new Error("private internal"); } },
  });
  const response = await route.GET(new Request(`https://example.invalid/prestadores/evidencias/${id}?provider=${provider}`), { params: Promise.resolve({ id }) });
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.match(await response.text(), /Não foi possível ler/);
});
