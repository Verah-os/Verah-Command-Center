import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import {
  readRows,
  readMetrics,
  readDirectory,
  readCustomer,
  searchDirectory,
  available,
  unavailable,
} from "../services/customer-crm/read-model.ts";

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const customer = (n, name = `Cliente ${n}`) => ({
  id: id(n),
  display_name: name,
  created_at: "2026-09-02T10:00:00Z",
});
const request = (n, customerId = id(1), stage = "solicitado") => ({
  id: id(n),
  customer_id: customerId,
  vehicle_id: id(30),
  reference_code: `VER-${n}`,
  service_stage: stage,
  created_at: "2026-09-03T10:00:00Z",
  updated_at: "2026-09-04T10:00:00Z",
});
const contact = (n, customerId = id(1)) => ({
  id: id(n),
  customer_id: customerId,
  channel_type: "whatsapp",
  channel_address: "+5516999999999",
  consent_status: "unknown",
});
const event = (n, requestId = id(10)) => ({
  id: id(n),
  service_request_id: requestId,
  event_type: "request_created",
  actor_role: "customer",
  channel: "app",
  created_at: "2026-09-03T10:00:00Z",
});

// A read-only PostgREST simulator: tests execute the production query builders.
function database(tables = {}, options = {}) {
  const queries = [];
  return {
    queries,
    from(table) {
      const query = { table, filters: [], start: 0, end: Infinity };
      queries.push(query);
      const builder = {
        select(columns, flags) {
          query.columns = columns;
          query.flags = flags;
          return builder;
        },
        eq(column, value) {
          query.filters.push((r) => r[column] === value);
          return builder;
        },
        in(column, values) {
          query.filters.push((r) => values.includes(r[column]));
          return builder;
        },
        gte(column, value) {
          query.filters.push((r) => r[column] >= value);
          return builder;
        },
        lt(column, value) {
          query.filters.push((r) => r[column] < value);
          return builder;
        },
        order(column) {
          query.order = column;
          return builder;
        },
        range(start, end) {
          query.start = start;
          query.end = end;
          return builder;
        },
        then(resolve, reject) {
          if (options.throwTable === table)
            return Promise.reject(new Error("private backend error")).then(
              resolve,
              reject,
            );
          if (options.failTable === table)
            return Promise.resolve({
              data: null,
              count: null,
              error: { message: "private backend error" },
            }).then(resolve, reject);
          const rows = (tables[table] ?? [])
            .filter((r) => query.filters.every((f) => f(r)))
            .sort((a, b) =>
              String(a[query.order]).localeCompare(String(b[query.order])),
            );
          const data = rows
            .slice(
              query.start,
              Math.min(
                query.end + 1,
                query.start + (options.serverCap ?? 1000),
              ),
            )
            .map((r) =>
              Object.fromEntries(
                query.columns.split(",").map((k) => [k, r[k]]),
              ),
            );
          const result = {
            data: query.flags.head ? null : data,
            count: options.nullCount ? null : rows.length,
            error: null,
          };
          return Promise.resolve(result).then(resolve, reject);
        },
      };
      return builder;
    },
  };
}

test("KPIs use canonical identities, current UTC month, distinct active customers and open stages", async () => {
  const db = database({
    customers: [
      customer(1),
      { ...customer(2), created_at: "2026-08-31T23:59:59Z" },
      { ...customer(3), created_at: "2026-10-01T00:00:00Z" },
    ],
    customer_vehicles: [{ id: id(30) }, { id: id(31) }],
    service_requests: [
      request(10),
      request(11),
      request(12, id(2), "concluido"),
      request(13, id(2), "cancelado"),
      request(14, null),
    ],
  });
  const m = await readMetrics(db, new Date("2026-09-30T23:59:59Z"));
  assert.equal(m.customers.data, 3);
  assert.equal(m.newCustomers.data, 1);
  assert.equal(m.vehicles.data, 2);
  assert.equal(m.openRequests.data, 3);
  assert.equal(m.activeCustomers.data, 1);
  assert.ok(db.queries.every((q) => !q.columns.includes("*")));
});

test("missing tables, thrown errors and null counts stay unavailable, not zero", async () => {
  for (const options of [
    { failTable: "service_requests" },
    { throwTable: "service_requests" },
  ]) {
    const m = await readMetrics(database({}, options));
    assert.equal(m.openRequests.status, "unavailable");
    assert.equal(m.activeCustomers.status, "unavailable");
    assert.equal(m.customers.data, 0);
  }
  const m = await readMetrics(database({}, { nullCount: true }));
  assert.equal(m.customers.status, "unavailable");
  const missing = await readMetrics(database({}, { failTable: "customers" }));
  assert.equal(missing.activeCustomers.status, "unavailable");
});

test("unknown canonical stages fail closed instead of silently changing KPI meaning", async () => {
  const m = await readMetrics(
    database({ service_requests: [request(10, id(1), "future_stage")] }),
  );
  assert.equal(m.openRequests.status, "unavailable");
});

test("pagination follows server row caps and rejects incomplete or excessive datasets", async () => {
  const rows = Array.from({ length: 205 }, (_, n) => customer(n + 1));
  const db = database({ customers: rows }, { serverCap: 75 });
  const result = await readDirectory(db);
  assert.equal(result.customers.data.length, 205);
  assert.deepEqual(
    db.queries.filter((q) => q.table === "customers").map((q) => q.start),
    [0, 75, 150],
  );
  const large = await readDirectory(
    database({
      customers: Array.from({ length: 5001 }, (_, n) => customer(n + 1)),
    }),
  );
  assert.equal(large.customers.reason, "limit");
  const duplicate = await readDirectory(
    database({ customers: [customer(1), customer(1)] }),
  );
  assert.equal(duplicate.customers.reason, "invalid");
});

