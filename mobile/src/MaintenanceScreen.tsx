import { useRef, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import type { CustomerJourneyController, GarageVehicle } from "./customer-journey";
import { MAX_VEHICLE_DOCUMENT_BYTES } from "./vehicle-documents";
import {
  applyMaintenanceAssistedDraft,
  buildMaintenanceAssistedDraft,
  buildMaintenanceReceiptDocumentInput,
  shouldConfirmAssistedSave,
  type MaintenanceAssistedDraft,
  type MaintenanceEditableFields,
} from "./maintenance-assist";

const todayIso = () => new Date().toISOString().slice(0, 10);

export function MaintenanceScreen({ controller, vehicle, onBack }: {
  controller: CustomerJourneyController; vehicle: GarageVehicle; onBack: () => void;
}) {
  const [type, setType] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(todayIso());
  const [km, setKm] = useState("");
  const [amount, setAmount] = useState("");
  const [nextDate, setNextDate] = useState("");
  const [nextKm, setNextKm] = useState("");
  const [expense, setExpense] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [assistNote, setAssistNote] = useState("");
  const assistNoteRef = useRef("");
  const [activeDraft, setActiveDraft] = useState<MaintenanceAssistedDraft | null>(null);
  const [receiptPicked, setReceiptPicked] = useState<{ name: string; bytes: Blob; mimeType: string } | null>(null);

  const pickReceipt = async () => {
    if (busy) return;
    const picked = await DocumentPicker.getDocumentAsync({
      type: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (picked.canceled) return;
    const asset = picked.assets[0];
    if (!asset) return;
    const bytes = await fetch(asset.uri).then((response) => response.blob());
    if (bytes.size > MAX_VEHICLE_DOCUMENT_BYTES) {

      setError("O arquivo excede o limite de 10 MiB.");
      return;
    }
    setReceiptPicked({ name: asset.name ?? "recibo.jpeg", bytes: bytes, mimeType: asset.mimeType ?? bytes.type ?? "" });
  };

  const buildDraft = (): MaintenanceAssistedDraft =>
    buildMaintenanceAssistedDraft({
      note: assistNote,
      today: todayIso(),
      hasReceiptFile: receiptPicked !== null,
    });

  const currentFields = (): MaintenanceEditableFields => ({
    type,
    description,
    date,
    km,
    amount,
    nextDate,
    nextKm,
  });

  // "Usar rascunho assistido" only populates the editable fields and returns to
  // review. Nothing is saved here: no OCR/extracted values are ever persisted
  // automatically. The final save goes through an explicit confirmation.


  const applyDraftToFields = (draft: MaintenanceAssistedDraft) => {
    if (busy) return;
    const next = applyMaintenanceAssistedDraft(currentFields(), draft);
    setType(next.type);
    setDescription(next.description);
    setDate(next.date);
    setKm(next.km);
    setAmount(next.amount);
    setNextDate(next.nextDate);
    setNextKm(next.nextKm);
    setActiveDraft(draft);
  };

  const saveMaintenance = async (pendingReceipt: { name: string; bytes: Blob; mimeType: string } | null) => {
    if (busy) return;
    setBusy(true); setError("");
    const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)
      && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
    const validKm = (value: string) => /^\d+$/.test(value) && Number(value) <= 2000000;
    if (!type.trim() || type.trim().length > 80 || !description.trim() || description.trim().length > 160
      || !validDate(date) || date > new Date().toISOString().slice(0, 10) || !validKm(km)
      || (nextDate && (!validDate(nextDate) || nextDate < date))
      || (nextKm && (!validKm(nextKm) || Number(nextKm) < Number(km)))
      || (amount && !/^\d+([.,]\d{1,2})?$/.test(amount))) {
      setError("Confira tipo, descrição, datas, km e valor informado."); setBusy(false); return;
    }
    const cents = amount ? Math.round(Number(amount.replace(",", ".")) * 100) : null;
    if ((cents !== null && (!Number.isSafeInteger(cents) || cents > 2147483647))
      || (expense && (cents === null || cents <= 0))) {
      setError("Para incluir nas despesas, informe um valor positivo válido."); setBusy(false); return;
    }
    const normalizedType = type.trim().toLowerCase();
    const result = await controller.registerMaintenance(vehicle.id, {
      maintenance_type: normalizedType, description: description.trim(), occurred_on: date,
      odometer_km: Number(km), amount_cents: cents, next_due_on: nextDate || null,
      next_due_km: nextKm ? Number(nextKm) : null, create_expense: expense,
      idempotency_key: `maintenance:${vehicle.id}:${normalizedType}:${date}:${Number(km)}`,
    });
    if (!result.ok) { setBusy(false); setError(result.message); return; }
    if (pendingReceipt && controller.registerVehicleDocument) {

      const docInput = buildMaintenanceReceiptDocumentInput(
        vehicle.id,
        date,
        description,
        pendingReceipt.name,
      );
      const docResult = await controller.registerVehicleDocument(vehicle.id, { ...docInput, mimeType: pendingReceipt.mimeType }, pendingReceipt.bytes);
      if (!docResult.ok) { setBusy(false); setError(docResult.message); return; }
    }
    setBusy(false);
    setActiveDraft(null);
    onBack();
  };

  const save = async () => {
    if (busy) return;
    const needsConfirmation = shouldConfirmAssistedSave(activeDraft, true);
    if (!needsConfirmation) {
      void saveMaintenance(receiptPicked);
      return;
    }
    // Assisted flow: an explicit confirmation gates the final canonical save using
    // Action currently edited field values — no OCR/extracted value is auto-persisted..
    const confirmed = await new Promise<boolean>((resolve) => {
      Alert.alert(
        "Confirmar rascunho assistido?",
        "Nenhum campo foi extraído automaticamente do recibo. Confira data, hodômetro, valor e os demais campos antes de salvar.",
        [
          { text: "Revisar", style: "cancel", onPress: () => resolve(false) },
          { text: "Confirmar e salvar", onPress: () => resolve(true) },
        ],
      );
    });
    if (!confirmed) return;
    void saveMaintenance(receiptPicked);
  };

return <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Text style={styles.title}>Registrar manutenção</Text>
    <Text style={styles.subtitle}>{vehicle.brand} {vehicle.model}</Text>

    <View style={styles.card}>
      <Text style={styles.cardTitle}>Adicionar foto ou nota do recibo</Text>
      <Text style={styles.hint}>
        Anexe o recibo como documento privado do veículo. A VERAH não extrai
        campos da foto: data, hodômetro, valor e próximos vencimentos são
        preenchidos manualmente e exigem sua confirmação antes do salvamento..
      </Text>
      <TextInput
        accessibilityLabel="Nota do recibo (opcional)"
        placeholder="Nota do recibo (ex.: troca de óleo, R$ 300,) (opcional)"
        placeholderTextColor="#777777"
        maxLength={160}
        value={assistNote}
        onChangeText={(value) => { setAssistNote(value); assistNoteRef.current = value; }}
        editable={!busy}
        style={styles.input}
      />
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => void pickReceipt()}
        style={[styles.secondaryButton, busy && styles.disabled]}>
        <Text style={styles.secondaryButtonText}>
          {receiptPicked ? `Recibo anexado: ${receiptPicked.name}` : "Adicionar foto ou nota do recibo"}
        </Text>
      </Pressable>
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => applyDraftToFields(buildDraft())}
        style={[styles.assistButton, busy && styles.disabled]}>
        <Text style={styles.assistButtonText}>
          {activeDraft ? "Rascunho assistido aplicado — revise os campos" : "Usar rascunho assistido"}
        </Text>
      </Pressable>
    </View>

    <View style={styles.card}>
      <Text style={styles.cardTitle}>Dados da manutenção</Text>
      {([
        ["Tipo (ex.: troca de óleo)", type, setType], ["Descrição", description, setDescription],
        ["Data (AAAA-MM-DD)", date, setDate], ["Odômetro (km)", km, setKm],
        ["Valor em R$ (opcional)", amount, setAmount],
        ["Próxima data(AAAA-MM-DD, opcional)", nextDate, setNextDate],
        ["Próxima quilometragem (opcional)", nextKm, setNextKm],
      ] as const).map(([label, value, setter]) => <TextInput key={label} accessibilityLabel={label}
        placeholder={label} value={value} onChangeText={setter} editable={!busy}
        style={styles.input} />)}
    </View>

    <View style={styles.card}>
      <Text>Incluir este valor nas despesas do veículo</Text>
      <Switch accessibilityLabel="Incluir nas despesas" value={expense} onValueChange={setExpense} disabled={busy} />
      <Text style={styles.hint}>
        Marque apenas se esta manutenção ainda não foi lançada como despesa. O valor será contado uma vez. O registro salvo não pode ser editado..

      </Text>
    </View>

    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    <Pressable accessibilityRole="button" disabled={busy} onPress={() => void save()} style={[styles.saveButton, busy && styles.disabled]}>
      <Text style={styles.saveText}>{busy ? "Salvando…" : "Salvar manutenção"}</Text>
    </Pressable>
    <Pressable accessibilityRole="button" disabled={busy} onPress={onBack} style={styles.backButton}>
      <Text>Voltar</Text>
    </Pressable>
  </ScrollView>;
}

