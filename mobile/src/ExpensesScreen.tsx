import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { CustomerJourneyController, ExpenseCategory, GarageVehicle, VehicleExpenseSummary } from "./customer-journey";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  expenseCategoryLabel,
  mapExpenseCategory,
  formatBrzlCents,
  formatCostPerKm,
  formatDistanceKm,
} from "./customer-journey";

const todayIso = () => new Date().toISOString().slice(0, 10);

export function ExpensesScreen({
  controller,
  vehicle,
  onExpensePeriodChange,
  onBack,
}: {
  controller: CustomerJourneyController;
  vehicle: GarageVehicle;
  onExpensePeriodChange?: (periodDays: number | null) => void;
  onBack: () => void;
}) {
  const [summary, setSummary] = useState<VehicleExpenseSummary | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [periodDays, setPeriodDays] = useState<number | null>(null);
  const [category, setCategory] = useState<ExpenseCategory>("outros");
  const [amount, setAmount] = useState("");
  const [occurredOn, setOccurredOn] = useState(todayIso());
  const [odometer, setOdometer] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSummary = useCallback(async (days: number | null) => {
    if (!controller.refreshExpenses) return;
    await controller.refreshExpenses(days);
    setPeriodDays(days);
    setUnavailable(false);
  }, [controller]);

  useEffect(() => {
    void loadSummary(periodDays);
  }, [loadSummary, periodDays]);

  const register = async () => {
    setBusy(true);
    setError(null);
    const rawAmount = amount.trim().replace(",", ".");
    const cents = Number(rawAmount);
    if (!Number.isFinite(cents) || cents <= 0) {
      setError("Informe o valor da despesa acima de zero."); setBusy(false); return;
    }
    if (!Number.isSafeInteger(Math.round(cents * 100)) || Math.round(cents * 100) > 2_147_483_647) {
      setError("Valor acima do limite suportado."); setBusy(false); return;
    }
    const date = occurredOn.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > todayIso()) {
      setError("Informe uma data válida até hoje."); setBusy(false); return;
    }
    const odometerValue = odometer.trim();
    if (odometerValue && (!Number.isInteger(Number(odometerValue)) || Number(odometerValue) < 0 || Number(odometerValue) > 2000000)) {
      setError("Informe uma quilometragem válida."); setBusy(false); return;
    }
    const descriptionValue = description.trim();
    if (descriptionValue.length > 160) {
      setError("Descrição muito longa (limite de 160 caracteres)."); setBusy(false); return;
    }
    const result = await controller.registerExpense(vehicle.id, {
      category,
      amountCents: Math.round(cents * 100),
      occurredOn: date,
      odometerKm: odometerValue ? Number(odometerValue) : null,
      description: descriptionValue || null,
    });
    setBusy(false);
    if (!result.ok) { setError(result.message); return; }
    setAmount(""); setOdometer(""); setDescription("");
    await loadSummary(periodDays);
    Alert.alert("Despesa registrada", "A despesa entrou no resumo de custos do veículo.");
  };

  const vehicleName = vehicle.nickname ?? `${vehicle.brand} ${vehicle.model}`;
  const mappedCategory = mapExpenseCategory(category);
  const currentCategory: ExpenseCategory = mappedCategory ?? "outros";

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
      <Text style={styles.eyebrow}>Despesas do veículo</Text>
      <Text style={styles.title}>{vehicleName}</Text>
      <Text style={styles.body}>
        Registre uma despesa manual para refletir no resumo de custos. As
        despesas ficam na mesma base canônica usada pela Web: quilometragem,
        manutenção, combustível e documentos compartilham a mesma fonte.
      </Text>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Quanto meu carro me custa?</Text>
        {summary ? (
          <>
            <Text style={styles.expensesTotal}>{formatBrzlCents(summary.totalCents)}</Text>
            <Text style={styles.meta}>
              {summary.expenseCount} {summary.expenseCount === 1 ? "despesa" : "despesas"} ·{" "}
              {summary.distanceKm !== null ? formatDistanceKm(summary.distanceKm) : "sem km válido"}
              {summary.costPerKmCents !== null ? ` · ${formatCostPerKm(summary.costPerKmCents)}` : ""}
            </Text>
          </>
        ) : unavailable ? (
          <Text style={styles.meta}>Despesas indisponíveis no momento. Tente novamente em instantes.</Text>
        ) : (
          <Text style={styles.meta}>Carregando resumo…</Text>
        )}
        <View style={styles.periodRow}>
          {[
            { label: "30 dias", days: 30 },
            { label: "90 dias", days: 90 },
            { label: "Tudo", days: null },
          ].map((option) => (
            <Pressable
              key={option.label}
              onPress={() => void loadSummary(option.days)}
              style={[styles.periodChip, periodDays === option.days && styles.periodChipActive]}
            >
              <Text style={[styles.periodChipText, periodDays === option.days && styles.periodChipTextActive]}>
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Registrar despesa</Text>
        <View style={styles.categoryRow}>
          {EXPENSE_CATEGORIES.map((item) => (
            <Pressable
              key={item}
              style={[styles.categoryPill, currentCategory === item && styles.categoryPillActive]}
              onPress={() => setCategory(item)}
            >
              <Text style={[styles.categoryPillText, currentCategory === item && styles.categoryPillTextActive]}>
                {EXPENSE_CATEGORY_LABELS[item]}
              </Text>
            </Pressable>
          ))}
        </View>
        <TextInput
          style={styles.input}
          placeholder="Valor (R$)"
          placeholderTextColor="#777777"
          keyboardType="decimal-pad"
          value={amount}
          onChangeText={setAmount}
        />
        <TextInput
          style={styles.input}
          placeholder="Data (AAAA-MM-DD)"
          placeholderTextColor="#777777"
          autoCapitalize="none"
          value={occurredOn}
          onChangeText={setOccurredOn}
        />
        <TextInput
          style={styles.input}
          placeholder="Quilometragem (km, opcional)"
          placeholderTextColor="#777777"
          keyboardType="number-pad"
          value={odometer}
          onChangeText={setOdometer}
        />
        <TextInput
          style={styles.input}
          placeholder="Descrição (opcional)"
          placeholderTextColor="#777777"
          maxLength={160}
          value={description}
          onChangeText={setDescription}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable style={[styles.primary, busy && styles.disabled]} disabled={busy} onPress={() => void register()}>
          <Text style={styles.primaryText}>{busy ? "Salvando…" : "Registrar despesa"}</Text>
        </Pressable>
      </View>

      <Text style={styles.footnote}>
        Categoria selecionada: {expenseCategoryLabel(currentCategory)}. A VERAH nunca
        cria ledger paralelo: cada despesa fica em <Text style={styles.mono}>vehicle_expenses</Text> com a mesma
        proteção de ownership da Web.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: "#FAF7F5" },
  content: { padding: 20, paddingBottom: 48 },
  backRow: { alignSelf: "flex-start", marginBottom: 12 },
  backLabel: { color: "#6D4C41", fontSize: 15, fontWeight: "600" },
  brand: { color: "#814455", fontSize: 24, fontWeight: "800" },
  eyebrow: { color: "#6D4C41", fontSize: 13, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8, marginTop: 8 },
  title: { color: "#263238", fontSize: 24, fontWeight: "800", marginTop: 4 },
  body: { color: "#667085", fontSize: 14, marginTop: 8 },
  card: { backgroundColor: "#FFFFFF", borderRadius: 16, padding: 16, marginTop: 16 },
  sectionTitle: { color: "#263238", fontSize: 16, fontWeight: "700" },
  expensesTotal: { color: "#263238", fontSize: 30, fontWeight: "800", marginTop: 6 },
  meta: { color: "#667085", fontSize: 13, marginTop: 4 },
  periodRow: { flexDirection: "row", marginTop: 12, gap: 8 },
  periodChip: { borderWidth: 1, borderColor: "#E4D5D2", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  periodChipActive: { backgroundColor: "#814455", borderColor: "#814455" },
  periodChipText: { color: "#6D4C41", fontSize: 13, fontWeight: "600" },
  periodChipTextActive: { color: "#FFFFFF" },
  categoryRow: { flexDirection: "row", marginTop: 12, gap: 8, flexWrap: "wrap" },
  categoryPill: { borderWidth: 1, borderColor: "#E4D5D2", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  categoryPillActive: { backgroundColor: "#814455", borderColor: "#814455" },
  categoryPillText: { color: "#6D4C41", fontSize: 13, fontWeight: "600" },
  categoryPillTextActive: { color: "#FFFFFF" },
  input: { borderWidth: 1, borderColor: "#E4D5D2", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12, marginTop: 12, color: "#263238", fontSize: 15, backgroundColor: "#FFFFFF" },
  error: { color: "#B3261E", fontSize: 13, marginTop: 8 },
  primary: { backgroundColor: "#814455", borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 16 },
  primaryText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  disabled: { opacity: 0.6 },
  footnote: { color: "#667085", fontSize: 12, marginTop: 16 },
  mono: { fontFamily: "monospace", color: "#6D4C41" },
});