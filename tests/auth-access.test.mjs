import assert from "node:assert/strict";
import test from "node:test";
import {
  decideAuthorization,
  isUserRole,
  roleHome,
} from "../services/auth/access.ts";

test("visitor is unauthenticated", () => {
  assert.equal(
    decideAuthorization({
      authenticated: false,
      profileExists: false,
      role: null,
      allowed: ["admin"],
    }),
    "unauthenticated",
  );
});

test("missing and invalid profiles fail closed", () => {
  assert.equal(
    decideAuthorization({
      authenticated: true,
      profileExists: false,
      role: null,
      allowed: ["admin"],
    }),
    "profile_missing",
  );
  assert.equal(
    decideAuthorization({
      authenticated: true,
      profileExists: true,
      role: "owner",
      allowed: ["admin"],
    }),
    "profile_invalid",
  );
});

test("customer, concierge and provider cannot satisfy an admin guard", () => {
  for (const role of ["customer", "concierge", "provider"]) {
    assert.equal(
      decideAuthorization({
        authenticated: true,
        profileExists: true,
        role,
        allowed: ["admin"],
      }),
      "forbidden",
    );
  }
});

test("only an explicit admin profile satisfies an admin guard", () => {
  assert.equal(
    decideAuthorization({
      authenticated: true,
      profileExists: true,
      role: "admin",
      allowed: ["admin"],
    }),
    "authorized",
  );
});

test("known roles keep their canonical portal destinations", () => {
  assert.deepEqual(roleHome, {
    customer: "/demo/cliente",
    concierge: "/concierge",
    provider: "/prestador",
    admin: "/dashboard",
  });
  assert.equal(isUserRole("admin"), true);
  assert.equal(isUserRole("owner"), false);
});
