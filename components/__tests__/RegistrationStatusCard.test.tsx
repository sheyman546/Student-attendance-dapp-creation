import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import RegistrationStatusCard from "../RegistrationStatusCard";

const { mockedUseWallet } = vi.hoisted(() => ({
  mockedUseWallet: vi.fn(),
}));

vi.mock("@/hooks/useWallet", () => ({
  useWallet: () => mockedUseWallet(),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

const WALLET = "0x1234567890abcdef1234567890abcdef12345678";
const signer = { signMessage: vi.fn().mockResolvedValue("0xsig") };

beforeEach(() => {
  mockedUseWallet.mockReturnValue({ address: WALLET, signer });
  mockFetch.mockReset();
  signer.signMessage.mockClear();
});

describe("RegistrationStatusCard", () => {
  it("shows a registered state when the student is on-chain", () => {
    render(
      <RegistrationStatusCard
        registered
        profile={{ name: "Ada Lovelace", email: "ada@school.edu", matricNo: "MAT/001" }}
        onLinked={() => {}}
      />
    );
    expect(screen.getByText(/Registered Student/i)).toBeInTheDocument();
    expect(screen.getByText("MAT/001")).toBeInTheDocument();
  });

  it("shows the link form for unregistered students", () => {
    render(
      <RegistrationStatusCard registered={false} profile={null} onLinked={() => {}} />
    );
    expect(screen.getByText(/not registered on-chain/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Matric \/ student ID number/i)).toBeInTheDocument();
  });

  it("links the wallet via matric number and refreshes", async () => {
    const onLinked = vi.fn();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ linked: true, txHash: "0xtx" }),
    });

    render(
      <RegistrationStatusCard registered={false} profile={null} onLinked={onLinked} />
    );

    fireEvent.change(screen.getByPlaceholderText(/Matric \/ student ID number/i), {
      target: { value: "MAT/001" },
    });
    fireEvent.click(screen.getByRole("button", { name: /link my wallet/i }));

    await waitFor(() => {
      expect(signer.signMessage).toHaveBeenCalledWith(
        expect.stringMatching(/^Link registration: /)
      );
    });
    await waitFor(() => {
      expect(onLinked).toHaveBeenCalledTimes(1);
    });
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/student/link",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("MAT/001"),
      })
    );
  });

  it("shows the server error when linking fails", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: "No pending registration matches that matric number" }),
    });

    render(
      <RegistrationStatusCard registered={false} profile={null} onLinked={() => {}} />
    );

    fireEvent.change(screen.getByPlaceholderText(/Matric \/ student ID number/i), {
      target: { value: "MAT/001" },
    });
    fireEvent.click(screen.getByRole("button", { name: /link my wallet/i }));

    await waitFor(() => {
      expect(
        screen.getByText("No pending registration matches that matric number")
      ).toBeInTheDocument();
    });
  });
});
