import { useState } from "react";
import * as Location from "expo-location";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { CustomerServiceRequest, GarageVehicle } from "./customer-journey";
import { createMobileServiceRequest } from "./service-request-supabase";
import type { PickupLocationSource, ServiceUrgency } from "./service-request";

const stageLabels: Record<string, string> = {
  solicitado: "Solicitado",
  concierge_aceitou: "Concierge aceitou",
  prestador_indicado: "Prestador indicado",
  aguardando_aprovacao: "Aguardando aprovação",
  em_execucao: "Em execução",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

export function CustomerRequests({
  vehicles,
  requests: initialRequests,
}: {
  vehicles: GarageVehicle[];
  requests: CustomerServiceRequest[];
}) {
  const [requests, setRequests] = useState(initialRequests);
  const [creating, setCreating] = useState(false);

  if (creating) {
    return (
      <NewRequestForm
        vehicles={vehicles}
        onCancel={() => setCreating(false)}
        onCreated={(request) => {
          setRequests((current) => [request, ...current]);
          setCreating(false);
        }}
      />
    );
  }

  return (
    <View>
      <Pressable style={styles.primaryButton} onPress={() => setCreating(true)}>
        <Text style={styles.primaryButtonText}>Quero um novo atendimento</Text>
      </Pressable>
      {requests.length ? (
        requests.map((request) => (
          <View key={request.id} style={styles.rowCard}>
            <Text style={styles.reference}>{request.referenceCode}</Text>
            <Text style={styles.rowTitle}>
              {request.vehicleBrand} {request.vehicleModel}
            </Text>
            <Text style={styles.meta}>
              {stageLabels[request.serviceStage] ?? request.serviceStage}
            </Text>
          </View>
        ))
      ) : (
        <Text style={styles.empty}>Nenhum atendimento registrado.</Text>
      )}
    </View>
  );
}

function NewRequestForm({
  vehicles,
  onCancel,
  onCreated,
}: {
  vehicles: GarageVehicle[];
  onCancel: () => void;
  onCreated: (request: CustomerServiceRequest) => void;
}) {
  const [vehicleId, setVehicleId] = useState(vehicles[0]?.id ?? "");
  const [pickupSource, setPickupSource] = useState<PickupLocationSource>("manual_address");
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [locating, setLocating] = useState(false);
  const [state, setState] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [instructions, setInstructions] = useState("");
  const [report, setReport] = useState("");
  const [urgency, setUrgency] = useState<ServiceUrgency>("media");
  const [reviewing, setReviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedVehicle = vehicles.find((vehicle) => vehicle.id === vehicleId);

  const chooseManualAddress = () => {
    setPickupSource("manual_address");
    setLatitude(null);
    setLongitude(null);
    setError(null);
  };

  const useCurrentLocation = async () => {
    setLocating(true);
    setError(null);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setPickupSource("manual_address");
        setError(
          "A localização não foi autorizada. Sem problema: informe o endereço manualmente abaixo.",
        );
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const nextLatitude = position.coords.latitude;
      const nextLongitude = position.coords.longitude;
      setLatitude(nextLatitude);
      setLongitude(nextLongitude);
      setPickupSource("device_location");

      try {
        const [place] = await Location.reverseGeocodeAsync({
          latitude: nextLatitude,
          longitude: nextLongitude,
        });
        if (place) {
          const street = place.street || place.name || "";
          const streetLine = [street, place.streetNumber].filter(Boolean).join(", ");
          const addressLine = [streetLine, place.district].filter(Boolean).join(" · ");
          if (addressLine) setAddress(addressLine);
          if (place.city || place.subregion) setCity(place.city || place.subregion || "");
          if (place.region?.length === 2) setState(place.region.toUpperCase());
        }
      } catch {
        // Coordinates are already captured. The customer can complete/edit the
        // textual address below before confirming the request.
      }
    } catch {
      setPickupSource("manual_address");
      setLatitude(null);
      setLongitude(null);
      setError(
        "Não foi possível obter sua localização agora. Use o endereço manual para continuar.",
      );
    } finally {
      setLocating(false);
    }
  };

  const continueToReview = () => {
    setError(null);
    if (!vehicleId) return setError("Escolha o veículo do atendimento.");
    if (!/^[A-Za-z]{2}$/.test(state.trim())) return setError("Informe a UF, por exemplo SP.");
    if (city.trim().length < 2) return setError("Informe a cidade onde o veículo está.");
    if (pickupSource === "manual_address" && address.trim().length < 8) {
      return setError("Informe o endereço onde o veículo está, incluindo rua e número.");
    }
    if (pickupSource === "device_location" && (latitude === null || longitude === null)) {
      return setError("Compartilhe novamente a localização atual ou use o endereço manual.");
    }
    if (report.trim().length < 15) {
      return setError("Conte o que aconteceu com um pouco mais de detalhe.");
    }
    setReviewing(true);
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    const result = await createMobileServiceRequest({
      vehicleId,
      state,
      city,
      address,
      report,
      urgency,
      pickupSource,
      latitude,
      longitude,
      pickupInstructions: instructions,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    onCreated(result.request);
  };

  const locationSummary =
    address.trim() ||
    (latitude !== null && longitude !== null
      ? `Localização atual (${latitude.toFixed(5)}, ${longitude.toFixed(5)})`
      : "—");

  if (reviewing) {
    return (
      <View>
        <Text style={styles.eyebrow}>Revisar solicitação</Text>
        <Text style={styles.formTitle}>Confirme antes de enviar</Text>
        <Review
          label="Veículo"
          value={
            selectedVehicle
              ? `${selectedVehicle.brand} ${selectedVehicle.model}`
              : "—"
          }
        />
        <Review
          label="Local do veículo"
          value={`${locationSummary} · ${city.trim()}/${state.trim().toUpperCase()}`}
        />
        <Review
          label="Como a localização foi informada"
          value={
            pickupSource === "device_location"
              ? "Localização atual do aparelho"
              : "Endereço informado manualmente"
          }
        />
        <Review label="O que aconteceu" value={report.trim()} />
        <Review label="Urgência" value={urgencyLabel(urgency)} />
        {instructions.trim() ? (
          <Review label="Referência para retirada" value={instructions.trim()} />
        ) : null}
        <Text style={styles.privacy}>
          Esta localização será usada pela VERAH e pelo Concierge somente para
          organizar o atendimento e eventual retirada do veículo. Você pode
          voltar e editar antes de confirmar.
        </Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable
          style={[styles.primaryButton, busy && styles.disabled]}
          disabled={busy}
          onPress={() => void submit()}
        >
          <Text style={styles.primaryButtonText}>
            {busy ? "Enviando…" : "Confirmar e solicitar atendimento"}
          </Text>
        </Pressable>
        <Pressable
          style={styles.outlineButton}
          disabled={busy}
          onPress={() => setReviewing(false)}
        >
          <Text style={styles.outlineButtonText}>Voltar e editar</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View>
      <Text style={styles.eyebrow}>Novo atendimento</Text>
      <Text style={styles.formTitle}>Vamos entender o que aconteceu</Text>
      <Text style={styles.meta}>
        Informe onde o veículo está. Você pode compartilhar a localização atual
        somente quando quiser ou continuar sem permissão usando o endereço manual.
      </Text>

      <Text style={styles.label}>Veículo</Text>
      <View style={styles.choices}>
        {vehicles.map((vehicle) => (
          <Pressable
            key={vehicle.id}
            onPress={() => setVehicleId(vehicle.id)}
            style={[
              styles.choice,
              vehicle.id === vehicleId && styles.choiceSelected,
            ]}
          >
            <Text
              style={[
                styles.choiceText,
                vehicle.id === vehicleId && styles.choiceTextSelected,
              ]}
            >
              {vehicle.nickname ?? `${vehicle.brand} ${vehicle.model}`}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.locationCard}>
        <Text style={styles.locationTitle}>Onde o veículo está?</Text>
        <Pressable
          style={[
            styles.locationAction,
            pickupSource === "device_location" && styles.locationActionSelected,
            locating && styles.disabled,
          ]}
          disabled={locating}
          onPress={() => void useCurrentLocation()}
        >
          <Text
            style={[
              styles.locationActionText,
              pickupSource === "device_location" &&
                styles.locationActionTextSelected,
            ]}
          >
            {locating
              ? "Obtendo localização…"
              : pickupSource === "device_location"
                ? "✓ Localização atual confirmada"
                : "Usar minha localização atual"}
          </Text>
        </Pressable>
        <Pressable style={styles.manualLink} onPress={chooseManualAddress}>
          <Text style={styles.manualLinkText}>Prefiro informar o endereço</Text>
        </Pressable>
        <Text style={styles.permissionNote}>
          A VERAH solicita apenas acesso em primeiro plano quando você toca na
          opção acima. O atendimento continua funcionando se você negar.
        </Text>
      </View>

      <Text style={styles.label}>UF</Text>
      <TextInput
        style={styles.input}
        value={state}
        onChangeText={setState}
        autoCapitalize="characters"
        maxLength={2}
        placeholder="SP"
        placeholderTextColor="#8A9199"
      />
      <Text style={styles.label}>Cidade</Text>
      <TextInput
        style={styles.input}
        value={city}
        onChangeText={setCity}
        autoCapitalize="words"
        placeholder="Franca"
        placeholderTextColor="#8A9199"
      />
      <Text style={styles.label}>
        {pickupSource === "device_location"
          ? "Endereço (confira ou ajuste se necessário)"
          : "Rua e número"}
      </Text>
      <TextInput
        style={styles.input}
        value={address}
        onChangeText={setAddress}
        autoCapitalize="words"
        placeholder="Rua, número, bairro"
        placeholderTextColor="#8A9199"
      />
      <Text style={styles.label}>Referência para retirada (opcional)</Text>
      <TextInput
        style={styles.input}
        value={instructions}
        onChangeText={setInstructions}
        placeholder="Ex.: portaria do prédio"
        placeholderTextColor="#8A9199"
      />
      <Text style={styles.label}>Conte o que aconteceu</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={report}
        onChangeText={setReport}
        multiline
        textAlignVertical="top"
        placeholder="Inclua ruídos, luzes no painel, quando começou…"
        placeholderTextColor="#8A9199"
      />

      <Text style={styles.label}>Urgência percebida</Text>
      <View style={styles.choices}>
        {(["baixa", "media", "alta", "critica"] as ServiceUrgency[]).map(
          (item) => (
            <Pressable
              key={item}
              onPress={() => setUrgency(item)}
              style={[styles.choice, urgency === item && styles.choiceSelected]}
            >
              <Text
                style={[
                  styles.choiceText,
                  urgency === item && styles.choiceTextSelected,
                ]}
              >
                {urgencyLabel(item)}
              </Text>
            </Pressable>
          ),
        )}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable style={styles.primaryButton} onPress={continueToReview}>
        <Text style={styles.primaryButtonText}>Revisar solicitação</Text>
      </Pressable>
      <Pressable style={styles.outlineButton} onPress={onCancel}>
        <Text style={styles.outlineButtonText}>Voltar</Text>
      </Pressable>
    </View>
  );
}

function Review({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.reviewCard}>
      <Text style={styles.reviewLabel}>{label}</Text>
      <Text style={styles.reviewValue}>{value}</Text>
    </View>
  );
}

function urgencyLabel(value: ServiceUrgency) {
  return value === "media"
    ? "Média"
    : value === "critica"
      ? "Crítica"
      : value.charAt(0).toUpperCase() + value.slice(1);
}

const styles = StyleSheet.create({
  eyebrow: {
    color: "#A85F70",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1.1,
  },
  formTitle: {
    color: "#263238",
    fontSize: 22,
    fontWeight: "700",
    marginTop: 5,
    marginBottom: 8,
  },
  label: {
    color: "#344054",
    fontSize: 13,
    fontWeight: "700",
    marginTop: 14,
    marginBottom: 7,
  },
  input: {
    width: "100%",
    borderWidth: 1,
    borderColor: "#DED9DA",
    borderRadius: 12,
    paddingHorizontal: 13,
    paddingVertical: 12,
    fontSize: 15,
    color: "#263238",
    backgroundColor: "#FFFFFF",
  },
  multiline: { minHeight: 120 },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choice: {
    borderWidth: 1,
    borderColor: "#D8E7E5",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 4,
  },
  choiceSelected: { backgroundColor: "#177F78", borderColor: "#177F78" },
  choiceText: { color: "#52606D", fontSize: 13, fontWeight: "600" },
  choiceTextSelected: { color: "#FFFFFF" },
  locationCard: {
    backgroundColor: "#ECF8F6",
    borderRadius: 14,
    padding: 14,
    marginTop: 16,
  },
  locationTitle: { color: "#176A65", fontSize: 15, fontWeight: "700" },
  locationAction: {
    marginTop: 12,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#B8DDD8",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: "center",
  },
  locationActionSelected: { backgroundColor: "#177F78", borderColor: "#177F78" },
  locationActionText: { color: "#176A65", fontSize: 14, fontWeight: "700" },
  locationActionTextSelected: { color: "#FFFFFF" },
  manualLink: { alignSelf: "center", paddingVertical: 10, paddingHorizontal: 8 },
  manualLinkText: { color: "#A85F70", fontSize: 13, fontWeight: "700" },
  permissionNote: { color: "#667085", fontSize: 11, lineHeight: 16, marginTop: 2 },
  primaryButton: {
    marginTop: 18,
    backgroundColor: "#177F78",
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
    textAlign: "center",
  },
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
  error: { color: "#C84E59", fontSize: 13, marginTop: 12 },
  meta: { color: "#667085", fontSize: 14, lineHeight: 20, marginTop: 5 },
  empty: { color: "#7A838B", fontSize: 14, lineHeight: 21, marginTop: 12 },
  rowCard: {
    borderWidth: 1,
    borderColor: "#EEF0F2",
    borderRadius: 14,
    padding: 14,
    marginTop: 10,
  },
  rowTitle: { color: "#263238", fontSize: 15, fontWeight: "700" },
  reference: { color: "#177F78", fontSize: 13, fontWeight: "800" },
  reviewCard: {
    borderWidth: 1,
    borderColor: "#EEF0F2",
    borderRadius: 14,
    padding: 13,
    marginTop: 10,
  },
  reviewLabel: {
    color: "#A85F70",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  reviewValue: { color: "#263238", fontSize: 14, lineHeight: 20, marginTop: 4 },
  privacy: { color: "#667085", fontSize: 12, lineHeight: 18, marginTop: 14 },
});
