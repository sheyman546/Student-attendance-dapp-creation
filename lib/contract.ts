import { ethers } from "ethers";
import ProofStorageABI from "./abis/ProofStorage.json";

export const PROOF_ABI = ProofStorageABI.abi;

export const getProofContract = async () => {
  if (typeof window === "undefined") {
    throw new Error("Must be used in browser");
  }
  if (!window.ethereum) {
    throw new Error("MetaMask is not installed");
  }
  const provider = new ethers.BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();

  const contractAddress = process.env.NEXT_PUBLIC_PROOF_ADDRESS;
  if (!contractAddress) {
    throw new Error("Contract address not set in .env");
  }
  return new ethers.Contract(contractAddress, ProofStorageABI.abi, signer);
};

/**
 * Read-only contract handle connected to the browser wallet's provider.
 * Safe for view calls (no gas, no transactions).
 */
export const getProofContractReadOnly = async () => {
  if (typeof window === "undefined") {
    throw new Error("Must be used in browser");
  }
  if (!window.ethereum) {
    throw new Error("MetaMask is not installed");
  }
  const provider = new ethers.BrowserProvider(window.ethereum);
  const contractAddress = process.env.NEXT_PUBLIC_PROOF_ADDRESS;
  if (!contractAddress) {
    throw new Error("Contract address not set in .env");
  }
  return new ethers.Contract(contractAddress, ProofStorageABI.abi, provider);
};

/**
 * Read-only on-chain check: returns true when `hash` is recorded in the
 * deployed ProofStorage contract. Uses the connected wallet's provider, so
 * no gas is spent and no transaction is sent.
 */
export const verifyProofOnChain = async (hash: string): Promise<boolean> => {
  if (typeof window === "undefined") {
    throw new Error("Must be used in browser");
  }
  if (!window.ethereum) {
    throw new Error("MetaMask is not installed");
  }
  const provider = new ethers.BrowserProvider(window.ethereum);
  const contractAddress = process.env.NEXT_PUBLIC_PROOF_ADDRESS;
  if (!contractAddress) {
    throw new Error("Contract address not set in .env");
  }
  const contract = new ethers.Contract(
    contractAddress,
    ProofStorageABI.abi,
    provider
  );
  return contract.verifyProof(hash);
};

/**
 * Extracts the decoded arguments of the first `eventName` log in a receipt.
 * Returns null when the event isn't present (or the receipt has no logs).
 */
export function readEventFromReceipt(
  receipt: { logs: readonly unknown[] },
  eventName: string
): Record<string, unknown> | null {
  const iface = new ethers.Interface(PROOF_ABI);
  let topic: string;
  try {
    topic = iface.getEvent(eventName)?.topicHash ?? "";
  } catch {
    return null;
  }
  if (!topic) return null;

  for (const log of receipt.logs ?? []) {
    const { topics, data } = log as { topics?: string[]; data?: string };
    if (topics && topics[0] === topic) {
      try {
        const parsed = iface.parseLog({ topics, data: data ?? "0x" });
        return parsed?.args
          ? Object.fromEntries(
              Object.entries(parsed.args).filter(
                ([key]) => !/^\d+$/.test(key)
              )
            )
          : null;
      } catch {
        // ignore malformed logs for this event
      }
    }
  }
  return null;
}

/** Shortens a 0x address/hash for display. */
export function shortenHex(value: string, head = 6, tail = 4): string {
  if (!value || value.length <= head + tail + 1) return value ?? "";
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
}

/** Returns the configured block explorer base URL (or null). */
export function getExplorerBaseUrl(): string | null {
  return process.env.NEXT_PUBLIC_EXPLORER_URL ?? null;
}

/** Builds a block explorer link for a tx hash when configured. */
export function getTxExplorerUrl(txHash: string): string | null {
  const base = getExplorerBaseUrl();
  if (!base || !txHash) return null;
  return `${base.replace(/\/$/, "")}/tx/${txHash}`;
}

/** Builds a block explorer link for an address when configured. */
export function getAddressExplorerUrl(address: string): string | null {
  const base = getExplorerBaseUrl();
  if (!base || !address) return null;
  return `${base.replace(/\/$/, "")}/address/${address}`;
}
