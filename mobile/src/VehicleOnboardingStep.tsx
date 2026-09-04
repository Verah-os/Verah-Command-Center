import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import {
  normalizeBrazilianPlate,
  type CustomerJourneyController,
} from "./customer-journey";
import { modelsForBrand, vehicleBrands } from "./vehicle-catalog";

type EntryMode = "plate" | "catalog" | null;

export function VehicleOnboardingStep({
  controller,
}: {
  controller: CustomerJourneyController;
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
  const [error, setError] = useState<string | null>(null);
  const [lookupMessage, setLookupMessage] = useState<string | null>(null);
  const models = modelsForBrand(brand);

  const clearVehicle = () => {
    setBrand("");
    setModel("");
    setModelYear("");
    setVersion("");
    setEngine("");
    setTransmission("");
    setConfirmed(false);
  };

  const chooseMode = (nextMode: Exclude<EntryMode, null>) => {
    setMode(nextMode);
    setError(null);
    setLookupMessage(null);
    clearVehicle();
    if (nextMode === "catalog") setPlate("");
  };

  const lookupPlate = () => {
    const normalized = normalizeBrazilianPlate(plate);
    if (!normalized) {
      setError("Placa inválida. Use o formato ABC1234 ou ABC1D23.");
      return;
    }
    setPlate(normalized);
    setError(null);

    // Same synthetic plate suggestion currently documented in verah.app (#139).
    // It is explicit demo data, never presented as an official plate lookup.
    if (normalized === "VRH1A23") {
      setBrand("Volkswagen");
      setModel("Polo");
      setModelYear("2022");
      setVersion("1.0 MPI");
      setEngine("1.0 flex");
      setTransmission("Manual de 5 marchas");
      setLookupMessage("Encontramos uma sugestão. Confira os dados antes de salvar.");
      return;
    }

    setMode("catalog");
    setLookupMessage(
      "Não encontramos uma sugestão automática para esta placa neste ambiente. Sua placa ficou preenchida; escolha a montadora e o modelo abaixo.",
    );
  };

  const submit = async () => {
    if (!plate.trim()) {
      setError("Para salvar neste build, informe a placa. Você pode escolher o carro primeiro.");
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
    if (!result.ok) setError(result.message);
  };

  if (mode === null) {
    return (
      <ScrollView contentContainerStyle={styles.form}>
        <Text style={styles.brand}>VERAH</Text>
        <Text style={styles.eyebrow}>Seu primeiro veículo</Text>
        <Text style={styles.title}>Vamos encontrar seu carro</Text>
        <Text style={styles.body}>
          Comece pela placa ou escolha a montadora e o modelo no catálogo da VERAH.
        </Text>
        <ChoiceCard
          title="Sei minha placa"
          description="Digite a placa para a VERAH tentar preencher os dados do veículo."
          onPress={() => chooseMode("plate")}
        />
        <ChoiceCard
          title="Não sei a placa"
          description="Escolha primeiro a montadora e o modelo, como em um catálogo automotivo."
          onPress={() => chooseMode("catalog")}
        />
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.form}>
      <Text style={styles.brand}>VERAH</Text>
      <Text style={styles.eyebrow}>Seu primeiro veículo</Text>
      <Text style={styles.title}>
        {mode === "plate" ? "Encontre pela placa" : "Escolha seu veículo"}
      </Text>
      <Text style={styles.body}>
        {mode === "plate"
          ? "Digite a placa. Quando houver uma sugestão disponível, a VERAH preenche os dados para você conferir."
          : "Selecione a montadora e o modelo. Se souber a placa, você já pode informá-la."}
      </Text>

      <TextInput
        style={styles.input}
        placeholder={mode === "plate" ? "Placa (ABC1234 ou ABC1D23)" : "Placa (se souber)"}
        placeholderTextColor="#777777"
        autoCapitalize="characters"
        autoCorrect={false}
        value={plate}
        onChangeText={(value) => {
          setPlate(value);
          if (mode === "plate") {
            setLookupMessage(null);
            clearVehicle();
          }
        }}
      />

      {mode === "plate" ? (
        <OutlineButton label="Buscar veículo" onPress={lookupPlate} />
      ) : null}
      {lookupMessage ? <Text style={styles.message}>{lookupMessage}</Text> : null}

      {mode === "catalog" || brand ? (
        <>
          <Text style={styles.sectionLabel}>Montadora</Text>
          <View style={styles.chips}>
            {vehicleBrands.map((item) => (
              <Chip
                key={item}
                label={item}
                selected={brand === item}
                onPress={() => {
                  setBrand(item);
                  setModel("");
                  setConfirmed(false);
                  setError(null);
                }}
              />
            ))}
          </View>
          {brand ? (
            <>
              <Text style={styles.sectionLabel}>Modelo</Text>
              <View style={styles.chips}>
                {models.map((item) => (
                  <Chip
                    key={item}
                    label={item}
                    selected={model === item}
                    onPress={() => {
                      setModel(item);
                      setConfirmed(false);
                      setError(null);
                    }}
                  />
                ))}
              </View>
            </>
          ) : null}
        </>
      ) : null}

      {brand && model ? (
        <>
          <TextInput
            style={styles.input}
            placeholder="Ano/modelo"
            placeholderTextColor="#777777"
            keyboardType="number-pad"
            value={modelYear}
            onChangeText={setModelYear}
          />
          <TextInput
            style={styles.input}
            placeholder="Versão (opcional)"
            placeholderTextColor="#777777"
            value={version}
            onChangeText={setVersion}
          />
          <TextInput
            style={styles.input}
            placeholder="Motorização (opcional)"
            placeholderTextColor="#777777"
            value={engine}
            onChangeText={setEngine}
          />
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
            <Text style={styles.checkLabel}>
              Confirmo que estes dados correspondem ao meu veículo: {brand} {model}.
            </Text>
          </Pressable>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable
            style={[styles.primary, busy && styles.disabled]}
            disabled={busy}
            onPress={() => void submit()}
          >
            <Text style={styles.primaryText}>{busy ? "Salvando…" : "Salvar e continuar"}</Text>
          </Pressable>
        </>
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : null}

      <OutlineButton label="Voltar às opções" onPress={() => setMode(null)} />
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
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

function OutlineButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.outline} onPress={onPress}>
      <Text style={styles.outlineText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  form: { width: "100%", maxWidth: 420, alignSelf: "center", paddingBottom: 32 },
  brand: { color: "#2AA79B", fontSize: 32, fontWeight: "700" },
  eyebrow: { color: "#2AA79B", fontSize: 14, fontWeight: "600", marginTop: 16 },
  title: { color: "#FFFFFF", fontSize: 20, fontWeight: "600", marginTop: 4 },
  body: { color: "#C9C9C9", fontSize: 15, lineHeight: 21, marginTop: 12, marginBottom: 20 },
  input: { backgroundColor: "#242424", borderRadius: 8, color: "#FFFFFF", fontSize: 16, marginBottom: 12, paddingHorizontal: 14, paddingVertical: 12 },
  choice: { backgroundColor: "#242424", borderColor: "#2AA79B", borderRadius: 12, borderWidth: 1, marginBottom: 12, padding: 16 },
  choiceTitle: { color: "#FFFFFF", fontSize: 17, fontWeight: "700" },
  choiceDescription: { color: "#C9C9C9", fontSize: 14, lineHeight: 20, marginTop: 6 },
  message: { color: "#C9C9C9", fontSize: 14, lineHeight: 20, marginBottom: 16, marginTop: 10 },
  sectionLabel: { color: "#FFFFFF", fontSize: 15, fontWeight: "600", marginBottom: 10, marginTop: 10 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  chip: { borderColor: "#555555", borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  chipSelected: { backgroundColor: "#2AA79B", borderColor: "#2AA79B" },
  chipText: { color: "#C9C9C9", fontSize: 13 },
  chipTextSelected: { color: "#0B0B0B", fontWeight: "700" },
  checkRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginTop: 4, marginBottom: 8 },
  check: { width: 22, height: 22, borderRadius: 6, borderWidth: 1, borderColor: "#2AA79B", alignItems: "center", justifyContent: "center", marginTop: 2 },
  checkSelected: { backgroundColor: "#2AA79B" },
  checkMark: { color: "#0B0B0B", fontSize: 14, fontWeight: "700" },
  checkLabel: { color: "#C9C9C9", fontSize: 14, flex: 1 },
  error: { color: "#E0706A", fontSize: 14, marginTop: 4 },
  primary: { backgroundColor: "#2AA79B", borderRadius: 8, marginTop: 16, paddingVertical: 12, alignItems: "center" },
  primaryText: { color: "#0B0B0B", fontSize: 16, fontWeight: "700" },
  disabled: { opacity: 0.6 },
  outline: { borderWidth: 1, borderColor: "#2AA79B", borderRadius: 8, marginTop: 16, paddingVertical: 12, alignItems: "center" },
  outlineText: { color: "#2AA79B", fontSize: 16, fontWeight: "600" },
});
