import { ethers } from "ethers";
import { verifySignedRequest, isAdminWallet } from "@/lib/auth";
import { attestProofOnChain } from "@/lib/proof";

/**
 * Retries on-chain attestation for every attendance record that is still
 * `pending` (hashProof IS NULL). The proof hash is derived deterministically
 * from the record's stored `date`, so retrying reproduces the exact hash that
 * the original POST /api/attendance would have attested — the same hash is
 * simply stored again on-chain (idempotent).
 *
 * Owner-only: requires a fresh signed request from the contract owner.
 */
export async function POST(request: Request) {
  let body: { wallet?: unknown; message?: unknown; signature?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const wallet = typeof body.wallet === "string" ? body.wallet.toLowerCase() : "";
  const message = typeof body.message === "string" ? body.message : "";
  const signature = typeof body.signature === "string" ? body.signature : "";

  const check = verifySignedRequest(wallet, message, signature, "Admin attest");
  if (!check.ok) {
    return Response.json({ error: check.error }, { status: check.status });
  }

  if (!isAdminWallet(wallet)) {
    return Response.json(
      { error: "Not authorized — only the contract owner can retry attestations" },
      { status: 403 }
    );
  }

  try {
    const { prisma } = await import("@/lib/prisma");

    const pending = await prisma.attendance.findMany({
      where: { hashProof: null },
      orderBy: { date: "asc" },
    });

    let attested = 0;
    const failed: string[] = [];

    for (const record of pending) {
      const proofHash = ethers.solidityPackedKeccak256(
        ["address", "uint256"],
        [record.wallet, record.date.getTime()]
      );
      const attestedHash = await attestProofOnChain(proofHash, record.wallet);
      if (attestedHash) {
        await prisma.attendance.update({
          where: { id: record.id },
          data: { hashProof: attestedHash },
        });
        attested += 1;
      } else {
        failed.push(record.id);
      }
    }

    return Response.json({ pending: pending.length, attested, failed });
  } catch (error) {
    console.error("Failed to retry attestations:", error);
    return Response.json(
      { error: "Database not available. Make sure DATABASE_URL is set and prisma generate has been run." },
      { status: 503 }
    );
  }
}
