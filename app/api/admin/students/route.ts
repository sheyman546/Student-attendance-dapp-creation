import { authorizeAdminOrTeacher, WALLET_REGEX } from "@/lib/auth";
import { isStudentRegisteredOnChain } from "@/lib/proof";
import type { AdminStudentRecord } from "@/types/attendance";

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

/** Lists registered students with their attendance counts. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const auth = await authorizeAdminOrTeacher(request, {
    wallet: searchParams.get("wallet") ?? undefined,
    message: searchParams.get("message") ?? undefined,
    signature: searchParams.get("signature") ?? undefined,
  });
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { prisma } = await import("@/lib/prisma");
    const users = await prisma.user.findMany({
      where: { role: "USER" },
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { attendance: true } } },
    });

    const students: AdminStudentRecord[] = users.map((u) => ({
      id: u.id,
      name: u.name ?? null,
      email: u.email ?? null,
      wallet: u.wallet ?? null,
      matricNo: u.matricNo ?? null,
      isRegistered: u.isRegistered,
      role: u.role,
      createdAt: u.createdAt.toISOString(),
      attendanceCount: u._count.attendance,
    }));

    return Response.json({ students });
  } catch (error) {
    console.error("Failed to list students:", error);
    return Response.json(
      { error: "Database not available. Make sure DATABASE_URL is set and prisma generate has been run." },
      { status: 503 }
    );
  }
}

/**
 * Registers a student. The admin/teacher first sends registerStudent(wallet)
 * from their browser wallet (txHash + onChainId come back), then this route
 * mirrors the registration into the database with the student's metadata.
 *
 * A student may also be registered by email or matric number alone — the
 * record is created "pending" (isRegistered=false) until the student links
 * a wallet via POST /api/student/link.
 */
export async function POST(request: Request) {
  let body: {
    wallet?: unknown;
    message?: unknown;
    signature?: unknown;
    studentWallet?: unknown;
    name?: unknown;
    email?: unknown;
    matricNo?: unknown;
    txHash?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const auth = await authorizeAdminOrTeacher(request, {
    wallet: typeof body.wallet === "string" ? body.wallet : undefined,
    message: typeof body.message === "string" ? body.message : undefined,
    signature: typeof body.signature === "string" ? body.signature : undefined,
  });
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const studentWallet =
    typeof body.studentWallet === "string" ? body.studentWallet.toLowerCase() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const matricNo = typeof body.matricNo === "string" ? body.matricNo.trim() : "";
  const txHash = typeof body.txHash === "string" ? body.txHash : "";

  if (!studentWallet && !email && !matricNo) {
    return Response.json(
      { error: "Provide a wallet address, email or matric number" },
      { status: 400 }
    );
  }
  if (studentWallet && !WALLET_REGEX.test(studentWallet)) {
    return Response.json(
      { error: "A valid student wallet address is required" },
      { status: 400 }
    );
  }
  if (email && !EMAIL_REGEX.test(email)) {
    return Response.json(
      { error: "Please enter a valid email address" },
      { status: 400 }
    );
  }
  if (matricNo && !MATRIC_REGEX.test(matricNo)) {
    return Response.json(
      { error: "Please enter a valid matric / student ID number" },
      { status: 400 }
    );
  }
  if (name.length > 100) {
    return Response.json(
      { error: "Name is too long (max 100 characters)" },
      { status: 400 }
    );
  }

  try {
    const { prisma } = await import("@/lib/prisma");

    // When a wallet is provided, it must be registered on-chain. Best-effort
    // verification — when the RPC is not configured (null) we keep the record
    // as a pending wallet link instead of trusting the tx hash blindly. The
    // student can complete the on-chain registration from their portal via
    // the link flow, which re-checks against the contract.
    let isRegistered = false;
    if (studentWallet && txHash) {
      const onChain = await isStudentRegisteredOnChain(studentWallet);
      if (onChain === false) {
        return Response.json(
          { error: "This wallet is not registered on-chain yet" },
          { status: 400 }
        );
      }
      if (onChain === true) isRegistered = true;
    } else if (studentWallet) {
      return Response.json(
        { error: "The registerStudent transaction hash is required" },
        { status: 400 }
      );
    }

    const data = {
      ...(studentWallet ? { wallet: studentWallet } : {}),
      ...(name ? { name } : {}),
      ...(email ? { email } : {}),
      ...(matricNo ? { matricNo } : {}),
      isRegistered,
    };

    let user;
    try {
      if (studentWallet) {
        // Upsert by wallet so re-registering keeps one profile per wallet.
        user = await prisma.user.upsert({
          where: { wallet: studentWallet },
          update: {
            ...(name ? { name } : {}),
            ...(email ? { email } : {}),
            ...(matricNo ? { matricNo } : {}),
            // Never downgrade an already-registered student when verification
            // is unavailable — only promote to registered.
            ...(isRegistered ? { isRegistered: true } : {}),
            role: "USER",
          },
          create: { ...data, role: "USER" },
        });
      } else {
        user = await prisma.user.create({
          data: { ...data, role: "USER" },
        });
      }
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return Response.json(
          { error: "That student is already registered (wallet, email or matric number already in use)" },
          { status: 409 }
        );
      }
      throw error;
    }

    return Response.json(
      {
        student: {
          id: user.id,
          name: user.name,
          email: user.email,
          wallet: user.wallet,
          matricNo: user.matricNo,
          isRegistered: user.isRegistered,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to register student:", error);
    return Response.json(
      { error: "Database not available. Make sure DATABASE_URL is set and prisma generate has been run." },
      { status: 503 }
    );
  }
}
