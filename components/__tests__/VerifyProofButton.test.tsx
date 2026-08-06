import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import VerifyProofButton from "../VerifyProofButton";

const { verifyMock } = vi.hoisted(() => ({
  verifyMock: vi.fn(),
}));

vi.mock("@/lib/contract", () => ({ verifyProofOnChain: verifyMock }));

const HASH = "0x7a9f3c8d2e1b5a4f6c0d8e3f2a1b9c7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a1b";

describe("VerifyProofButton", () => {
  it("shows a Verify button initially", () => {
    render(<VerifyProofButton hashProof={HASH} />);
    expect(screen.getByRole("button", { name: /verify/i })).toBeInTheDocument();
  });

  it("shows a verified badge when the proof exists on-chain", async () => {
    verifyMock.mockResolvedValue(true);
    render(<VerifyProofButton hashProof={HASH} />);
    fireEvent.click(screen.getByRole("button", { name: /verify/i }));
    await waitFor(() =>
      expect(screen.getByText("Verified on-chain")).toBeInTheDocument()
    );
    expect(verifyMock).toHaveBeenCalledWith(HASH);
  });

  it("shows a missing badge when the proof is not on-chain", async () => {
    verifyMock.mockResolvedValue(false);
    render(<VerifyProofButton hashProof={HASH} />);
    fireEvent.click(screen.getByRole("button", { name: /verify/i }));
    await waitFor(() => expect(screen.getByText("Not on-chain")).toBeInTheDocument());
  });

  it("shows an error state when verification fails", async () => {
    verifyMock.mockRejectedValue(new Error("MetaMask is not installed"));
    render(<VerifyProofButton hashProof={HASH} />);
    fireEvent.click(screen.getByRole("button", { name: /verify/i }));
    await waitFor(() => expect(screen.getByText("Verify error")).toBeInTheDocument());
  });
});
