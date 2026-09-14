import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { AuthSessionController } from "./auth-session";

export function AuthScreen({
  controller,
  recoveryMode = false,
}: {
  controller: AuthSessionController;
  recoveryMode?: boolean;
}) {
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    const result =
      mode === "sign-in"
        ? await controller.signIn(email.trim(), password)
        : await controller.signUp(email.trim(), password);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    if (mode === "sign-up") {
      setNotice("Cadastro criado. Confirme o e-mail se o projeto exigir.");
    }
  };

  const requestRecovery = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await controller.requestPasswordReset(email.trim());
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setNotice(result.message ?? "Se este e-mail estiver cadastrado, enviaremos as instruções.");
  };

  const savePassword = async () => {
    setError(null);
    setNotice(null);
    if (password !== confirmPassword) {
      setError("As senhas precisam ser iguais.");
      return;
    }
    setBusy(true);
    const result = await controller.updatePassword(password);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setNotice("Senha atualizada com segurança.");
  };

  const google = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await controller.signInWithGoogle();
    setBusy(false);
    if (!result.ok) setError(result.message);
  };

  if (recoveryMode) {
    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.container}
      >
        <View style={styles.card}>
          <Text style={styles.brand}>VERAH</Text>
          <Text style={styles.kicker}>Confiança para cuidar do que é seu</Text>
          <Text style={styles.title}>Criar nova senha</Text>
          <TextInput
            style={styles.input}
            placeholder="Nova senha"
            placeholderTextColor="#8A9199"
            secureTextEntry
            textContentType="newPassword"
            value={password}
            onChangeText={setPassword}
          />
          <TextInput
            style={styles.input}
            placeholder="Confirmar nova senha"
            placeholderTextColor="#8A9199"
            secureTextEntry
            textContentType="newPassword"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {notice ? <Text style={styles.notice}>{notice}</Text> : null}
          <Pressable
            style={[styles.submit, busy && styles.disabled]}
            disabled={busy}
            onPress={() => void savePassword()}
          >
            <Text style={styles.submitLabel}>Salvar nova senha</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.container}
    >
      <View style={styles.card}>
        <Text style={styles.brand}>VERAH</Text>
        <Text style={styles.kicker}>Confiança para cuidar do que é seu</Text>
        <Text style={styles.title}>
          {mode === "sign-in" ? "Entrar" : "Criar conta"}
        </Text>

        <Pressable
          style={[styles.googleButton, busy && styles.disabled]}
          disabled={busy}
          onPress={() => void google()}
        >
          <Text style={styles.googleMark}>G</Text>
          <Text style={styles.googleLabel}>Continuar com Google</Text>
        </Pressable>

        <View style={styles.dividerRow}>
          <View style={styles.divider} />
          <Text style={styles.dividerText}>ou</Text>
          <View style={styles.divider} />
        </View>

        <TextInput
          style={styles.input}
          placeholder="E-mail"
          placeholderTextColor="#8A9199"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          placeholder="Senha"
          placeholderTextColor="#8A9199"
          secureTextEntry
          textContentType={mode === "sign-in" ? "password" : "newPassword"}
          value={password}
          onChangeText={setPassword}
        />
        {mode === "sign-in" ? (
          <Pressable disabled={busy} onPress={() => void requestRecovery()}>
            <Text style={styles.forgotPassword}>Esqueci minha senha</Text>
          </Pressable>
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}
        <Pressable
          style={[styles.submit, busy && styles.disabled]}
          disabled={busy}
          onPress={() => void submit()}
        >
          <Text style={styles.submitLabel}>
            {mode === "sign-in" ? "Entrar" : "Cadastrar"}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => {
            setMode(mode === "sign-in" ? "sign-up" : "sign-in");
            setError(null);
            setNotice(null);
          }}
        >
          <Text style={styles.switchMode}>
            {mode === "sign-in"
              ? "Ainda não tem conta? Cadastre-se"
              : "Já tem conta? Entrar"}
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, width: "100%", alignItems: "center", justifyContent: "center", padding: 20 },
  card: { width: "100%", maxWidth: 420, backgroundColor: "#FFFFFF", borderRadius: 24, padding: 22, borderWidth: 1, borderColor: "#F3DFE3" },
  brand: { color: "#814455", fontSize: 34, fontWeight: "800", letterSpacing: 1 },
  kicker: { color: "#A85F70", fontSize: 13, fontWeight: "600", marginTop: 3 },
  title: { color: "#263238", fontSize: 24, fontWeight: "700", marginTop: 24, marginBottom: 18 },
  googleButton: { minHeight: 48, borderWidth: 1, borderColor: "#DADDE1", borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: 14 },
  googleMark: { color: "#263238", fontSize: 18, fontWeight: "800" },
  googleLabel: { color: "#263238", fontSize: 15, fontWeight: "700" },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 18 },
  divider: { flex: 1, height: 1, backgroundColor: "#ECE7E8" },
  dividerText: { color: "#8A9199", fontSize: 12 },
  input: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#DED9DA", borderRadius: 12, color: "#263238", fontSize: 16, marginBottom: 12, paddingHorizontal: 14, paddingVertical: 12 },
  forgotPassword: { color: "#814455", fontSize: 14, fontWeight: "600", textAlign: "right", marginTop: -2, marginBottom: 4 },
  error: { color: "#C84E59", fontSize: 14, marginTop: 4 },
  notice: { color: "#814455", fontSize: 14, marginTop: 4 },
  submit: { backgroundColor: "#814455", borderRadius: 12, marginTop: 16, paddingVertical: 13, alignItems: "center" },
  disabled: { opacity: 0.6 },
  submitLabel: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  switchMode: { color: "#667085", fontSize: 14, marginTop: 16, textAlign: "center" },
});
