import type { JsonRpcSigner } from "ethers";

/** Signs a fresh "Admin access: <wallet>:<ts>" request with the wallet. */
export async function signAdminRequest(
  signer: JsonRpcSigner,
  address: string
): Promise<{ wallet: string; message: string; signature: string }> {
  const timestamp = Date.now();
  const message = `Admin access: ${address}:${timestamp}`;
  const signature = await signer.signMessage(message);
  return { wallet: address, message, signature };
}

/** Signs a fresh "Attendance request: <wallet>:<ts>" request. */
export async function signAttendanceRequest(
  signer: JsonRpcSigner,
  address: string
): Promise<{ wallet: string; message: string; signature: string }> {
  const timestamp = Date.now();
  const message = `Attendance request: ${address}:${timestamp}`;
  const signature = await signer.signMessage(message);
  return { wallet: address, message, signature };
}

/** Signs a fresh "Link registration: <wallet>:<ts>" request. */
export async function signLinkRequest(
  signer: JsonRpcSigner,
  address: string
): Promise<{ wallet: string; message: string; signature: string }> {
  const timestamp = Date.now();
  const message = `Link registration: ${address}:${timestamp}`;
  const signature = await signer.signMessage(message);
  return { wallet: address, message, signature };
}

/** Builds a query string, skipping empty/undefined values. */
export function toQuery(
  params: Record<string, string | number | undefined | null>
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, String(value));
    }
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}
