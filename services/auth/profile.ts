import type { Route } from "next";
import { redirect } from "next/navigation";
import {
  decideAuthorization,
  isUserRole,
  roleHome,
} from "@/services/auth/access";
import { createSupabaseServerClient } from "@/services/supabase/server";
import type { UserProfile, UserRole } from "@/types/user-profile";

export { roleHome };

type CurrentProfileState =
  | { status: "authenticated"; profile: UserProfile }
  | { status: "unauthenticated" }
  | { status: "profile_missing" }
  | { status: "profile_invalid" }
  | { status: "error" };

export async function getCurrentProfileState(): Promise<CurrentProfileState> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) return { status: "unauthenticated" };

  const { data, error } = await supabase
    .from("user_profiles")
    .select("user_id,role,display_name,provider_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return { status: "error" };
  if (!data) return { status: "profile_missing" };
  if (
    !isUserRole(data.role) ||
    typeof data.user_id !== "string" ||
    typeof data.display_name !== "string"
  ) {
    return { status: "profile_invalid" };
  }

  return {
    status: "authenticated",
    profile: {
      userId: data.user_id,
      role: data.role,
      displayName: data.display_name,
      providerId: typeof data.provider_id === "string" ? data.provider_id : null,
    },
  };
}

export async function getCurrentProfile(): Promise<UserProfile | null> {
  const state = await getCurrentProfileState();
  return state.status === "authenticated" ? state.profile : null;
}

export async function requireRole(allowed: readonly UserRole[]) {
  const state = await getCurrentProfileState();

  if (state.status === "unauthenticated") {
    redirect("/login?error=session_required");
  }
  if (state.status === "profile_missing") {
    redirect("/login?error=profile_missing");
  }
  if (state.status === "profile_invalid") {
    redirect("/login?error=profile_invalid");
  }
  if (state.status === "error") {
    redirect("/login?error=profile_error");
  }

  const decision = decideAuthorization({
    authenticated: true,
    profileExists: true,
    role: state.profile.role,
    allowed,
  });

  if (decision !== "authorized") {
    redirect(`${roleHome[state.profile.role]}?error=access_denied` as Route);
  }

  return state.profile;
}
