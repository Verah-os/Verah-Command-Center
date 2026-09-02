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

// Email/password sign-up + login against the shared Supabase project. No
// social/phone providers; recovery stays out of scope for M1.
export function AuthScreen({ controller }: { controller: AuthSessionController }) {
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.container}
    >
      <Text style={styles.brand}>VERAH</Text>
      <Text style={styles.title}>
        {mode === "sign-in" ? "Entrar" : "Criar conta"}
      </Text>
      <TextInput
        style={styles.input}
        placeholder="E-mail"
        placeholderTextColor="#777777"
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
        placeholderTextColor="#777777"
        secureTextEntry
        textContentType={mode === "sign-in" ? "password" : "newPassword"}
        value={password}
        onChangeText={setPassword}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      <Pressable
        style={[styles.submit, busy && styles.submitDisabled]}
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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { width: "100%", maxWidth: 420 },
  brand: { color: "#2AA79B", fontSize: 32, fontWeight: "700" },
  title: { color: "#FFFFFF", fontSize: 20, fontWeight: "600", marginTop: 8, marginBottom: 20 },
  input: {
    backgroundColor: "#242424",
    borderRadius: 8,
    color: "#FFFFFF",
    fontSize: 16,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  error: { color: "#E0706A", fontSize: 14, marginTop: 4 },
  notice: { color: "#2AA79B", fontSize: 14, marginTop: 4 },
  submit: {
    backgroundColor: "#2AA79B",
    borderRadius: 8,
    marginTop: 16,
    paddingVertical: 12,
    alignItems: "center",
  },
  submitDisabled: { opacity: 0.6 },
  submitLabel: { color: "#0B0B0B", fontSize: 16, fontWeight: "700" },
  switchMode: {
    color: "#C9C9C9",
    fontSize: 14,
    marginTop: 16,
    textAlign: "center",
  },
});
