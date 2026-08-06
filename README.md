# 🎓 Student Attendance dApp

Blockchain-powered student attendance tracking with **contract-enforced safeguards**. Students and teachers log in through **separate portals**, teachers create courses and open attendance sessions (with a start time and duration), and **registered students mark attendance from their own wallet** — receiving a real transaction hash for every mark.

Built with **Next.js 16**, **ethers v6**, **Solidity/Foundry**, and **Prisma + PostgreSQL**.

## ✨ Features

### Separate portals
- **`/student` — Student Portal** — connect your wallet, see open attendance sessions with a live countdown, mark attendance (one wallet tx per session), and view your history with a per-course breakdown.
- **`/admin` — Teacher/Admin Portal** — sign in with **MetaMask** or **Google (Gmail)**. Register students, create courses, open/close attendance sessions, and inspect every session's records.

### Admin/teacher-only functions
- **Register a student** — by wallet address *and/or* email *and/or* matric / ID number. A wallet-backed registration is recorded on-chain.
- **Create a course** — course code + course title, recorded on-chain.
- **Open an attendance session** — the dashboard's *set time for attendance* and *set attendance duration* fields map directly to the contract's `openSession(courseId, startTime, duration)` parameters.
- **Close a session early** — before its duration expires.
- **View all registered students and every attendance record for a session.**

### Student-only functions
- **Mark attendance for the currently open session** — only works when the student is registered, the session is open, and the current time is inside `startTime + duration`. The student's **transaction hash is shown on the portal** with a block-explorer link.
- **View their own attendance status** for a session, and their **total count / history across all sessions** (with a per-course breakdown).

### Contract-enforced safeguards (not just frontend)
- Only the admin/teacher can register students, create courses, and open/close sessions (`onlyAdminOrTeacher`).
- Only registered students can mark attendance (`registeredStudents[msg.sender]`).
- No double-marking per session (`hasMarked[sessionId][student]`).
- Sessions become **unclaimable automatically once their duration passes**, even if nobody closes them.
- Every state change emits an event (`StudentRegistered`, `CourseCreated`, `SessionOpened`, `SessionClosed`, `AttendanceMarked`, …) so the dashboards listen for **real-time updates instead of polling**.

## 🧱 Architecture

```
┌────────────────────────────────────────────────────────────┐
│  Frontend (Next.js App Router)                              │
│  WalletProvider → useWallet()                               │
│   ├── /student — Student Portal                             │
│   │    ├── markAttendance(sessionId)  ── student's own tx ─┐│
│   │    └── history / per-course breakdown                  ││
│   └── /admin — Teacher/Admin Portal (wallet or Google)     ││
│        ├── registerStudent / createCourse / openSession    ││
│        └── closeSession (all admin/teacher wallet txs)     ││
└───────────────────────────────────────────────┼────────────┘
                                                ▼
┌────────────────────────────────────────────────────────────┐
│  ProofStorage (source of truth)                             │
│  students · courses · sessions · marks  +  events           │
│  API routes (mirror + index for dashboards):                │
│   /api/student/overview  /api/student/link                 │
│   /api/attendance        /api/admin/{students,courses,     │
│   sessions,teachers,me}  /api/auth/google…                 │
└────────────────────────────────────────────────────────────┘
```

### The contract: `contracts/src/ProofStorage.sol`

- `registerStudent(address)` / `unregisterStudent(address)` — **admin/teacher only**.
- `createCourse(code, name)` — **admin/teacher only**, returns the course id.
- `openSession(courseId, startTime, duration)` — **admin/teacher only**, returns the session id. Marking is only possible while `startTime ≤ now ≤ startTime + duration`.
- `closeSession(sessionId)` — **admin/teacher only** (no-op guard against double close).
- `markAttendance(sessionId)` — **any registered student**, but only during the open window and never twice per session. All checks are in the contract.
- `isStudentRegistered(address)`, `isSessionActive(id)`, `getSession(id)`, `getCourse(id)`, `hasStudentMarked(sessionId, student)` — read-only views used by the frontend.
- Legacy proof store retained for compatibility: `storeProof` / `verifyProof` / `authorizeMarker` / `revokeMarker`.

> **Security model:** the contract is the source of truth for who may mark and when; the database mirrors it (with email/matric metadata) so dashboards are fast. Students send `markAttendance` from their own wallet, so every mark has a real transaction hash they can show.

## 📋 Prerequisites

