import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ethers } from "ethers";
import { POST } from "../route";

const { prismaMock, attestMock } = vi.hoisted(() => ({
  prismaMock: {
    attendance: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
  attestMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/proof", () => ({ attestProofOnChain: attestMock }));

// The owner wallet: matches the private key used in real deployments, but for
// tests we control it via PRIVATE_KEY so isAdminWallet resolves to true.
const OWNER_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const OWNER = new ethers.Wallet(OWNER_KEY);
const OWNER_ADDRESS = OWNER.address;
const OTHER = new ethers.Wallet(
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
);

function signedBody(timestamp: number = Date.now()) {
  const message = `Admin attest: ${OWNER_ADDRESS}:${timestamp}`;
  const signature = OWNER.signMessageSync(message);
  return { wallet: OWNER_ADDRESS, message, signature };
}

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/admin/attest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("PRIVATE_KEY", OWNER_KEY);
  for (const fn of Object.values(prismaMock.attendance)) {
    fn.mockReset();
  }
  attestMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/admin/attest", () => {
  it("rejects an invalid wallet address", async () => {
    const res = await post({
      wallet: "not-an-address",
      message: "Admin attest: not-an-address:1",
      signature: "0x",
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "A valid wallet address is required",
    });
  });

  it("rejects a request not signed by the admin wallet", async () => {
    const message = `Admin attest: ${OWNER_ADDRESS}:${Date.now()}`;
    const signature = OTHER.signMessageSync(message);
    const res = await post({ wallet: OWNER_ADDRESS, message, signature });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Signature does not match wallet" });
  });

  it("rejects a valid signature from a non-admin wallet", async () => {
    // OTHER signs its own message — the request is from a non-owner wallet.
    const message = `Admin attest: ${OTHER.address}:${Date.now()}`;
    const signature = OTHER.signMessageSync(message);
    const res = await post({ wallet: OTHER.address, message, signature });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: "Not authorized — only the contract owner can retry attestations",
    });
    expect(prismaMock.attendance.findMany).not.toHaveBeenCalled();
  });

  it("rejects an expired signature", async () => {
    const stale = Date.now() - 6 * 60 * 1000;
    const res = await post(signedBody(stale));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toMatch(/expired/i);
  });

  it("attests all pending records and updates them", async () => {
    prismaMock.attendance.findMany.mockResolvedValue([
      { id: "rec-1", wallet: "0x1111111111111111111111111111111111111111", date: new Date("2026-07-28T09:00:00.000Z"), hashProof: null },
      { id: "rec-2", wallet: "0x2222222222222222222222222222222222222222", date: new Date("2026-07-29T09:00:00.000Z"), hashProof: null },
    ]);
    attestMock.mockResolvedValue("0xattested");

    const res = await post(signedBody());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ pending: 2, attested: 2, failed: [] });
    expect(attestMock).toHaveBeenCalledTimes(2);
    expect(prismaMock.attendance.update).toHaveBeenCalledTimes(2);
    expect(prismaMock.attendance.update).toHaveBeenCalledWith({
      where: { id: "rec-1" },
      data: { hashProof: "0xattested" },
    });
  });

  it("reports failures when attestation is unavailable", async () => {
    prismaMock.attendance.findMany.mockResolvedValue([
      { id: "rec-1", wallet: "0x1111111111111111111111111111111111111111", date: new Date("2026-07-28T09:00:00.000Z"), hashProof: null },
      { id: "rec-2", wallet: "0x2222222222222222222222222222222222222222", date: new Date("2026-07-29T09:00:00.000Z"), hashProof: null },
    ]);
    attestMock.mockResolvedValueOnce("0xok").mockResolvedValueOnce(null);

    const res = await post(signedBody());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ pending: 2, attested: 1, failed: ["rec-2"] });
    expect(prismaMock.attendance.update).toHaveBeenCalledTimes(1);
  });

  it("is a no-op when there are no pending records", async () => {
    prismaMock.attendance.findMany.mockResolvedValue([]);
    const res = await post(signedBody());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ pending: 0, attested: 0, failed: [] });
    expect(attestMock).not.toHaveBeenCalled();
  });

  it("returns 503 when the database is unavailable", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    prismaMock.attendance.findMany.mockRejectedValue(
      new Error("db connection refused")
    );
    const res = await post(signedBody());
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/Database not available/i);
    consoleSpy.mockRestore();
  });
});
