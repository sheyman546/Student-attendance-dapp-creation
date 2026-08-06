import { verifySignedRequest, isAdminWallet } from "@/lib/auth";
import { toAttendanceJson } from "@/lib/attendance";
import type { AdminAttendanceRecord } from "@/types/attendance";

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;

function positiveInt(value: string | null, fallback: number, max?: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return max !== undefined ? Math.min(parsed, max) : parsed;
}

interface AttendanceRow {
  id: string;
  date: Date;
  hashProof: string | null;
  wallet: string;
  user?: { name: string | null; email: string | null } | null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const wallet = searchParams.get("wallet")?.toLowerCase() ?? "";
  const message = searchParams.get("message") ?? "";
  const signature = searchParams.get("signature") ?? "";
  const page = positiveInt(searchParams.get("page"), 1);
  const pageSize = positiveInt(
    searchParams.get("pageSize"),
    DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE
  );

  // Must be a fresh signature from the requesting wallet
  const check = verifySignedRequest(wallet, message, signature, "Admin access");
  if (!check.ok) {
    return Response.json({ error: check.error }, { status: check.status });
  }

  // Only the contract owner (admin) may view all attendance
  if (!isAdminWallet(wallet)) {
    return Response.json(
      { error: "Not authorized — only the contract owner can view admin data" },
      { status: 403 }
    );
  }

  try {
    const { prisma } = await import("@/lib/prisma");

    const [rows, total] = await Promise.all([
      prisma.attendance.findMany({
        orderBy: { date: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { user: { select: { name: true, email: true } } },
      }) as Promise<AttendanceRow[]>,
      prisma.attendance.count(),
    ]);

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const records: AdminAttendanceRecord[] = rows.map((row) => ({
      ...toAttendanceJson(row),
      wallet: row.wallet,
      studentName: row.user?.name ?? null,
      studentEmail: row.user?.email ?? null,
    }));

    const stats = {
      totalStudents: new Set(rows.map((r) => r.wallet)).size,
      totalRecords: total,
      todayRecords: 0, // replaced below after fetching the full picture
    };

    // stats are global (across all records), so compute them independently of
    // the current page. totalStudents needs a distinct-wallet scan.
    const [distinctWallets, todayCount] = await Promise.all([
      prisma.attendance.findMany({
        distinct: ["wallet"],
        select: { wallet: true },
      }),
      prisma.attendance.count({ where: { date: { gte: today } } }),
    ]);
    stats.totalStudents = distinctWallets.length;
    stats.todayRecords = todayCount;

    return Response.json({
      records,
      stats,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    });
  } catch (error) {
    console.error("Failed to fetch admin attendance:", error);
    return Response.json(
      { error: "Database not available. Make sure DATABASE_URL is set and prisma generate has been run." },
      { status: 503 }
    );
  }
}
