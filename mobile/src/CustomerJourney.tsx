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
  type JourneyUser,
} from "./customer-journey";
import { CustomerHome } from "./CustomerHome";
import { VehicleOnboardingStep } from "./VehicleOnboardingStep";

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
        <ActivityIndicator color="#177F78" />
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
        <PrimaryButton label="Tentar novamente" onPress={() => void controller.restore()} />
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
  return (
    <CustomerHome
      vehicles={state.vehicles}
      requests={state.requests}
      onSignOut={onSignOut}
    />
  );
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
    <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
      <Text style={styles.brand}>VERAH</Text>
      <Text style={styles.eyebrow}>Conta criada</Text>
      <Text style={styles.title}>Vamos preparar sua VERAH</Text>
      <Text style={styles.body}>
        Seu progresso fica salvo e acompanha você em qualquer dispositivo.
      </Text>
      <TextInput
        style={styles.input}
        placeholder="Nome de preferência"
        placeholderTextColor="#7A838B"
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

function SecondaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.secondary} onPress={onPress}>
      <Text style={styles.secondaryLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center", gap: 12 },
  note: { color: "#667085", fontSize: 14 },
  card: { width: "100%", maxWidth: 420, backgroundColor: "#FFFFFF", padding: 22, borderRadius: 22 },
  form: { width: "100%", maxWidth: 420, alignSelf: "center", paddingBottom: 32 },
  brand: { color: "#177F78", fontSize: 32, fontWeight: "800" },
  eyebrow: { color: "#A85F70", fontSize: 14, fontWeight: "700", marginTop: 16 },
  title: { color: "#263238", fontSize: 22, fontWeight: "700", marginTop: 4 },
  body: { color: "#667085", fontSize: 15, marginTop: 12, marginBottom: 20 },
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
  checkboxRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginTop: 4, marginBottom: 8 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1, borderColor: "#177F78", alignItems: "center", justifyContent: "center", marginTop: 2 },
  checkboxChecked: { backgroundColor: "#177F78" },
  checkboxMark: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  checkboxLabel: { color: "#667085", fontSize: 14, flex: 1 },
  error: { color: "#C84E59", fontSize: 14, marginTop: 4 },
  submit: { backgroundColor: "#177F78", borderRadius: 12, marginTop: 16, paddingVertical: 13, alignItems: "center" },
  submitDisabled: { opacity: 0.6 },
  submitLabel: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  secondary: { borderWidth: 1, borderColor: "#177F78", borderRadius: 12, marginTop: 16, paddingVertical: 12, alignItems: "center" },
  secondaryLabel: { color: "#177F78", fontSize: 16, fontWeight: "600" },
});
