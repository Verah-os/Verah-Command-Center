import { SafeAreaView, StatusBar, StyleSheet, Text, View } from "react-native";
import { getAuthFacade, getCustomerJourneyFacade } from "./src/supabase";
import { resolveVerahEnvironmentDescriptor } from "./src/config";
import { AuthGate } from "./src/AuthGate";

const CANONICAL_ALPHA_PROJECT_REF = "wxnklnbntgpcncajzpsj";

export default function App() {
  const descriptor = resolveVerahEnvironmentDescriptor({
    EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
    EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    EXPO_PUBLIC_SUPABASE_ENVIRONMENT: process.env.EXPO_PUBLIC_SUPABASE_ENVIRONMENT,
  });
  // Packaged Alpha/preview builds must use the canonical hosted project.
  // Explicit localhost remains available only in React Native development bundles.
  const localDevelopment = __DEV__ && descriptor?.projectRef === null;
  const canonicalAlpha = descriptor?.projectRef === CANONICAL_ALPHA_PROJECT_REF;
  const backendAllowed = Boolean(descriptor && (canonicalAlpha || localDevelopment));
  const facade = backendAllowed ? getAuthFacade() : null;
  const journeyFacade = backendAllowed ? getCustomerJourneyFacade() : null;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFF9F8" />
      {facade && journeyFacade && descriptor ? (
        <View style={styles.appShell}>
          <View style={styles.environmentBanner}>
            <Text style={styles.environmentText}>
              {localDevelopment
                ? "Desenvolvimento local"
                : `Alpha · ${descriptor.projectRef}`}
            </Text>
          </View>
          <View style={styles.appContent}>
            <AuthGate facade={facade} journeyFacade={journeyFacade} />
          </View>
        </View>
      ) : (
        <FailClosedNotice projectRef={descriptor?.projectRef ?? null} />
      )}
    </SafeAreaView>
  );
}

function FailClosedNotice({ projectRef }: { projectRef: string | null }) {
  return (
    <View style={styles.failClosed}>
      <View style={styles.card}>
        <Text style={styles.brand}>VERAH</Text>
        <Text style={styles.title}>Build Alpha bloqueada</Text>
        <Text style={styles.body}>
          Este APK não está conectado ao backend Alpha canônico da VERAH.
          Nenhuma informação é enviada ou recebida até a configuração ser corrigida.
        </Text>
        <Text style={styles.diagnostic}>
          Backend: {projectRef ?? "não configurado"}
        </Text>
        <Text style={styles.diagnostic}>
          Esperado: {CANONICAL_ALPHA_PROJECT_REF}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, width: "100%", backgroundColor: "#FFF9F8" },
  appShell: { flex: 1, width: "100%" },
  appContent: { flex: 1 },
  environmentBanner: {
    width: "100%",
    paddingVertical: 4,
    paddingHorizontal: 12,
    backgroundColor: "#F7E8EB",
    alignItems: "center",
  },
  environmentText: { color: "#814455", fontSize: 11, fontWeight: "700" },
  failClosed: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  card: { width: "100%", maxWidth: 420 },
  brand: { color: "#814455", fontSize: 32, fontWeight: "800" },
  title: { color: "#263238", fontSize: 20, fontWeight: "600", marginTop: 8 },
  body: { color: "#667085", fontSize: 15, marginTop: 12 },
  diagnostic: { color: "#667085", fontSize: 12, marginTop: 8 },
});
