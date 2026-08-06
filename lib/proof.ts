import { ethers } from "ethers";
import ProofStorageABI from "./abis/ProofStorage.json";

/** True when the required on-chain env vars are configured. */
function isOnChainConfigured(): boolean {
  return !!(
    process.env.RPC_URL && process.env.NEXT_PUBLIC_PROOF_ADDRESS
  );
}

function getReadOnlyContract(provider: ethers.JsonRpcProvider) {
  return new ethers.Contract(
    process.env.NEXT_PUBLIC_PROOF_ADDRESS as string,
    ProofStorageABI.abi,
    provider
  );
}

/**
 * Attempts to record an attendance proof on-chain using the server-side
 * signer (the contract owner or an authorized marker from .env).
 *
 * Returns the proof hash when the transaction succeeded, or null when
 * on-chain attestation is not configured (missing PRIVATE_KEY / RPC_URL /
 * NEXT_PUBLIC_PROOF_ADDRESS) or fails — in which case the attendance record
 * stays off-chain in the database.
 */
export async function attestProofOnChain(
  proofHash: string,
  studentAddress: string
): Promise<string | null> {
  const privateKey = process.env.PRIVATE_KEY;
  const rpcUrl = process.env.RPC_URL;
  const contractAddress = process.env.NEXT_PUBLIC_PROOF_ADDRESS;

  if (!privateKey || !rpcUrl || !contractAddress) {
    return null;
  }

  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);
    const contract = new ethers.Contract(
      contractAddress,
      ProofStorageABI.abi,
      wallet
    );
    const tx = await contract.storeProof(proofHash, studentAddress);
    await tx.wait();
    return proofHash;
  } catch (error) {
    console.error("Failed to attest proof on-chain:", error);
    return null;
  }
}

/**
 * Verifies that `txHash` is a successful on-chain markAttendance call for
 * `sessionOnChainId` by `wallet` (via the hasStudentMarked view).
 *
 * Returns true/false when verification was possible, or null when RPC /
 * contract aren't configured (callers should fall back to a pending record).
 */
export async function verifyMarkOnChain(
  sessionOnChainId: number | null | undefined,
  wallet: string,
  txHash: string
): Promise<boolean | null> {
  if (
    sessionOnChainId == null ||
    !txHash ||
    !/^0x[a-fA-F0-9]{64}$/.test(txHash) ||
    !isOnChainConfigured()
  ) {
    return null;
  }
  try {
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    const receipt = await provider.getTransactionReceipt(txHash);
    if (!receipt || receipt.status !== 1) return false;
    const contract = getReadOnlyContract(provider);
    return (await contract.hasStudentMarked(
      sessionOnChainId,
      wallet.toLowerCase()
    )) as boolean;
  } catch (error) {
    console.error("Failed to verify mark on-chain:", error);
    return null;
  }
}

/** Returns whether `wallet` is registered on-chain, or null when unverifiable. */
export async function isStudentRegisteredOnChain(
  wallet: string
): Promise<boolean | null> {
  if (!isOnChainConfigured()) return null;
  try {
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    const contract = getReadOnlyContract(provider);
    return (await contract.isStudentRegistered(wallet.toLowerCase())) as boolean;
  } catch (error) {
    console.error("Failed to check on-chain registration:", error);
    return null;
  }
}

/** Returns whether a course exists on-chain, or null when unverifiable. */
export async function getCourseOnChain(
  onChainId: number
): Promise<{ code: string; name: string } | null> {
  if (!isOnChainConfigured()) return null;
  try {
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    const contract = getReadOnlyContract(provider);
    const [code, name] = (await contract.getCourse(onChainId)) as [string, string];
    return { code, name };
  } catch (error) {
    console.error("Failed to fetch course on-chain:", error);
    return null;
  }
}

/** Returns a session's on-chain state, or null when unverifiable. */
export async function getSessionOnChain(
  onChainId: number
): Promise<{
  courseId: bigint;
  startTime: bigint;
  duration: bigint;
  closed: boolean;
  exists: boolean;
} | null> {
  if (!isOnChainConfigured()) return null;
  try {
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    const contract = getReadOnlyContract(provider);
    const [courseId, startTime, duration, closed, exists] =
      (await contract.getSession(onChainId)) as [
        bigint,
        bigint,
        bigint,
        boolean,
        boolean
      ];
    return { courseId, startTime, duration, closed, exists };
  } catch (error) {
    console.error("Failed to fetch session on-chain:", error);
    return null;
  }
}

/**
 * Registers a student on-chain using the server signer (the contract owner).
 * Used by the student "link my registration" flow, where the admin already
 * created a pending registration record (by email / matric) off-chain.
 * Returns the tx hash, or null when not configured or on failure.
 */
export async function registerStudentOnChain(
  studentAddress: string
): Promise<string | null> {
  const privateKey = process.env.PRIVATE_KEY;
  const rpcUrl = process.env.RPC_URL;
  const contractAddress = process.env.NEXT_PUBLIC_PROOF_ADDRESS;

  if (!privateKey || !rpcUrl || !contractAddress) return null;

  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);
    const contract = new ethers.Contract(
      contractAddress,
      ProofStorageABI.abi,
      wallet
    );
    const tx = await contract.registerStudent(studentAddress);
    await tx.wait();
    return tx.hash;
  } catch (error) {
    console.error("Failed to register student on-chain:", error);
    return null;
  }
}
