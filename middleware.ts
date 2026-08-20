import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { env } from "@/lib/env";
import { isUserRole, roleHome as homes } from "@/services/auth/access";
import type { UserRole } from "@/types/user-profile";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  type CookieToSet = {
    name: string;
    value: string;
    options?: Parameters<typeof response.cookies.set>[2];
  };

  const supabase = createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isLogin = path.startsWith("/login") || path.startsWith("/entrar/");
  const isPublicDemo = path === "/demo" || path === "/demo/concierge";
  if (!user && !isLogin && !isPublicDemo) {
    const url = request.nextUrl.clone();
    url.pathname = path.startsWith("/demo/cliente")
      ? "/entrar/cliente"
      : path.startsWith("/concierge")
        ? "/entrar/concierge"
        : path.startsWith("/demo/prestador")
          ? "/entrar/prestador"
          : "/login";
    return NextResponse.redirect(url);
  }

  if (!user) return response;
  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (profileError) {
    if (isLogin) return response;
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "?error=profile_error";
    return NextResponse.redirect(url);
  }
  if (!profile || !isUserRole(profile.role)) {
    if (isLogin) return response;
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?error=${profile ? "profile_invalid" : "profile_missing"}`;
    return NextResponse.redirect(url);
  }
  const role = profile.role;
  if (isLogin) return NextResponse.redirect(new URL(homes[role], request.url));

  const routeRole: UserRole | null = path.startsWith("/demo/cliente")
    ? "customer"
    : path.startsWith("/concierge")
      ? "concierge"
      : path.startsWith("/demo/prestador")
        ? "provider"
        : null;

  if (routeRole && role !== routeRole) {
    const url = new URL(homes[role], request.url);
    url.searchParams.set("error", "access_denied");
    return NextResponse.redirect(url);
  }

  const allowed =
    isPublicDemo ||
    routeRole === role ||
    role === "admin";
  if (!allowed) {
    const url = new URL(homes[role], request.url);
    url.searchParams.set("error", "access_denied");
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|brand/).*)",
  ],
};
