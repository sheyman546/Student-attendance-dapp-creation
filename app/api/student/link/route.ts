import { verifySignedRequest } from "@/lib/auth";
import { registerStudentOnChain } from "@/lib/proof";

const MATRIC_REGEX = /^[A-Za-z0-9/-]{2,32}$/;

/**
 * Claims a pending student registration.
 *
 * The admin may register a student by email or matric number before the
 * student has a wallet. When that student connects their wallet, they prove
 * ownership by entering the matric number on their registration record; the
 * server then registers the wallet on-chain using the owner key (the admin
 * already approved this student — the contract's admin-only guard is
 * preserved because the request is relayed by the admin's own key).
 */
export async function POST(request: Request) {
  let body: {
    wallet?: unknown;
    message?: unknown;
    signature?: unknown;
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
  const matricNo = typeof body.matricNo === "string" ? body.matricNo.trim() : "";

  const check = verifySignedRequest(wallet, message, signature, "Link registration");
  if (!check.ok) {
    return Response.json({ error: check.error }, { status: check.status });
  }

  if (!MATRIC_REGEX.test(matricNo)) {
    return Response.json(
      { error: "Please enter a valid matric / student ID number" },
      { status: 400 }
    );
  }

  try {
    const { prisma } = await import("@/lib/prisma");

    const user = await prisma.user.findFirst({
      where: { matricNo, role: "USER" },
    });
    if (!user) {
      return Response.json(
        { error: "No pending registration matches that matric number" },
        { status: 404 }
      );
    }
    // The matric is already linked to a different wallet — refuse.
    if (user.wallet && user.wallet !== wallet) {
      return Response.json(
        { error: "That matric number is already linked to another wallet" },
        { status: 409 }
      );
    }

    // Register the wallet on-chain (owner key). This is the authoritative
    // gate for "only registered students can mark attendance".
    const txHash = await registerStudentOnChain(wallet);
    if (!txHash) {
      return Response.json(
        {
          error:
            "Could not register on-chain. Check that PRIVATE_KEY, RPC_URL and NEXT_PUBLIC_PROOF_ADDRESS are configured.",
        },
        { status: 503 }
      );
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { wallet, isRegistered: true },
    });

    return Response.json({ linked: true, txHash }, { status: 200 });
  } catch (error) {
    console.error("Failed to link student registration:", error);
    return Response.json(
      { error: "Database not available. Make sure DATABASE_URL is set and prisma generate has been run." },
      { status: 503 }
    );
  }
}
