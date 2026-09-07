import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { CustomerJourneyController, FuelResults, FuelType, GarageVehicle } from "./customer-journey";
import { FUEL_TYPES } from "./customer-journey";

const fuelLabels: Record<FuelType, string> = {
  gasolina: "Gasolina",
  etanol: "Etanol",
  diesel: "Diesel",
  gnv: "GNV",
};

export function FuelHistoryScreen({
  controller,
  vehicle,
  onBack,
}: {
  controller: CustomerJourneyController;
  vehicle: GarageVehicle;
  onBack: () => void;
}) {
  const [results, setResults] = useState<FuelResults | null>(null);
  const [odometerInput, setOdometerInput] = useState("");
  const [litersInput, setLitersInput] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const [fuelType, setFuelType] = useState<FuelType>("gasolina");
  const [noteInput, setNoteInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await controller.listFuel(vehicle.id);
    setLoading(false);
    if (!result.ok) { setError(result.message); return; }
    setResults(result.data);
  }, [controller, vehicle.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const register = async () => {
    setBusy(true);
    setError(null);
    const result = await controller.registerFuel(vehicle.id, {
      odometerValue: odometerInput,
      liters: litersInput,
      totalAmount: amountInput,
      fuelType,
      note: noteInput || undefined,
    });
    setBusy(false);
    if (!result.ok) { setError(result.message); return; }
    setOdometerInput("");
    setLitersInput("");
    setAmountInput("");
    setNoteInput("");
    await load();
    Alert.alert("Abastecimento registrado", "O consumo foi calculado quando houver intervalo válido de odômetro.");
  };

  const latest = results?.latest ?? null;
  const nextMinimum = results?.nextMinimum ?? 0;
  const vehicleName = vehicle.nickname ?? `${vehicle.brand} ${vehicle.model}`;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <Pressable style={styles.backRow} onPress={onBack}>
        <Text style={styles.backLabel}>← Voltar para a garagem</Text>
      </Pressable>
      <Text style={styles.brand}>VERAH</Text>
      <Text style={styles.eyebrow}>Abastecimentos</Text>
      <Text style={styles.title}>{vehicleName}</Text>
      <Text style={styles.body}>
        Registre cada abastecimento com o hodômetro atual. A VERAH calcula o
        consumo (km/L) somente quando há um intervalo válido entre registros.

      </Text>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Último abastecimento</Text>
        {loading ? (
          <Text style={styles.meta}>Carregando histórico…</Text>
        ) : latest ? (
          <>
            <Text style={styles.latestValue}>
              {fuelLabels[latest.fuelType]} · {latest.liters.toLocaleString("pt-BR")} L
            </Text>
            <Text style={styles.meta}>
              {formatDate(latest.recordedAt)} · {latest.odometerValue.toLocaleString("pt-BR")} km
            </Text>
            {latest.consumptionKmpl !== null ? (
              <Text style={styles.meta}>
                Consumo {latest.consumptionKmpl.toLocaleString("pt-BR")} km/L
              </Text>
            ) : (
              <Text style={styles.meta}>Sem intervalo válido para calcular consumo.</Text>
            )}
          </>
        ) : (
          <Text style={styles.meta}>Nenhum abastecimento registrado neste veículo.</Text>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Registrar abastecimento</Text>
        <TextInput
          style={styles.input}
          placeholder={nextMinimum ? `Hodômetro atual (mín. ${nextMinimum.toLocaleString("pt-BR")} km` : "Hodômetro atual (km)"}
          placeholderTextColor="#777777"
          keyboardType="number-pad"
          value={odometerInput}
          onChangeText={setOdometerInput}
        />
        <TextInput
          style={styles.input}
          placeholder="Litros abastecidos"
          placeholderTextColor="#777777"
          keyboardType="decimal-pad"
          value={litersInput}
          onChangeText={setLitersInput}
        />
        <TextInput
          style={styles.input}
          placeholder="Valor total (R$)"
          placeholderTextColor="#777777"
          keyboardType="decimal-pad"
          value={amountInput}
          onChangeText={setAmountInput}
        />
        <View style={styles.fuelRow}>
          {FUEL_TYPES.map((type) => (
            <Pressable
              key={type}
              style={[styles.fuelPill, fuelType === type && styles.fuelPillActive]}
              onPress={() => setFuelType(type)}
            >
              <Text style={[styles.fuelPillText, fuelType === type && styles.fuelPillTextActive]}>
                {fuelLabels[type]}
              </Text>
            </Pressable>
          ))}
        </View>
        <TextInput
          style={styles.input}
          placeholder="Observação (opcional)"
          placeholderTextColor="#777777"
          maxLength={200}
          value={noteInput}
          onChangeText={setNoteInput}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable style={[styles.primary, busy && styles.disabled]} disabled={busy} onPress={() => void register()}>
          <Text style={styles.primaryText}>{busy ? "Salvando…" : "Registrar abastecimento"}</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Histórico</Text>
        {loading ? (
          <Text style={styles.meta}>Carregando…</Text>
        ) : !results?.logs.length ? (
          <Text style={styles.empty}>Ainda não há abastecimentos registrados.</Text>
        ) : (
          results.logs.map((log) => (
            <View key={log.id} style={styles.rowCard}>
              <Text style={styles.rowValue}>
                {fuelLabels[log.fuelType]} · {log.liters.toLocaleString("pt-BR")} L
              </Text>
              <Text style={styles.meta}>
                {formatDate(log.recordedAt)} · {log.odometerValue.toLocaleString("pt-BR")} km
              </Text>
              {log.consumptionKmpl !== null ? (
                <Text style={styles.rowConsumption}>
                  Consumo {log.consumptionKmpl.toLocaleString("pt-BR")} km/L
                </Text>
              ) : null}
              {log.note ? <Text style={styles.rowNote}>{log.note}</Text> : null}
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const styles = StyleSheet.create({
  scroll: { flex: 1, width: "100%" },
  content: { width: "100%", maxWidth: 520, alignSelf: "center", padding: 18, paddingBottom: 64 },
  backRow: { paddingVertical: 6, alignSelf: "flex-start" },
  backLabel: { color: "#177F78", fontSize: 13, fontWeight: "700" },
  brand: { color: "#177F78", fontSize: 28, fontWeight: "800", letterSpacing: 1 },
  eyebrow: { color: "#A85F70", fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1.2, marginTop: 6 },
  title: { color: "#263238", fontSize: 23, fontWeight: "700", marginTop: 4 },
  body: { color: "#667085", fontSize: 15, lineHeight: 22, marginTop: 12, marginBottom:  16 },
  card: { backgroundColor: "#FFFFFF", borderRadius:  22, padding:  20, borderWidth: 1, borderColor: "#F5DCE1", marginBottom:  14 },
  sectionTitle: { color: "#263238", fontSize:  18, fontWeight: "700", marginBottom:  12 },
  latestValue: { color: "#177F78", fontSize:  30, fontWeight: "800", marginTop:  8 },
  meta: { color: "#667085", fontSize: 14, lineHeight: 21, marginTop:  6 },
  input: {
    backgroundColor: "#FFFFFF",
    borderWidth:  1,
    borderColor: "#E8E1E2",
    borderRadius:  12,
    color: "#263238",
    fontSize: 16,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical:  12,
  },
  error: { color: "#B84E5F", fontSize:  14, lineHeight:  20, marginBottom:  10 },
  primary: { backgroundColor: "#177F78", borderRadius:  14, paddingVertical:  14, alignItems: "center" },
  primaryText: { color: "#FFFFFF", fontSize:  15, fontWeight: "700" },
  disabled: { opacity: 0.6 },
  fuelRow: { flexDirection: "row", flexWrap: "wrap", gap:  8, marginBottom:  12 },
  fuelPill: { borderWidth:  1, borderColor: "#177F78", borderRadius:  999, paddingHorizontal:  11, paddingVertical:  8 },
  fuelPillActive: { backgroundColor: "#177F78" },
  fuelPillText: { color: "#177F78", fontSize:  13, fontWeight: "700" },
  fuelPillTextActive: { color: "#FFFFFF" },
  empty: { color: "#7A838B", fontSize:  14, lineHeight:  21, marginTop:  10 },
  rowCard: { borderWidth:  1, borderColor: "#EEF0F2", borderRadius:  14, padding:  14, marginTop:  10 },
  rowValue: { color: "#263238", fontSize:  17, fontWeight: "700" },
  rowConsumption: { color: "#177F78", fontSize:  13, fontWeight: "700", marginTop: 4 },
  rowNote: { color: "#667085", fontSize:  13, marginTop:  4 },
});