const styles = StyleSheet.create({
  content: { padding:  24, gap:  12 },
  title: { fontSize:  24, fontWeight: "700", color: "#814455" },
  subtitle: { fontSize:  14, color: "#5F6B76", marginBottom:  4 },
  card: { borderWidth:  1, borderColor: "#E8E1E2", borderRadius:  14, padding:  14, gap:  10 },
  cardTitle: { fontSize:  15, fontWeight: "700", color: "#263238" },
  hint: { fontSize:  13, lineHeight:  18, color: "#667085" },
  input: { padding:  14, borderWidth:  1, borderColor: "#CBD5E1", borderRadius: 12 },
  secondaryButton: { padding:  14, borderWidth:  1, borderColor: "#814455", borderRadius: 12 },
  secondaryButtonText: { color: "#814455", textAlign: "center", fontWeight: "600" },
  assistButton: { padding:  14, backgroundColor: "#F2E6E1", borderRadius: 12 },
  assistButtonText: { color: "#814455", textAlign: "center", fontWeight: "700" },
  saveButton: { padding: 16, backgroundColor: "#814455", borderRadius: 12 },
  saveText: { color: "white", textAlign: "center" },
  backButton: { padding: 16 },
  error: { color: "#B42318" },
  disabled: { opacity:  0.6 },
});
