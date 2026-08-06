import { ethers } from "ethers";
import { createHmac, timingSafeEqual } from "node:crypto";

export const WALLET_REGEX = /^0x[a-fA-F0-9]{40}$/;
const REQUEST_TTL_MS = 5 * 60 * 1000; // signatures expire after 5 minutes

/**
 * The contract owner's address, derived from the server's PRIVATE_KEY
 * (the same key that attests proofs on-chain). The owner is the admin.
 * Returns null when PRIVATE_KEY isn't configured.
 */
export function getOwnerAddress(): string | null {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) return null;
  try {
    return new ethers.Wallet(privateKey).address.toLowerCase();
  } catch {
    return null;
  }
}

export function isAdminWallet(wallet: string): boolean {
  const owner = getOwnerAddress();
  return !!owner && wallet.toLowerCase() === owner;
}

type VerifyResult = { ok: true } | { ok: false; error: string; status: number };

/**
 * Verifies that `signature` is a fresh signature over
 * `${prefix}: <wallet>:<timestamp>` produced by the wallet itself.
 * This proves wallet ownership and prevents replay.
 */
export function verifySignedRequest(
  wallet: string,
  message: string,
  signature: string,
  prefix: string
): VerifyResult {
  const normalizedWallet = wallet.toLowerCase();

  if (!WALLET_REGEX.test(normalizedWallet)) {
    return { ok: false, error: "A valid wallet address is required", status: 400 };
  }
  if (!message || !signature) {
    return { ok: false, error: "Message and signature are required", status: 400 };
  }

  let recovered: string;
  try {
    recovered = ethers.verifyMessage(message, signature).toLowerCase();
  } catch {
    return { ok: false, error: "Invalid signature", status: 401 };
  }
  if (recovered !== normalizedWallet) {
    return { ok: false, error: "Signature does not match wallet", status: 401 };
  }

  const match = new RegExp(
    `^${prefix}: (0x[a-fA-F0-9]{40}):(\\d+)$`
  ).exec(message);
  if (!match || match[1].toLowerCase() !== normalizedWallet) {
    return {
      ok: false,
      error: `Invalid ${prefix.toLowerCase()} message`,
      status: 401,
    };
  }

  const requestedAt = Number(match[2]);
  if (Math.abs(Date.now() - requestedAt) > REQUEST_TTL_MS) {
    return {
      ok: false,
      error: `${prefix} expired. Please try again.`,
      status: 401,
    };
  }

  return { ok: true };
}

// ---------------------------------------------------------------------
// Teachers
// ---------------------------------------------------------------------

/**
 * A wallet is a teacher when it is the contract owner (admin) or the wallet
 * is linked to a User record with the TEACHER role. Teacher management keeps
 * this database role in sync with the on-chain marker registry.
 */
export async function isTeacherWallet(wallet: string): Promise<boolean> {
  if (isAdminWallet(wallet)) return true;
  try {
    const { prisma } = await import("@/lib/prisma");
    const user = await prisma.user.findUnique({
      where: { wallet: wallet.toLowerCase() },
    });
    return user?.role === "TEACHER" || user?.role === "ADMIN";
  } catch {
    return false;
  }
}

/** Emails allowed to sign in as a teacher, from TEACHER_EMAILS. */
export function getTeacherEmailAllowlist(): string[] {
  return (process.env.TEACHER_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

/** True when `email` may sign in as a teacher (allowlist or TEACHER role). */
export async function isTeacherEmail(email: string): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  if (getTeacherEmailAllowlist().includes(normalized)) return true;
  try {
    const { prisma } = await import("@/lib/prisma");
    const user = await prisma.user.findFirst({
      where: { email: normalized, role: "TEACHER" },
    });
    return !!user;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------
// Teacher session cookie (Google / Gmail login)
// ---------------------------------------------------------------------

export const TEACHER_SESSION_COOKIE = "teacher_session";
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret) return secret;
  // Fallback derived from PRIVATE_KEY so deployments without SESSION_SECRET
  // still get a per-deployment secret (not shared across instances).
  const privateKey = process.env.PRIVATE_KEY;
  if (privateKey) {
    return ethers.keccak256(ethers.toUtf8Bytes(`teacher-session:${privateKey}`));
  }
  return "insecure-dev-session-secret-change-me";
}

function signSession(payload: string): string {
  return createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
}

/** Creates an HMAC-signed session token for a verified teacher email. */
export function createTeacherSessionToken(email: string): string {
  const payload = Buffer.from(
    JSON.stringify({
      email,
      exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
    })
  ).toString("base64url");
  return `${payload}.${signSession(payload)}`;
}

/** Returns the email embedded in `token`, or null when invalid/expired. */
export function verifyTeacherSessionToken(token: string | null): string | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = signSession(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      email?: unknown;
      exp?: unknown;
    };
    if (typeof data.email !== "string") return null;
    if (
      typeof data.exp === "number" &&
      data.exp < Math.floor(Date.now() / 1000)
    ) {
      return null;
    }
    return data.email;
  } catch {
    return null;
  }
}

/** Reads the teacher session email from a request's cookies, if valid. */
export function getTeacherSessionEmail(request: Request): string | null {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const match = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${TEACHER_SESSION_COOKIE}=`));
  if (!match) return null;
  const token = match.slice(TEACHER_SESSION_COOKIE.length + 1);
  // NOTE: callers must re-check `isTeacherEmail(email)` (as
  // authorizeAdminOrTeacher does) so revoked teachers lose access promptly.
  return verifyTeacherSessionToken(token);
}

/** Set-Cookie header that installs a teacher session. */
export function teacherSessionCookieHeader(token: string): string {
  return `${TEACHER_SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`;
}

/** Set-Cookie header that clears a teacher session. */
export function clearTeacherSessionCookieHeader(): string {
  return `${TEACHER_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

// ---------------------------------------------------------------------
// Combined authorization for admin/teacher APIs
// ---------------------------------------------------------------------

export type TeacherAuth =
  | { ok: true; wallet: string | null; email: string | null }
  | { ok: false; error: string; status: number };

/**
 * Authorizes an admin/teacher API call via either:
 *   1. a fresh wallet signature from an admin or teacher wallet, or
 *   2. a valid teacher session cookie (Google login).
 */
export async function authorizeAdminOrTeacher(
  request: Request,
  input: { wallet?: string; message?: string; signature?: string }
): Promise<TeacherAuth> {
  const { wallet, message, signature } = input;

  if (wallet && message && signature) {
    const check = verifySignedRequest(wallet, message, signature, "Admin access");
    if (!check.ok) return check;
    if (await isTeacherWallet(wallet)) {
      return { ok: true, wallet: wallet.toLowerCase(), email: null };
    }
    return {
      ok: false,
      error: "Not authorized — only the admin or a teacher can do this",
      status: 403,
    };
  }

  const email = getTeacherSessionEmail(request);
  if (email && (await isTeacherEmail(email))) {
    return { ok: true, wallet: null, email };
  }

  return {
    ok: false,
    error: "Authentication required — connect your wallet or sign in with Google",
    status: 401,
  };
}
