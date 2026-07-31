import { ethers } from "ethers";
import ProofStorageABI from "../contracts/out/ProofStorage.sol/ProofStorage.json";

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
        throw new Error(
            "Contract address not set. Set NEXT_PUBLIC_PROOF_ADDRESS in your .env.local file."
        );
    }
    return new ethers.Contract(contractAddress, ProofStorageABI.abi, signer);
};

export const getProofContractReadOnly = () => {
    // Read-only provider for verifyProof and getStudentRecords (no signer needed)
    if (typeof window === "undefined") {
        throw new Error("Must be used in browser");
    }
    const provider = new ethers.JsonRpcProvider(
        process.env.NEXT_PUBLIC_RPC_URL || "http://localhost:8545"
    );

    const contractAddress = process.env.NEXT_PUBLIC_PROOF_ADDRESS;
    if (!contractAddress) {
        throw new Error(
            "Contract address not set. Set NEXT_PUBLIC_PROOF_ADDRESS in your .env.local file."
        );
    }
    return new ethers.Contract(contractAddress, ProofStorageABI.abi, provider);
};
