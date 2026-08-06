import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import StudentHistoryTable from "../StudentHistoryTable";
import type { AttendanceRecord } from "@/types/attendance";

const records: AttendanceRecord[] = [
  {
    id: "1",
    date: "2026-07-28T09:00:00Z",
    txHash: "0x7a9f3c8d2e1b5a4f6c0d8e3f2a1b9c7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a1b",
    hashProof: "0x7a9f3c8d2e1b5a4f6c0d8e3f2a1b9c7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a1b",
    courseCode: "CS101",
    courseName: "Blockchain Basics",
    sessionId: "s1",
    status: "confirmed",
  },
  {
    id: "2",
    date: "2026-07-27T09:00:00Z",
    txHash: null,
    hashProof: null,
    courseCode: "MATH201",
    courseName: "Calculus II",
    sessionId: "s2",
    status: "pending",
  },
];

describe("StudentHistoryTable", () => {
  it("shows an empty state when there are no records", () => {
    render(<StudentHistoryTable records={[]} />);
    expect(screen.getByText("No attendance records yet")).toBeInTheDocument();
  });

  it("renders course codes and transaction hashes", () => {
    render(<StudentHistoryTable records={records} />);
    expect(screen.getByText("CS101")).toBeInTheDocument();
    expect(screen.getByText("Blockchain Basics")).toBeInTheDocument();
    expect(screen.getByText("Calculus II")).toBeInTheDocument();
    // truncated tx hash (10 head / 6 tail)
    expect(screen.getByText("0x7a9f3c8d...3f2a1b")).toBeInTheDocument();
    expect(screen.getByText("No on-chain tx")).toBeInTheDocument();
    expect(screen.getByText("Confirmed")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
  });

  it("renders skeleton loaders while loading", () => {
    const { container } = render(<StudentHistoryTable records={[]} isLoading />);
    expect(container.querySelector(".animate-pulse")).not.toBeNull();
  });
});
