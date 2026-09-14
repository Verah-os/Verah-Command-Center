import assert from "node:assert/strict";
import test from "node:test";

import { createAuthSession } from "../src/auth-session.ts";

function facade(overrides = {}) {
  let session = null;
  const listeners = new Set();
  return {
    getSession: async () => ({ session }),
    onAuthStateChange(listener) {
      listeners.add(listener);
      return { unsubscribe: () => listeners.delete(listener) };
    },
    signIn: async () => ({ error: null }),
    signUp: async () => ({ error: null }),
    signOut: async () => ({ error: null }),
    resetPasswordForEmail: async () => ({ error: null }),
    handleAuthUrl: async () => {
      session = { user: { id: "u-1", email: "cliente@verah.dev" } };
      return { error: null };
    },
    updatePassword: async () => ({ error: null }),
    ...overrides,
  };
}

test("rejects malformed recovery email locally", async () => {
  const controller = createAuthSession(facade());
  const result = await controller.requestPasswordReset("invalido");
  assert.equal(result.ok, false);
  assert.match(result.message, /e-mail válido/i);
  controller.dispose();
});

test("returns the same neutral recovery message even when backend rejects", async () => {
  const controller = createAuthSession(facade({
    resetPasswordForEmail: async () => ({ error: { message: "user not found" } }),
  }));
  const result = await controller.requestPasswordReset("cliente@verah.dev");
  assert.equal(result.ok, true);
  assert.match(result.message, /se este e-mail estiver cadastrado/i);
  controller.dispose();
});

test("recovery callback enters password-recovery state for the same auth user", async () => {
  const controller = createAuthSession(facade());
  const result = await controller.handleAuthUrl(
    "verah-dev://auth/callback#access_token=a&refresh_token=b&type=recovery",
  );
  assert.equal(result.ok, true);
  const state = controller.getState();
  assert.equal(state.status, "password-recovery");
  assert.equal(state.user?.id, "u-1");
  controller.dispose();
});

test("successful password update keeps the canonical user and exits recovery", async () => {
  const controller = createAuthSession(facade());
  await controller.handleAuthUrl(
    "verah-dev://auth/callback#access_token=a&refresh_token=b&type=recovery",
  );
  const result = await controller.updatePassword("nova-senha-123");
  assert.equal(result.ok, true);
  const state = controller.getState();
  assert.equal(state.status, "signed-in");
  assert.equal(state.user.id, "u-1");
  controller.dispose();
});
