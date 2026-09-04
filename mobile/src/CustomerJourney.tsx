import { useState, useSyncExternalStore } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  createCustomerJourney,
  defaultDisplayName,
  type CustomerJourneyController,
  type CustomerJourneyFacade,
  type GarageVehicle,
  type JourneyUser,
} from "./customer-journey";
import { VehicleOnboardingStep } from "./VehicleOnboardingStep";

// Post-login journey gate (#173): restores the canonical onboarding state via
// RPC and routes the customer through basic profile -> vehicle confirmation
// -> persisted garage. Progress lives server-side, so reinstalls and new
// devices land back on the correct step (safe journey restoration).
export function CustomerJourneyGate({
  facade,
  user,
  onSignOut,
}: {
  facade: CustomerJourneyFacade;
  user: JourneyUser;
  onSignOut: () => void;
}) {
  const [controller] = useState<CustomerJourneyController>(() =>
    createCustomerJourney(facade, user),
  );
  const state = useSyncExternalStore(controller.subscribe, controller.getState);

  if (state.status === "loading") {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#2AA79B" />
        <Text style={styles.note}>Restaurando sua jornada…</Text>
      </View>
    );
  }
  if (state.status === "error") {
    return (
      <View style={styles.card}>
        <Text style={styles.brand}>VERAH</Text>
        <Text style={styles.title}>Não foi possível carregar sua jornada</Text>
        <Text style={styles.error}>{state.message}</Text>
        <PrimaryButton
          label="Tentar novamente"
          onPress={() => void controller.restore()}
        />
        <SecondaryButton label="Sair" onPress={onSignOut} />
      </View>
    );
  }
  if (state.status === "basic-profile") {
    return <BasicProfileStep controller={controller} user={user} />;
  }
  if (state.status === "vehicle") {
    return <VehicleOnboardingStep controller={controller} />;
  }
  return <GarageScreen vehicles={state.vehicles} onSignOut={onSignOut} />;
}

function BasicProfileStep({
  controller,
  user,
}: {
  controller: CustomerJourneyController;
  user: JourneyUser;
}) {
  const [displayName, setDisplayName] = useState(defaultDisplayName(user));
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const result = await controller.submitBasicProfile(displayName, acceptedTerms);
    setBusy(false);
    if (!result.ok) setError(result.message);
  };

  return (
    <ScrollView contentContainerStyle={styles.form}>
      <Text style={styles.brand}>VERAH</Text>
      <Text style={styles.eyebrow}>Conta criada</Text>
      <Text style={styles.title}>Vamos preparar sua VERAH</Text>
      <Text style={styles.body}>
        Este progresso fica salvo. WhatsApp é um canal opcional e nunca
        substitui sua identidade.
      </Text>
      <TextInput
        style={styles.input}
        placeholder="Nome de preferência"
        placeholderTextColor="#777777"
        autoCapitalize="words"
        value={displayName}
        onChangeText={setDisplayName}
      />
      <Checkbox
        checked={acceptedTerms}
        onToggle={() => setAcceptedTerms((value) => !value)}
        label="Li e aceito os termos de onboarding do Pilot Alpha v1. Consentimentos de WhatsApp, transporte, orçamento e pagamento permanecem separados."
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <PrimaryButton
        label="Continuar para meu veículo"
        busy={busy}
        onPress={() => void submit()}
      />
    </ScrollView>
  );
}

