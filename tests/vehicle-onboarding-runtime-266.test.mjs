import assert from "node:assert/strict";
import test from "node:test";
import { loadTs } from "./helpers/load-ts.mjs";
import { createCustomerJourney, normalizeBrazilianPlate } from "../mobile/src/customer-journey.ts";

function catalog(invoke) {
  return loadTs("mobile/src/fipe-catalog.ts", {
    "./fipe-catalog-timeout": { FIPE_CATALOG_TIMEOUT_MS: 10_000 },
    "./supabase": { getSupabaseClient: () => ({ functions: { invoke } }) },
  });
}

// Minimal React host: production event handlers and state run unchanged. Native
// widgets are inert elements; no device, external network or mirrored logic.
function screen(fipe, controller) {
  const state = [];
  let cursor = 0;
  const element = (type, props) => ({ type, props });
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in state)) state[index] = initial;
      return [state[index], (value) => { state[index] = typeof value === "function" ? value(state[index]) : value; }];
    },
    useRef(initial) { return react.useState({ current: initial })[0]; },
  };
  const { VehicleOnboardingStep } = loadTs("mobile/src/VehicleOnboardingStep.tsx", {
    react,
    "react/jsx-runtime": { jsx: element, jsxs: element, Fragment: "Fragment" },
    "react-native": { Pressable: "Pressable", ScrollView: "ScrollView", Text: "Text", TextInput: "TextInput", View: "View", StyleSheet: { create: (value) => value } },
    "./customer-journey": { normalizeBrazilianPlate }, "./fipe-catalog": fipe,
  });
  function render() {
    cursor = 0;
    const nodes = [];
    function walk(node) {
      if (!node || typeof node !== "object") return;
      if (Array.isArray(node)) { node.forEach(walk); return; }
      if (typeof node.type === "function") { walk(node.type(node.props)); return; }
      nodes.push(node);
      walk(node.props?.children);
    }
    walk(VehicleOnboardingStep({ controller }));
    return nodes;
  }
  const text = (node) => typeof node === "string" ? node : Array.isArray(node) ? node.map(text).join("") : node?.props ? text(node.props.children) : "";
  const find = (predicate) => { const node = render().find(predicate); assert.ok(node, "expected UI control"); return node; };
  return {
    render,
    async press(label) {
      const node = find((n) => n.type === "Pressable" && text(n).includes(label));
      assert.ok(!node.props.disabled, `${label} must be enabled`);
      node.props.onPress();
      await new Promise((resolve) => setImmediate(resolve));
    },
    input(placeholder, value) { find((n) => n.type === "TextInput" && n.props.placeholder === placeholder).props.onChangeText(value); },
    value(placeholder) { return find((n) => n.type === "TextInput" && n.props.placeholder === placeholder).props.value; },
    text: () => render().filter((n) => n.type === "Text").map(text).join(" "),
  };
}

test("catalog selection populates available provider fields and submits through canonical controller", async () => {
  const fipe = catalog(async (_, { body, timeout }) => {
    assert.equal(timeout, 10_000);
    const data = { brands: [{ code: "1", name: "Toyota" }], models: [{ code: "2", name: "Corolla" }], years: [{ code: "2022-1", name: "2022" }], detail: { brand: "Toyota", model: "Corolla", modelYear: 2022, fuel: "Flex", codeFipe: "123456-7" } }[body.action];
    return { data: { ok: true, data }, error: null };
  });
  let saved;
  const ui = screen(fipe, { confirmVehicle: async (draft) => { saved = draft; return { ok: true }; } });
  assert.doesNotMatch(ui.text(), /Sei minha placa/);
  assert.match(ui.text(), /não identifica marca e modelo pela placa/);
  await ui.press("Escolher no catálogo FIPE");
  ui.input("Placa (ABC1234 ou ABC1D23)", "ABC1234");
  await ui.press("Toyota"); await ui.press("Corolla"); await ui.press("2022");
  assert.match(ui.text(), /Ano\/modelo: 2022/);
  assert.match(ui.text(), /Combustível: Flex/);
  await ui.press("Confirmo"); await ui.press("Salvar e continuar");
  assert.equal(saved.brand, "Toyota"); assert.equal(saved.model, "Corolla");
  assert.equal(saved.modelYear, "2022"); assert.equal(saved.engine, "Flex");
});

for (const failure of ["timeout", "provider_not_configured"]) {
  test(`${failure} -> one manual fallback preserves plate and completes first-vehicle onboarding`, async () => {
    const fipe = catalog(async () => failure === "timeout"
      ? { data: null, error: new Error("FunctionsFetchError") }
      : { data: null, error: { context: new Response(JSON.stringify({ ok: false, error: failure }), { status: 503 }) } });
    let registered = false;
    let saved;
    const journey = createCustomerJourney({
      refreshOnboarding: async () => ({ data: { onboarding_status: registered ? "completed" : "in_progress", basic_profile_completed: true, vehicle_status: registered ? "registered" : "pending" }, error: null }),
      confirmVehicle: async (draft) => { registered = true; saved = draft; return { error: null }; },
      listVehicles: async () => ({ data: registered ? [{ id: "vehicle", ...saved, year: saved.modelYear }] : [], error: null }),
    }, { id: "customer-user" });
    await journey.restore();
    const ui = screen(fipe, journey);
    await ui.press("Escolher no catálogo FIPE");
    if (failure === "provider_not_configured") assert.match(ui.text(), /ainda não está configurado/);
    else assert.match(ui.text(), /Não foi possível consultar/);
    ui.input("Placa (ABC1234 ou ABC1D23)", "ABC1234");
    await ui.press("Cadastrar manualmente");
    assert.equal(ui.value("Placa (ABC1234 ou ABC1D23)"), "ABC1234");
    ui.input("Ex.: Toyota", "Toyota"); ui.input("Ex.: Corolla", "Corolla"); ui.input("Ex.: 2022", "2022");
    await ui.press("Confirmo"); await ui.press("Salvar e continuar");
    assert.equal(journey.getState().status, "ready");
    assert.equal(saved.plate, "ABC1234"); assert.equal(saved.modelYear, 2022);
    assert.equal(saved.version, null);
  });
}

test("incomplete FIPE detail cannot be presented as a successful identification", async () => {
  const fipe = catalog(async () => ({ data: { ok: true, data: { brand: "Toyota" } }, error: null }));
  await assert.rejects(fipe.getFipeVehicleDetail("1", "2", "2022"), /incompletos/);
});
