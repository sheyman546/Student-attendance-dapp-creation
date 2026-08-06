import { verifySignedRequest, WALLET_REGEX } from "@/lib/auth";

export interface StudentProfile {
  name: string | null;
  email: string | null;
  matricNo: string | null;
}

const NAME_MAX = 100;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MATRIC_REGEX = /^[A-Za-z0-9/-]{2,32}$/;

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

/** Returns the student's profile (or nulls when they haven't set one). */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const wallet = searchParams.get("wallet")?.toLowerCase() ?? "";

  if (!WALLET_REGEX.test(wallet)) {
    return Response.json(
      { error: "A valid wallet address is required" },
      { status: 400 }
    );
  }

  try {
    const { prisma } = await import("@/lib/prisma");
    const user = await prisma.user.findUnique({ where: { wallet } });

    const profile: StudentProfile = {
      name: user?.name ?? null,
      email: user?.email ?? null,
      matricNo: user?.matricNo ?? null,
    };
    return Response.json(profile);
  } catch (error) {
    console.error("Failed to fetch profile:", error);
    return Response.json(
      { error: "Database not available. Make sure DATABASE_URL is set and prisma generate has been run." },
      { status: 503 }
    );
  }
}

/** Creates or updates the profile linked to the signed wallet. */
export async function PUT(request: Request) {
  let body: {
    wallet?: unknown;
    message?: unknown;
    signature?: unknown;
    name?: unknown;
    email?: unknown;
    matricNo?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const wallet = typeof body.wallet === "string" ? body.wallet.toLowerCase() : "";
  const message = typeof body.message === "string" ? body.message : "";
  const signature = typeof body.signature === "string" ? body.signature : "";

  // The student must prove they own the wallet before editing its profile.
  const check = verifySignedRequest(wallet, message, signature, "Profile update");
  if (!check.ok) {
    return Response.json({ error: check.error }, { status: check.status });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name || name.length > NAME_MAX) {
    return Response.json(
      { error: `Name is required (max ${NAME_MAX} characters)` },
      { status: 400 }
    );
  }

  let email: string | null = null;
  if (body.email !== undefined && body.email !== null && body.email !== "") {
    if (typeof body.email !== "string" || !EMAIL_REGEX.test(body.email.trim())) {
      return Response.json(
        { error: "Please enter a valid email address (or leave it empty)" },
        { status: 400 }
      );
    }
    email = body.email.trim().toLowerCase();
  }

  let matricNo: string | null = null;
  if (body.matricNo !== undefined && body.matricNo !== null && body.matricNo !== "") {
    if (typeof body.matricNo !== "string" || !MATRIC_REGEX.test(body.matricNo.trim())) {
      return Response.json(
        { error: "Please enter a valid matric / student ID number" },
        { status: 400 }
      );
    }
    matricNo = body.matricNo.trim();
  }

  try {
    const { prisma } = await import("@/lib/prisma");

    // upsert by wallet — the unique(wallet) constraint means one profile per
    // wallet. When no user exists yet (wallet previously null), upsert creates
    // one with the wallet attached.
    let user;
    try {
      user = await prisma.user.upsert({
        where: { wallet },
        update: { name, email, ...(matricNo ? { matricNo } : {}) },
        create: { wallet, name, email, ...(matricNo ? { matricNo } : {}) },
      });
    } catch (error) {
      // P2002 on email/matric — another student already claimed it.
      if (isUniqueConstraintError(error)) {
        return Response.json(
          { error: "That email or matric number is already linked to another student" },
          { status: 409 }
        );
      }
      throw error;
    }

    const profile: StudentProfile = {
      name: user.name,
      email: user.email,
      matricNo: user.matricNo ?? null,
    };
    return Response.json(profile, { status: 200 });
  } catch (error) {
    console.error("Failed to save profile:", error);
    return Response.json(
      { error: "Database not available. Make sure DATABASE_URL is set and prisma generate has been run." },
      { status: 503 }
    );
  }
}