// Legacy manual step kept temporarily for rollback safety while the new
// guided selector is validated on a physical Android build.
function VehicleStep({ controller }: { controller: CustomerJourneyController }) {
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

  const submit = async () => {
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

  return (
    <ScrollView contentContainerStyle={styles.form}>
      <Text style={styles.brand}>VERAH</Text>
      <Text style={styles.eyebrow}>Seu primeiro veículo</Text>
      <Text style={styles.title}>Cadastre seu carro</Text>
      <Text style={styles.body}>
        Nenhuma consulta externa foi feita. Informe somente o que souber;
        versão, motorização e câmbio são opcionais.
      </Text>
      <TextInput
        style={styles.input}
        placeholder="Placa (ABC1234 ou ABC1D23)"
        placeholderTextColor="#777777"
        autoCapitalize="characters"
        autoCorrect={false}
        value={plate}
        onChangeText={setPlate}
      />
      <TextInput
        style={styles.input}
        placeholder="Marca"
        placeholderTextColor="#777777"
        value={brand}
        onChangeText={setBrand}
      />
      <TextInput
        style={styles.input}
        placeholder="Modelo"
        placeholderTextColor="#777777"
        value={model}
        onChangeText={setModel}
      />
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
      <Checkbox
        checked={confirmed}
        onToggle={() => setConfirmed((value) => !value)}
        label="Confirmo que estes dados correspondem ao meu veículo."
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <PrimaryButton
        label="Salvar e continuar"
        busy={busy}
        onPress={() => void submit()}
      />
    </ScrollView>
  );
}

function GarageScreen({
  vehicles,
  onSignOut,
}: {
  vehicles: GarageVehicle[];
  onSignOut: () => void;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.brand}>VERAH</Text>
      <Text style={styles.eyebrow}>Veículo confirmado</Text>
      <Text style={styles.title}>Sua garagem</Text>
      {vehicles.length === 0 ? (
        <Text style={styles.body}>Nenhum veículo ativo encontrado.</Text>
      ) : (
        vehicles.map((vehicle) => (
          <View key={vehicle.id} style={styles.vehicleCard}>
            <Text style={styles.vehicleName}>
              {vehicle.nickname ?? `${vehicle.brand} ${vehicle.model}`}
            </Text>
            <Text style={styles.vehicleMeta}>
              {[vehicle.year, vehicle.plate].filter(Boolean).join(" · ")}
            </Text>
          </View>
        ))
      )}
      <SecondaryButton label="Sair" onPress={onSignOut} />
    </View>
  );
}

function Checkbox({
  checked,
  onToggle,
  label,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <Pressable
      style={styles.checkboxRow}
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
    >
      <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
        {checked ? <Text style={styles.checkboxMark}>✓</Text> : null}
      </View>
      <Text style={styles.checkboxLabel}>{label}</Text>
    </Pressable>
  );
}

function PrimaryButton({
  label,
  onPress,
  busy = false,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
}) {
  return (
    <Pressable
      style={[styles.submit, busy && styles.submitDisabled]}
      disabled={busy}
      onPress={onPress}
    >
      <Text style={styles.submitLabel}>{label}</Text>
    </Pressable>
  );
}

function SecondaryButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.secondary} onPress={onPress}>
      <Text style={styles.secondaryLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center", gap: 12 },
  note: { color: "#C9C9C9", fontSize: 14 },
  card: { width: "100%", maxWidth: 420 },
  form: { width: "100%", maxWidth: 420, alignSelf: "center", paddingBottom: 32 },
  brand: { color: "#2AA79B", fontSize: 32, fontWeight: "700" },
  eyebrow: { color: "#2AA79B", fontSize: 14, fontWeight: "600", marginTop: 16 },
  title: { color: "#FFFFFF", fontSize: 20, fontWeight: "600", marginTop: 4 },
  body: { color: "#C9C9C9", fontSize: 15, marginTop: 12, marginBottom: 20 },
  input: {
    backgroundColor: "#242424",
    borderRadius: 8,
    color: "#FFFFFF",
    fontSize: 16,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginTop: 4,
    marginBottom: 8,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#2AA79B",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  checkboxChecked: { backgroundColor: "#2AA79B" },
  checkboxMark: { color: "#0B0B0B", fontSize: 14, fontWeight: "700" },
  checkboxLabel: { color: "#C9C9C9", fontSize: 14, flex: 1 },
  error: { color: "#E0706A", fontSize: 14, marginTop: 4 },
  submit: {
    backgroundColor: "#2AA79B",
    borderRadius: 8,
    marginTop: 16,
    paddingVertical: 12,
    alignItems: "center",
  },
  submitDisabled: { opacity: 0.6 },
  submitLabel: { color: "#0B0B0B", fontSize: 16, fontWeight: "700" },
  secondary: {
    borderWidth: 1,
    borderColor: "#2AA79B",
    borderRadius: 8,
    marginTop: 16,
    paddingVertical: 12,
    alignItems: "center",
  },
  secondaryLabel: { color: "#2AA79B", fontSize: 16, fontWeight: "600" },
  vehicleCard: {
    backgroundColor: "#242424",
    borderRadius: 8,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  vehicleName: { color: "#FFFFFF", fontSize: 16, fontWeight: "600" },
  vehicleMeta: { color: "#C9C9C9", fontSize: 14, marginTop: 4 },
});
