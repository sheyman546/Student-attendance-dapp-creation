import { describe, it, expect, vi, beforeEach } from "vitest";
import { ethers } from "ethers";
import { GET } from "../route";

const { prismaMock, registeredMock } = vi.hoisted(() => ({
  prismaMock: {
    user: { findUnique: vi.fn() },
    session: { findMany: vi.fn(), count: vi.fn() },
    attendance: { findMany: vi.fn() },
  },
  registeredMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/proof", () => ({ isStudentRegisteredOnChain: registeredMock }));

const WALLET = new ethers.Wallet(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
);
const WALLET_ADDRESS = WALLET.address;

const OPEN_SESSION = {
  id: "session-1",
  courseId: "course-1",
  onChainId: 1,
  startTime: new Date(Date.now() - 60_000),
  durationSeconds: 3600,
  closed: false,
  course: { code: "CS101", name: "Blockchain Basics" },
};

const UPCOMING_SESSION = {
  id: "session-2",
  courseId: "course-1",
  onChainId: 2,
  startTime: new Date(Date.now() + 3600_000),
  durationSeconds: 3600,
  closed: false,
  course: { code: "CS101", name: "Blockchain Basics" },
};

const HISTORY_ROW = {
  id: "rec-1",
  wallet: WALLET_ADDRESS.toLowerCase(),
  date: new Date("2026-07-30T10:00:00.000Z"),
  txHash: "0xabc",
  hashProof: "0xabc",
  session: {
    id: "session-1",
    startTime: new Date("2026-07-30T09:00:00.000Z"),
    course: { code: "CS101", name: "Blockchain Basics" },
  },
};

function get(wallet: string) {
  return GET(new Request(`http://localhost/api/student/overview?wallet=${wallet}`));
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const fn of Object.values(prismaMock.attendance)) fn.mockReset();
  prismaMock.user.findUnique.mockReset();
  prismaMock.session.findMany.mockReset();
  prismaMock.session.count.mockReset();
  registeredMock.mockReset();
});

describe("GET /api/student/overview", () => {
  it("rejects an invalid wallet param", async () => {
    const res = await get("not-an-address");
    expect(res.status).toBe(400);
  });

  it("returns registration status, sessions, history and breakdown", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "u-1",
      name: "Ada Lovelace",
      email: "ada@school.edu",
      matricNo: "MAT/001",
      wallet: WALLET_ADDRESS.toLowerCase(),
      isRegistered: true,
    });
    registeredMock.mockResolvedValue(true);

    prismaMock.session.findMany.mockResolvedValue([OPEN_SESSION, UPCOMING_SESSION]);
    prismaMock.attendance.findMany
      .mockResolvedValueOnce([HISTORY_ROW]) // history
      .mockResolvedValueOnce([{ sessionId: "session-1", txHash: "0xabc" }]); // my marks
    prismaMock.session.count.mockResolvedValue(2);

    const res = await get(WALLET_ADDRESS);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.registered).toBe(true);
    expect(body.profile).toEqual({
      name: "Ada Lovelace",
      email: "ada@school.edu",
      matricNo: "MAT/001",
    });
    expect(body.activeSessions).toHaveLength(1);
    expect(body.activeSessions[0]).toMatchObject({
      courseCode: "CS101",
      isActive: true,
      markedByMe: true,
    });
    expect(body.upcomingSessions).toHaveLength(1);
    expect(body.upcomingSessions[0].isActive).toBe(false);
    expect(body.history).toHaveLength(1);
    expect(body.breakdown).toEqual([
      { courseCode: "CS101", courseName: "Blockchain Basics", attended: 1 },
    ]);
    expect(body.totals).toEqual({ attended: 1, attendanceRate: 50 });
  });

  it("reports unregistered students when not on-chain", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    registeredMock.mockResolvedValue(false);
    prismaMock.session.findMany.mockResolvedValue([]);
    prismaMock.attendance.findMany.mockResolvedValue([]);
    prismaMock.session.count.mockResolvedValue(0);

    const res = await get(WALLET_ADDRESS);
    const body = await res.json();
    expect(body.registered).toBe(false);
    expect(body.profile).toBeNull();
  });

  it("returns 503 when the database is unavailable", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    prismaMock.user.findUnique.mockRejectedValue(new Error("db down"));
    const res = await get(WALLET_ADDRESS);
    expect(res.status).toBe(503);
    consoleSpy.mockRestore();
  });
});
