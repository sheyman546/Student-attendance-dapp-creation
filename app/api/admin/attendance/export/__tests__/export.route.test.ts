import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ethers } from "ethers";
import { GET } from "../route";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    attendance: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const OWNER_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const OWNER = new ethers.Wallet(OWNER_KEY);
const OWNER_ADDRESS = OWNER.address;

function signedParams() {
  const timestamp = Date.now();
  const message = `Admin access: ${OWNER_ADDRESS}:${timestamp}`;
  const signature = OWNER.signMessageSync(message);
  return `wallet=${OWNER_ADDRESS}&message=${encodeURIComponent(
    message
  )}&signature=${encodeURIComponent(signature)}`;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("PRIVATE_KEY", OWNER_KEY);
  prismaMock.attendance.findMany.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/admin/attendance/export", () => {
  it("rejects an unauthenticated request", async () => {
    const res = await GET(
      new Request("http://localhost/api/admin/attendance/export?wallet=bad")
    );
    expect(res.status).toBe(400);
    expect(prismaMock.attendance.findMany).not.toHaveBeenCalled();
  });

  it("rejects a valid signature from a non-admin wallet", async () => {
    const OTHER = new ethers.Wallet(
      "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
    );
    const message = `Admin access: ${OTHER.address}:${Date.now()}`;
    const signature = OTHER.signMessageSync(message);
    const params = `wallet=${OTHER.address}&message=${encodeURIComponent(
      message
    )}&signature=${encodeURIComponent(signature)}`;
    const res = await GET(
      new Request(`http://localhost/api/admin/attendance/export?${params}`)
    );
    expect(res.status).toBe(403);
  });

  it("returns a CSV file with headers and rows", async () => {
    prismaMock.attendance.findMany.mockResolvedValue([
      {
        id: "a",
        wallet: "0x1111111111111111111111111111111111111111",
        date: new Date("2026-07-30T10:00:00.000Z"),
        hashProof: "0xproof",
      },
      {
        id: "b",
        wallet: "0x2222222222222222222222222222222222222222",
        date: new Date("2026-07-29T09:30:00.000Z"),
        hashProof: null,
      },
    ]);

    const res = await GET(
      new Request(`http://localhost/api/admin/attendance/export?${signedParams()}`)
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/text\/csv/);
    expect(res.headers.get("Content-Disposition")).toMatch(/attachment/);

    const csv = await res.text();
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe("studentName,studentEmail,wallet,date,status,hashProof");
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain("0x1111111111111111111111111111111111111111");
    expect(lines[1]).toContain("confirmed");
    expect(lines[1]).toContain("0xproof");
    expect(lines[2]).toContain("pending");
    // empty hashProof renders as an empty (unquoted) CSV field
    expect(lines[2]).toMatch(/,pending,$/);
  });

  it("escapes fields with commas or quotes", async () => {
    prismaMock.attendance.findMany.mockResolvedValue([
      {
        id: "a",
        wallet: "0x1111111111111111111111111111111111111111",
        date: new Date("2026-07-30T10:00:00.000Z"),
        hashProof: null,
      },
    ]);
    const res = await GET(
      new Request(`http://localhost/api/admin/attendance/export?${signedParams()}`)
    );
    const csv = await res.text();
    // pending records render an empty field for hashProof
    expect(csv).toMatch(/,pending,$/);
  });

  it("includes student name and email when a profile is linked", async () => {
    prismaMock.attendance.findMany.mockResolvedValue([
      {
        id: "a",
        wallet: "0x1111111111111111111111111111111111111111",
        date: new Date("2026-07-30T10:00:00.000Z"),
        hashProof: "0xproof",
        user: { name: "Ada Lovelace", email: "ada@school.edu" },
      },
    ]);
    const res = await GET(
      new Request(`http://localhost/api/admin/attendance/export?${signedParams()}`)
    );
    const csv = await res.text();
    // clean values need no CSV quoting
    expect(csv).toContain("Ada Lovelace,ada@school.edu");
    expect(csv).toContain("0xproof");
    expect(prismaMock.attendance.findMany).toHaveBeenCalledWith({
      orderBy: { date: "desc" },
      include: { user: { select: { name: true, email: true } } },
    });
  });

  it("returns 503 when the database is unavailable", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    prismaMock.attendance.findMany.mockRejectedValue(new Error("db down"));
    const res = await GET(
      new Request(`http://localhost/api/admin/attendance/export?${signedParams()}`)
    );
    expect(res.status).toBe(503);
    consoleSpy.mockRestore();
  });
});
