# FTH Program - Complete Implementation Guide

## 🚀 What's Been Built

This repository contains the **complete, production-ready** FTH (Financial Technology Hub) Program infrastructure:

### ✅ Core Systems Implemented

1. **USDF Rewards Engine** (`src/services/rewards/USDFRewardsEngine.ts`)
   - Tenure-based reward calculation (2-8% annual based on account age)
   - Tier multipliers (1.0x to 2.5x)
   - Activity bonuses from gold purchases
   - Quarterly batch accrual job

2. **Membership NFT Service** (`src/services/nft/MembershipNFTService.ts`)
   - XLS-20 NFT minting on XRPL
   - Metadata encoding (handle, tier, benefits)
   - Tier verification and upgrades
   - NFT transfer logic

3. **US Banking Adapter** (`src/services/banking/USBankingAdapter.ts`)
   - ACH deposit/withdrawal processing
   - Wire transfer support
   - 2% exit fee for balances < 90 days
   - Bank account linking and verification
   - Reconciliation webhooks

4. **Dashboard API** (`src/api/dashboard.ts`)
   - Unified `/v1/member/dashboard` endpoint
   - Aggregates: member identity, balances, transactions, metals, PoR, NFT
   - Powers the Command Hub UI

5. **Enhanced Database Schema** (`prisma/schema.prisma`)
   - `Member` with USDF/FTHUSD balances
   - `MembershipNFT` for XLS-20 tokens
   - `USBankAccount` for US-only banking
   - `PorSnapshot` for reserve tracking
   - Enhanced `LedgerTransaction` with metadata

### 📊 Complete Documentation

1. **Flowcharts & Diagrams** (`docs/FLOWCHARTS_AND_DIAGRAMS.md`)
   - 8 comprehensive Mermaid diagrams
   - User journey flows (onboarding, deposit, withdrawal, transfer, gold purchase, rewards)
   - Data flow diagrams (FTHUSD lifecycle, PoR pipeline, NFT minting)
   - Integration flows (XRPL, banking, EVM)
   - System component tree
   - Performance benchmarks

2. **Deployment Scripts**
   - `scripts/migrate-db.ps1` - Database migration
   - `scripts/deploy.ps1` - Complete environment setup
   - `docker-compose.yml` - Full infrastructure stack
   - `.env.example` - Configuration template

---

## 📋 Quick Start

### Prerequisites

