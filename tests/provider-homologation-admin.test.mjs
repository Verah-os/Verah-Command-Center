import assert from "node:assert/strict";
import test from "node:test";
import { loadTs } from "./helpers/load-ts.mjs";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";

const id = "a4444444-4444-4444-8444-444444444444";
test("page exposes canonical controls and read errors never render an empty directory", async () => {
  const db = setup();
  const service = {
    ...db.service,
    listHomologationProviders: async () => [db.tables.service_providers],
  };
  const page = loadTs("app/(command)/prestadores/page.tsx", {
    "react/jsx-runtime": jsx,
    "next/link": { default: ({ children, href, ...props }) => jsx.jsx("a", { ...props, href, children }) },
    "@/services/auth/profile": { requireRole: async () => ({ role: "admin" }) },
    "@/services/provider-homologation/service": service,
    "./actions": { submitHomologation: async () => {} },
  }).default;
  const html = renderToStaticMarkup(await page({ searchParams: Promise.resolve({ provider: id }) }));
  assert.match(html, /Checklist e evidências/);
  assert.match(html, /Categorias autorizadas/);
  assert.match(html, /Registrar decisão humana/);
  assert.match(html, /Bloqueio operacional/);
  db.fail("provider_homologation_profiles");
  const failed = renderToStaticMarkup(await page({ searchParams: Promise.resolve({ provider: id }) }));
  assert.match(failed, /Isso não significa lista vazia/);
  assert.doesNotMatch(failed, /Nenhum prestador encontrado|<form/);
});

test("server action authorization rejects before mutation and redirects", async () => {
  let mutations = 0;
  const action = loadTs("app/(command)/prestadores/actions.ts", {
    "next/cache": { revalidatePath: () => {} },
    "next/navigation": { redirect: () => { throw new Error("unexpected redirect"); } },
    "@/services/auth/profile": { requireRole: async () => { throw new Error("access_denied"); } },
    "@/services/provider-homologation/service": { operateHomologation: async () => { mutations++; } },
  }).submitHomologation;
  await assert.rejects(action(form("status", { status: "approved" })), /access_denied/);
  assert.equal(mutations, 0);
});
function setup(role = "admin") {
  const tables = {
    service_providers: {
      id,
      name: "Synthetic provider",
      status: "active",
      city: "Test",
      trade_name: "Test",
    },
    provider_homologation_profiles: [
      {
        provider_id: id,
        homologation_status: "under_review",
        critical_operational_block: false,
        next_review_at: null,
      },
    ],
    provider_homologation_checklist_items: [
      {
        item_code: "company_registration",
        review_status: "verified",
        is_required_for_pilot: true,
        evidence_required: true,
        evidence_ref: id,
        valid_until: null,
      },
    ],
    provider_category_authorizations: [
      {
        category_code: "freios",
        authorization_status: "pilot_approved",
        valid_until: null,
      },
    ],
  };
  const calls = [];
  let failure;
  let rpcFailure = false;
  const client = {
    from(table) {
      const query = {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        order() {
          return this;
        },
        single() {
          return this;
        },
        then(resolve) {
          return Promise.resolve({
            data: tables[table],
            error: failure === table ? { code: "42501" } : null,
          }).then(resolve);
        },
      };
      return query;
    },
    async rpc(name, args) {
      calls.push({ name, args });
      return {
        data: rpcFailure ? null : id,
        error: rpcFailure ? { code: "42501" } : null,
      };
    },
  };
  const service = loadTs("services/provider-homologation/service.ts", {
    "@/services/auth/profile": {
      requireRole: async (roles) => {
        if (!roles.includes(role)) throw new Error("access_denied");
      },
    },
    "@/services/supabase/server": {
      createSupabaseServerClient: async () => client,
    },
  });
  return {
    service,
    tables,
    calls,
    fail: (table) => {
      failure = table;
    },
    failRpc: () => {
      rpcFailure = true;
    },
  };
}
function form(operation, extra = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    provider_id: id,
    operation,
    reason: "Human review",
    ...extra,
  }))
    data.set(key, value);
  return data;
}

