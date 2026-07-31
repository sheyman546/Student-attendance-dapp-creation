# Student Attendance dApp

Secure, transparent, and immutable attendance tracking powered by Ethereum smart contracts. Every attendance record is verified and stored on-chain as an unforgeable proof of participation.

## Architecture

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16 + React 19 + Tailwind CSS |
| Smart Contracts | Solidity (Foundry) |
| Blockchain | Ethereum (EVM-compatible) |
| Database | PostgreSQL + Prisma |
| Web3 | ethers.js v6 |

## Getting Started

### Prerequisites

- **Node.js** 18+
- **Foundry** — [install guide](https://book.getfoundry.sh/getting-started/installation)
- **PostgreSQL** — or use [Supabase](https://supabase.com/) / [Neon](https://neon.tech/)
- **MetaMask** browser extension

### 1. Clone & Install

```bash
git clone https://github.com/sheyman546/Student-attendance-dapp-creation.git
cd Student-attendance-dapp-creation

# Install frontend dependencies
npm install
```

### 2. Environment Variables

```bash
cp .env.example .env.local
```

Edit `.env.local` and fill in your values:

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_PROOF_ADDRESS` | Deployed `ProofStorage` contract address |
| `NEXT_PUBLIC_RPC_URL` | RPC endpoint (Alchemy, Infura, or `http://localhost:8545`) |
| `DATABASE_URL` | PostgreSQL connection string |
| `PRIVATE_KEY` | Deployer wallet private key (for Foundry scripts) |

### 3. Compile Smart Contracts

```bash
cd contracts
forge build
```

### 4. Run Tests

```bash
forge test -vvv
# 27 tests — all should pass
```

### 5. Deploy the Contract

```bash
# Create a .env file in contracts/ with your PRIVATE_KEY
forge script script/DeployProofStorage.s.sol --rpc-url <RPC_URL> --broadcast
```

Copy the deployed contract address into `.env.local` as `NEXT_PUBLIC_PROOF_ADDRESS`.

### 6. Database

```bash
npx prisma generate
npx prisma db push
```

### 7. Run the Dev Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Smart Contract

### `ProofStorage.sol`

Stores immutable attendance proofs on-chain with instructor role gating.

| Function | Access | Purpose |
|----------|--------|---------|
| `markAttendance(student, courseId, hash)` | Instructor | Record attendance |
| `storeProof(hash)` | Public (legacy) | Self-report attendance |
| `verifyProof(hash)` | Public | Check if proof exists |
| `getStudentRecords(student)` | Public | List all proofs for a student |
| `getStudentRecordCount(student)` | Public | Count records for a student |
| `setInstructor(address, bool)` | Admin | Grant/revoke instructor role |
| `transferAdmin(address)` | Admin | Transfer admin role |

### Events

- `AttendanceMarked(bytes32, address, string, uint256, address)`
- `InstructorSet(address, bool)`
- `AdminTransferred(address, address)`

## Project Structure

```
.
├── app/                    # Next.js pages
│   ├── page.tsx            # Landing page
│   ├── dashboard/          # Attendance dashboard
│   └── api/                # API routes
├── components/             # React components
│   ├── MarkAttendance.tsx  # Contract interaction
│   ├── AttendanceList.tsx  # History table
│   ├── AttendanceStats.tsx # Stats cards
│   ├── Navbar.tsx          # Navigation + wallet
│   ├── WalletConnect.tsx   # Wallet connection
│   └── ProtectedRoute.tsx  # Auth guard
├── contracts/
│   ├── src/
│   │   └── ProofStorage.sol
│   ├── test/
│   │   └── ProofStorage.t.sol
│   └── script/
│       └── DeployProofStorage.s.sol
├── lib/
│   ├── contract.ts          # Contract interaction
│   ├── web3.ts              # Wallet connection
│   └── prisma.ts            # Database client
├── prisma/
│   └── schema.prisma
├── hooks/
│   └── useWallet.tsx        # Wallet context
└── .env.example
```
