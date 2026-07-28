import type { UserRole } from "@/types/user-profile";

export const userRoles = ["customer", "concierge", "provider", "admin"] as const;

export const roleHome: Record<UserRole, string> = {
  customer: "/demo/cliente",
  concierge: "/concierge",
  provider: "/demo/prestador",
  admin: "/dashboard",
};

export type AuthorizationDecision =
  | "authorized"
  | "unauthenticated"
  | "profile_missing"
  | "profile_invalid"
  | "forbidden";

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === "string" && userRoles.includes(value as UserRole);
}

export function decideAuthorization({
  authenticated,
  profileExists,
  role,
  allowed,
}: {
  authenticated: boolean;
  profileExists: boolean;
  role: unknown;
  allowed: readonly UserRole[];
}): AuthorizationDecision {
  if (!authenticated) return "unauthenticated";
  if (!profileExists) return "profile_missing";
  if (!isUserRole(role)) return "profile_invalid";
  return allowed.includes(role) ? "authorized" : "forbidden";
}
