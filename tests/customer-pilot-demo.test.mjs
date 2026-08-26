import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { customerPilotDemo as demo } from "../lib/customer-pilot-demo.ts";
import { customerJourneyStages } from "../lib/customer-service-stage.ts";
import { conciergeDemoFixture } from "../lib/concierge-demo.ts";

test("canonical customer fixture keeps vehicle, R$659 split and synthetic payment coherent", () => {
  assert.equal(demo.vehicle.id, "DEMO-VEH-001");
  assert.equal(demo.vehicle.name, "Volkswagen Polo");
  assert.equal(demo.vehicle.year, "2021/2022");
  assert.equal(demo.quote.items.reduce((total, item) => total + item.amount, 0), 580);
  assert.equal(demo.quote.serviceAmount + demo.quote.verahFee, 659);
  assert.equal(demo.quote.total, 659);
  assert.equal(demo.payment.mode, "sandbox/mock");
  assert.match(demo.payment.disclaimer, /nenhuma cobrança/i);
});

test("customer timeline is chronological and projects only canonical service stages", () => {
  assert.deepEqual(demo.timeline.map(({ time }) => time), [
    "09:05", "09:12", "09:35", "10:18", "10:32", "10:41",
    "11:05", "14:20", "14:42", "15:00", "15:35",
  ]);
  assert.equal(demo.timeline.at(-1)?.stage, "concluido");
  assert.ok(demo.timeline.every(({ stage }) => customerJourneyStages.includes(stage)));
});

test("passport and next care derive from the same completed fixture", () => {
  assert.match(demo.passport.event, /48\.327 km/);
  assert.equal(demo.vehicle.mileageAtCompletion, 48_327);
  assert.ok(demo.nextCare.every((care) => !/diagnóstico confirmado automaticamente/i.test(care)));
});

test("executive customer and Concierge views derive from the same canonical case", () => {
  assert.equal(conciergeDemoFixture.customer, demo.customer.fullName);
  assert.match(conciergeDemoFixture.vehicle, /Volkswagen Polo/);
  assert.equal(conciergeDemoFixture.reportedProblem, demo.report);
  assert.deepEqual(
    conciergeDemoFixture.proposals.map(({ total }) => total),
    [580, 560],
  );
  assert.match(conciergeDemoFixture.comparison.recommendation, /R\$20/);
});

test("service worker caches only the synthetic demo shell and clears it on logout", async () => {
  const source = await readFile(new URL("../public/customer-demo-sw.js", import.meta.url), "utf8");
  assert.match(source, /CLEAR_CUSTOMER_DEMO_CACHE/);
  assert.match(source, /\/demo\/cliente\/piloto/);
  assert.doesNotMatch(source, /\/api\/|\/login|supabase|authorization/i);
});

test("client persists only versioned demo controls and handles offline, reconnection and logout", async () => {
  const source = await readFile(
    new URL("../components/customer/customer-pilot-demo.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /verah\.customer-pilot-demo\.v1/);
  assert.match(source, /sessionStorage\.removeItem/);
  assert.match(source, /addEventListener\("offline"/);
  assert.match(source, /addEventListener\("online"/);
  assert.match(source, /CLEAR_CUSTOMER_DEMO_CACHE/);
  assert.match(source, /Coordenação VERAH/);
  assert.match(source, /Reiniciar/);
  assert.match(source, /type StoredState = \{ scene: Scene; furthest: number; approved: boolean; paid: boolean \}/);
  assert.doesNotMatch(source, /localStorage/);
});
