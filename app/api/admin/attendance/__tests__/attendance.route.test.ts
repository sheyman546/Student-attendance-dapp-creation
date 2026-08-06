import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ethers } from "ethers";
import { GET } from "../route";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    attendance: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const OWNER_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const OWNER = new ethers.Wallet(OWNER_KEY);
const OWNER_ADDRESS = OWNER.address;

function signedParams(extra = "") {
  const timestamp = Date.now();
  const message = `Admin access: ${OWNER_ADDRESS}:${timestamp}`;
  const signature = OWNER.signMessageSync(message);
  return `wallet=${OWNER_ADDRESS}&message=${encodeURIComponent(
    message
  )}&signature=${encodeURIComponent(signature)}${extra}`;
}

function get(params: string) {
  return GET(new Request(`http://localhost/api/admin/attendance?${params}`));
}

const row = (id: string, date: Date, wallet: string) => ({
  id,
  date,
  hashProof: null,
  wallet,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("PRIVATE_KEY", OWNER_KEY);
  for (const fn of Object.values(prismaMock.attendance)) {
    fn.mockReset();
  }
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/admin/attendance", () => {
  it("rejects an invalid wallet param", async () => {
    const res = await get("wallet=not-an-address");
    expect(res.status).toBe(400);
  });

  it("rejects a request not signed by the admin", async () => {
    const res = await get("wallet=0x1111111111111111111111111111111111111111&message=x&signature=0x");
    expect(res.status).toBe(401);
  });

  it("paginates records and returns global stats", async () => {
    const d1 = new Date("2026-07-30T10:00:00.000Z");
    prismaMock.attendance.findMany
      .mockResolvedValueOnce([row("a", d1, "0x1111111111111111111111111111111111111111")])
      .mockResolvedValueOnce([
        { wallet: "0x1111111111111111111111111111111111111111" },
        { wallet: "0x2222222222222222222222222222222222222222" },
      ]);
    prismaMock.attendance.count
      .mockResolvedValueOnce(25) // total records
      .mockResolvedValueOnce(2); // today's records

    const res = await get(signedParams("&page=2&pageSize=10"));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(prismaMock.attendance.findMany).toHaveBeenNthCalledWith(1, {
      orderBy: { date: "desc" },
      skip: 10,
      take: 10,
      include: { user: { select: { name: true, email: true } } },
    });
    expect(body.records).toHaveLength(1);
    expect(body.stats).toEqual({ totalStudents: 2, totalRecords: 25, todayRecords: 2 });
    expect(body.pagination).toEqual({
      page: 2,
      pageSize: 10,
      total: 25,
      totalPages: 3,
    });
  });

  it("defaults to page 1 with pageSize 10", async () => {
    prismaMock.attendance.findMany.mockResolvedValue([]);
    prismaMock.attendance.count.mockResolvedValue(0);

    const res = await get(signedParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(prismaMock.attendance.findMany).toHaveBeenNthCalledWith(1, {
      orderBy: { date: "desc" },
      skip: 0,
      take: 10,
      include: { user: { select: { name: true, email: true } } },
    });
    expect(body.pagination).toEqual({ page: 1, pageSize: 10, total: 0, totalPages: 1 });
  });

  it("clamps pageSize to a maximum of 100", async () => {
    prismaMock.attendance.findMany.mockResolvedValue([]);
    prismaMock.attendance.count.mockResolvedValue(0);

    const res = await get(signedParams("&pageSize=9999"));
    expect(res.status).toBe(200);
    expect(prismaMock.attendance.findMany).toHaveBeenNthCalledWith(1, {
      orderBy: { date: "desc" },
      skip: 0,
      take: 100,
      include: { user: { select: { name: true, email: true } } },
    });
  });

  it("returns 503 when the database is unavailable", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    prismaMock.attendance.findMany.mockRejectedValue(new Error("db down"));
    const res = await get(signedParams());
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/Database not available/i);
    consoleSpy.mockRestore();
  });
});
