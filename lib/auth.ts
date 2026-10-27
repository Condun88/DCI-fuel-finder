// Session tokens: "<expiryMs>.<hex HMAC-SHA256(expiryMs)>", signed with SESSION_SECRET.
// Uses Web Crypto so it runs in both middleware (edge) and route handlers (node).

export const SESSION_COOKIE = "dci_session";
export const SESSION_DAYS = 90;

const enc = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

/** Constant-time string comparison (compares SHA-256 digests so lengths never leak). */
export async function safeEqual(a: string, b: string): Promise<boolean> {
  const [da, db] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  const x = new Uint8Array(da);
  const y = new Uint8Array(db);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

export function authConfigured(): boolean {
  const s = process.env.SESSION_SECRET ?? "";
  return Boolean(process.env.APP_USERNAME && process.env.APP_PASSWORD && s.length >= 32);
}

export async function createSessionToken(): Promise<string> {
  const expiry = String(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  return `${expiry}.${await hmac(process.env.SESSION_SECRET as string, expiry)}`;
}

export async function verifySessionToken(token: string | undefined): Promise<boolean> {
  if (!token || !authConfigured()) return false;
  const [expiry, sig] = token.split(".");
  if (!expiry || !sig || !/^\d+$/.test(expiry)) return false;
  if (Number(expiry) < Date.now()) return false;
  const expected = await hmac(process.env.SESSION_SECRET as string, expiry);
  return safeEqual(sig, expected);
}
