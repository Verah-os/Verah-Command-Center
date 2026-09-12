import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import type {
  CustomerJourneyController,
  GarageVehicle,
  VehicleDocument,
  VehicleDocumentInput,
  VehicleDocumentKind,
} from "./customer-journey";
import {
  MAX_VEHICLE_DOCUMENT_BYTES,
  vehicleDocumentIdempotencyKey,
  VEHICLE_DOCUMENT_KIND_LABELS,
  VEHICLE_DOCUMENT_KINDS,
} from "./vehicle-documents";

export function VehicleDocumentsScreen({
  controller,
  vehicle,
  onBack,
}: {
  controller: CustomerJourneyController;
  vehicle: GarageVehicle;
  onBack: () => void;
}) {
  const [documents, setDocuments] = useState<VehicleDocument[] | null>(null);
  const [kind, setKind] = useState<VehicleDocumentKind>("outro");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await controller.listVehicleDocuments(vehicle.id);
    setLoading(false);
    if (!result.ok) { setError(result.message); return; }
    setDocuments(result.data);
  }, [controller, vehicle.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const pickAndUpload = async () => {
    if (busy) return;
    const picked = await DocumentPicker.getDocumentAsync({
      type: ["application/pdf", "image/jpeg", "image/png", "image/webp"],
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
    const input: VehicleDocumentInput = {
      documentKind: kind,
      documentDate: date,
      fileName: asset.name ?? "documento",
      mimeType: asset.mimeType ?? bytes.type ?? "",
      reference: reference || undefined,
      note: note || undefined,
      idempotencyKey: vehicleDocumentIdempotencyKey(
        {
          documentKind: kind,
          documentDate: date,
          fileName: asset.name ?? "documento",
          mimeType: asset.mimeType ?? bytes.type ?? "",
        } as VehicleDocumentInput,
        bytes.size,
      ),
    };
    setBusy(true);
    setError(null);
    const result = await controller.registerVehicleDocument(vehicle.id, input, bytes);
    setBusy(false);
    if (!result.ok) { setError(result.message); return; }
    setKind("outro");
    setDate(new Date().toISOString().slice(0, 10));
    setReference("");
    setNote("");
    await load();
    Alert.alert("Documento salvo", "O arquivo foi enviado com acesso privado, sem URL pública.");
  };

  const remove = async (document: VehicleDocument) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await controller.removeVehicleDocument(document.id);
    setBusy(false);
    if (!result.ok) { setError(result.message); return; }
    await load();
  };

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
      <Text style={styles.eyebrow}>Documentos e notas</Text>
      <Text style={styles.title}>{vehicleName}</Text>
      <Text style={styles.body}>
        Guarde documentos do veículo com acesso privado e histórico seguro. Nada
        fica acessível por URL pública.


      </Text>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Adicionar documento</Text>
        <Text style={styles.label}>Tipo</Text>
        <View style={styles.kindRow}>
          {VEHICLE_DOCUMENT_KINDS.map((option) => (
            <Pressable
              key={option}
              style={[styles.kindPill,, kind === option && styles.kindPillActive]}
              onPress={() => setKind(option)}
            >
              <Text style={[styles.kindPillText,, kind === option && styles.kindPillTextActive]}>
                {VEHICLE_DOCUMENT_KIND_LABELS[option]}
              </Text>
            </Pressable>
          ))}
        </View>
        <TextInput
          style={styles.input}
          placeholder="Data do documento (AAAA-MM-DD)"
          placeholderTextColor="#777777"
          maxLength={10}
          value={date}
          onChangeText={setDate}
        />
        <TextInput
          style={styles.input}
          placeholder="Referência (opcional, ex.: nota nº 123)"
          placeholderTextColor="#777777"
          maxLength={80}
          value={reference}
          onChangeText={setReference}
        />
        <TextInput
          style={styles.input}
          placeholder="Observação (opcional)"
          placeholderTextColor="#777777"
          maxLength={160}
          value={note}
          onChangeText={setNote}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable style={[styles.primary,, busy && styles.disabled]} disabled={busy} onPress={() => void pickAndUpload()}>
          <Text style={styles.primaryText}>{busy ? "Enviando…" : "Escolher arquivo e enviar"}</Text>
        </Pressable>
        <Text style={styles.capNote}>
          PDF, JPEG, PNG e WebP até 10 MiB. O arquivo fica privado do(a) proprietário(a).
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Documentos deste veículo</Text>
        {loading ? (
          <Text style={styles.meta}>Carregando…</Text>
        ) : !documents?.length ? (
          <Text style={styles.empty}>Ainda não há documentos deste veículo.</Text>
        ) : (
          documents.map((document) => (
            <View key={document.id} style={styles.rowCard}>
              <View style={styles.rowHeader}>
                <Text style={styles.rowValue}>
                  {VEHICLE_DOCUMENT_KIND_LABELS[document.documentKind]}
                </Text>
                <Pressable style={styles.removeButton} disabled={busy} onPress={() => void remove(document)}>
                  <Text style={styles.removeButtonText}>Remover</Text>
                </Pressable>
              </View>
              <Text style={styles.meta}>
                {formatDocumentDate(document.documentDate)} · {document.fileName}
              </Text>
              <Text style={styles.meta}>{formatDocumentSize(document.sizeBytes)}</Text>
              {document.reference ? <Text style={styles.rowNote}>Ref.: {document.reference}</Text> : null}
              {document.note ? <Text style={styles.rowNote}>{document.note}</Text> : null}
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

function formatDocumentDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDocumentSize(bytes: number) {
  if (!Number.isFinite(bytes)) return "";
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MiB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024).toLocaleString("pt-BR")} KiB`;
  return `${bytes} B`;
}

const styles = StyleSheet.create({
  scroll: { flex: 1, width: "100%" },
  content: { width: "100%", maxWidth: 520, alignSelf: "center", padding: 18, paddingBottom: 64 },
  backRow: { paddingVertical: 6, alignSelf: "flex-start" },
  backLabel: { color: "#814455", fontSize: 13, fontWeight: "700" },
  brand: { color: "#814455", fontSize: 28, fontWeight: "800", letterSpacing: 1 },
  eyebrow: { color: "#A85F70", fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1.2, marginTop: 6 },
  title: { color: "#263238", fontSize: 23, fontWeight: "700", marginTop: 4 },
  body: { color: "#667085", fontSize: 15, lineHeight: 22, marginTop: 12, marginBottom:  16 },
  card: { backgroundColor: "#FFFFFF", borderRadius:  22, padding:  20, borderWidth: 1, borderColor: "#F5DCE1", marginBottom:  14 },
  sectionTitle: { color: "#263238", fontSize:  18, fontWeight: "700", marginBottom:  12 },
  label: { color: "#667085", fontSize:  13, fontWeight: "700", marginBottom:  6 },
  kindRow: { flexDirection: "row", flexWrap: "wrap", gap:  8, marginBottom:  12 },
  kindPill: { borderWidth:  1, borderColor: "#814455", borderRadius:  999, paddingHorizontal:  11, paddingVertical:  8 },
  kindPillActive: { backgroundColor: "#814455" },
  kindPillText: { color: "#814455", fontSize:  13, fontWeight: "700" },
  kindPillTextActive: { color: "#FFFFFF" },
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
  capNote: { color: "#7A838B", fontSize:  13, lineHeight:  19, marginTop:  10 },
  primary: { backgroundColor: "#814455", borderRadius:  14, paddingVertical:  14, alignItems: "center" },
  primaryText: { color: "#FFFFFF", fontSize:  15, fontWeight: "700" },
  disabled: { opacity: 0.6 },
  meta: { color: "#667085", fontSize: 14, lineHeight:  21, marginTop:  6 },
  empty: { color: "#7A838B", fontSize:  14, lineHeight:  21, marginTop:  10 },
  rowCard: { borderWidth:  1, borderColor: "#EEF0F2", borderRadius:  14, padding:  14, marginTop:  10 },
  rowHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap:  8 },
  rowValue: { color: "#263238", fontSize:  17, fontWeight: "700" },
  removeButton: { borderWidth:  1, borderColor: "#B84E5F", borderRadius:  999, paddingHorizontal:  10, paddingVertical:  4 },
  removeButtonText: { color: "#B84E5F", fontSize:  13, fontWeight: "700" },
  rowNote: { color: "#667085", fontSize:  13, marginTop:  4 },
});
