// Pure auth session state machine for the mobile M1 flow. Free of React
// Native imports so it runs under plain `node --test` (same convention as the
// root suite); the RN/Supabase wiring lives in `supabase.ts` / `AuthGate.tsx`.

export type AuthUser = { id: string; email?: string };
export type AuthSessionData = { user: AuthUser } | null;

export type AuthState =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "signed-in"; user: AuthUser };

export type AuthResult = { ok: true } | { ok: false; message: string };

// Minimal seam over the Supabase auth surface used by the app. Injection via
// this interface is required for tests (Node CI has no RN runtime); the real
// binding from SupabaseClient lives in `supabase.ts`.
export interface AuthFacade {
  getSession(): Promise<{ session: AuthSessionData }>;
  onAuthStateChange(
    listener: (event: string, session: AuthSessionData) => void,
  ): { unsubscribe(): void };
  signIn(email: string, password: string): Promise<{ error: { message: string } | null }>;
  signUp(email: string, password: string): Promise<{ error: { message: string } | null }>;
  signOut(): Promise<{ error: { message: string } | null }>;
}

export interface AuthSessionController {
  getState(): AuthState;
  subscribe(listener: () => void): () => void;
  signUp(email: string, password: string): Promise<AuthResult>;
  signIn(email: string, password: string): Promise<AuthResult>;
  signOut(): Promise<AuthResult>;
  dispose(): void;
}

export function createAuthSession(facade: AuthFacade): AuthSessionController {
  let state: AuthState = { status: "loading" };
  const listeners = new Set<() => void>();

  const emit = () => {
    for (const listener of listeners) listener();
  };

  const applySession = (session: AuthSessionData) => {
    // Explicit guard: a null/partial session must never report signed-in.
    state = session?.user
      ? { status: "signed-in", user: session.user }
      : { status: "signed-out" };
    emit();
  };

  // Subscribe before the initial getSession so no event is lost between the
  // two calls.
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

  const toResult = (response: { error: { message: string } | null }): AuthResult =>
    response.error
      ? { ok: false, message: response.error.message }
      : { ok: true };

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async signIn(email, password) {
      return toResult(await facade.signIn(email, password));
    },
    async signUp(email, password) {
      return toResult(await facade.signUp(email, password));
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
