import { SafeAreaView, StatusBar, StyleSheet, Text, View } from "react-native";
import { getAuthFacade, getCustomerJourneyFacade } from "./src/supabase";
import { AuthGate } from "./src/AuthGate";

export default function App() {
  const facade = getAuthFacade();
  const journeyFacade = getCustomerJourneyFacade();
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFF9F8" />
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
    <View style={styles.failClosed}>
      <View style={styles.card}>
        <Text style={styles.brand}>VERAH</Text>
        <Text style={styles.title}>Build de desenvolvimento — M1</Text>
        <Text style={styles.body}>
          Supabase público não configurado. Defina EXPO_PUBLIC_SUPABASE_URL e
          EXPO_PUBLIC_SUPABASE_ANON_KEY. Fail-closed: nenhuma chamada de backend
          é possível.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, width: "100%", backgroundColor: "#FFF9F8" },
  failClosed: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  card: { width: "100%", maxWidth: 420 },
  brand: { color: "#177F78", fontSize: 32, fontWeight: "800" },
  title: { color: "#263238", fontSize: 20, fontWeight: "600", marginTop: 8 },
  body: { color: "#667085", fontSize: 15, marginTop: 12 },
});
