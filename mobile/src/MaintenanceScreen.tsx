import { useState } from "react";
import { Pressable, ScrollView, Switch, Text, TextInput } from "react-native";
import type { CustomerJourneyController, GarageVehicle } from "./customer-journey";

export function MaintenanceScreen({ controller, vehicle, onBack }: {
  controller: CustomerJourneyController; vehicle: GarageVehicle; onBack: () => void;
}) {
  const [type, setType] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [km, setKm] = useState("");
  const [amount, setAmount] = useState("");
  const [nextDate, setNextDate] = useState("");
  const [nextKm, setNextKm] = useState("");
  const [expense, setExpense] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fields = [
    ["Tipo (ex.: troca de óleo)", type, setType], ["Descrição", description, setDescription],
    ["Data (AAAA-MM-DD)", date, setDate], ["Odômetro (km)", km, setKm],
    ["Valor em R$ (opcional)", amount, setAmount],
    ["Próxima data (AAAA-MM-DD, opcional)", nextDate, setNextDate],
    ["Próxima quilometragem (opcional)", nextKm, setNextKm],
  ] as const;
  const save = async () => {
    if (busy) return;
    const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)
      && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
    const validKm = (value: string) => /^\d+$/.test(value) && Number(value) <= 2000000;
    if (!type.trim() || type.trim().length > 80 || !description.trim() || description.trim().length > 160
      || !validDate(date) || date > new Date().toISOString().slice(0, 10) || !validKm(km)
      || (nextDate && (!validDate(nextDate) || nextDate < date))
      || (nextKm && (!validKm(nextKm) || Number(nextKm) < Number(km)))
      || (amount && !/^\d+([.,]\d{1,2})?$/.test(amount))) {
      setError("Confira tipo, descrição, datas, km e valor informado."); return;
    }
    const cents = amount ? Math.round(Number(amount.replace(",", ".")) * 100) : null;
    if ((cents !== null && (!Number.isSafeInteger(cents) || cents > 2147483647))
      || (expense && (cents === null || cents <= 0))) {
      setError("Para incluir nas despesas, informe um valor positivo válido."); return;
    }
    setBusy(true); setError("");
    const normalizedType = type.trim().toLowerCase();
    const result = await controller.registerMaintenance(vehicle.id, {
      maintenance_type: normalizedType, description: description.trim(), occurred_on: date,
      odometer_km: Number(km), amount_cents: cents, next_due_on: nextDate || null,
      next_due_km: nextKm ? Number(nextKm) : null, create_expense: expense,
      idempotency_key: `maintenance:${vehicle.id}:${normalizedType}:${date}:${Number(km)}`,
    });
    setBusy(false);
    if (!result.ok) { setError(result.message); return; }
    onBack();
  };
  return <ScrollView contentContainerStyle={{ padding: 24, gap: 12 }} keyboardShouldPersistTaps="handled">
    <Text style={{ fontSize: 24, fontWeight: "700", color: "#177F78" }}>Registrar manutenção</Text>
    <Text>{vehicle.brand} {vehicle.model}</Text>
    {fields.map(([label, value, setter]) => <TextInput key={label} accessibilityLabel={label}
      placeholder={label} value={value} onChangeText={setter} editable={!busy}
      style={{ padding: 14, borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 12 }} />)}
    <Text>Incluir este valor nas despesas do veículo</Text>
    <Switch accessibilityLabel="Incluir nas despesas" value={expense} onValueChange={setExpense} disabled={busy} />
    <Text>Marque apenas se esta manutenção ainda não foi lançada como despesa. O valor será contado uma vez. O registro salvo não pode ser editado.</Text>
    {error ? <Text accessibilityRole="alert" style={{ color: "#B42318" }}>{error}</Text> : null}
    <Pressable accessibilityRole="button" disabled={busy} onPress={() => void save()} style={{ padding: 16, backgroundColor: "#177F78", borderRadius: 12 }}>
      <Text style={{ color: "white", textAlign: "center" }}>{busy ? "Salvando…" : "Salvar manutenção"}</Text>
    </Pressable>
    <Pressable accessibilityRole="button" disabled={busy} onPress={onBack} style={{ padding: 16 }}><Text>Voltar</Text></Pressable>
  </ScrollView>;
}
