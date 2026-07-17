import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { env } from "@/lib/env";
import type { UserRole } from "@/types/user-profile";

const homes: Record<UserRole, string> = {
  customer: "/demo/cliente",
  concierge: "/concierge",
  provider: "/demo/prestador",
  admin: "/dashboard",
};

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
  const isPublicCustomerLanding = path === "/demo";
  if (!user && !isLogin && !isPublicCustomerLanding) {
    const url = request.nextUrl.clone();
    url.pathname = path.startsWith("/demo/cliente")
      ? "/entrar/cliente"
      : "/login";
    return NextResponse.redirect(url);
  }

  if (!user) return response;
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!profile) {
    if (isLogin) return response;
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "?error=profile_missing";
    return NextResponse.redirect(url);
  }
  const role = profile.role as UserRole;
  if (isLogin) return NextResponse.redirect(new URL(homes[role], request.url));
  const allowed =
    path === "/demo" ||
    ((role === "customer" || role === "admin") &&
      path.startsWith("/demo/cliente")) ||
    ((role === "concierge" || role === "admin") &&
      path.startsWith("/concierge")) ||
    ((role === "provider" || role === "admin") &&
      path.startsWith("/demo/prestador")) ||
    role === "admin";
  if (!allowed) return NextResponse.redirect(new URL(homes[role], request.url));

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|brand/).*)",
  ],
};
