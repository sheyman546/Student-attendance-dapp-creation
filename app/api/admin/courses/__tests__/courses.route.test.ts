import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ethers } from "ethers";
import { GET, POST } from "../route";

const { prismaMock, courseChainMock } = vi.hoisted(() => ({
  prismaMock: {
    course: { findMany: vi.fn(), upsert: vi.fn() },
    user: { findUnique: vi.fn() },
  },
  courseChainMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/proof", () => ({ getCourseOnChain: courseChainMock }));

const OWNER_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const OWNER = new ethers.Wallet(OWNER_KEY);
const OWNER_ADDRESS = OWNER.address;

const TX_HASH = "0x" + "ef".repeat(32);

function signedBody(extra: Record<string, unknown> = {}) {
  const timestamp = Date.now();
  const message = `Admin access: ${OWNER_ADDRESS}:${timestamp}`;
  const signature = OWNER.signMessageSync(message);
  return { wallet: OWNER_ADDRESS, message, signature, ...extra };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("PRIVATE_KEY", OWNER_KEY);
  prismaMock.course.findMany.mockReset();
  prismaMock.course.upsert.mockReset();
  prismaMock.user.findUnique.mockReset();
  courseChainMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/admin/courses", () => {
  it("creates a course and mirrors the on-chain id", async () => {
    courseChainMock.mockResolvedValue(null); // RPC not configured -> trust the tx
    prismaMock.course.upsert.mockResolvedValue({
      id: "course-1",
      code: "CS101",
      name: "Blockchain Basics",
      onChainId: 2,
    });

    const res = await POST(
      new Request("http://localhost/api/admin/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          signedBody({ code: "CS101", name: "Blockchain Basics", onChainId: "2", txHash: TX_HASH })
        ),
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.course).toMatchObject({ code: "CS101", onChainId: 2 });
    expect(prismaMock.course.upsert).toHaveBeenCalledWith({
      where: { code: "CS101" },
      update: { name: "Blockchain Basics", onChainId: 2 },
      create: { code: "CS101", name: "Blockchain Basics", onChainId: 2 },
    });
  });

  it("rejects when the on-chain course does not match", async () => {
    courseChainMock.mockResolvedValue({ code: "MATH101", name: "Other" });
    const res = await POST(
      new Request("http://localhost/api/admin/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(signedBody({ code: "CS101", name: "Blockchain Basics", onChainId: "2", txHash: TX_HASH })),
      })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/do not match/i);
  });

  it("rejects an invalid course code", async () => {
    const res = await POST(
      new Request("http://localhost/api/admin/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(signedBody({ code: "TOO LONG CODE HERE!", name: "X", onChainId: "1", txHash: TX_HASH })),
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 409 for a duplicate course code", async () => {
    courseChainMock.mockResolvedValue(null);
    prismaMock.course.upsert.mockRejectedValue({ code: "P2002" });
    const res = await POST(
      new Request("http://localhost/api/admin/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(signedBody({ code: "CS101", name: "X", onChainId: "1", txHash: TX_HASH })),
      })
    );
    expect(res.status).toBe(409);
  });
});

describe("GET /api/admin/courses", () => {
  it("lists courses with session counts", async () => {
    prismaMock.course.findMany.mockResolvedValue([
      {
        id: "course-1",
        code: "CS101",
        name: "Blockchain Basics",
        onChainId: 1,
        createdAt: new Date(),
        _count: { sessions: 2 },
      },
    ]);

    const timestamp = Date.now();
    const message = `Admin access: ${OWNER_ADDRESS}:${timestamp}`;
    const signature = OWNER.signMessageSync(message);
    const res = await GET(
      new Request(
        `http://localhost/api/admin/courses?wallet=${OWNER_ADDRESS}&message=${encodeURIComponent(message)}&signature=${encodeURIComponent(signature)}`
      )
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.courses).toHaveLength(1);
    expect(body.courses[0]).toMatchObject({ code: "CS101", sessionCount: 2 });
  });

  it("rejects an unauthenticated request", async () => {
    const res = await GET(new Request("http://localhost/api/admin/courses"));
    expect(res.status).toBe(401);
    expect(prismaMock.course.findMany).not.toHaveBeenCalled();
  });
});
