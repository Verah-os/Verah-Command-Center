import { useEffect, useState, useSyncExternalStore } from "react";
import { ActivityIndicator, Linking, StyleSheet, Text, View } from "react-native";
import {
  createAuthSession,
  type AuthFacade,
  type AuthSessionController,
} from "./auth-session";
import type { CustomerJourneyFacade } from "./customer-journey";
import { AuthScreen } from "./AuthScreen";
import { CustomerJourneyGate } from "./CustomerJourney";

export function AuthGate({
  facade,
  journeyFacade,
}: {
  facade: AuthFacade;
  journeyFacade: CustomerJourneyFacade;
}) {
  const [controller] = useState<AuthSessionController>(() =>
    createAuthSession(facade),
  );

  useEffect(() => {
    const consume = (url: string | null) => {
      if (url) void controller.handleAuthUrl(url);
    };
    const subscription = Linking.addEventListener("url", ({ url }) => consume(url));
    void Linking.getInitialURL().then(consume);
    return () => {
      subscription.remove();
      controller.dispose();
    };
  }, [controller]);

  const state = useSyncExternalStore(controller.subscribe, controller.getState);

  if (state.status === "loading") {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#814455" />
        <Text style={styles.note}>Restaurando sessão…</Text>
      </View>
    );
  }
  if (state.status === "signed-out" || state.status === "password-recovery") {
    return (
      <AuthScreen
        controller={controller}
        recoveryMode={state.status === "password-recovery"}
      />
    );
  }
  return (
    <CustomerJourneyGate
      facade={journeyFacade}
      user={state.user}
      onSignOut={() => void controller.signOut()}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  note: { color: "#667085", fontSize: 14 },
});
