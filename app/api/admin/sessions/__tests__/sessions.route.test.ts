import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ethers } from "ethers";
import { GET, POST } from "../route";

const { prismaMock, sessionChainMock } = vi.hoisted(() => ({
  prismaMock: {
    course: { findUnique: vi.fn() },
    session: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    user: { findUnique: vi.fn() },
  },
  sessionChainMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/proof", () => ({ getSessionOnChain: sessionChainMock }));

const OWNER_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const OWNER = new ethers.Wallet(OWNER_KEY);
const OWNER_ADDRESS = OWNER.address;

const TX_HASH = "0x" + "cd".repeat(32);

function signedBody(extra: Record<string, unknown> = {}) {
  const timestamp = Date.now();
  const message = `Admin access: ${OWNER_ADDRESS}:${timestamp}`;
  const signature = OWNER.signMessageSync(message);
  return { wallet: OWNER_ADDRESS, message, signature, ...extra };
}

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/admin/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("PRIVATE_KEY", OWNER_KEY);
  for (const fn of Object.values(prismaMock.session)) fn.mockReset();
  prismaMock.course.findUnique.mockReset();
  prismaMock.user.findUnique.mockReset();
  sessionChainMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/admin/sessions", () => {
  it("rejects an unauthenticated request", async () => {
    const res = await post({ wallet: "bad", message: "x", signature: "0x", action: "open" });
    expect(res.status).toBe(400);
  });

  it("rejects a valid signature from a non-teacher wallet", async () => {
    const OTHER = new ethers.Wallet(
      "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
    );
    const message = `Admin access: ${OTHER.address}:${Date.now()}`;
    const signature = OTHER.signMessageSync(message);
    const res = await post({ wallet: OTHER.address, message, signature, action: "open" });
    expect(res.status).toBe(403);
    expect(prismaMock.session.create).not.toHaveBeenCalled();
  });

  it("opens a session for a course with start time and duration", async () => {
    prismaMock.course.findUnique.mockResolvedValue({
      id: "course-1",
      code: "CS101",
      name: "Blockchain Basics",
      onChainId: 1,
    });
    sessionChainMock.mockResolvedValue(null); // RPC not configured -> trust the tx
    prismaMock.session.create.mockResolvedValue({
      id: "session-1",
      courseId: "course-1",
      onChainId: 3,
      startTime: new Date("2026-08-06T10:00:00.000Z"),
      durationSeconds: 3600,
      closed: false,
    });

    const res = await post(
      signedBody({
        action: "open",
        courseCode: "CS101",
        startTime: "2026-08-06T10:00:00.000Z",
        durationSeconds: 3600,
        onChainId: "3",
        txHash: TX_HASH,
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.session).toMatchObject({
      id: "session-1",
      courseCode: "—",
      durationSeconds: 3600,
    });
    expect(prismaMock.session.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        courseId: "course-1",
        onChainId: 3,
        durationSeconds: 3600,
        closed: false,
      }),
    });
  });

  it("rejects an unknown course", async () => {
    prismaMock.course.findUnique.mockResolvedValue(null);
    const res = await post(
      signedBody({ action: "open", courseCode: "NOPE", startTime: "2026-08-06T10:00:00.000Z", durationSeconds: 3600, onChainId: "1", txHash: TX_HASH })
    );
    expect(res.status).toBe(404);
  });

  it("rejects an invalid duration", async () => {
    prismaMock.course.findUnique.mockResolvedValue({ id: "c1", code: "CS101", name: "X", onChainId: 1 });
    const res = await post(
      signedBody({ action: "open", courseCode: "CS101", startTime: "2026-08-06T10:00:00.000Z", durationSeconds: -5, onChainId: "1", txHash: TX_HASH })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Duration/i);
  });

  it("closes a session and marks closedAt", async () => {
    prismaMock.session.findUnique.mockResolvedValue({
      id: "session-1",
      courseId: "course-1",
      onChainId: 3,
      startTime: new Date(),
      durationSeconds: 3600,
      closed: false,
      course: { code: "CS101", name: "X" },
    });
    sessionChainMock.mockResolvedValue({
      courseId: BigInt(1),
      startTime: BigInt(0),
      duration: BigInt(3600),
      closed: true,
      exists: true,
    });
    prismaMock.session.update.mockResolvedValue({
      id: "session-1",
      courseId: "course-1",
      onChainId: 3,
      startTime: new Date(),
      durationSeconds: 3600,
      closed: true,
      closedAt: new Date(),
      course: { code: "CS101", name: "X" },
    });

    const res = await post(
      signedBody({ action: "close", sessionId: "session-1", txHash: TX_HASH })
    );
    expect(res.status).toBe(200);
    expect(prismaMock.session.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "session-1" },
        data: expect.objectContaining({ closed: true }),
      })
    );
  });

  it("rejects closing a session still open on-chain", async () => {
    prismaMock.session.findUnique.mockResolvedValue({
      id: "session-1",
      courseId: "course-1",
      onChainId: 3,
      startTime: new Date(),
      durationSeconds: 3600,
      closed: false,
      course: { code: "CS101", name: "X" },
    });
    sessionChainMock.mockResolvedValue({
      courseId: BigInt(1),
      startTime: BigInt(0),
      duration: BigInt(3600),
      closed: false,
      exists: true,
    });
    const res = await post(signedBody({ action: "close", sessionId: "session-1", txHash: TX_HASH }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/still open on-chain/i);
  });
});

