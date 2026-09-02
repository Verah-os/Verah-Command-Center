import { useEffect, useState, useSyncExternalStore } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import {
  createAuthSession,
  type AuthFacade,
  type AuthSessionController,
} from "./auth-session";
import type { CustomerJourneyFacade } from "./customer-journey";
import { AuthScreen } from "./AuthScreen";
import { CustomerJourneyGate } from "./CustomerJourney";

// Session gate: restores the persisted AsyncStorage session on start, then
// routes signed-out customers to the auth form and signed-in customers to the
// onboarding/garage journey (#173), whose progress is restored server-side.
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
    <CustomerJourneyGate
      facade={journeyFacade}
      user={state.user}
      onSignOut={() => void controller.signOut()}
    />
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center", gap: 12 },
  note: { color: "#C9C9C9", fontSize: 14 },
});
