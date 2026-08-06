import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ethers } from "ethers";
import { GET, POST } from "../route";

const { prismaMock, registeredChainMock } = vi.hoisted(() => ({
  prismaMock: {
    user: { findMany: vi.fn(), findUnique: vi.fn(), upsert: vi.fn(), create: vi.fn() },
  },
  registeredChainMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/proof", () => ({ isStudentRegisteredOnChain: registeredChainMock }));

const OWNER_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const OWNER = new ethers.Wallet(OWNER_KEY);
const OWNER_ADDRESS = OWNER.address;
const STUDENT = "0x1111111111111111111111111111111111111111";

const TX_HASH = "0x" + "12".repeat(32);

function signedBody(extra: Record<string, unknown> = {}) {
  const timestamp = Date.now();
  const message = `Admin access: ${OWNER_ADDRESS}:${timestamp}`;
  const signature = OWNER.signMessageSync(message);
  return { wallet: OWNER_ADDRESS, message, signature, ...extra };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("PRIVATE_KEY", OWNER_KEY);
  for (const fn of Object.values(prismaMock.user)) fn.mockReset();
  registeredChainMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/admin/students", () => {
  it("registers a student by wallet after the on-chain tx", async () => {
    registeredChainMock.mockResolvedValue(true);
    prismaMock.user.upsert.mockResolvedValue({
      id: "u-1",
      name: "Ada Lovelace",
      email: "ada@school.edu",
      wallet: STUDENT,
      matricNo: "MAT/001",
      isRegistered: true,
    });

    const res = await POST(
      new Request("http://localhost/api/admin/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          signedBody({
            studentWallet: STUDENT,
            name: "Ada Lovelace",
            email: "ada@school.edu",
            matricNo: "MAT/001",
            txHash: TX_HASH,
          })
        ),
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.student).toMatchObject({ wallet: STUDENT, isRegistered: true });
    expect(prismaMock.user.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { wallet: STUDENT },
        create: expect.objectContaining({ role: "USER", isRegistered: true }),
      })
    );
  });

  it("rejects a wallet that is not registered on-chain", async () => {
    registeredChainMock.mockResolvedValue(false);
    const res = await POST(
      new Request("http://localhost/api/admin/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          signedBody({ studentWallet: STUDENT, txHash: TX_HASH })
        ),
      })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/not registered on-chain/i);
    expect(prismaMock.user.upsert).not.toHaveBeenCalled();
  });

  it("creates a pending registration from email/matric alone", async () => {
    prismaMock.user.create.mockResolvedValue({
      id: "u-2",
      name: null,
      email: "student@school.edu",
      wallet: null,
      matricNo: "MAT/002",
      isRegistered: false,
    });

    const res = await POST(
      new Request("http://localhost/api/admin/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          signedBody({ email: "student@school.edu", matricNo: "MAT/002" })
        ),
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.student).toMatchObject({ isRegistered: false, wallet: null });
    expect(prismaMock.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ role: "USER", isRegistered: false }),
      })
    );
  });

  it("rejects when no identifier is provided", async () => {
    const res = await POST(
      new Request("http://localhost/api/admin/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(signedBody({})),
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 409 for a duplicate email", async () => {
    prismaMock.user.create.mockRejectedValue({ code: "P2002" });
    const res = await POST(
      new Request("http://localhost/api/admin/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(signedBody({ email: "dup@school.edu" })),
      })
    );
    expect(res.status).toBe(409);
  });
});

describe("GET /api/admin/students", () => {
  it("lists students with attendance counts", async () => {
    prismaMock.user.findMany.mockResolvedValue([
      {
        id: "u-1",
        name: "Ada Lovelace",
        email: "ada@school.edu",
        wallet: STUDENT,
        matricNo: "MAT/001",
        isRegistered: true,
        role: "USER",
        createdAt: new Date(),
        _count: { attendance: 4 },
      },
    ]);

    const timestamp = Date.now();
    const message = `Admin access: ${OWNER_ADDRESS}:${timestamp}`;
    const signature = OWNER.signMessageSync(message);
    const res = await GET(
      new Request(
        `http://localhost/api/admin/students?wallet=${OWNER_ADDRESS}&message=${encodeURIComponent(message)}&signature=${encodeURIComponent(signature)}`
      )
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.students).toHaveLength(1);
    expect(body.students[0]).toMatchObject({
      matricNo: "MAT/001",
      attendanceCount: 4,
      isRegistered: true,
    });
  });
});