describe("GET /api/admin/sessions", () => {
  it("lists sessions with counts and status", async () => {
    prismaMock.session.findMany.mockResolvedValue([
      {
        id: "session-1",
        courseId: "course-1",
        onChainId: 1,
        startTime: new Date(Date.now() - 60_000),
        durationSeconds: 3600,
        closed: false,
        course: { code: "CS101", name: "Blockchain Basics" },
        _count: { attendance: 3 },
      },
    ]);

    const timestamp = Date.now();
    const message = `Admin access: ${OWNER_ADDRESS}:${timestamp}`;
    const signature = OWNER.signMessageSync(message);
    const res = await GET(
      new Request(
        `http://localhost/api/admin/sessions?wallet=${OWNER_ADDRESS}&message=${encodeURIComponent(message)}&signature=${encodeURIComponent(signature)}`
      )
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sessions).toHaveLength(1);
    expect(body.sessions[0]).toMatchObject({
      courseCode: "CS101",
      isActive: true,
      attendanceCount: 3,
    });
  });

  it("returns session records when sessionId is provided", async () => {
    prismaMock.session.findUnique.mockResolvedValue({
      id: "session-1",
      courseId: "course-1",
      onChainId: 1,
      startTime: new Date(),
      durationSeconds: 3600,
      closed: false,
      course: { code: "CS101", name: "X" },
      attendance: [
        {
          id: "rec-1",
          wallet: "0x1111111111111111111111111111111111111111",
          date: new Date(),
          txHash: TX_HASH,
          hashProof: TX_HASH,
          session: { id: "session-1", startTime: new Date(), course: { code: "CS101", name: "X" } },
          user: { name: "Ada", email: "ada@x.edu", matricNo: "MAT/1" },
        },
      ],
    });

    const timestamp = Date.now();
    const message = `Admin access: ${OWNER_ADDRESS}:${timestamp}`;
    const signature = OWNER.signMessageSync(message);
    const res = await GET(
      new Request(
        `http://localhost/api/admin/sessions?wallet=${OWNER_ADDRESS}&message=${encodeURIComponent(message)}&signature=${encodeURIComponent(signature)}&sessionId=session-1`
      )
    );
    const body = await res.json();
    expect(body.records).toHaveLength(1);
    expect(body.records[0]).toMatchObject({
      studentName: "Ada",
      matricNo: "MAT/1",
      wallet: "0x1111111111111111111111111111111111111111",
    });
  });
});