test("name/contact search is literal, accent-insensitive and pagination bounded", async () => {
  const directory = await readDirectory(
    database({
      customers: [customer(1, "Márcia"), customer(2, "Outra cliente")],
      customer_channels: [
        contact(40),
        {
          ...contact(41),
          channel_type: "app",
          channel_address: "private-auth-user-id",
        },
      ],
    }),
  );
  assert.equal(searchDirectory(directory, "marcia").rows[0].id, id(1));
  assert.equal(searchDirectory(directory, "(16) 99999-9999").rows[0].id, id(1));
  assert.equal(searchDirectory(directory, "private-auth-user-id").total, 0);
  assert.equal(searchDirectory(directory, "%'),id.neq.null").total, 0);
  assert.equal(searchDirectory(directory, "", Infinity).page, 1);
  assert.equal(
    searchDirectory({ ...directory, contacts: unavailable() }, "9999").total,
    0,
  );
  assert.equal(
    searchDirectory({ ...directory, customers: unavailable() }, "Márcia"),
    null,
  );
  const long = {
    customers: available(Array.from({ length: 26 }, (_, n) => customer(n + 1))),
    contacts: available([]),
  };
  assert.equal(searchDirectory(long, "", 99).rows.length, 1);
  assert.equal(searchDirectory(long, "", 99).page, 2);
});

test("360 reads only exact canonical bindings and whitelisted event metadata", async () => {
  const vehicle = {
    id: id(30),
    customer_id: id(1),
    brand: "Marca",
    model: "Modelo",
    year: 2022,
    plate: null,
    current_mileage: 0,
    active: true,
  };
  const db = database({
    customers: [customer(1), customer(2)],
    customer_channels: [contact(40), contact(41, id(2))],
    customer_vehicles: [
      vehicle,
      { ...vehicle, id: id(31), customer_id: id(2) },
      { ...vehicle, id: id(32), customer_id: null, owner_id: id(1) },
    ],
    service_requests: [request(10), request(11, id(2)), request(12, null)],
    service_request_events: [
      event(50),
      { ...event(51), created_at: "2026-09-05T10:00:00Z" },
      event(52, id(11)),
    ],
  });
  const detail = await readCustomer(db, id(1));
  assert.equal(detail.status, "available");
  assert.equal(detail.vehicles.data.length, 1);
  assert.equal(detail.vehicles.data[0].current_mileage, 0);
  assert.equal(detail.contacts.data.length, 1);
  assert.deepEqual(
    detail.requests.data.map((r) => r.id),
    [id(10)],
  );
  assert.deepEqual(
    detail.events.data.map((e) => e.id),
    [id(51), id(50)],
  );
  assert.ok(
    db.queries.every(
      (q) =>
        !/payload|auth_user_id|provider_id|customer_phone|message|\*/.test(
          q.columns,
        ),
    ),
  );
});

test("missing identities do not trigger secondary queries and invalid UUIDs never hit the database", async () => {
  const db = database();
  assert.equal((await readCustomer(db, "invalid-id")).status, "not_found");
  assert.equal(db.queries.length, 0);
  assert.equal((await readCustomer(db, id(1))).status, "not_found");
  assert.equal(db.queries.length, 1);
});

test("optional source failure preserves identity and never invents a last interaction", async () => {
  const db = database(
    { customers: [customer(1)], service_requests: [request(10)] },
    { failTable: "service_request_events" },
  );
  const detail = await readCustomer(db, id(1));
  assert.equal(detail.customer.id, id(1));
  assert.equal(detail.events.status, "unavailable");
  assert.equal(detail.requests.status, "available");
  const requestsUnavailable = database(
    { customers: [customer(1)] },
    { failTable: "service_requests" },
  );
  assert.equal(
    (await readCustomer(requestsUnavailable, id(1))).events.status,
    "unavailable",
  );
  assert.ok(
    !requestsUnavailable.queries.some(
      (q) => q.table === "service_request_events",
    ),
  );
});

test("all CRM entry points authorize admin before creating a data client", async () => {
  const source = readFileSync(
    new URL("../services/customer-crm/service.ts", import.meta.url),
    "utf8",
  );
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  for (const role of [null, "customer", "provider", "concierge", "admin"]) {
    const calls = [];
    const modules = {
      "@/services/auth/profile": {
        requireRole: async (allowed) => {
          calls.push("guard");
          assert.deepEqual(allowed, ["admin"]);
          if (role !== "admin") throw new Error("denied");
        },
      },
      "@/services/supabase/server": {
        createSupabaseServerClient: async () => {
          calls.push("client");
          return {};
        },
      },
      "./read-model": Object.fromEntries(
        ["readCustomer", "readDirectory", "readMetrics"].map((name) => [
          name,
          () => {
            calls.push("read");
            return {};
          },
        ]),
      ),
    };
    const exports = {};
    new Function("require", "exports", code)((name) => modules[name], exports);
    for (const method of Object.values(exports)) {
      calls.length = 0;
      if (role !== "admin") {
        await assert.rejects(() => method(id(1)), /denied/);
        assert.deepEqual(calls, ["guard"]);
      } else {
        await method(id(1));
        assert.deepEqual(calls, ["guard", "client", "read"]);
      }
    }
  }
});

test("empty ID sets do not issue unfiltered history reads", async () => {
  const db = database();
  assert.deepEqual(
    await readRows(db, "service_request_events", "id", () => true, {
      ids: ["service_request_id", []],
    }),
    available([]),
  );
  assert.equal(db.queries.length, 0);
});
