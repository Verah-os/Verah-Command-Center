import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { customerStageLabels } from "../lib/customer-service-stage.ts";

const compiled = ts.transpileModule(readFileSync(new URL("../app/demo/cliente/page.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
async function home(requests) {
  const container = ({ children }) => jsx.jsx("div", { children });
  const icon = () => null;
  const modules = {
    "react/jsx-runtime": jsx,
    "next/link": { default: ({ children, ...props }) => jsx.jsx("a", { ...props, children }) },
    "lucide-react": Object.fromEntries(["ArrowRight", "CarFront", "Clock3", "ShieldCheck", "Sparkles"].map(name => [name, icon])),
    "@/components/ui/card": { Card: container, CardContent: container },
    "@/components/customer/customer-shell": { CustomerShell: container },
    "@/components/brand/verah-network-motif": { VerahNetworkMotif: icon },
    "@/lib/customer-vehicle": { nextCareMessages: () => [], vehicleName: () => "Fixture" },
    "@/lib/customer-service-stage": { customerStageLabels },
    "@/services/auth/profile": { requireRole: async roles => { assert.deepEqual(roles, ["customer"]); return { displayName: "Cliente Teste" }; } },
    "@/services/customer-vehicles": { listCustomerVehicles: async () => [] },
    "@/services/service-requests": { listCustomerServiceRequests: async () => requests },
    "@/services/service-quotes": { listCustomerQuoteSummaries: async () => new Map() },
  };
  const exports = {};
  new Function("require", "exports", compiled)(name => { assert.ok(name in modules, name); return modules[name]; }, exports);
  return renderToStaticMarkup(await exports.default());
}
const request = (id, serviceStage) => ({ id, serviceStage, referenceCode: `REF-${id}`, vehicleBrand: "Volkswagen", vehicleModel: "Fox" });

test("#274 active and quote-pending journeys make follow-up the primary action", async () => {
  for (const stage of ["concierge_aceitou", "aguardando_aprovacao", "em_execucao"]) {
    const html = await home([request("same-request", stage)]);
    const primary = html.match(/<a[^>]+class="[^"]*bg-accent[^>]*>.*?<\/a>/)?.[0];
    assert.ok(primary);
    assert.match(primary, /href="\/demo\/cliente\/atendimento\/same-request"/);
    assert.match(primary, />Acompanhar atendimento/);
    assert.doesNotMatch(primary, /Solicitar|Revisar orçamento/);
    assert.ok(html.indexOf("REF-same-request") < html.indexOf("Meu veículo"));
    assert.match(html, /href="\/demo\/cliente\/novo-atendimento"/);
  }
});

test("#274 no active requests keeps new request as primary action", async () => {
  for (const requests of [[], [request("done", "concluido"), request("cancelled", "cancelado")]]) {
    const html = await home(requests);
    assert.doesNotMatch(html, /Acompanhar atendimento/);
    assert.match(html, /href="\/demo\/cliente\/novo-atendimento"[^>]*bg-accent[^>]*>Solicitar atendimento/);
  }
});

test("#274 every open request remains identifiable and reachable", async () => {
  const html = await home([request("one", "concierge_aceitou"), request("two", "aguardando_aprovacao")]);
  assert.match(html, /aria-label="Outros atendimentos em andamento"/);
  for (const id of ["one", "two"]) {
    assert.ok(html.includes(`/demo/cliente/atendimento/${id}`));
    assert.ok(html.includes(`REF-${id}`));
  }
});
