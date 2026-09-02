import { SafeAreaView, StatusBar, StyleSheet, Text, View } from "react-native";
import { getAuthFacade, getCustomerJourneyFacade } from "./src/supabase";
import { AuthGate } from "./src/AuthGate";

// M1 (#169 auth + #173 onboarding/garagem): fail-closed — the app only
// renders when the public anon contract resolves; otherwise no backend
// interaction is possible.
export default function App() {
  const facade = getAuthFacade();
  const journeyFacade = getCustomerJourneyFacade();
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      {facade && journeyFacade ? (
        <AuthGate facade={facade} journeyFacade={journeyFacade} />
      ) : (
        <FailClosedNotice />
      )}
    </SafeAreaView>
  );
}

function FailClosedNotice() {
  return (
    <View style={styles.card}>
      <Text style={styles.brand}>VERAH</Text>
      <Text style={styles.title}>Build de desenvolvimento — M1</Text>
      <Text style={styles.body}>
        Supabase público não configurado. Defina EXPO_PUBLIC_SUPABASE_URL e
        EXPO_PUBLIC_SUPABASE_ANON_KEY. Fail-closed: nenhuma chamada de backend
        é possível.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1A1A1A",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: { maxWidth: 420 },
  brand: { color: "#2AA79B", fontSize: 32, fontWeight: "700" },
  title: { color: "#FFFFFF", fontSize: 20, fontWeight: "600", marginTop: 8 },
  body: { color: "#C9C9C9", fontSize: 15, marginTop: 12 },
});
