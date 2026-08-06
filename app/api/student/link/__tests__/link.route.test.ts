import { describe, it, expect, vi, beforeEach } from "vitest";
import { ethers } from "ethers";
import { POST } from "../route";

const { prismaMock, registerMock } = vi.hoisted(() => ({
  prismaMock: {
    user: { findFirst: vi.fn(), update: vi.fn() },
  },
  registerMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/proof", () => ({ registerStudentOnChain: registerMock }));

const WALLET = new ethers.Wallet(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
);
const WALLET_ADDRESS = WALLET.address;

function post(overrides: Partial<{ matricNo: string; timestamp: number }> = {}) {
  const timestamp = overrides.timestamp ?? Date.now();
  const message = `Link registration: ${WALLET_ADDRESS}:${timestamp}`;
  const signature = WALLET.signMessageSync(message);
  return POST(
    new Request("http://localhost/api/student/link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        wallet: WALLET_ADDRESS,
        message,
        signature,
        matricNo: overrides.matricNo ?? "MAT/001",
      }),
    })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.user.findFirst.mockReset();
  prismaMock.user.update.mockReset();
  registerMock.mockReset();
});

describe("POST /api/student/link", () => {
  it("links the wallet to a pending registration and registers on-chain", async () => {
    prismaMock.user.findFirst.mockResolvedValue({
      id: "u-1",
      wallet: null,
      matricNo: "MAT/001",
    });
    registerMock.mockResolvedValue("0xregistertx");

    const res = await post();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ linked: true, txHash: "0xregistertx" });
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: "u-1" },
      data: { wallet: WALLET_ADDRESS.toLowerCase(), isRegistered: true },
    });
  });

  it("rejects a matric number that matches no pending registration", async () => {
    prismaMock.user.findFirst.mockResolvedValue(null);
    const res = await post();
    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatch(/No pending registration/i);
  });

  it("rejects a matric number already linked to a different wallet", async () => {
    prismaMock.user.findFirst.mockResolvedValue({
      id: "u-1",
      wallet: "0x2222222222222222222222222222222222222222",
      matricNo: "MAT/001",
    });
    const res = await post();
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/another wallet/i);
  });

  it("re-registers a wallet that was recorded while RPC verification was unavailable", async () => {
    // Admin registered the wallet but the on-chain check couldn't run, so
    // isRegistered stayed false. The same wallet links again via matric.
    prismaMock.user.findFirst.mockResolvedValue({
      id: "u-1",
      wallet: WALLET_ADDRESS.toLowerCase(),
      matricNo: "MAT/001",
    });
    registerMock.mockResolvedValue("0xrelinktx");

    const res = await post();
    expect(res.status).toBe(200);
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: "u-1" },
      data: { wallet: WALLET_ADDRESS.toLowerCase(), isRegistered: true },
    });
  });

  it("returns 503 when on-chain registration is unavailable", async () => {
    prismaMock.user.findFirst.mockResolvedValue({
      id: "u-1",
      wallet: null,
      matricNo: "MAT/001",
    });
    registerMock.mockResolvedValue(null);

    const res = await post();
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/PRIVATE_KEY/i);
  });

  it("rejects an invalid matric number", async () => {
    const res = await post({ matricNo: "!!!" });
    expect(res.status).toBe(400);
  });

  it("rejects an expired signature", async () => {
    const res = await post({ timestamp: Date.now() - 6 * 60 * 1000 });
    expect(res.status).toBe(401);
  });
});
