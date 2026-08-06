import { verifySignedRequest, isAdminWallet } from "@/lib/auth";

interface AttendanceRow {
  id: string;
  date: Date;
  hashProof: string | null;
  wallet: string;
  user?: { name: string | null; email: string | null } | null;
}

/** Escapes a CSV field per RFC 4180 (quotes, commas, newlines). */
function csvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function toStatus(hashProof: string | null): string {
  return hashProof ? "confirmed" : "pending";
}

function toCsv(rows: AttendanceRow[]): string {
  const header = ["studentName", "studentEmail", "wallet", "date", "status", "hashProof"];
  const lines = rows.map((row) =>
    [
      csvField(row.user?.name ?? ""),
      csvField(row.user?.email ?? ""),
      csvField(row.wallet),
      csvField(row.date.toISOString()),
      csvField(toStatus(row.hashProof)),
      csvField(row.hashProof ?? ""),
    ].join(",")
  );
  return [header.join(","), ...lines].join("\n");
}

/**
 * Downloads every attendance record as CSV. Admin-only: requires a fresh
 * signed request from the contract owner, same as GET /api/admin/attendance.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const wallet = searchParams.get("wallet")?.toLowerCase() ?? "";
  const message = searchParams.get("message") ?? "";
  const signature = searchParams.get("signature") ?? "";

  const check = verifySignedRequest(wallet, message, signature, "Admin access");
  if (!check.ok) {
    return Response.json({ error: check.error }, { status: check.status });
  }

  if (!isAdminWallet(wallet)) {
    return Response.json(
      { error: "Not authorized — only the contract owner can export attendance" },
      { status: 403 }
    );
  }

  try {
    const { prisma } = await import("@/lib/prisma");
    const rows = (await prisma.attendance.findMany({
      orderBy: { date: "desc" },
      include: { user: { select: { name: true, email: true } } },
    })) as AttendanceRow[];

    const csv = toCsv(rows);
    const dateStamp = new Date().toISOString().slice(0, 10);

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="attendance-${dateStamp}.csv"`,
      },
    });
  } catch (error) {
    console.error("Failed to export attendance:", error);
    return Response.json(
      { error: "Database not available. Make sure DATABASE_URL is set and prisma generate has been run." },
      { status: 503 }
    );
  }
}
