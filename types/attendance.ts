export type AttendanceStatus = "confirmed" | "pending" | "failed";

export interface AttendanceRecord {
  id: string;
  date: string;
  txHash: string | null;
  hashProof: string | null;
  courseCode: string | null;
  courseName: string | null;
  sessionId: string | null;
  status: AttendanceStatus;
}

export interface AdminAttendanceRecord extends AttendanceRecord {
  wallet: string;
  studentName?: string | null;
  studentEmail?: string | null;
}

export interface SessionInfo {
  id: string;
  courseCode: string;
  courseName: string;
  startTime: string;
  durationSeconds: number;
  closed: boolean;
  /** Claimable right now: open, not closed, within start..start+duration. */
  isActive: boolean;
  /** startTime has passed (whether or not it has ended). */
  hasStarted: boolean;
  /** startTime + duration has passed. */
  ended: boolean;
  markedByMe: boolean;
  myTxHash?: string | null;
  attendanceCount?: number;
  onChainId?: number | null;
}

export interface CourseSummary {
  id: string;
  code: string;
  name: string;
  onChainId?: number | null;
  sessionCount?: number;
}

export interface CourseBreakdown {
  courseCode: string;
  courseName: string;
  attended: number;
}

export interface StudentProfile {
  name: string | null;
  email: string | null;
  matricNo: string | null;
}

export interface StudentOverview {
  registered: boolean;
  profile: StudentProfile | null;
  activeSessions: SessionInfo[];
  upcomingSessions: SessionInfo[];
  history: AttendanceRecord[];
  breakdown: CourseBreakdown[];
  totals: {
    attended: number;
    attendanceRate: number; // 0..100
  };
}

export interface AdminStudentRecord {
  id: string;
  name: string | null;
  email: string | null;
  wallet: string | null;
  matricNo: string | null;
  isRegistered: boolean;
  role: string;
  createdAt: string;
  attendanceCount: number;
}

export interface TeacherStatus {
  isAdmin: boolean;
  isTeacher: boolean;
  ownerAddress: string | null;
  teacherEmail: string | null;
}