for (const role of ["provider", "customer", "concierge", null]) {
  test(`${role}: cannot read or invoke any administrative homologation operation`, async () => {
    const db = setup(role);
    await assert.rejects(
      db.service.listHomologationProviders(),
      /access_denied/,
    );
    await assert.rejects(db.service.getHomologationDetail(id), /access_denied/);
    for (const operation of [
      "initialize",
      "checklist",
      "category",
      "status",
      "block",
    ]) {
      await assert.rejects(
        db.service.operateHomologation(form(operation)),
        /access_denied/,
      );
    }
    assert.equal(db.calls.length, 0);
  });
}
test("every failed read rejects; never a false empty list or absent profile", async () => {
  for (const table of Object.keys(setup().tables)) {
    const db = setup();
    db.fail(table);
    await assert.rejects(
      db.service.getHomologationDetail(id),
      /não significa ausência/,
    );
    await assert.rejects(
      db.service.operateHomologation(
        form("status", { status: "pilot_approved" }),
      ),
      /não significa ausência/,
    );
    if (table === "service_providers")
      await assert.rejects(
        db.service.listHomologationProviders(),
        /não significa ausência/,
      );
    assert.equal(db.calls.length, 0);
  }
});
test("admin approval uses canonical RPC and preserves identity/request tables", async () => {
  for (const status of ["pilot_approved", "approved"]) {
    const db = setup();
    await db.service.operateHomologation(form("status", { status }));
    assert.deepEqual(db.calls, [
      {
        name: "set_provider_homologation_status",
        args: {
          p_provider_id: id,
          p_status: status,
          p_reason: "Human review",
          p_next_review_at: null,
        },
      },
    ]);
  }
});
test("mandatory requirements, category, block and inactive status prevent approvals", async () => {
  const changes = [
    (t) => {
      t.provider_homologation_profiles = [];
    },
    (t) => {
      t.provider_homologation_checklist_items = [];
    },
    (t) => {
      t.provider_homologation_checklist_items[0].review_status = "pending";
    },
    (t) => {
      t.provider_homologation_checklist_items[0].valid_until = "2000-01-01";
    },
    (t) => {
      t.provider_homologation_checklist_items[0].evidence_ref = null;
    },
    (t) => {
      t.provider_category_authorizations = [];
    },
    (t) => {
      t.provider_category_authorizations[0].valid_until = "2000-01-01";
    },
    (t) => {
      t.provider_category_authorizations[0].authorization_status = "suspended";
    },
    (t) => {
      t.provider_homologation_profiles[0].critical_operational_block = true;
    },
    (t) => {
      t.service_providers.status = "inactive";
    },
  ];
  for (const change of changes)
    for (const status of ["pilot_approved", "approved"]) {
      const db = setup();
      change(db.tables);
      await assert.rejects(
        db.service.operateHomologation(form("status", { status })),
      );
      assert.equal(db.calls.length, 0);
    }
});
test("checklist preserves mandatory flag despite tampered form", async () => {
  const db = setup();
  await db.service.operateHomologation(
    form("checklist", {
      item_code: "company_registration",
      status: "verified",
      evidence_ref: id,
      p_required_for_pilot: "false",
    }),
  );
  assert.equal(db.calls[0].args.p_required_for_pilot, true);
  assert.equal(db.calls[0].name, "review_provider_checklist_item");
});
test("canonical initialization, category and block RPCs; unknown operations denied", async () => {
  const db = setup();
  await db.service.operateHomologation(
    form("category", { category_code: "freios", status: "pilot_approved" }),
  );
  await db.service.operateHomologation(form("block", { blocked: "true" }));
  assert.deepEqual(
    db.calls.map((call) => call.name),
    ["set_provider_category_authorization", "set_provider_operational_block"],
  );
  await assert.rejects(
    db.service.operateHomologation(form("arbitrary_rpc")),
    /inválida/,
  );
  db.tables.provider_homologation_profiles = [];
  await db.service.operateHomologation(
    form("initialize", {
      legal_name: "Test",
      registration_reference: "Synthetic",
      address: "Test",
      responsible_person: "Test",
      contact: "Test",
    }),
  );
  assert.equal(db.calls[2].name, "upsert_provider_homologation_profile");
});
test("RPC failures and stale review dates fail closed", async () => {
  const db = setup();
  await assert.rejects(
    db.service.operateHomologation(
      form("status", { status: "approved", next_review_at: "2000-01-01" }),
    ),
    /futuro/,
  );
  assert.equal(db.calls.length, 0);
  db.failRpc();
  await assert.rejects(
    db.service.operateHomologation(form("status", { status: "approved" })),
    /não confirmada/,
  );
});
