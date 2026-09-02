import { useEffect, useState, useSyncExternalStore } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import {
  createAuthSession,
  type AuthFacade,
  type AuthSessionController,
} from "./auth-session";
import { AuthScreen } from "./AuthScreen";

// Session gate: restores the persisted AsyncStorage session on start, then
// routes signed-out customers to the auth form and signed-in customers to a
// placeholder (onboarding + garage land in the next ordered delivery).
export function AuthGate({ facade }: { facade: AuthFacade }) {
  const [controller] = useState<AuthSessionController>(() =>
    createAuthSession(facade),
  );
  useEffect(() => () => controller.dispose(), [controller]);
  const state = useSyncExternalStore(controller.subscribe, controller.getState);

  if (state.status === "loading") {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#2AA79B" />
        <Text style={styles.note}>Restaurando sessão…</Text>
      </View>
    );
  }
  if (state.status === "signed-out") {
    return <AuthScreen controller={controller} />;
  }
  return (
    <SignedInPlaceholder
      email={state.user.email}
      onSignOut={() => void controller.signOut()}
    />
  );
}

function SignedInPlaceholder({
  email,
  onSignOut,
}: {
  email?: string;
  onSignOut: () => void;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.brand}>VERAH</Text>
      <Text style={styles.title}>Sessão ativa</Text>
      <Text style={styles.body}>Conectada como {email ?? "cliente"}.</Text>
      <Text style={styles.body}>
        Onboarding e garagem chegam na próxima entrega ordenada (M1).
      </Text>
      <Pressable style={styles.signOutButton} onPress={onSignOut}>
        <Text style={styles.signOutLabel}>Sair</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center", gap: 12 },
  note: { color: "#C9C9C9", fontSize: 14 },
  card: { maxWidth: 420 },
  brand: { color: "#2AA79B", fontSize: 32, fontWeight: "700" },
  title: { color: "#FFFFFF", fontSize: 20, fontWeight: "600", marginTop: 8 },
  body: { color: "#C9C9C9", fontSize: 15, marginTop: 12 },
  signOutButton: {
    marginTop: 24,
    borderWidth: 1,
    borderColor: "#2AA79B",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  signOutLabel: { color: "#2AA79B", fontSize: 16, fontWeight: "600" },
});
