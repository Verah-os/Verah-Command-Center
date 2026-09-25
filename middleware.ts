import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { env } from "@/lib/env";
import { requireCanonicalWebEnvironment } from "@/lib/verah-environment";
import { isUserRole } from "@/services/auth/access";
import type { UserRole } from "@/types/user-profile";

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  // Exact public entry points: never broaden this to internal/demo prefixes.
  if (path === "/" || path === "/demo") return NextResponse.next({ request });
  const isPublicCustomerPilotDemo = [
    "/demo/cliente/piloto",
    "/customer-demo-sw.js",
    "/customer-demo-icon.svg",
    "/manifest.webmanifest",
  ].includes(path);
  if (isPublicCustomerPilotDemo) return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  type CookieToSet = {
    name: string;
    value: string;
    options?: Parameters<typeof response.cookies.set>[2];
  };

  try {
    requireCanonicalWebEnvironment({ supabaseUrl: env.supabaseUrl, anonKey: env.supabaseAnonKey, environment: env.supabaseEnvironment });
  } catch {
    return new NextResponse("Conexão Alpha indisponível: configure o backend canônico wxnklnbntgpcncajzpsj.", { status: 503 });
  }
  const supabase = createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // Redirects must carry refreshed/cleared auth cookies back to the browser.
  function loginRedirect(destination: string, error: string) {
    const url = new URL(destination, request.url);
    url.searchParams.set("error", error);
    const redirected = NextResponse.redirect(url);
    response.cookies.getAll().forEach((cookie) => redirected.cookies.set(cookie));
    redirected.headers.set("Cache-Control", "private, no-store");
    return redirected;
  }

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  const within = (base: string) => path === base || path.startsWith(`${base}/`);
  const isLogin = path === "/login" || within("/entrar");
  const isPublicDemo = path === "/demo/concierge";
  // Login is a terminal recovery surface even with an existing session.
  // In particular, POST Server Actions must be able to switch accounts.
  if (isLogin) return response;

  const routeRole: UserRole | null = within("/demo/cliente") || within("/onboarding/cliente")
    ? "customer"
    : within("/concierge")
      ? "concierge"
      : within("/prestador") || within("/demo/prestador") || within("/onboarding/prestador")
        ? "provider"
        : null;
  const loginPath = routeRole === "customer" ? "/entrar/cliente"
    : routeRole === "provider" ? "/entrar/prestador"
      : routeRole === "concierge" ? "/entrar/concierge" : "/login";

  if (userError || !user) {
    return isPublicDemo ? response : loginRedirect(loginPath, "session_required");
  }
  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (profileError) return loginRedirect(loginPath, "profile_error");
  if (!profile || !isUserRole(profile.role)) {
    return loginRedirect(loginPath, profile ? "profile_invalid" : "profile_missing");
  }
  const role = profile.role;
  // Customer pages require customer; provider/concierge also admit admin.
  const allowed = isPublicDemo || routeRole === role ||
    (role === "admin" && routeRole !== "customer");
  if (!allowed) return loginRedirect(loginPath, "access_denied");

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|brand/).*)",
  ],
};
