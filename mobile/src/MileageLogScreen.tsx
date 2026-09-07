import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { GarageVehicle } from "./customer-journey";
import {
  createVehicleMileageController,
  type VehicleMileageController,
  type VehicleMileageLog,
} from "./vehicle-mileage";
import { getVehicleMileageFacade } from "./vehicle-mileage-supabase";

export function MileageLogScreen({
  vehicle,
  onDone,
}: {
  vehicle: GarageVehicle;
  onDone: () => void;
}) {
  const [controller, setController] = useState<VehicleMileageController | null>(null);

  useEffect(() => {
    const facade = getVehicleMileageFacade(vehicle.id);
    if (!facade) {
      setController(null);
      return;
    }
    const next = createVehicleMileageController(facade, vehicle.id);
    void next.load();
    setController(next);
  }, [vehicle.id]);

  if (!controller) {
    return <MileageSetupMissing onDone={onDone} />;
  }
  return <MileageContent controller={controller} vehicle={vehicle} onDone={onDone} />;
}

function MileageContent({
  controller,
  vehicle,
  onDone,
}: {
  controller: VehicleMileageController;
  vehicle: GarageVehicle;
  onDone: () => void;
}) {
  const state = useSyncExternalStore(controller.subscribe, controller.getState);
  const [odometerKm, setOdometerKm] = useState("");
  const [recordedAt, setRecordedAt] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latestKm = state.status === "ready" ? state.latestKm : null;

  const submit = async () => {
    setBusy(true);
    setError(null);
    const result = await controller.addEntry({
      odometerKm: odometerKm || "",
      recordedAt: recordedAt || undefined,
      note,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setOdometerKm("");
    setNote("");
    Alert.alert("Quilometragem registrada", "O novo valor foi salvo no histórico do veículo.");
  };

  if (state.status === "loading") {
    return (
      <MileageShell vehicle={vehicle} onDone={onDone}>
        <ActivityIndicator color="#177F78" />
        <Text style={styles.centerNote}>Carregando histórico…</Text>
      </MileageShell>
    );
  }
  if (state.status === "error") {
    return (
      <MileageShell vehicle={vehicle} onDone={onDone}>
        <Text style={styles.title}>Não foi possível carregar o histórico</Text>
        <Text style={styles.error}>{state.message}</Text>
        <Pressable style={styles.primaryButton} onPress={() => void controller.load()}>
          <Text style={styles.primaryButtonText}>Tentar novamente</Text>
        </Pressable>
      </MileageShell>
    );
  }

  return (
    <MileageShell vehicle={vehicle} onDone={onDone}>
      <Text style={styles.eyebrow}>Quilometragem</Text>
      <Text style={styles.title}>
        {vehicle.nickname ?? `${vehicle.brand} ${vehicle.model}`}
      </Text>

      <View style={styles.latestCard}>
        <Text style={styles.latestLabel}>Última registrada</Text>
        <Text style={styles.latestValue}>
          {latestKm === null ? "—" : `${latestKm.toLocaleString("pt-BR")} km`}
        </Text>
      </View>

      <Text style={styles.label}>Quilometragem atual (km)</Text>
      <TextInput
        style={styles.input}
        value={odometerKm}
        onChangeText={setOdometerKm}
        keyboardType="number-pad"
        placeholder="ex.: 45.250"
        placeholderTextColor="#8A9199"
      />
      <Text style={styles.label}>Data do registro (opcional)</Text>
      <TextInput
        style={styles.input}
        value={recordedAt}
        onChangeText={setRecordedAt}
        placeholder="AAAA-MM-DD (hoje se vazio)"
        placeholderTextColor="#8A9199"
        autoCapitalize="none"
      />
      <Text style={styles.label}>Observação (opcional)</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={note}
        onChangeText={setNote}
        multiline
        textAlignVertical="top"
        placeholder="ex.: abastecimento completo"
        placeholderTextColor="#8A9199"
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable
        style={[styles.primaryButton, busy && styles.disabled]}
        disabled={busy}
        onPress={() => void submit()}
      >
        <Text style={styles.primaryButtonText}>
          {busy ? "Salvando…" : "Registrar quilometragem"}
        </Text>
      </Pressable>
      <Pressable style={styles.outlineButton} onPress={onDone}>
        <Text style={styles.outlineButtonText}>Voltar</Text>
      </Pressable>

      <HistoryList logs={state.logs} latestKm={latestKm} />
    </MileageShell>
  );
}

function HistoryList({ logs, latestKm }: { logs: VehicleMileageLog[]; latestKm: number | null }) {
  const sorted = useMemo(
    () =>
      [...logs].sort(
        (a, b) =>
          b.recordedAt.localeCompare(a.recordedAt) ||
          b.createdAt.localeCompare(a.createdAt),
      ),
    [logs],
  );

  if (!sorted.length) {
    return (
      <View style={styles.historyCard}>
        <Text style={styles.historyTitle}>Histórico</Text>
        <Text style={styles.empty}>
          Nenhum registro ainda. As quilometragens ficam salvas por veículo e
          acompanham você em qualquer dispositivo.

        </Text>
      </View>
    );
  }

  return (
    <View style={styles.historyCard}>
      <Text style={styles.historyTitle}>Histórico</Text>
      {sorted.map((log) => (
        <View key={log.id} style={styles.historyRow}>
          <Text style={styles.historyKm}>
            {log.odometerKm.toLocaleString("pt-BR")} km
          </Text>
          <Text style={styles.historyMeta}>
            {[log.odometerKm === latestKm ? "último" : null, formatDate(log.recordedAt)].filter(Boolean).join(" · ")}
          </Text>
          {log.note ? <Text style={styles.historyNote}>{log.note}</Text> : null}
        </View>
      ))}
    </View>
  );
}

function MileageShell({
  vehicle,
  onDone,
  children,
}: {
  vehicle: GarageVehicle;
  onDone: () => void;
  children: React.ReactNode;
}) {
  return (
    <ScrollView
      style={styles.shell}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={onDone}>
          <Text style={styles.backLabel}>← Voltar</Text>
        </Pressable>
        <Text style={styles.brand}>VERAH</Text>
        <Text style={styles.kicker}>Quilometragem por veículo</Text>
      </View>
      {children}
    </ScrollView>
  );
}

function MileageSetupMissing({ onDone }: { onDone: () => void }) {
  return (
    <View style={styles.failClosed}>
      <Text style={styles.title}>Backend não configurado</Text>
      <Text style={styles.meta}>
        O histórico de quilometragem precisa do Supabase público configurado.
      </Text>
      <Pressable style={styles.outlineButton} onPress={onDone}>
        <Text style={styles.outlineButtonText}>Voltar</Text>
      </Pressable>
    </View>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("pt-BR");
}

const styles = StyleSheet.create({
  shell: { flex: 1, width: "100%", backgroundColor: "#FFF9F8" },
  content: { width: "100%", maxWidth: 520, alignSelf: "center", padding: 18, paddingBottom: 48 },
  header: { marginBottom: 14 },
  backButton: { alignSelf: "flex-start", paddingVertical: 6 },
  backLabel: { color: "#A85F70", fontSize: 13, fontWeight: "700" },
  brand: { color: "#177F78", fontSize: 28, fontWeight: "800", letterSpacing: 1 },
  kicker: { color: "#A85F70", fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1.2, marginTop: 4 },
  eyebrow: { color: "#A85F70", fontSize: 12, fontWeight: "800", textTransform: "uppercase", letterSpacing: 1.1, marginBottom: 4 },
  title: { color: "#263238", fontSize:  ​21, fontWeight: "700", marginTop: 4, marginBottom: 4 },
  centerNote: { color: "#667085", fontSize: 14, marginTop: 10 },
  failClosed: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  latestCard: { backgroundColor: "#ECF8F6", borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: "#CBECE7" },
  latestLabel: { color: "#176A65", fontSize: 13, fontWeight: "700" },
  latestValue: { color: "#263238", fontSize: 26, fontWeight: "800", marginTop: 4 },
  label: { color: "#344054", fontSize: 13, fontWeight: "700", marginTop: 14, marginBottom: 7 },
  input: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DED9DA",
    borderRadius: 12,
    paddingHorizontal: 13,
    paddingVertical: 12,
    fontSize: 15,
    color: "#263238",
    marginBottom: 4,
  },
  multiline: { minHeight: 80 },
  primaryButton: {
    backgroundColor: "#177F78",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 16,
  },
  primaryButtonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  outlineButton: {
    borderWidth: 1,
    borderColor: "#177F78",
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: "center",
    marginTop: 10,
  },
  outlineButtonText: { color: "#177F78", fontSize: 14, fontWeight: "700" },
  disabled: { opacity: 0.6 },
  error: { color: "#C84E59", fontSize: 13, marginTop: 10 },
  meta: { color: "#667085", fontSize: 14, lineHeight: 20, marginTop: 5 },
  empty: { color: "#7A838B", fontSize: 13, lineHeight: 19, marginTop: 8 },
  historyCard: { borderWidth: 1, borderColor: "#EEF0F2", borderRadius: 14, padding: 14, marginTop: 16 },
  historyTitle: { color: "#263238", fontSize: 15, fontWeight: "700", marginBottom: 8 },
  historyRow: { borderTopWidth: 1, borderTopColor: "#F0EAEB", paddingVertical: 10 },
  historyKm: { color: "#177F78", fontSize: 15, fontWeight: "800" },
  historyMeta: { color: "#7A838B", fontSize: 12, marginTop: 2 },
  historyNote: { color: "#52606D", fontSize: 13, marginTop: 3 },
});