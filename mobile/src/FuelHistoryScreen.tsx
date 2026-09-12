import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type {
  ChargingLog,
  ChargingType,
  CustomerJourneyController,
  EnergyHistoryEntry,
  FuelLog,
  FuelType,
  GarageVehicle,
} from "./customer-journey";
import {
  CHARGING_TYPES,
  CHARGING_TYPE_LABELS,
  CHARGING_UNAVAILABLE_MESSAGE,
  FUEL_TYPES,
  FUEL_UNAVAILABLE_MESSAGE,
  chargingTypeLabel,
  formatBrzlCents,
  formatEnergyEfficiency,
  formatEnergyQuantity,
  mergeEnergyHistory,
} from "./customer-journey";

type SourceAvailability = "available" | "unavailable" | "loading";

const fuelLabels: Record<FuelType, string> = {
  gasolina: "Gasolina",
  etanol:"Etanol",
  diesel:"Diesel",
  gnv:"GNV",
};

type EnergyMode = "combustao" | "eletrico";
type EnergyResults<T> = { logs: T[]; latest:T | null; nextMinimum:number };

export function FuelHistoryScreen({
  controller,
  vehicle,
  onBack,
}: {
  controller:CustomerJourneyController;
  vehicle:GarageVehicle;
  onBack: () => void;
}) {
  const [fuelResults, setFuelResults] = useState<EnergyResults<FuelLog> | null>(null);
  const [chargingResults, setChargingResults] = useState<EnergyResults<ChargingLog> | null>(null);
  const [fuelAvailability, setFuelAvailability] = useState<SourceAvailability>("loading");
  const [chargingAvailability, setChargingAvailability] = useState<SourceAvailability>("loading");
  const [mode, setMode] = useState<EnergyMode>("combustao");
  const [odometerInput, setOdometerInput] = useState("");
  const [litersInput, setLitersInput] = useState("");
  const [kwhInput, setKwhInput] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const [fuelType, setFuelType] = useState<FuelType>("gasolina");
  const [chargingType, setChargingType] = useState<ChargingType>(CHARGING_TYPES[0]);
  const [batteryInput, setBatteryInput] = useState("");
  const [noteInput, setNoteInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setFuelAvailability("loading");
    setChargingAvailability("loading");
    const [fuelResult, chargingResult] = await Promise.all([
      controller.listFuel(vehicle.id),
      controller.listCharging(vehicle.id),
    ]);
    setLoading(false);
    if (fuelResult.ok) {
      setFuelResults(fuelResult.data);
      setFuelAvailability("available");
    } else {
      setFuelResults(null);
      setFuelAvailability("unavailable");
    }
    if (chargingResult.ok) {
      setChargingResults(chargingResult.data);
      setChargingAvailability("available");
    } else {
      setChargingResults(null);
      setChargingAvailability("unavailable");
    }
    }, [controller, vehicle.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const register = async () => {
    setBusy(true);
    setError(null);
    if (mode === "combustao") {
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
      return;
    }
    const result = await controller.registerCharging(vehicle.id, {
      odometerValue: odometerInput,
      kwh: kwhInput,
      totalAmount: amountInput,
      batteryPercent: batteryInput.trim() ? batteryInput : undefined,
      chargingType,
      note: noteInput || undefined,
    });
    setBusy(false);
    if (!result.ok) { setError(result.message); return; }
    setOdometerInput("");
    setKwhInput("");
    setAmountInput("");
    setBatteryInput("");
    setNoteInput("");
    await load();
    Alert.alert("Recarga registrada", "A eficiência foi calculada quando houver intervalo válido de odômetro.");
  };

  const latestFuel = fuelResults?.latest ?? null;
  const latestCharging = chargingResults?.latest ?? null;
  const fuelUnavailable = fuelAvailability === "unavailable";
  const chargingUnavailable = chargingAvailability === "unavailable";
  const activeUnavailable = mode === "combustao" ? fuelUnavailable : chargingUnavailable;
  const nextMinimum = mode === "combustao"
    ? (fuelResults?.nextMinimum ?? 0)
    : (chargingResults?.nextMinimum ?? 0);
  const blend = mergeEnergyHistory(fuelResults?.logs ?? [], chargingResults?.logs ?? []);
  const history: EnergyHistoryEntry[] = mode === "combustao"
    ? blend.filter((entry) => entry.kind === "fuel")
    : blend.filter((entry) => entry.kind === "charging");
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
      <Text style={styles.eyebrow}>Abastecimentos e recargas</Text>
      <Text style={styles.title}>{vehicleName}</Text>
      <Text style={styles.body}>
        Registre cada abastecimento (litros) ou recarga (kWh) com o hodômetro
        atual.A VERAH calcula consumo (km/L) ou eficiência (km/kWh) somente
        quando há um intervalo válido entre registros. Combustão e elétrico
        continuam em unidades separadas: litros nunca viram kWh..
      </Text>

      <View style={styles.modeRow}>
        <Pressable
          accessibilityRole="button"
          style={[styles.modePill, mode === "combustao" && styles.modePillActive]}
          onPress={() => setMode("combustao")}
        >
          <Text style={[styles.modePillText, mode === "combustao" && styles.modePillTextActive]}>Combustão</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          style={[styles.modePill, mode === "eletrico" && styles.modePillActive]}
          onPress={() => setMode("eletrico")}
        >
          <Text style={[styles.modePillText, mode === "eletrico" && styles.modePillTextActive]}>Elétrico</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{mode === "combustao" ? "Último abastecimento" : "Última recarga"}</Text>
        {loading ? (
          <Text style={styles.meta}>Carregando histórico…</Text>
        ) : mode === "combustao" ? (
          fuelUnavailable ? (
            <Text style={styles.meta}>{FUEL_UNAVAILABLE_MESSAGE}</Text>
          ) : latestFuel ? (
            <>
              <Text style={styles.latestValue}>
                {`${fuelLabels[latestFuel.fuelType ?? "gasolina"]} · ${formatEnergyQuantity(latestFuel.liters, "L")}`}
              </Text>
              <Text style={styles.meta}>
                {formatDate(latestFuel.recordedAt)} · {latestFuel.odometerValue.toLocaleString("pt-BR")} km
              </Text>
              {latestFuel.consumptionKmpl !== null ? (
                <Text style={styles.meta}>Consumo {formatDecimal(latestFuel.consumptionKmpl)} km/L</Text>
              ) : (
                <Text style={styles.meta}>Sem intervalo válido para calcular consumo.</Text>
              )}
            </>
          ) : (
            <Text style={styles.meta}>Nenhum abastecimento registrado neste veículo.</Text>
          )
        ) : chargingUnavailable ? (
          <Text style={styles.meta}>{CHARGING_UNAVAILABLE_MESSAGE}</Text>
        ) : latestCharging ? (
          <>
            <Text style={styles.latestValue}>
              {`${chargingTypeLabel(latestCharging.chargingType)} · ${formatEnergyQuantity(latestCharging.kwh, "kWh")}`}
            </Text>
            <Text style={styles.meta}>
              {formatDate(latestCharging.recordedAt)} · {latestCharging.odometerValue.toLocaleString("pt-BR")} km
            </Text>
            {latestCharging.consumptionKmKwh !== null ? (
              <Text style={styles.meta}>Eficiência {formatDecimal(latestCharging.consumptionKmKwh)} km/kWh</Text>
            ) : (
              <Text style={styles.meta}>Sem intervalo válido para calcular eficiência.</Text>
            )}
            {latestCharging.batteryPercent !== null && latestCharging.batteryPercent !== undefined ? (
              <Text style={styles.meta}>Bateria {latestCharging.batteryPercent}%</Text>
            ) : null}
          </>
        ) : (
          <Text style={styles.meta}>Nenhuma recarga registrada neste veículo.</Text>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{mode === "combustao" ? "Registrar abastecimento" : "Registrar recarga"}</Text>
        {loading ? null : activeUnavailable ? (
          <Text style={styles.meta}>{mode === "combustao" ? FUEL_UNAVAILABLE_MESSAGE : CHARGING_UNAVAILABLE_MESSAGE}</Text>
        ) : (
          <>
        <TextInput
          style={styles.input}
          placeholder={nextMinimum ? `Hodômetro atual (mín. ${nextMinimum.toLocaleString("pt-BR")} km` : "Hodômetro atual (km)"}
          placeholderTextColor="#777777"
          keyboardType="number-pad"
          value={odometerInput}
          onChangeText={setOdometerInput}
        />
        {mode === "combustao" ? (
          <TextInput
            style={styles.input}
            placeholder="Litros abastecidos"
            placeholderTextColor="#777777"
            keyboardType="decimal-pad"
            value={litersInput}
            onChangeText={setLitersInput}
          />
        ) : (
          <TextInput
            style={styles.input}
            placeholder="Energia da recarga (kWh)"
            placeholderTextColor="#777777"
            keyboardType="decimal-pad"
            value={kwhInput}
            onChangeText={setKwhInput}
          />
        )}
        <TextInput
          style={styles.input}
          placeholder="Valor total (R$)"
          placeholderTextColor="#777777"
          keyboardType="decimal-pad"
          value={amountInput}
          onChangeText={setAmountInput}
        />
        {mode === "combustao" ? (
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
        ) : (
          <>
            <View style={styles.fuelRow}>
              {CHARGING_TYPES.map((type) => (
                <Pressable
                  key={type}
                  style={[styles.fuelPill, chargingType === type && styles.fuelPillActive]}
                  onPress={() => setChargingType(type)}
                >
                  <Text style={[styles.fuelPillText, chargingType === type && styles.fuelPillTextActive]}>
                    {CHARGING_TYPE_LABELS[type]}
                  </Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              style={styles.input}
              placeholder="Bateria ao final (%, opcional)"
              placeholderTextColor="#777777"
              keyboardType="number-pad"
              value={batteryInput}
              onChangeText={setBatteryInput}
            />
          </>
        )}
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
          <Text style={styles.primaryText}>
            {busy ? "Salvando…" : mode === "combustao" ? "Registrar abastecimento" : "Registrar recarga"}
          </Text>
        </Pressable>
          </>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Histórico {mode === "combustao" ? "(litros)" : "(kWh)"}</Text>
        {loading ? (
          <Text style={styles.meta}>Carregando…</Text>
        ) : activeUnavailable ? (
          <Text style={styles.meta}>{mode === "combustao" ? FUEL_UNAVAILABLE_MESSAGE : CHARGING_UNAVAILABLE_MESSAGE}</Text>
        ) : !history.length ? (
          <Text style={styles.empty}>
            {mode === "combustao"
              ? "Ainda não há abastecimentos registrados."
              : "Ainda não há recargas registradas."}
          </Text>
        ) : (
          history.map((entry: EnergyHistoryEntry) => (
            <View key={`${entry.kind}:${entry.id}`} style={styles.rowCard}>
              <Text style={styles.rowValue}>
                {entry.kind === "fuel"
                  ? `${fuelLabels[entry.fuelType ?? "gasolina"]} · ${formatEnergyQuantity(entry.quantity, "L")}`
                  : `${chargingTypeLabel(entry.chargingType)} · ${formatEnergyQuantity(entry.quantity, "kWh")}`}
              </Text>
              <Text style={styles.meta}>
                {formatDate(entry.recordedAt)} · {entry.odometerValue.toLocaleString("pt-BR")} km
              </Text>
              {entry.batteryPercent !== null && entry.batteryPercent !== undefined ? (
                <Text style={styles.meta}>Bateria {entry.batteryPercent}%</Text>
              ) : null}
              {entry.efficiency !== null ? (
                <Text style={styles.rowConsumption}>{formatEnergyEfficiency(entry)}</Text>
              ) : null}
              {entry.totalAmount > 0 ? (
                <Text style={styles.rowNote}>{formatBrzlCents(entry.totalAmount)}</Text>
              ) : null}
              {entry.note ? <Text style={styles.rowNote}>{entry.note}</Text> : null}
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
    day:"2-digit",
    month:"short",
    year:"numeric",
  });
}

function formatDecimal(value: number): string {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
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
  card: { backgroundColor: "#FFFFFF", borderRadius: 22, padding: 20, borderWidth: 1, borderColor: "#F5DCE1", marginBottom: 14 },
  sectionTitle: { color: "#263238", fontSize: 18, fontWeight: "700", marginBottom: 12 },
  latestValue: { color: "#177F78", fontSize: 30, fontWeight: "800", marginTop: 8 },
  meta: { color: "#667085", fontSize:  14, lineHeight:  21, marginTop:  6 },
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
  error: { color: "#B84E5F", fontSize: 14, lineHeight: 20, marginBottom:  10 },
  primary: { backgroundColor: "#177F78", borderRadius: 14, paddingVertical:  14, alignItems: "center" },
  primaryText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  disabled: { opacity: 0.6 },
  fuelRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom:  12 },
  fuelPill: { borderWidth: 1, borderColor: "#177F78", borderRadius: 999, paddingHorizontal:  11, paddingVertical: 8 },
  fuelPillActive: { backgroundColor: "#177F78" },
  fuelPillText: { color: "#177F78", fontSize: 13, fontWeight: "700" },
  fuelPillTextActive: { color: "#FFFFFF" },
  modeRow: { flexDirection: "row", gap: 8, marginBottom:  14 },
  modePill: { borderWidth: 1, borderColor: "#177F78", borderRadius: 999, paddingHorizontal:  16, paddingVertical:  10 },
  modePillActive: { backgroundColor: "#177F78" },
  modePillText: { color: "#177F78", fontSize: 14, fontWeight: "700" },
  modePillTextActive: { color: "#FFFFFF" },
  empty: { color: "#7A838B", fontSize: 14, lineHeight: 21, marginTop:  10 },
  rowCard: { borderWidth: 1, borderColor: "#EEF0F2", borderRadius: 14, padding:  14, marginTop:  10 },
  rowValue: { color: "#263238", fontSize: 17, fontWeight: "700" },
  rowConsumption: { color: "#177F78", fontSize:  13, fontWeight: "700", marginTop:  4 },
  rowNote: { color: "#667085", fontSize: 13, marginTop: 4 },
});