- **Node.js** 18+ ([download](https://nodejs.org/))
- **Docker Desktop** ([download](https://www.docker.com/products/docker-desktop))
- **PostgreSQL** 15+ (via Docker or local)
- **Git** ([download](https://git-scm.com/))

### Installation

```powershell
# Clone repository
git clone https://github.com/kevanbtc/XRPFTH.git
cd fth-program-specs

# Run automated deployment
.\scripts\deploy.ps1
```

The deployment script will:
1. ✅ Check prerequisites
2. ✅ Create `.env` from template
3. ✅ Install npm dependencies
4. ✅ Start Docker services (PostgreSQL, Redis)
5. ✅ Run database migrations
6. ✅ Generate Prisma Client
7. ✅ Build application

### Manual Setup (Alternative)

```powershell
# 1. Environment setup
cp .env.example .env
# Edit .env with your credentials

# 2. Install dependencies
npm install

# 3. Start Docker services
docker-compose up -d postgres redis

# 4. Run migrations
npx prisma migrate dev

# 5. Generate Prisma Client
npx prisma generate

# 6. Build
npm run build
```

---

## 🎯 Running the System

### Development Mode

```powershell
# Terminal 1: Start API server
npm run dev

# Terminal 2: Start cron scheduler
npm run cron

# Terminal 3: Watch logs
docker-compose logs -f api
```

### Production Mode

```powershell
# Build for production
npm run build

# Start all services
docker-compose up -d

# View logs
docker-compose logs -f
```

---

## 📡 API Endpoints

### Dashboard

```bash
GET /v1/member/dashboard
```

Returns complete Command Hub data:
- Member identity & tier
- FTHUSD & USDF balances
- Recent transactions (last 10)
- Metals holdings & current prices
- PoR status (coverage ratio, last updated)
- Membership NFT metadata
- Quick action permissions

**Example Response:**

```json
{
  "member": {
    "memberId": "mem_123",
    "handle": "founder.fth",
    "email": "founder@example.com",
    "membershipTier": "ELITE",
    "kycStatus": "APPROVED",
    "verified": true,
    "xrplAddress": "rN7n7otQ...",
    "evmWallet": "0x..."
  },
  "balances": {
    "fthusd": { "amount": 125000, "currency": "FTHUSD", "backed": "1:1 USD Backed" },
    "usdf": { "amount": 3450, "currency": "USDF", "redeemable": false }
  },
  "recentTransactions": [...],
  "metals": {
    "currentPrices": { "gold": 2047.5, "silver": 24.85, "platinum": 925.0 },
    "holdings": [...],
    "totalHoldingsValue": 6262.5
  },
  "membershipNft": {
    "nftTokenId": "NFT-FTH-001",
    "tier": "ELITE",
    "benefits": { "feeDiscount": 35, "rewardsMultiplier": 2.0, "goldDiscount": 12 }
  },
  "proofOfReserves": {
    "totalIssued": 15000000,
    "totalBacking": 15720000,
    "coverageRatio": 1.048,
    "lastUpdated": "2025-11-08T07:59:00Z",
    "status": "HEALTHY"
  }
}
```

### Other Endpoints

- `GET /v1/balances` - Get FTHUSD/USDF balances
- `GET /v1/transactions/recent` - Recent transaction history
- `POST /v1/transfer` - Internal XRPL transfer
- `POST /v1/deposit` - Initiate ACH/Wire deposit
- `POST /v1/withdraw` - Initiate withdrawal with fee calculation
- `GET /v1/metals/holdings` - Get metal holdings
- `POST /v1/metals/purchase` - Purchase gold/silver/platinum
- `GET /v1/por/latest` - Latest Proof of Reserves
- `GET /v1/nft/membership` - Membership NFT metadata

---

## 🔄 Cron Jobs

### USDF Rewards Accrual

**Schedule:** Quarterly (every 3 months)  
**Cron:** `0 0 1 */3 *`

```typescript
import { USDFRewardsEngine } from './src/services/rewards/USDFRewardsEngine';

const rewardsEngine = new USDFRewardsEngine();
await rewardsEngine.batchAccrueRewards();
```

### PoR Snapshot

**Schedule:** Every 10 minutes  
**Cron:** `*/10 * * * *`

```typescript
import { PorAppService } from './src/services/app/PorAppService';

const porService = new PorAppService();
await porService.captureSnapshot();
```

---

## 🗄️ Database Schema

### Key Models

**Member**
- FTHUSD balance (cached)
- USDF balance (rewards credits)
- Membership tier (BRONZE, SILVER, GOLD, ELITE, PLATINUM)
- Membership NFT ID
- Last rewards accrual timestamp
- US bank account linked status

**MembershipNFT**
- XRPL NFT Token ID
- Handle (e.g., founder.fth)
- Tier & benefits metadata
- Minted timestamp

**LedgerTransaction**
- All balance movements (deposits, withdrawals, transfers, rewards, fees)
- XRPL transaction hash
- Related order ID (for gold purchases)
- Metadata (JSON for extensibility)

**GoldOrder**
- Metal type (GOLD, SILVER, PLATINUM, PALLADIUM)
- Ounces purchased
- Discount applied (tier-based)
- USDF credits used
- Fulfillment status

**USBankAccount**
- Account number (encrypted)
- Routing number
- Verification status
- Primary account flag

**PorSnapshot**
- Total FTHUSD issued
- Total USD backing
- Coverage ratio (e.g., 104.8%)
- Merkle root for member verification
- EVM anchoring status

---

## 🎨 System Flows

All flows are documented with Mermaid diagrams in `docs/FLOWCHARTS_AND_DIAGRAMS.md`:

1. **Member Onboarding Flow** - KYC → Wallet → NFT → Bank Linking
2. **ACH Deposit Flow** - Initiate → Pending → Webhook → Mint FTHUSD
3. **Withdrawal Flow** - Amount → Fee Calculation → Deduct → Bank Transfer
4. **Internal Transfer Flow** - Resolve Handle → XRPL Payment → Update Balances
5. **Gold Purchase Flow** - Select → Discount → USDF → Deduct → Fulfill
6. **USDF Rewards Accrual Flow** - Calculate → Mint → Log
7. **PoR Pipeline** - Aggregate → Calculate → Store → Anchor EVM
8. **NFT Minting** - Metadata → Mint → Store → Transfer

---

## 🔐 Security Features

### Multi-Signature Wallets
- **3-of-5** for FTHUSD issuer wallet
- **2-of-3** for operations wallet

### XRPL Security Flags
- **RequireAuth** - Only approved members can hold FTHUSD
- **NoRipple** - Prevent cross-currency rippling
- **DEX Prevention** - Block speculative trading

### Exit Fee Logic
- **2% fee** if balance held < 90 days
- Weighted average age calculation
- Transparent fee disclosure before withdrawal

### Banking Security
- US-only accounts (jurisdiction enforcement)
- Micro-deposit verification
- Encrypted account numbers
- Reconciliation webhooks

### API Security
- JWT authentication
- Rate limiting (100 req/15min)
- Request validation
- CORS configuration

---

## 📊 Monitoring & Operations

### Prometheus Metrics

Access at `http://localhost:9090`

- API response times
- Transaction throughput
- PoR coverage ratio
- XRPL confirmation times
- Database query latency

### Grafana Dashboards

Access at `http://localhost:3001`

Default credentials: `admin / admin_change_in_prod`

Pre-configured dashboards:
- System Overview
- API Performance
- XRPL Metrics
- PoR Tracking
- User Activity

### PgAdmin (Database Management)

Access at `http://localhost:5050`

Default credentials: `admin@fth.finance / admin_change_in_prod`

---

## 🧪 Testing

### Run Tests

```powershell
# All tests
npm test

# Unit tests only
npm run test:unit

# Integration tests
npm run test:integration

# E2E tests
npm run test:e2e

# Test coverage
npm run test:coverage
```

### Test Structure

```
tests/
├── unit/
│   ├── rewards/
│   │   └── USDFRewardsEngine.test.ts
│   ├── nft/
│   │   └── MembershipNFTService.test.ts
│   └── banking/
│       └── USBankingAdapter.test.ts
├── integration/
│   ├── api/
│   │   └── dashboard.test.ts
│   └── xrpl/
│       └── payment.test.ts
└── e2e/
    ├── onboarding.test.ts
    ├── deposit-withdrawal.test.ts
    └── gold-purchase.test.ts
```

---

## 🌍 Environment Configuration

### Required Environment Variables

```bash
# Database
DATABASE_URL=postgresql://...

# XRPL
XRPL_SERVER_URL=wss://s.altnet.rippletest.net:51233
FTHUSD_ISSUER_SEED=sEd...
NFT_ISSUER_SEED=sEd...

# EVM
EVM_RPC_URL=https://sepolia.infura.io/v3/...
EVM_PRIVATE_KEY=0x...
POR_REGISTRY_ADDRESS=0x...

# Banking (Production)
BANKING_PROVIDER=PLAID
PLAID_CLIENT_ID=...
PLAID_SECRET=...

# Security
JWT_SECRET=...
VAULT_TOKEN=...

# Monitoring
SENTRY_DSN=...
```

See `.env.example` for complete list.

---

## 📦 Docker Services

```powershell
# Start all services
docker-compose up -d

# Start specific services
docker-compose up -d postgres redis

# View logs
docker-compose logs -f api

# Stop all services
docker-compose down

# Clean everything (including volumes)
docker-compose down -v
```

---

## 🚢 Deployment Checklist

### Pre-Deployment

- [ ] Update `.env` with production credentials
- [ ] Review XRPL issuer wallet seeds (NEVER commit!)
- [ ] Configure EVM contract addresses
- [ ] Set up Chainlink price feeds
- [ ] Configure US banking provider (Plaid/Stripe)
- [ ] Set up KYC provider (Onfido/Jumio)
- [ ] Configure email service (SendGrid)
- [ ] Set up Vault for secret management
- [ ] Review rate limits and security settings

### Database

- [ ] Run migrations on production DB
- [ ] Create database backups
- [ ] Set up automated backup schedule (every 6 hours)
- [ ] Test disaster recovery procedures

### XRPL

- [ ] Deploy issuer wallet on mainnet
- [ ] Fund issuer wallet with XRP
- [ ] Set RequireAuth and NoRipple flags
- [ ] Test trustline creation
- [ ] Verify DEX prevention

### EVM

- [ ] Deploy PoR Registry contract
- [ ] Verify contract on Etherscan
- [ ] Configure Chainlink oracle addresses
- [ ] Test EVM anchoring

### Monitoring

- [ ] Configure Prometheus alerts
- [ ] Set up Grafana dashboards
- [ ] Configure PagerDuty/Opsgenie
- [ ] Test alerting (undercollateralization, API failures)

### Security

- [ ] Run security audit
- [ ] Penetration testing
- [ ] Review multi-sig configurations
- [ ] Test exit fee calculations
- [ ] Verify KYC enforcement

### Launch

- [ ] Deploy to staging environment
- [ ] Run smoke tests
- [ ] Load testing (1000+ concurrent users)
- [ ] Deploy to production
- [ ] Monitor for 24 hours
- [ ] Announce launch

---

## 📚 Documentation Links

- [README](../README.md) - Main repository overview
- [Flowcharts & Diagrams](./FLOWCHARTS_AND_DIAGRAMS.md) - Complete system flows
- [Investor Memo](./INVESTOR_MEMO.md) - Investment case & GTM strategy
- [Website PRD](./WEBSITE_PRD_FOR_SPARK.md) - Marketing page requirements
- [Infrastructure Overview](./INFRASTRUCTURE_OVERVIEW.md) - Ops & topology
- [Architecture Diagrams](./DIAGRAMS.md) - Color-coded system diagrams

---

## 🤝 Contributing

### Development Workflow

1. Create feature branch: `git checkout -b feature/my-feature`
2. Make changes and test: `npm test`
3. Commit: `git commit -m "feat: add feature"`
4. Push: `git push origin feature/my-feature`
5. Create pull request on GitHub

### Commit Message Format

```
<type>(<scope>): <subject>

Types: feat, fix, docs, style, refactor, test, chore
Scopes: api, xrpl, evm, banking, rewards, nft, por, etc.

Examples:
feat(rewards): add quarterly USDF accrual job
fix(banking): correct exit fee calculation for < 90 days
docs(flowcharts): add gold purchase flow diagram
```

---

## 🆘 Support & Troubleshooting

### Common Issues

**Database connection failed**
```powershell
# Restart PostgreSQL
docker-compose restart postgres

# Check logs
docker-compose logs postgres
```

**Prisma Client out of sync**
```powershell
# Regenerate Prisma Client
npx prisma generate
```

**XRPL connection timeout**
```powershell
# Check XRPL server URL in .env
# Try alternative server:
XRPL_SERVER_URL=wss://xrplcluster.com
```

**Exit fee incorrect**
```powershell
# Verify deposit timestamps in database
# Check weighted average age calculation in USBankingAdapter
```

### Getting Help

- GitHub Issues: [github.com/kevanbtc/XRPFTH/issues](https://github.com/kevanbtc/XRPFTH/issues)
- Email: support@fth.finance
- Discord: [discord.gg/fth](https://discord.gg/fth)

---

## 📄 License

MIT License - See [LICENSE](../LICENSE) for details

---

**Built with ❤️ by the FTH Finance Team**  
**For 400k accredited investors ready to build the future of fiat-backed finance on XRPL**
