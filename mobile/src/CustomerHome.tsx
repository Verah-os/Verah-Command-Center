import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { CustomerServiceRequest, GarageVehicle } from "./customer-journey";
import { CustomerRequests } from "./CustomerRequests";

type Tab = "home" | "requests" | "vehicles" | "history" | "profile";

const stageLabels: Record<string, string> = {
  solicitado: "Solicitado",
  concierge_aceitou: "Concierge aceitou",
  prestador_indicado: "Prestador indicado",
  aguardando_aprovacao: "Aguardando aprovação",
  em_execucao: "Em execução",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

export function CustomerHome({
  vehicles,
  requests,
  onSignOut,
}: {
  vehicles: GarageVehicle[];
  requests: CustomerServiceRequest[];
  onSignOut: () => void;
}) {
  const [tab, setTab] = useState<Tab>("home");
  const primaryVehicle = vehicles[0] ?? null;
  const openRequest = requests.find(
    (request) => !["concluido", "cancelado"].includes(request.serviceStage),
  );
  const completed = requests.filter((request) => request.serviceStage === "concluido");

  return (
    <View style={styles.shell}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.brand}>VERAH</Text>
          <Text style={styles.kicker}>Sua jornada VERAH</Text>
        </View>

        {tab === "home" && (
          <>
            <View style={styles.hero}>
              <Text style={styles.heroTitle}>Cuidado para o seu veículo. Clareza para você.</Text>
              <Text style={styles.heroText}>
                Do primeiro relato ao cuidado concluído, a VERAH conecta cada próximo passo.
              </Text>
              <Pressable style={styles.primaryButton} onPress={() => setTab("requests")}>
                <Text style={styles.primaryButtonText}>Solicitar atendimento</Text>
              </Pressable>
            </View>

            <Section title="Meu veículo">
              {primaryVehicle ? (
                <>
                  <Text style={styles.cardEyebrow}>
                    {primaryVehicle.nickname ?? "Veículo principal"}
                  </Text>
                  <Text style={styles.cardTitle}>
                    {primaryVehicle.brand} {primaryVehicle.model}
                  </Text>
                  <Text style={styles.meta}>
                    {[primaryVehicle.year, primaryVehicle.plate].filter(Boolean).join(" · ")}
                  </Text>
                  <TextButton label="Ver veículos" onPress={() => setTab("vehicles")} />
                </>
              ) : (
                <Text style={styles.empty}>Nenhum veículo ativo encontrado.</Text>
              )}
            </Section>

            <Section title="Atendimento atual" accent>
              {openRequest ? (
                <>
                  <Text style={styles.reference}>{openRequest.referenceCode}</Text>
                  <Text style={styles.cardTitle}>
                    {openRequest.vehicleBrand} {openRequest.vehicleModel}
                  </Text>
                  <View style={styles.statusPill}>
                    <Text style={styles.statusText}>
                      {stageLabels[openRequest.serviceStage] ?? openRequest.serviceStage}
                    </Text>
                  </View>
                  <Text style={styles.meta}>
                    {openRequest.customerMessage ?? "Acompanhe os detalhes do atendimento."}
                  </Text>
                  <TextButton label="Acompanhar" onPress={() => setTab("requests")} />
                </>
              ) : (
                <>
                  <Text style={styles.cardTitle}>Nenhum atendimento em aberto</Text>
                  <Text style={styles.meta}>
                    Quando precisar, a VERAH organiza o próximo passo com você.
                  </Text>
                  <TextButton label="Solicitar atendimento" onPress={() => setTab("requests")} />
                </>
              )}
            </Section>

            <Section title="Histórico recente">
              {completed.length ? (
                completed.slice(0, 3).map((request) => (
                  <View key={request.id} style={styles.rowCard}>
                    <Text style={styles.rowTitle}>
                      {naturalLabel(request.probableCategory ?? "Atendimento VERAH")}
                    </Text>
                    <Text style={styles.meta}>
                      {request.customerRating ? `Avaliação ${request.customerRating}/5` : "Sem avaliação"}
                    </Text>
                  </View>
                ))
              ) : (
                <Text style={styles.empty}>
                  Seu histórico aparecerá aqui após a conclusão de um atendimento.
                </Text>
              )}
              <TextButton label="Ver histórico completo" onPress={() => setTab("history")} />
            </Section>
          </>
        )}

        {tab === "requests" && (
          <Section title="Atendimentos">
            <CustomerRequests vehicles={vehicles} requests={requests} />
          </Section>
        )}

        {tab === "vehicles" && (
          <Section title="Meus veículos">
            {vehicles.map((vehicle) => (
              <View key={vehicle.id} style={styles.rowCard}>
                <Text style={styles.rowTitle}>{vehicle.nickname ?? `${vehicle.brand} ${vehicle.model}`}</Text>
                <Text style={styles.meta}>{[vehicle.year, vehicle.plate].filter(Boolean).join(" · ")}</Text>
              </View>
            ))}
          </Section>
        )}

        {tab === "history" && (
          <Section title="Histórico">
            {completed.length ? completed.map((request) => (
              <View key={request.id} style={styles.rowCard}>
                <Text style={styles.rowTitle}>{naturalLabel(request.probableCategory ?? "Atendimento VERAH")}</Text>
                <Text style={styles.meta}>{request.referenceCode}</Text>
              </View>
            )) : <Text style={styles.empty}>Ainda não há atendimentos concluídos.</Text>}
          </Section>
        )}

        {tab === "profile" && (
          <Section title="Perfil">
            <Text style={styles.meta}>Sua conta VERAH e preferências ficarão aqui.</Text>
            <Pressable style={styles.outlineButton} onPress={onSignOut}>
              <Text style={styles.outlineButtonText}>Sair</Text>
            </Pressable>
          </Section>
        )}
      </ScrollView>

      <View style={styles.tabs}>
        <TabButton label="Início" active={tab === "home"} onPress={() => setTab("home")} />
        <TabButton label="Atend." active={tab === "requests"} onPress={() => setTab("requests")} />
        <TabButton label="Veículos" active={tab === "vehicles"} onPress={() => setTab("vehicles")} />
        <TabButton label="Histórico" active={tab === "history"} onPress={() => setTab("history")} />
        <TabButton label="Perfil" active={tab === "profile"} onPress={() => setTab("profile")} />
      </View>
    </View>
  );
}

