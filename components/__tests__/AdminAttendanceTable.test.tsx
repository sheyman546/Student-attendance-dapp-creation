import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import AdminAttendanceTable, {
  type AdminPagination,
} from "../AdminAttendanceTable";
import type { AdminAttendanceRecord } from "@/types/attendance";

const pagination: AdminPagination = {
  page: 1,
  pageSize: 10,
  total: 25,
  totalPages: 3,
};

const baseRecord = {
  txHash: null as string | null,
  courseCode: "CS101" as string | null,
  courseName: "Blockchain Basics" as string | null,
  sessionId: "s1" as string | null,
};

const records: AdminAttendanceRecord[] = [
  {
    ...baseRecord,
    id: "1",
    wallet: "0x1234567890abcdef1234567890abcdef12345678",
    date: "2026-07-28T09:00:00Z",
    hashProof: "0x7a9f3c8d2e1b5a4f6c0d8e3f2a1b9c7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a1b",
    status: "confirmed",
  },
  {
    ...baseRecord,
    id: "2",
    wallet: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
    date: "2026-07-27T09:00:00Z",
    hashProof: null,
    status: "pending",
  },
];

describe("AdminAttendanceTable", () => {
  it("shows an empty state when there are no records", () => {
    render(<AdminAttendanceTable records={[]} />);
    expect(screen.getByText("No attendance records yet")).toBeInTheDocument();
  });

  it("renders student wallets, truncated proof hashes, and status badges", () => {
    render(<AdminAttendanceTable records={records} />);

    // shortenWallet: slice(0,6) + "..." + slice(-4)
    expect(screen.getByText("0x1234...5678")).toBeInTheDocument();
    expect(screen.getByText("0xabcd...abcd")).toBeInTheDocument();
    // students without a profile show the placeholder
    expect(screen.getAllByText("No profile set")).toHaveLength(2);
    // shortenHash: slice(0,10) + "..." + slice(-6)
    expect(screen.getByText("0x7a9f3c8d...3f2a1b")).toBeInTheDocument();
    expect(screen.getByText("Confirmed")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.getByText("No on-chain proof")).toBeInTheDocument();
  });

  it("shows the student name instead of the placeholder when a profile is set", () => {
    const withProfiles: AdminAttendanceRecord[] = [
      { ...records[0], studentName: "Ada Lovelace", studentEmail: "ada@school.edu" },
      { ...records[1] },
    ];
    render(<AdminAttendanceTable records={withProfiles} />);

    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getAllByText("No profile set")).toHaveLength(1);
  });

  it("renders skeleton loaders while loading", () => {
    const { container } = render(
      <AdminAttendanceTable records={[]} isLoading />
    );
    expect(container.querySelector(".animate-pulse")).not.toBeNull();
  });

  it("shows pagination controls and record counts when pagination is provided", () => {
    render(
      <AdminAttendanceTable
        records={records}
        pagination={pagination}
        onPageChange={() => {}}
      />
    );
    expect(screen.getByText(/Page 1 of 3/)).toBeInTheDocument();
    // the "Showing X–Y of Z records" sentence is split across spans
    expect(
      screen.findAllByText((_, node) =>
        node?.textContent?.includes("of 25 records") ?? false
      )
    ).resolves.not.toHaveLength(0);
    const prev = screen.getByRole("button", { name: /previous/i });
    const next = screen.getByRole("button", { name: /next/i });
    expect(prev).toBeDisabled();
    expect(next).not.toBeDisabled();
  });

  it("calls onPageChange with the next page", () => {
    const onPageChange = vi.fn();
    render(
      <AdminAttendanceTable
        records={records}
        pagination={pagination}
        onPageChange={onPageChange}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it("does not render pagination when pagination is not provided", () => {
    render(<AdminAttendanceTable records={records} />);
    expect(screen.queryByText(/Page 1 of 3/)).not.toBeInTheDocument();
  });

  it("renders an export button and calls onExport", () => {
    const onExport = vi.fn();
    render(<AdminAttendanceTable records={records} onExport={onExport} />);
    fireEvent.click(screen.getByRole("button", { name: /export csv/i }));
    expect(onExport).toHaveBeenCalledTimes(1);
  });
});
