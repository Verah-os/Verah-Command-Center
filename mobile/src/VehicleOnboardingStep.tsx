import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import {
  normalizeBrazilianPlate,
  type CustomerJourneyController,
} from "./customer-journey";
import {
  getFipeVehicleDetail,
  listFipeBrands,
  listFipeModels,
  listFipeYears,
  type FipeCatalogOption,
} from "./fipe-catalog";

type EntryMode = "plate" | "catalog" | null;

export function VehicleOnboardingStep({
  controller,
  additional = false,
  onSaved,
  onCancel,
}: {
  controller: CustomerJourneyController;
  additional?: boolean;
  onSaved?: () => void;
  onCancel?: () => void;
}) {
  const [mode, setMode] = useState<EntryMode>(null);
  const [plate, setPlate] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [modelYear, setModelYear] = useState("");
  const [version, setVersion] = useState("");
  const [engine, setEngine] = useState("");
  const [transmission, setTransmission] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [catalogBusy, setCatalogBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lookupMessage, setLookupMessage] = useState<string | null>(null);
  const [brands, setBrands] = useState<FipeCatalogOption[]>([]);
  const [models, setModels] = useState<FipeCatalogOption[]>([]);
  const [years, setYears] = useState<FipeCatalogOption[]>([]);
  const [brandId, setBrandId] = useState("");
  const [modelId, setModelId] = useState("");
  const [yearId, setYearId] = useState("");
  const [fipeInfo, setFipeInfo] = useState<string | null>(null);

  const resetSelection = () => {
    setBrand("");
    setModel("");
    setModelYear("");
    setVersion("");
    setEngine("");
    setTransmission("");
    setConfirmed(false);
    setModels([]);
    setYears([]);
    setBrandId("");
    setModelId("");
    setYearId("");
    setFipeInfo(null);
  };

  const loadBrands = async () => {
    if (brands.length) return true;
    setCatalogBusy(true);
    setError(null);
    try {
      const result = await listFipeBrands();
      if (!result.length) throw new Error("O catálogo FIPE não retornou montadoras.");
      setBrands(result);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar o catálogo FIPE.");
      return false;
    } finally {
      setCatalogBusy(false);
    }
  };

  const chooseMode = async (nextMode: Exclude<EntryMode, null>) => {
    setMode(nextMode);
    setError(null);
    setLookupMessage(null);
    resetSelection();
    if (nextMode === "catalog") {
      setPlate("");
      await loadBrands();
    }
  };

  const lookupPlate = async () => {
    const normalized = normalizeBrazilianPlate(plate);
    if (!normalized) {
      setError("Placa inválida. Use o formato ABC1234 ou ABC1D23.");
      return;
    }
    setPlate(normalized);
    setError(null);
    resetSelection();
    const loaded = await loadBrands();
    if (!loaded) return;
    setMode("catalog");
    setLookupMessage(
      "Placa validada. No modo gratuito, a FIPE não identifica o veículo pela placa; complete marca, modelo e ano para vincular esta placa ao carro correto.",
    );
  };

  const chooseBrand = async (item: FipeCatalogOption) => {
    setBrandId(item.id);
    setBrand(item.name);
    setModelId("");
    setModel("");
    setYearId("");
    setModelYear("");
    setVersion("");
    setEngine("");
    setConfirmed(false);
    setYears([]);
    setFipeInfo(null);
    setCatalogBusy(true);
    setError(null);
    try {
      const result = await listFipeModels(item.id);
      if (!result.length) throw new Error("Nenhum modelo encontrado para esta montadora.");
      setModels(result);
    } catch (cause) {
      setModels([]);
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar os modelos.");
    } finally {
      setCatalogBusy(false);
    }
  };

  const chooseModel = async (item: FipeCatalogOption) => {
    setModelId(item.id);
    setModel(item.name);
    setYearId("");
    setModelYear("");
    setVersion("");
    setEngine("");
    setConfirmed(false);
    setFipeInfo(null);
    setCatalogBusy(true);
    setError(null);
    try {
      const result = await listFipeYears(brandId, item.id);
      if (!result.length) throw new Error("Nenhum ano encontrado para este modelo.");
      setYears(result);
    } catch (cause) {
      setYears([]);
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar os anos.");
    } finally {
      setCatalogBusy(false);
    }
  };

  const chooseYear = async (item: FipeCatalogOption) => {
    setYearId(item.id);
    setConfirmed(false);
    setCatalogBusy(true);
    setError(null);
    setFipeInfo(null);
    try {
      const detail = await getFipeVehicleDetail(brandId, modelId, item.id);
      setBrand(detail.brand);
      setModel(detail.model);
      setModelYear(String(detail.modelYear));
      setVersion(detail.codeFipe ? `FIPE ${detail.codeFipe}` : "");
      setEngine(detail.fuel ?? "");
      const info = [detail.price, detail.referenceMonth].filter(Boolean).join(" · ");
      setFipeInfo(info || "Dados conferidos na tabela FIPE.");
    } catch (cause) {
      setYearId("");
      setError(cause instanceof Error ? cause.message : "Não foi possível consultar os detalhes FIPE.");
    } finally {
      setCatalogBusy(false);
    }
  };

  const submit = async () => {
    if (!plate.trim()) {
      setError("Informe a placa para vincular este veículo ao seu cadastro.");
      return;
    }
    if (!confirmed) {
      setError("Confirme que estes dados correspondem ao seu veículo.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await controller.confirmVehicle({
      plate,
      brand,
      model,
      modelYear,
      version,
      engine,
      transmission,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    onSaved?.();
  };

  const scrollProps = {
    style: styles.scroll,
    contentContainerStyle: styles.form,
    showsVerticalScrollIndicator: false,
    keyboardShouldPersistTaps: "handled" as const,
  };

  if (mode === null) {
    return (
      <ScrollView {...scrollProps}>
        <Text style={styles.brandName}>VERAH</Text>
        <Text style={styles.eyebrow}>{additional ? "Adicionar veículo" : "Seu primeiro veículo"}</Text>
        <Text style={styles.title}>{additional ? "Cadastre outro carro" : "Vamos encontrar seu carro"}</Text>
        <Text style={styles.body}>
          Use a placa como identificação e confirme o veículo pelo catálogo FIPE gratuito.
        </Text>
        <ChoiceCard
          title="Sei minha placa"
          description="Informe a placa e depois confirme marca, modelo e ano com dados FIPE."
          onPress={() => void chooseMode("plate")}
        />
        <ChoiceCard
          title="Quero escolher o veículo"
          description="Navegue pelo catálogo FIPE e informe a placa antes de salvar."
          onPress={() => void chooseMode("catalog")}
        />
        {additional && onCancel ? <OutlineButton label="Cancelar" onPress={onCancel} /> : null}
      </ScrollView>
    );
  }

  return (
    <ScrollView {...scrollProps}>
      <Text style={styles.brandName}>VERAH</Text>
      <Text style={styles.eyebrow}>{additional ? "Adicionar veículo" : "Seu primeiro veículo"}</Text>
      <Text style={styles.title}>{mode === "plate" ? "Comece pela placa" : "Confirme seu veículo"}</Text>
      <Text style={styles.body}>
        O catálogo usa a tabela FIPE real. A consulta gratuita não faz identificação automática pela placa.
      </Text>

      <TextInput
        style={styles.input}
        placeholder="Placa (ABC1234 ou ABC1D23)"
        placeholderTextColor="#777777"
        autoCapitalize="characters"
        autoCorrect={false}
        value={plate}
        onChangeText={(value) => {
          setPlate(value);
          setConfirmed(false);
          if (mode === "plate") setLookupMessage(null);
        }}
      />

      {mode === "plate" ? <OutlineButton label={catalogBusy ? "Carregando…" : "Validar placa e continuar"} onPress={() => void lookupPlate()} disabled={catalogBusy} /> : null}
      {lookupMessage ? <Text style={styles.message}>{lookupMessage}</Text> : null}

      {mode === "catalog" ? (
        <>
          <Text style={styles.sectionLabel}>Montadora</Text>
          {catalogBusy && !brands.length ? <Text style={styles.message}>Carregando catálogo FIPE…</Text> : null}
          <View style={styles.chips}>
            {brands.map((item) => (
              <Chip key={item.id} label={item.name} selected={brandId === item.id} onPress={() => void chooseBrand(item)} />
            ))}
          </View>

          {brandId ? (
            <>
              <Text style={styles.sectionLabel}>Modelo / versão</Text>
              <View style={styles.chips}>
                {models.map((item) => (
                  <Chip key={item.id} label={item.name} selected={modelId === item.id} onPress={() => void chooseModel(item)} />
                ))}
              </View>
            </>
          ) : null}

          {modelId ? (
            <>
              <Text style={styles.sectionLabel}>Ano</Text>
              <View style={styles.chips}>
                {years.map((item) => (
                  <Chip key={item.id} label={item.name} selected={yearId === item.id} onPress={() => void chooseYear(item)} />
                ))}
              </View>
            </>
          ) : null}
        </>
      ) : null}

      {brand && model && modelYear ? (
        <View style={styles.summary}>
          <Text style={styles.summaryTitle}>{brand} {model}</Text>
          <Text style={styles.summaryText}>Ano/modelo: {modelYear}</Text>
          {engine ? <Text style={styles.summaryText}>Combustível: {engine}</Text> : null}
          {version ? <Text style={styles.summaryText}>{version}</Text> : null}
          {fipeInfo ? <Text style={styles.fipeText}>{fipeInfo}</Text> : null}
          <TextInput
            style={styles.input}
            placeholder="Câmbio (opcional)"
            placeholderTextColor="#777777"
            value={transmission}
            onChangeText={setTransmission}
          />
          <Pressable
            style={styles.checkRow}
            onPress={() => setConfirmed((value) => !value)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: confirmed }}
          >
            <View style={[styles.check, confirmed && styles.checkSelected]}>
              {confirmed ? <Text style={styles.checkMark}>✓</Text> : null}
            </View>
            <Text style={styles.checkLabel}>Confirmo que estes dados correspondem ao meu veículo.</Text>
          </Pressable>
          <Pressable style={[styles.primary, busy && styles.disabled]} disabled={busy} onPress={() => void submit()}>
            <Text style={styles.primaryText}>{busy ? "Salvando…" : additional ? "Adicionar veículo" : "Salvar e continuar"}</Text>
          </Pressable>
        </View>
      ) : null}

      {catalogBusy && brands.length ? <Text style={styles.message}>Consultando FIPE…</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {mode === "catalog" && !brands.length && !catalogBusy ? <OutlineButton label="Tentar carregar FIPE novamente" onPress={() => void loadBrands()} /> : null}
      <OutlineButton label="Voltar às opções" onPress={() => setMode(null)} />
      {additional && onCancel ? <OutlineButton label="Cancelar cadastro" onPress={onCancel} /> : null}
    </ScrollView>
  );
}

function ChoiceCard({ title, description, onPress }: { title: string; description: string; onPress: () => void }) {
  return (
    <Pressable style={styles.choice} onPress={onPress}>
      <Text style={styles.choiceTitle}>{title}</Text>
      <Text style={styles.choiceDescription}>{description}</Text>
    </Pressable>
  );
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.chip, selected && styles.chipSelected]} onPress={onPress}>
      <Text numberOfLines={2} style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

function OutlineButton({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable style={[styles.outline, disabled && styles.disabled]} disabled={disabled} onPress={onPress}>
      <Text style={styles.outlineText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: { width: "100%", alignSelf: "stretch" },
  form: { width: "100%", maxWidth: 420, alignSelf: "center", paddingBottom: 32, paddingHorizontal: 2 },
  brandName: { color: "#2AA79B", fontSize: 32, fontWeight: "700" },
  eyebrow: { color: "#2AA79B", fontSize: 14, fontWeight: "600", marginTop: 16 },
  title: { color: "#FFFFFF", fontSize: 20, fontWeight: "600", marginTop: 4 },
  body: { color: "#C9C9C9", fontSize: 15, lineHeight: 21, marginTop: 12, marginBottom: 20, flexShrink: 1 },
  input: { backgroundColor: "#242424", borderRadius: 8, color: "#FFFFFF", fontSize: 16, marginBottom: 12, paddingHorizontal: 14, paddingVertical: 12, width: "100%" },
  choice: { backgroundColor: "#242424", borderColor: "#2AA79B", borderRadius: 12, borderWidth: 1, marginBottom: 12, padding: 16, width: "100%" },
  choiceTitle: { color: "#FFFFFF", fontSize: 17, fontWeight: "700" },
  choiceDescription: { color: "#C9C9C9", fontSize: 14, lineHeight: 20, marginTop: 6, flexShrink: 1 },
  message: { color: "#C9C9C9", fontSize: 14, lineHeight: 20, marginBottom: 12, marginTop: 10, flexShrink: 1 },
  sectionLabel: { color: "#FFFFFF", fontSize: 15, fontWeight: "600", marginBottom: 10, marginTop: 10 },
  chips: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -4, marginBottom: 8, width: "100%" },
  chip: { borderColor: "#555555", borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, marginHorizontal: 4, marginBottom: 8, maxWidth: "100%", flexShrink: 1 },
  chipSelected: { backgroundColor: "#2AA79B", borderColor: "#2AA79B" },
  chipText: { color: "#C9C9C9", fontSize: 13, flexShrink: 1 },
  chipTextSelected: { color: "#0B0B0B", fontWeight: "700" },
  summary: { backgroundColor: "#242424", borderRadius: 12, padding: 16, marginTop: 8, width: "100%" },
  summaryTitle: { color: "#FFFFFF", fontSize: 17, fontWeight: "700", marginBottom: 8 },
  summaryText: { color: "#C9C9C9", fontSize: 14, lineHeight: 20 },
  fipeText: { color: "#2AA79B", fontSize: 14, fontWeight: "600", marginTop: 8, marginBottom: 14 },
  checkRow: { flexDirection: "row", alignItems: "flex-start", marginTop: 4, marginBottom: 8, width: "100%" },
  check: { width: 22, height: 22, borderRadius: 6, borderWidth: 1, borderColor: "#2AA79B", alignItems: "center", justifyContent: "center", marginTop: 2, marginRight: 12, flexShrink: 0 },
  checkSelected: { backgroundColor: "#2AA79B" },
  checkMark: { color: "#0B0B0B", fontSize: 14, fontWeight: "700" },
  checkLabel: { color: "#C9C9C9", fontSize: 14, flex: 1, flexShrink: 1 },
  error: { color: "#E0706A", fontSize: 14, marginTop: 8, flexShrink: 1 },
  primary: { backgroundColor: "#2AA79B", borderRadius: 8, marginTop: 16, paddingVertical: 12, alignItems: "center", width: "100%" },
  primaryText: { color: "#0B0B0B", fontSize: 16, fontWeight: "700" },
  disabled: { opacity: 0.6 },
  outline: { borderWidth: 1, borderColor: "#2AA79B", borderRadius: 8, marginTop: 16, paddingVertical: 12, alignItems: "center", width: "100%" },
  outlineText: { color: "#2AA79B", fontSize: 16, fontWeight: "600" },
});
