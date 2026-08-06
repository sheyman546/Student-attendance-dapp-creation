import { describe, it, expect, vi, beforeEach } from "vitest";
import { ethers } from "ethers";
import { POST, GET } from "../route";

const { prismaMock, verifyMarkMock, limiterMock } = vi.hoisted(() => ({
  prismaMock: {
    attendance: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    session: {
      findUnique: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
  verifyMarkMock: vi.fn(),
  limiterMock: { check: vi.fn(() => true) },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/proof", () => ({ verifyMarkOnChain: verifyMarkMock }));
vi.mock("@/lib/rateLimit", () => ({ attendanceLimiter: limiterMock }));

const WALLET = new ethers.Wallet(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
);
const WALLET_ADDRESS = WALLET.address;
const OTHER_WALLET = new ethers.Wallet(
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
);

const TX_HASH = "0x" + "ab".repeat(32);

function signedBody(overrides: Partial<{ timestamp: number; sessionId: string; txHash: string }> = {}) {
  const timestamp = overrides.timestamp ?? Date.now();
  const message = `Attendance request: ${WALLET_ADDRESS}:${timestamp}`;
  const signature = WALLET.signMessageSync(message);
  return {
    wallet: WALLET_ADDRESS,
    message,
    signature,
    sessionId: overrides.sessionId ?? "session-1",
    txHash: overrides.txHash ?? TX_HASH,
  };
}

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/attendance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

function makeSession(overrides: Partial<{ closed: boolean; startTime: Date; durationSeconds: number; onChainId: number | null }> = {}) {
  const now = Date.now();
  return {
    id: "session-1",
    courseId: "course-1",
    startTime: overrides.startTime ?? new Date(now - 60_000),
    durationSeconds: overrides.durationSeconds ?? 3600,
    closed: overrides.closed ?? false,
    onChainId: overrides.onChainId ?? 1,
    course: { code: "CS101", name: "Blockchain Basics" },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const fn of Object.values(prismaMock.attendance)) fn.mockReset();
  prismaMock.session.findUnique.mockReset();
  prismaMock.user.findUnique.mockReset();
  prismaMock.user.findUnique.mockResolvedValue(null);
  // Default: RPC not configured — the server-side window fallback applies.
  verifyMarkMock.mockReset();
  verifyMarkMock.mockResolvedValue(null);
  limiterMock.check.mockReset();
  limiterMock.check.mockReturnValue(true);
});

describe("POST /api/attendance", () => {
  describe("signature verification", () => {
    it("rejects an invalid wallet address", async () => {
      const res = await post({
        wallet: "not-an-address",
        message: "Attendance request: not-an-address:123",
        signature: "0x",
        sessionId: "s1",
        txHash: TX_HASH,
      });
      expect(res.status).toBe(400);
    });

    it("rejects a signature produced by a different wallet", async () => {
      const message = `Attendance request: ${WALLET_ADDRESS}:${Date.now()}`;
      const signature = OTHER_WALLET.signMessageSync(message);
      const res = await post({ wallet: WALLET_ADDRESS, message, signature, sessionId: "s1", txHash: TX_HASH });
      expect(res.status).toBe(401);
    });

    it("rejects an expired signature", async () => {
      const res = await post(signedBody({ timestamp: Date.now() - 6 * 60 * 1000 }));
      expect(res.status).toBe(401);
      expect((await res.json()).error).toMatch(/expired/i);
    });
  });

  describe("validation", () => {
    it("rejects a missing session", async () => {
      const res = await post({ ...signedBody(), sessionId: "" });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("A session is required");
    });

    it("rejects an invalid transaction hash", async () => {
      const res = await post({ ...signedBody(), txHash: "not-a-hash" });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("A valid transaction hash is required");
    });

    it("returns 404 when the session does not exist", async () => {
      prismaMock.session.findUnique.mockResolvedValue(null);
      const res = await post(signedBody());
      expect(res.status).toBe(404);
    });

    it("rejects marking a closed session", async () => {
      prismaMock.session.findUnique.mockResolvedValue(makeSession({ closed: true }));
      const res = await post(signedBody());
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/closed/i);
    });

    it("rejects marking before the session starts", async () => {
      prismaMock.session.findUnique.mockResolvedValue(
        makeSession({ startTime: new Date(Date.now() + 60_000) })
      );
      const res = await post(signedBody());
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/hasn't started/i);
    });

    it("rejects marking an expired session", async () => {
      prismaMock.session.findUnique.mockResolvedValue(
        makeSession({ startTime: new Date(Date.now() - 7200_000), durationSeconds: 3600 })
      );
      const res = await post(signedBody());
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/expired/i);
    });

    it("returns 429 when rate limited", async () => {
      limiterMock.check.mockReturnValue(false);
      const res = await post(signedBody());
      expect(res.status).toBe(429);
    });
  });

  describe("double-marking", () => {
    it("returns 409 when the student already marked this session", async () => {
      prismaMock.session.findUnique.mockResolvedValue(makeSession());
      prismaMock.attendance.findUnique.mockResolvedValue({ id: "old" });
      const res = await post(signedBody());
      expect(res.status).toBe(409);
      expect(prismaMock.attendance.create).not.toHaveBeenCalled();
    });

    it("returns 409 when a concurrent insert violates the unique (wallet, sessionId) constraint", async () => {
      prismaMock.session.findUnique.mockResolvedValue(makeSession());
      prismaMock.attendance.findUnique.mockResolvedValue(null);
      verifyMarkMock.mockResolvedValue(true);
      prismaMock.attendance.create.mockRejectedValue({ code: "P2002" });
      const res = await post(signedBody());
      expect(res.status).toBe(409);
    });
  });

  describe("on-chain verification", () => {
    it("rejects when the tx cannot be verified on-chain", async () => {
      prismaMock.session.findUnique.mockResolvedValue(makeSession());
      prismaMock.attendance.findUnique.mockResolvedValue(null);
      verifyMarkMock.mockResolvedValue(false);
      const res = await post(signedBody());
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/verify/i);
      expect(prismaMock.attendance.create).not.toHaveBeenCalled();
    });

    it("records a confirmed attendance when the tx verifies on-chain", async () => {
      prismaMock.session.findUnique.mockResolvedValue(makeSession());
      prismaMock.attendance.findUnique.mockResolvedValue(null);
      verifyMarkMock.mockResolvedValue(true);
      prismaMock.attendance.create.mockResolvedValue({
        id: "rec-1",
        wallet: WALLET_ADDRESS.toLowerCase(),
        date: new Date(),
        txHash: TX_HASH,
        hashProof: TX_HASH,
        session: { id: "session-1", startTime: new Date(), course: { code: "CS101", name: "Blockchain Basics" } },
      });

      const res = await post(signedBody());
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.status).toBe("confirmed");
      expect(body.txHash).toBe(TX_HASH);
      expect(prismaMock.attendance.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            wallet: WALLET_ADDRESS.toLowerCase(),
            sessionId: "session-1",
            courseId: "course-1",
            txHash: TX_HASH,
          }),
        })
      );
    });

    it("stores a pending record when the RPC is not configured (verify returns null)", async () => {
      prismaMock.session.findUnique.mockResolvedValue(makeSession());
      prismaMock.attendance.findUnique.mockResolvedValue(null);
      verifyMarkMock.mockResolvedValue(null);
      prismaMock.attendance.create.mockResolvedValue({
        id: "rec-2",
        wallet: WALLET_ADDRESS.toLowerCase(),
        date: new Date(),
        txHash: TX_HASH,
        hashProof: null,
        session: { id: "session-1", startTime: new Date(), course: { code: "CS101", name: "Blockchain Basics" } },
      });

      const res = await post(signedBody());
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.status).toBe("pending");
      expect(body.hashProof).toBeNull();
    });
  });

  describe("database errors", () => {
    it("returns 503 when the database is unavailable", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      prismaMock.session.findUnique.mockRejectedValue(new Error("db down"));
      const res = await post(signedBody());
      expect(res.status).toBe(503);
      expect((await res.json()).error).toMatch(/Database not available/i);
      consoleSpy.mockRestore();
    });
  });
});

describe("GET /api/attendance", () => {
  it("rejects a missing wallet param", async () => {
    const res = await GET(new Request("http://localhost/api/attendance"));
    expect(res.status).toBe(400);
  });

  it("returns the student's records with course details", async () => {
    prismaMock.attendance.findMany.mockResolvedValue([
      {
        id: "rec-1",
        wallet: WALLET_ADDRESS.toLowerCase(),
        date: new Date("2026-07-30T10:00:00.000Z"),
        txHash: "0xabc",
        hashProof: "0xabc",
        session: { id: "session-1", startTime: new Date("2026-07-30T09:00:00.000Z"), course: { code: "CS101", name: "Blockchain Basics" } },
      },
    ]);

    const res = await GET(new Request(`http://localhost/api/attendance?wallet=${WALLET_ADDRESS}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({
      id: "rec-1",
      status: "confirmed",
      txHash: "0xabc",
      courseCode: "CS101",
      courseName: "Blockchain Basics",
    });
    expect(prismaMock.attendance.findMany).toHaveBeenCalledWith({
      where: { wallet: WALLET_ADDRESS.toLowerCase() },
      include: { session: { include: { course: true } } },
      orderBy: { date: "desc" },
    });
  });
});