function Section({ title, accent = false, children }: { title: string; accent?: boolean; children: React.ReactNode }) {
  return (
    <View style={[styles.card, accent && styles.accentCard]}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function TextButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.textButton}>
      <Text style={styles.textButtonLabel}>{label} →</Text>
    </Pressable>
  );
}

function TabButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={styles.tabButton} onPress={onPress} accessibilityRole="tab" accessibilityState={{ selected: active }}>
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</Text>
    </Pressable>
  );
}

function naturalLabel(value: string) {
  const label = value.replaceAll("_", " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

const styles = StyleSheet.create({
  shell: { flex: 1, width: "100%", backgroundColor: "#FFF9F8" },
  scroll: { flex: 1, width: "100%" },
  content: { width: "100%", maxWidth: 520, alignSelf: "center", padding: 18, paddingBottom: 100 },
  header: { marginBottom: 14 },
  brand: { color: "#177F78", fontSize: 28, fontWeight: "800", letterSpacing: 1 },
  kicker: { color: "#A85F70", fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1.2, marginTop: 4 },
  hero: { backgroundColor: "#FFFFFF", borderRadius: 26, padding: 22, borderWidth: 1, borderColor: "#F5DCE1", marginBottom: 14 },
  heroTitle: { color: "#263238", fontSize: 27, lineHeight: 33, fontWeight: "700" },
  heroText: { color: "#667085", fontSize: 15, lineHeight: 22, marginTop: 10 },
  primaryButton: { marginTop: 18, backgroundColor: "#177F78", borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  primaryButtonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  card: { backgroundColor: "#FFFFFF", borderRadius: 22, padding: 20, borderWidth: 1, borderColor: "#F5DCE1", marginBottom: 14 },
  accentCard: { backgroundColor: "#ECF8F6", borderColor: "#CBECE7" },
  sectionTitle: { color: "#263238", fontSize: 18, fontWeight: "700", marginBottom: 14 },
  cardEyebrow: { color: "#A85F70", fontSize: 13, fontWeight: "700" },
  cardTitle: { color: "#263238", fontSize: 21, fontWeight: "700", marginTop: 5 },
  meta: { color: "#667085", fontSize: 14, lineHeight: 21, marginTop: 6 },
  reference: { color: "#177F78", fontSize: 13, fontWeight: "800" },
  statusPill: { alignSelf: "flex-start", backgroundColor: "#FFFFFF", borderRadius: 999, paddingHorizontal: 11, paddingVertical: 7, marginTop: 12 },
  statusText: { color: "#176A65", fontSize: 13, fontWeight: "700" },
  textButton: { paddingVertical: 10, marginTop: 8, alignSelf: "flex-start" },
  textButtonLabel: { color: "#177F78", fontSize: 14, fontWeight: "700" },
  rowCard: { borderWidth: 1, borderColor: "#EEF0F2", borderRadius: 14, padding: 14, marginTop: 10 },
  rowTitle: { color: "#263238", fontSize: 15, fontWeight: "700" },
  empty: { color: "#7A838B", fontSize: 14, lineHeight: 21 },
  outlineButton: { borderWidth: 1, borderColor: "#177F78", borderRadius: 14, paddingVertical: 13, alignItems: "center", marginTop: 18 },
  outlineButtonText: { color: "#177F78", fontSize: 15, fontWeight: "700" },
  tabs: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", backgroundColor: "#FFFFFF", borderTopWidth: 1, borderTopColor: "#EEE7E8", paddingBottom: 8, paddingTop: 8 },
  tabButton: { flex: 1, alignItems: "center", paddingVertical: 8 },
  tabLabel: { color: "#7A838B", fontSize: 11, fontWeight: "600" },
  tabLabelActive: { color: "#177F78", fontWeight: "800" },
});
