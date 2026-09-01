import { SafeAreaView, StatusBar, StyleSheet, Text, View } from "react-native";
import { getSupabaseClient } from "./src/supabase";

// M1 scaffold (epic #164): smoke screen only. Auth, onboarding and garage
// screens land in the next dependency-ordered issues (see docs/ship-verah).
export default function App() {
  const configured = getSupabaseClient() !== null;
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.card}>
        <Text style={styles.brand}>VERAH</Text>
        <Text style={styles.title}>Build de desenvolvimento — M1</Text>
        <Text style={styles.body}>
          App em construção. Nenhum dado de produção é usado aqui.
        </Text>
        <Text style={styles.status}>
          Supabase (anon, RLS): {configured ? "configurado" : "não configurado — defina EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_ANON_KEY"}
        </Text>
      </View>
    </SafeAreaView>
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
  status: { color: "#C9C9C9", fontSize: 13, marginTop: 20 },
});
