export type AuthUser = { id: string; email?: string };
export type AuthSessionData = { user: AuthUser } | null;

export type AuthState =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "signed-in"; user: AuthUser };

export type AuthResult = { ok: true } | { ok: false; message: string };

type AuthResponse = { error: { message: string } | null };

export interface AuthFacade {
  getSession(): Promise<{ session: AuthSessionData }>;
  onAuthStateChange(
    listener: (event: string, session: AuthSessionData) => void,
  ): { unsubscribe(): void };
  signIn(email: string, password: string): Promise<AuthResponse>;
  signUp(email: string, password: string): Promise<AuthResponse>;
  signOut(): Promise<AuthResponse>;
  signInWithGoogle?(): Promise<AuthResponse>;
}

export interface AuthSessionController {
  getState(): AuthState;
  subscribe(listener: () => void): () => void;
  signUp(email: string, password: string): Promise<AuthResult>;
  signIn(email: string, password: string): Promise<AuthResult>;
  signInWithGoogle(): Promise<AuthResult>;
  signOut(): Promise<AuthResult>;
  dispose(): void;
}

export function createAuthSession(facade: AuthFacade): AuthSessionController {
  let state: AuthState = { status: "loading" };
  const listeners = new Set<() => void>();
  const emit = () => { for (const listener of listeners) listener(); };
  const applySession = (session: AuthSessionData) => {
    state = session?.user
      ? { status: "signed-in", user: session.user }
      : { status: "signed-out" };
    emit();
  };

  const subscription = facade.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT") {
      state = { status: "signed-out" };
      emit();
      return;
    }
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
    async signOut() {
      const result = toResult(await facade.signOut());
      if (result.ok) {
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
