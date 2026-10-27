import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

// Everything is behind the login except the login page itself, the login API,
// and static assets needed to render the login page / home-screen icon.
const PUBLIC_PATHS = ["/login", "/api/login", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png", "/apple-touch-icon.png", "/favicon.ico"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.includes(pathname)) return NextResponse.next();

  const ok = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (ok) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
