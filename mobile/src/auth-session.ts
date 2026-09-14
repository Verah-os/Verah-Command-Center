export type AuthUser = {
  id: string;
  email?: string;
  userMetadata?: Record<string, unknown>;
  appMetadata?: Record<string, unknown>;
  createdAt?: string;
  lastSignInAt?: string;
};
export type AuthSessionData = { user: AuthUser } | null;

export type AuthState =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "password-recovery"; user: AuthUser | null }
  | { status: "signed-in"; user: AuthUser };

export type AuthResult =
  | { ok: true; message?: string }
  | { ok: false; message: string };

export type AuthResponse = { error: { message: string } | null };

export interface AuthFacade {
  getSession(): Promise<{ session: AuthSessionData }>;
  onAuthStateChange(
    listener: (event: string, session: AuthSessionData) => void,
  ): { unsubscribe(): void };
  signIn(email: string, password: string): Promise<AuthResponse>;
  signUp(email: string, password: string): Promise<AuthResponse>;
  signOut(): Promise<AuthResponse>;
  signInWithGoogle?(): Promise<AuthResponse>;
  handleAuthUrl?(url: string): Promise<AuthResponse>;
  resetPasswordForEmail?(email: string): Promise<AuthResponse>;
  updatePassword?(password: string): Promise<AuthResponse>;
}

export interface AuthSessionController {
  getState(): AuthState;
  subscribe(listener: () => void): () => void;
  signUp(email: string, password: string): Promise<AuthResult>;
  signIn(email: string, password: string): Promise<AuthResult>;
  signInWithGoogle(): Promise<AuthResult>;
  requestPasswordReset(email: string): Promise<AuthResult>;
  handleAuthUrl(url: string): Promise<AuthResult>;
  updatePassword(password: string): Promise<AuthResult>;
  signOut(): Promise<AuthResult>;
  dispose(): void;
}

const RECOVERY_NOTICE =
  "Se este e-mail estiver cadastrado, enviaremos as instruções para redefinir a senha.";

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isRecoveryUrl(url: string) {
  if (!url.startsWith("verah-dev://auth/callback")) return false;
  try {
    const normalized = url.replace("#", "?");
    const parsed = new URL(normalized);
    return parsed.searchParams.get("type") === "recovery";
  } catch {
    return /(?:[?#&])type=recovery(?:&|$)/.test(url);
  }
}

export function createAuthSession(facade: AuthFacade): AuthSessionController {
  let state: AuthState = { status: "loading" };
  let recoveryActive = false;
  const listeners = new Set<() => void>();
  const emit = () => { for (const listener of listeners) listener(); };
  const applySession = (session: AuthSessionData) => {
    if (recoveryActive) {
      state = { status: "password-recovery", user: session?.user ?? null };
    } else {
      state = session?.user
        ? { status: "signed-in", user: session.user }
        : { status: "signed-out" };
    }
    emit();
  };

  const subscription = facade.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT") {
      recoveryActive = false;
      state = { status: "signed-out" };
      emit();
      return;
    }
    if (event === "PASSWORD_RECOVERY") recoveryActive = true;
    applySession(session);
  });

  void facade.getSession().then(({ session }) => {
    if (state.status === "loading") applySession(session);
  });

  const toResult = (response: AuthResponse): AuthResult =>
    response.error ? { ok: false, message: response.error.message } : { ok: true };

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    async signIn(email, password) {
      return toResult(await facade.signIn(email, password));
    },
    async signUp(email, password) {
      return toResult(await facade.signUp(email, password));
    },
    async signInWithGoogle() {
      if (!facade.signInWithGoogle) {
        return { ok: false, message: "Login com Google ainda não está configurado nesta build." };
      }
      return toResult(await facade.signInWithGoogle());
    },
    async requestPasswordReset(email) {
      const normalized = email.trim().toLowerCase();
      if (!isValidEmail(normalized)) {
        return { ok: false, message: "Digite um e-mail válido." };
      }
      if (facade.resetPasswordForEmail) {
        try {
          await facade.resetPasswordForEmail(normalized);
        } catch {
          // Deliberately ignore transport/backend detail to avoid account enumeration.
        }
      }
      return { ok: true, message: RECOVERY_NOTICE };
    },
    async handleAuthUrl(url) {
      if (!facade.handleAuthUrl) return { ok: true };
      const recovery = isRecoveryUrl(url);
      const result = toResult(await facade.handleAuthUrl(url));
      if (!result.ok) return result;
      if (recovery) {
        recoveryActive = true;
        const { session } = await facade.getSession();
        state = { status: "password-recovery", user: session?.user ?? null };
        emit();
      }
      return { ok: true };
    },
    async updatePassword(password) {
      if (password.length < 8) {
        return { ok: false, message: "Use uma senha com pelo menos 8 caracteres." };
      }
      if (!facade.updatePassword) {
        return { ok: false, message: "Não foi possível redefinir a senha nesta build." };
      }
      const result = toResult(await facade.updatePassword(password));
      if (!result.ok) return result;
      recoveryActive = false;
      const { session } = await facade.getSession();
      applySession(session);
      return { ok: true };
    },
    async signOut() {
      const result = toResult(await facade.signOut());
      if (result.ok) {
        recoveryActive = false;
        state = { status: "signed-out" };
        emit();
      }
      return result;
    },
    dispose() {
      subscription.unsubscribe();
    },
  };
}
