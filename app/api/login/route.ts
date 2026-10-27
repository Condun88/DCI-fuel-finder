import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, SESSION_DAYS, authConfigured, createSessionToken, safeEqual } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!authConfigured()) {
    return NextResponse.json(
      { error: "Login isn't set up yet. Ask the app owner to add the login settings in Vercel." },
      { status: 503 },
    );
  }

  let body: { username?: unknown; password?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Enter a username and password." }, { status: 400 });
  }
  const username = typeof body.username === "string" ? body.username.trim().slice(0, 200) : "";
  const password = typeof body.password === "string" ? body.password.slice(0, 200) : "";

  const [u, p] = await Promise.all([
    safeEqual(username.toLowerCase(), (process.env.APP_USERNAME as string).toLowerCase()),
    safeEqual(password, process.env.APP_PASSWORD as string),
  ]);

  if (!(u && p)) {
    // Small fixed delay slows down password guessing.
    await new Promise((r) => setTimeout(r, 800));
    return NextResponse.json({ error: "That username or password isn't right." }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await createSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
  return res;
}