- **Node.js 20+** (22 recommended) and npm
- **MetaMask** browser extension (for both portals; Google login needs no wallet for read-only admin use)
- **PostgreSQL** (local or hosted, e.g. [Neon](https://neon.tech) / [Supabase](https://supabase.com))
- **Foundry** ([install guide](https://book.getfoundry.sh/getting-started/installation)) — only needed to build/test the Solidity contracts

## 🚀 Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string used by Prisma |
| `PRIVATE_KEY` | Private key of the contract owner/admin — the server uses it to register students who link a pending record and to attest legacy proofs |
| `RPC_URL` | RPC endpoint for the chain the contract is deployed on (e.g. Sepolia via Infura/Alchemy) |
| `NEXT_PUBLIC_PROOF_ADDRESS` | Address of the deployed `ProofStorage` contract (public) |
| `NEXT_PUBLIC_EXPLORER_URL` | *Optional* — block explorer base URL used to link transaction hashes |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | *Optional* — Google OAuth app for the teacher Gmail login (redirect URI: `http://localhost:3000/api/auth/google/callback`) |
| `TEACHER_EMAILS` | *Optional* — comma-separated emails allowed to sign in as teachers via Google |
| `SESSION_SECRET` | *Optional* — secret for teacher session cookies (falls back to a key derived from `PRIVATE_KEY`) |
| `ATTENDANCE_RATE_LIMIT_MAX` / `ATTENDANCE_RATE_LIMIT_WINDOW_MS` | *Optional* — per-wallet rate limiting for `POST /api/attendance` |

### 3. Set up the database

```bash
npx prisma generate   # generate the Prisma client
npx prisma db push    # create tables from the schema (dev only — use migrate in prod)
```

### 4. Deploy the contract

```bash
cd contracts
forge build
# Foundry loads .env from the Foundry project root (contracts/).
# Put PRIVATE_KEY + RPC_URL in a contracts/.env (gitignored) or export them.
forge script script/DeployProofStorage.s.sol --rpc-url $RPC_URL --broadcast
```

Copy the printed contract address into `NEXT_PUBLIC_PROOF_ADDRESS` in the root `.env`.
The deploying account becomes the contract **owner** (the admin).

> To let a teacher open sessions and register students, use the portal's **Teachers** tab (owner signs in → authorize the teacher's wallet + optional Google email). It keeps the on-chain marker registry and the database role in sync, which is what the login gate checks. `cast send ... authorizeMarker` alone would grant on-chain access but not database login access.

> ⚠️ The contract was extended with the course/session ledger — **redeploy it** (the address in `.env` points at the old deployment). If `RPC_URL` / `NEXT_PUBLIC_PROOF_ADDRESS` are missing, the app runs in a degraded mode: marks are recorded off-chain as `pending`.

### 5. Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Students use **Student Portal**, teachers use **Teacher / Admin Portal**.

## 🧪 Testing

```bash
npm test               # frontend (Vitest + Testing Library)
cd contracts && forge test   # contract suite (safeguards, access control, events, expiry)
```

## 🔍 CI

GitHub Actions (`.github/workflows/ci.yml`) runs on every push/PR to `main`:

- **Frontend job:** `npm ci` → `prisma generate` → lint → typecheck → tests → production build
- **Contracts job:** `forge build` → `forge test` → committed ABI drift check

## 🛠️ Teacher / Admin Portal

Teachers sign in with their **wallet** (owner or authorized teacher) or **Google**. Tabs:

- **Overview** — students, courses, open sessions, marks today.
- **Courses** — create course titles (on-chain).
- **Sessions** — set start time + duration and open a session; close early; view who marked each session.
- **Students** — register by wallet/email/matric; pending records are linked by the student from the portal.
- **Teachers** — the admin (owner) authorizes/revokes the teacher role (on-chain) and pairs it with a Google email.
- **Attendance** *(admin-only)* — legacy all-records table with CSV export and pending-attestation retry. Teachers see per-session records under **Sessions** instead.

## ☁️ Deploying the frontend

The app deploys cleanly to **Vercel**:

1. Push the repo to GitHub (include the updated `package-lock.json`).
2. In Vercel, import the repo (framework: Next.js).
3. **Set the build command to `npx prisma generate && next build`** — the Prisma client (`lib/generated/prisma`) is gitignored and must be generated at build time, or the API routes return 503.
4. Add the environment variables from `.env.example`.
5. Point `DATABASE_URL` at your hosted PostgreSQL and run `prisma db push` (or `prisma migrate deploy`).
6. Deploy.

## 📦 Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build (auto-syncs the contract ABI via `prebuild`) |
| `npm run lint` | ESLint |
| `npm test` | Run the Vitest suite |
| `npm run sync:abi` | Regenerate `lib/abis/ProofStorage.json` from forge build output |

## 🗂️ Project Layout

```
app/
  student/                # student portal (separate login URL)
  admin/                  # teacher/admin portal (wallet + Google login)
  api/attendance/         # GET history / POST index student mark tx
  api/student/            # overview, link (claim a pending registration)
  api/admin/              # students, courses, sessions, teachers, attendance, me
  api/auth/               # google OAuth flow + logout + session
components/               # portal components (sessions, breakdown, history, admin panels…)
hooks/                    # useWallet, useStudentOverview, useTeacherStatus
lib/
  abis/                   # committed ProofStorage ABI
  auth.ts                 # wallet sigs + teacher sessions (cookie) + Google email checks
  proof.ts                # server-side on-chain helpers (verify mark, register student…)
  contract.ts             # browser contract helpers (view calls, event parsing)
contracts/                # Foundry project (src / test / script)
prisma/schema.prisma      # data model (User, Course, Session, Attendance)
```

## 🔜 Roadmap

- QR / geolocation-based attendance challenges
- Calendar view for attendance history
- Email/notification reminders

## 📄 License

No license file is included in this repository. Reach out to the project owner before reusing this code.
