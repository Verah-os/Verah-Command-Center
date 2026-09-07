import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { CustomerJourneyController, GarageVehicle, MileageResults } from "./customer-journey";

export function MileageHistoryScreen({
  controller,
  vehicle,
  onBack,
}: {
  controller: CustomerJourneyController;
  vehicle: GarageVehicle;
  onBack: () => void;
}) {
  const [results, setResults] = useState<MileageResults | null>(null);
  const [mileageInput, setMileageInput] = useState("");
  const [noteInput, setNoteInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await controller.listMileage(vehicle.id);
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
    const result = await controller.registerMileage(vehicle.id, {
      mileageValue: mileageInput,
      note: noteInput || undefined,
    });
    setBusy(false);
    if (!result.ok) { setError(result.message); return; }
    setMileageInput("");
    setNoteInput("");
    await load();
    Alert.alert("Quilometragem registrada", "O hodômetro do veículo foi atualizado.");
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
      <Text style={styles.eyebrow}>Quilometragem</Text>
      <Text style={styles.title}>{vehicleName}</Text>
      <Text style={styles.body}>
        Registre o hodômetro atual. A VERAH guarda o histórico por veículo e
        sincroniza em qualquer dispositivo.

      </Text>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Quilometragem atual</Text>
        {loading ? (
          <Text style={styles.meta}>Carregando histórico…</Text>
        ) : latest ? (
          <Text style={styles.latestValue}>{latest.mileageValue.toLocaleString("pt-BR")} km</Text>
        ) : (
          <Text style={styles.meta}>Nenhuma leitura registrada neste veículo.</Text>
        )}
        {latest ? (
          <Text style={styles.meta}>
            {formatDate(latest.recordedAt)} · {latest.note ?? "Sem observação"}
          </Text>
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Registrar nova leitura</Text>
        <TextInput
          style={styles.input}
          placeholder={nextMinimum ? `Novo hodômetro (mín. ${nextMinimum.toLocaleString("pt-BR")} km)` : "Hodômetro atual (km)"}
          placeholderTextColor="#777777"
          keyboardType="number-pad"
          value={mileageInput}
          onChangeText={setMileageInput}
        />
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
          <Text style={styles.primaryText}>{busy ? "Salvando…" : "Registrar quilometragem"}</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Histórico</Text>
        {loading ? (
          <Text style={styles.meta}>Carregando…</Text>
        ) : !results?.logs.length ? (
          <Text style={styles.empty}>Ainda não há leituras registradas.</Text>
        ) : (
          results.logs.map((log) => (
            <View key={log.id} style={styles.rowCard}>
              <Text style={styles.rowValue}>{log.mileageValue.toLocaleString("pt-BR")} km</Text>
              <Text style={styles.meta}>{formatDate(log.recordedAt)}</Text>
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
  body: { color: "#667085", fontSize: 15, lineHeight: 22, marginTop: 12, marginBottom: 16 },
  card: { backgroundColor: "#FFFFFF", borderRadius: 22, padding: 20, borderWidth: 1, borderColor: "#F5DCE1", marginBottom: 14 },
  sectionTitle: { color: "#263238", fontSize: 18, fontWeight: "700", marginBottom: 12 },
  latestValue: { color: "#177F78", fontSize: 30, fontWeight: "800", marginTop: 8 },
  meta: { color: "#667085", fontSize: 14, lineHeight: 21, marginTop: 6 },
  input: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E8E1E2",
    borderRadius: 12,
    color: "#263238",
    fontSize: 16,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  error: { color: "#B84E5F", fontSize: 14, lineHeight: 20, marginBottom: 10 },
  primary: { backgroundColor: "#177F78", borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  primaryText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  disabled: { opacity: 0.6 },
  empty: { color: "#7A838B", fontSize: 14, lineHeight: 21, marginTop: 6 },
  rowCard: { borderWidth: 1, borderColor: "#EEF0F2", borderRadius: 14, padding: 14, marginTop: 10 },
  rowValue: { color: "#263238", fontSize: 17, fontWeight: "700" },
  rowNote: { color: "#667085", fontSize: 13, marginTop: 4 },
});