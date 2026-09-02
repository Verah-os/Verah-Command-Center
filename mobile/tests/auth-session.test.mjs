import assert from "node:assert/strict";
import test from "node:test";

import { createAuthSession } from "../src/auth-session.ts";

// The in-memory facade is a deliberately necessary seam: Node CI has no
// React Native runtime, so the real binding in `src/supabase.ts` cannot be
// loaded here. The tests exercise the `createAuthSession` code path (restore,
// auth events, sign-in/up/out transitions) through this minimal transport.
function createFakeFacade(initialSession = null, failure = null) {
  const listeners = new Set();
  let session = initialSession;
  const calls = { signIn: 0, signUp: 0, signOut: 0 };
  const emit = (event) => {
    for (const listener of listeners) listener(event, session);
  };
  const facade = {
    getSession: async () => ({ session }),
    onAuthStateChange(listener) {
      listeners.add(listener);
      return { unsubscribe: () => listeners.delete(listener) };
    },
    signIn: async (email, password) => {
      calls.signIn += 1;
      if (failure === "signIn" || !email || !password) {
        return { error: { message: "credenciais recusadas" } };
      }
      session = { user: { id: "u-1", email } };
      emit("SIGNED_IN");
      return { error: null };
    },
    signUp: async (email, password) => {
      calls.signUp += 1;
      if (failure === "signUp" || !email || !password) {
        return { error: { message: "cadastro recusado" } };
      }
      session = { user: { id: "u-2", email } };
      emit("SIGNED_IN");
      return { error: null };
    },
    signOut: async () => {
      calls.signOut += 1;
      session = null;
      return { error: null };
    },
  };
  return { facade, calls, emit };
}

test("starts loading and restores a persisted session as signed-in", async () => {
  const persisted = { user: { id: "u-9", email: "cliente@verah.dev" } };
  const { facade } = createFakeFacade(persisted);
  const controller = createAuthSession(facade);
  assert.equal(controller.getState().status, "loading");
  await new Promise((resolve) => setTimeout(resolve, 0));
  const state = controller.getState();
  assert.equal(state.status, "signed-in");
  assert.deepEqual(state.user, persisted.user);
  controller.dispose();
});

test("restores signed-out when no persisted session exists", async () => {
  const { facade } = createFakeFacade(null);
  const controller = createAuthSession(facade);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(controller.getState().status, "signed-out");
  controller.dispose();
});

test("successful sign-in turns the customer signed-in via the facade event", async () => {
  const { facade, calls } = createFakeFacade(null);
  const controller = createAuthSession(facade);
  const result = await controller.signIn("cliente@verah.dev", "senha-123");
  assert.deepEqual(result, { ok: true });
  assert.equal(calls.signIn, 1);
  const state = controller.getState();
  assert.equal(state.status, "signed-in");
  assert.equal(state.user.email, "cliente@verah.dev");
  controller.dispose();
});

test("rejected sign-in stays signed-out and surfaces the message", async () => {
  const { facade } = createFakeFacade(null, "signIn");
  const controller = createAuthSession(facade);
  const result = await controller.signIn("cliente@verah.dev", "errada");
  assert.equal(result.ok, false);
  assert.equal(result.message, "credenciais recusadas");
  assert.equal(controller.getState().status, "signed-out");
  controller.dispose();
});

test("successful sign-up signs the customer in", async () => {
  const { facade, calls } = createFakeFacade(null);
  const controller = createAuthSession(facade);
  const result = await controller.signUp("nova@verah.dev", "senha-123");
  assert.deepEqual(result, { ok: true });
  assert.equal(calls.signUp, 1);
  assert.equal(controller.getState().status, "signed-in");
  controller.dispose();
});

test("rejected sign-up stays signed-out", async () => {
  const { facade } = createFakeFacade(null, "signUp");
  const controller = createAuthSession(facade);
  const result = await controller.signUp("nova@verah.dev", "senha-123");
  assert.equal(result.ok, false);
  assert.equal(controller.getState().status, "signed-out");
  controller.dispose();
});

test("a SIGNED_OUT auth event flips an active session to signed-out", async () => {
  const { facade, emit } = createFakeFacade({
    user: { id: "u-9", email: "cliente@verah.dev" },
  });
  const controller = createAuthSession(facade);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(controller.getState().status, "signed-in");
  emit("SIGNED_OUT");
  assert.equal(controller.getState().status, "signed-out");
  controller.dispose();
});

test("sign-out clears the local session state and returns ok", async () => {
  const { facade, calls } = createFakeFacade({
    user: { id: "u-9", email: "cliente@verah.dev" },
  });
  const controller = createAuthSession(facade);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const result = await controller.signOut();
  assert.deepEqual(result, { ok: true });
  assert.equal(calls.signOut, 1);
  assert.equal(controller.getState().status, "signed-out");
  controller.dispose();
});
