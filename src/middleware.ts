import { NextResponse, type NextRequest } from "next/server";

/**
 * Cookie-presence guard for instant redirects (UX only).
 * Every API endpoint re-verifies the session server-side — this middleware
 * is never a substitute for real authorization.
 */
const SESSION_COOKIE = "fastwallet_session";
const PROTECTED = ["/dashboard", "/withdrawals", "/transactions", "/settings", "/admin"];
const AUTH_PAGES = ["/login", "/register", "/forgot-password", "/reset-password"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasSession = Boolean(req.cookies.get(SESSION_COOKIE)?.value);

  if (!hasSession && PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (hasSession && AUTH_PAGES.some((p) => pathname === p)) {
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/withdrawals/:path*",
    "/transactions/:path*",
    "/settings/:path*",
    "/admin/:path*",
    "/login",
    "/register",
    "/forgot-password",
    "/reset-password",
  ],
};
