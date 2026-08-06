import { describe, it, expect, vi, beforeEach } from "vitest";
import { ethers } from "ethers";
import { GET, PUT } from "../route";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    user: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

// Deterministic wallets (fixed private keys) — mirrors the attendance route
// tests, avoiding ethers.createRandom() under Vitest's jsdom environment.
const WALLET = new ethers.Wallet(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
);
const WALLET_ADDRESS = WALLET.address;
const OTHER_WALLET = new ethers.Wallet(
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
);

function signedBody(
  overrides: { name?: string; email?: string; timestamp?: number } = {}
) {
  const timestamp = overrides.timestamp ?? Date.now();
  const message = `Profile update: ${WALLET_ADDRESS}:${timestamp}`;
  const signature = WALLET.signMessageSync(message);
  return {
    wallet: WALLET_ADDRESS,
    message,
    signature,
    name: overrides.name ?? "Ada Lovelace",
    email: overrides.email ?? "ada@school.edu",
  };
}

function put(body: unknown) {
  return PUT(
    new Request("http://localhost/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.user.findUnique.mockReset();
  prismaMock.user.upsert.mockReset();
});

describe("GET /api/profile", () => {
  it("rejects a missing or invalid wallet param", async () => {
    const res = await GET(new Request("http://localhost/api/profile"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "A valid wallet address is required",
    });
  });

  it("returns the profile when the student has set one", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "u-1",
      name: "Ada Lovelace",
      email: "ada@school.edu",
      wallet: WALLET_ADDRESS.toLowerCase(),
    });

    const res = await GET(
      new Request(`http://localhost/api/profile?wallet=${WALLET_ADDRESS}`)
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      name: "Ada Lovelace",
      email: "ada@school.edu",
      matricNo: null,
    });
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { wallet: WALLET_ADDRESS.toLowerCase() },
    });
  });

  it("returns nulls when no profile exists yet", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    const res = await GET(
      new Request(`http://localhost/api/profile?wallet=${WALLET_ADDRESS}`)
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ name: null, email: null, matricNo: null });
  });

  it("returns 503 when the database is unavailable", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    prismaMock.user.findUnique.mockRejectedValue(new Error("db down"));
    const res = await GET(
      new Request(`http://localhost/api/profile?wallet=${WALLET_ADDRESS}`)
    );
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/Database not available/i);
    consoleSpy.mockRestore();
  });
});

describe("PUT /api/profile", () => {
  it("rejects an invalid wallet address", async () => {
    const res = await put({
      wallet: "not-an-address",
      message: "Profile update: not-an-address:1",
      signature: "0x",
      name: "Ada",
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "A valid wallet address is required",
    });
  });

  it("rejects a signature produced by a different wallet", async () => {
    const message = `Profile update: ${WALLET_ADDRESS}:${Date.now()}`;
    const signature = OTHER_WALLET.signMessageSync(message);
    const res = await put({
      wallet: WALLET_ADDRESS,
      message,
      signature,
      name: "Ada",
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: "Signature does not match wallet",
    });
  });

  it("rejects a valid signature over the wrong message format", async () => {
    const message = "some random message";
    const signature = WALLET.signMessageSync(message);
    const res = await put({
      wallet: WALLET_ADDRESS,
      message,
      signature,
      name: "Ada",
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: "Invalid profile update message",
    });
  });

  it("rejects an expired signature", async () => {
    const stale = Date.now() - 6 * 60 * 1000;
    const res = await put(signedBody({ timestamp: stale }));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toMatch(/expired/i);
  });

  it("requires a non-empty name", async () => {
    const res = await put({ ...signedBody(), name: "   " });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Name is required/i);
  });

  it("rejects an invalid email format", async () => {
    const res = await put(signedBody({ email: "not-an-email" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/valid email/i);
  });

  it("allows an empty email", async () => {
    prismaMock.user.upsert.mockResolvedValue({
      id: "u-1",
      name: "Ada Lovelace",
      email: null,
      wallet: WALLET_ADDRESS.toLowerCase(),
    });
    const res = await put({ ...signedBody(), email: "" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      name: "Ada Lovelace",
      email: null,
      matricNo: null,
    });
    expect(prismaMock.user.upsert).toHaveBeenCalledWith({
      where: { wallet: WALLET_ADDRESS.toLowerCase() },
      update: { name: "Ada Lovelace", email: null },
      create: {
        wallet: WALLET_ADDRESS.toLowerCase(),
        name: "Ada Lovelace",
        email: null,
      },
    });
  });

  it("creates the profile with a signed request", async () => {
    prismaMock.user.upsert.mockResolvedValue({
      id: "u-1",
      name: "Ada Lovelace",
      email: "ada@school.edu",
      wallet: WALLET_ADDRESS.toLowerCase(),
    });
    const res = await put(signedBody());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      name: "Ada Lovelace",
      email: "ada@school.edu",
      matricNo: null,
    });
    expect(prismaMock.user.upsert).toHaveBeenCalledWith({
      where: { wallet: WALLET_ADDRESS.toLowerCase() },
      update: { name: "Ada Lovelace", email: "ada@school.edu" },
      create: {
        wallet: WALLET_ADDRESS.toLowerCase(),
        name: "Ada Lovelace",
        email: "ada@school.edu",
      },
    });
  });

  it("returns 409 when the email is already linked to another student", async () => {
    prismaMock.user.upsert.mockRejectedValue({ code: "P2002" });
    const res = await put(signedBody());
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/already linked/i);
  });

  it("returns 503 when the database is unavailable", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    prismaMock.user.upsert.mockRejectedValue(new Error("db down"));
    const res = await put(signedBody());
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/Database not available/i);
    consoleSpy.mockRestore();
  });
});
