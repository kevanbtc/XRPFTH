import request from 'supertest';
import express from 'express';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import { body, validationResult } from 'express-validator';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import cors from 'cors';

// Import your API routes and services
import healthRouter from '../src/api/health';
import porRouter from '../src/api/por';
import { MemberService } from '../src/services/app/MemberService';
import { BalanceService } from '../src/services/app/BalanceService';
import { GoldOrderAppService } from '../src/services/app/GoldOrderAppService';
import { PorAppService } from '../src/services/app/PorAppService';
import { AdminService } from '../src/services/app/AdminService';
import { getLedgerTransactions, clearLedgerTransactions, saveLedgerTransaction, LedgerType, Direction, TxStatus } from '../src/services/db';
import { KYCService, KYCStatus } from '../src/services/KYCService';
import { getXRPLService } from '../src/services/xrpl';
import { getEVMService } from '../src/services/evm';
import { TreasuryService } from '../src/services/treasury/TreasuryService';
import { PoRComposer } from '../src/services/por/PoRComposer';

dotenv.config();

const app = express();
const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretjwtkey';

// Initialize app services
const memberService = new MemberService();
const balanceService = new BalanceService();
const goldOrderAppService = new GoldOrderAppService();
const porAppService = new PorAppService();
const adminService = new AdminService();
const kycService = new KYCService();
const xrplService = getXRPLService();
const evmService = getEVMService();
const treasuryService = new TreasuryService();
const porComposer = new PoRComposer();

// --- API Security Hardening (same as in src/api/index.ts) ---
app.use(morgan('tiny')); // Use 'tiny' for less verbose logging in tests

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many authentication attempts from this IP, please try again after 15 minutes',
});

const apiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 1000,
  message: 'Too many requests from this IP, please try again after an hour',
});

const corsOptions = {
  origin: ['http://localhost:3001', 'https://fthusd.com', 'https://myusdf.com'],
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  credentials: true,
  optionsSuccessStatus: 204,
};
app.use(cors(corsOptions));

app.use(express.json());

// Use the new API routes
app.use('/health', healthRouter);
app.use('/por', porRouter);

// Middleware for JWT authentication (same as in src/api/index.ts)
// Extend the Express Request type to include the 'user' property
declare module 'express' {
  interface Request {
    user?: {
      name: string;
      role: string;
      memberId: string;
    };
  }
}

const authenticateToken = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token == null) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) return res.sendStatus(403);
    req.user = user; // Attach user payload to request
    next();
  });
};

// Define API routes (same as in src/api/index.ts)
app.get('/api/v1/', apiLimiter, (req: express.Request, res: express.Response) => {
  res.send('FTH API v1 is running!');
});

app.post(
  '/api/v1/auth/register',
  authLimiter,
  [
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters long'),
    body('xrplAddress').notEmpty().withMessage('XRPL address is required'),
    body('evmAddress').notEmpty().withMessage('EVM address is required'),
  ],
  async (req: express.Request, res: express.Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const { email, password, xrplAddress, evmAddress } = req.body;
    try {
      const newMember = await memberService.registerMember(email, password, xrplAddress, evmAddress);
      res.status(200).json({ message: 'Registration successful, KYC initiated.', memberId: newMember.memberId });
    } catch (error: any) {
      console.error('Error during registration:', error);
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }
);

app.post(
  '/api/v1/auth/login',
  authLimiter,
  [
    body('username').notEmpty().withMessage('Username is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  (req: express.Request, res: express.Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { username, password } = req.body;
    if (username === 'admin' && password === 'password') {
      const user = { name: username, role: 'admin', memberId: 'admin-1' };
      const accessToken = jwt.sign(user, JWT_SECRET, { expiresIn: '1h' });
      res.json({ accessToken: accessToken });
    } else if (username === 'test@example.com' && password === 'password') {
      const user = { name: username, role: 'member', memberId: 'member-123' };
      const accessToken = jwt.sign(user, JWT_SECRET, { expiresIn: '1h' });
      res.json({ accessToken: accessToken });
    }
    else {
      res.status(401).send('Invalid credentials');
    }
  }
);

app.use('/api/v1', authenticateToken);

app.get('/api/v1/me', apiLimiter, async (req: express.Request, res: express.Response) => {
  try {
    const memberId = req.user?.memberId;
    if (!memberId) {
      return res.status(401).json({ error: 'Unauthorized', details: 'Member ID not found in token' });
    }
    const memberProfile = await memberService.getMemberProfile(memberId);
    if (!memberProfile) {
      return res.status(404).json({ error: 'Member not found' });
    }
    res.json(memberProfile);
  } catch (error: any) {
    console.error('Error fetching member profile:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

app.get('/api/v1/me/balances', apiLimiter, async (req: express.Request, res: express.Response) => {
  try {
    const memberId = req.user?.memberId;
    if (!memberId) {
      return res.status(401).json({ error: 'Unauthorized', details: 'Member ID not found in token' });
    }
    const balances = await balanceService.getMemberBalances(memberId);
    if (!balances) {
      return res.status(404).json({ error: 'Balances not found for member' });
    }
    res.json(balances);
  } catch (error: any) {
    console.error('Error fetching member balances:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

app.get('/api/v1/me/gold-orders', apiLimiter, async (req: express.Request, res: express.Response) => {
  try {
    const memberId = req.user?.memberId;
    if (!memberId) {
      return res.status(401).json({ error: 'Unauthorized', details: 'Member ID not found in token' });
    }
    const goldOrders = await goldOrderAppService.listMemberOrders(memberId);
    res.json(goldOrders);
  } catch (error: any) {
    console.error('Error fetching gold orders:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

app.post(
  '/api/v1/gold-orders',
  apiLimiter,
  [
    body('quantityOunces').isFloat({ gt: 0 }).withMessage('Gold quantity must be a positive number'),
  ],
  async (req: express.Request, res: express.Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    try {
      const memberId = req.user?.memberId;
      if (!memberId) {
        return res.status(401).json({ error: 'Unauthorized', details: 'Member ID not found in token' });
      }
      const { quantityOunces } = req.body;
      const result = await goldOrderAppService.createGoldOrder(memberId, quantityOunces);
      res.status(200).json(result);
    } catch (error: any) {
      console.error('Error placing gold order:', error);
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }
);

app.get('/api/v1/admin/overview', authenticateToken, apiLimiter, async (req: express.Request, res: express.Response) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden', details: 'Admin access required' });
    }
    const overview = await adminService.getOverview();
    res.json(overview);
  } catch (error: any) {
    console.error('Error fetching admin overview:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

app.get('/api/v1/admin/ledger', authenticateToken, apiLimiter, async (req: express.Request, res: express.Response) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden', details: 'Admin access required' });
    }
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const flowType = req.query.flowType as string;
    const memberId = req.query.memberId as string;

    const ledgerData = await adminService.getPaginatedLedgerTransactions(page, limit, flowType, memberId);
    res.json(ledgerData);
  } catch (error: any) {
    console.error('Error fetching paginated ledger transactions:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

describe('Hero Journey - API Level End-to-End', () => {
  let memberAccessToken: string;
  let adminAccessToken: string;
  const testMemberEmail = 'test@example.com';
  const testMemberPassword = 'password';
  const testMemberXRPLAddress = process.env.TEST_MEMBER_XRPL_ADDRESS || 'rTESTMEMBERXRPLADDRESS';
  const testMemberEVMWallet = process.env.TEST_MEMBER_EVM_WALLET || '0xTESTMEMBEREVMWALLET';
  let testMemberId: string;

  beforeAll(async () => {
    // Clear DB and connect services
    await clearLedgerTransactions();
    await xrplService.connect();
    await evmService['provider'].ready;

    // Register a test member
    await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: testMemberEmail,
        password: testMemberPassword,
        xrplAddress: testMemberXRPLAddress,
        evmAddress: testMemberEVMWallet,
      })
      .expect(200);

    // Login as member
    const memberLoginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: testMemberEmail, password: testMemberPassword })
      .expect(200);
    memberAccessToken = memberLoginRes.body.accessToken;

    // Login as admin
    const adminLoginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'admin', password: 'password' })
      .expect(200);
    adminAccessToken = adminLoginRes.body.accessToken;

    // Get memberId from profile
    const meRes = await request(app)
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${memberAccessToken}`)
      .expect(200);
    testMemberId = meRes.body.memberId;

    // Simulate KYC approval for the test member
    await kycService.approveMember({
      memberId: testMemberId,
      walletAddress: testMemberEVMWallet,
      status: KYCStatus.Approved,
      jurisdictionCode: 784,
      flags: 0n,
    });
  });

  afterAll(async () => {
    await xrplService.disconnect();
    await prisma.$disconnect();
  });

  it('should complete the full member hero journey via API endpoints', async () => {
    // 1. Check initial balances (should be 0)
    const initialBalancesRes = await request(app)
      .get('/api/v1/me/balances')
      .set('Authorization', `Bearer ${memberAccessToken}`)
      .expect(200);
    expect(initialBalancesRes.body.fthusd.amount).toBe('0');
    expect(initialBalancesRes.body.usdf.amount).toBe('0');

    // 2. Simulate FTHUSD deposit (direct XRPL service call for simplicity in test)
    await xrplService.creditFTHUSD(testMemberXRPLAddress, '1000', `deposit-${Date.now()}`);
    await saveLedgerTransaction({
      id: `deposit-tx-${Date.now()}`,
      ledger: LedgerType.XRPL,
      flow: 'fthusd_deposit',
      direction: Direction.INBOUND,
      member: { connect: { memberId: testMemberId } }, // Connect to existing member
      wallet: testMemberXRPLAddress,
      txHash: 'mock_tx_hash_deposit',
      status: TxStatus.CONFIRMED,
      payloadSummary: JSON.stringify({ amount: '1000', currency: 'FTHUSD' }),
    });

    // Verify balances updated
    const balancesAfterDepositRes = await request(app)
      .get('/api/v1/me/balances')
      .set('Authorization', `Bearer ${memberAccessToken}`)
      .expect(200);
    expect(parseFloat(balancesAfterDepositRes.body.fthusd.amount)).toBeGreaterThan(0);

    // 3. Run PoR snapshot (direct service call)
    const asOf = new Date();
    const snapshotInput = await treasuryService.buildSnapshotInput(asOf);
    await porComposer.publishSnapshot(snapshotInput);

    // Verify latest PoR via API
    const porRes = await request(app)
      .get('/por/latest')
      .expect(200);
    expect(porRes.body.latestPoR.coverageRatio).toBeGreaterThanOrEqual(100);

    // 4. Simulate USDF bonus issuance (direct XRPL service call)
    await xrplService.issueUSDFBonus(testMemberXRPLAddress, '50', `bonus-${Date.now()}`, new Date().toISOString());
    await saveLedgerTransaction({
      id: `bonus-tx-${Date.now()}`,
      ledger: LedgerType.XRPL,
      flow: 'bonus_issue',
      direction: Direction.OUTBOUND,
      member: { connect: { memberId: testMemberId } }, // Connect to existing member
      wallet: testMemberXRPLAddress,
      txHash: 'mock_tx_hash_bonus',
      status: TxStatus.CONFIRMED,
      payloadSummary: JSON.stringify({ amountUSDF: '50', currency: 'USDF' }),
    });

    // Verify USDF balance updated
    const balancesAfterBonusRes = await request(app)
      .get('/api/v1/me/balances')
      .set('Authorization', `Bearer ${memberAccessToken}`)
      .expect(200);
    expect(parseFloat(balancesAfterBonusRes.body.usdf.amount)).toBeGreaterThan(0);

    // 5. Place a gold order via API
    const goldOrderRes = await request(app)
      .post('/api/v1/gold-orders')
      .set('Authorization', `Bearer ${memberAccessToken}`)
      .send({ quantityOunces: '0.1' })
      .expect(200);
    expect(goldOrderRes.body.message).toBe('Gold order placed successfully.');
    expect(goldOrderRes.body.orderId).toBeDefined();

    // Verify gold order in list via API
    const goldOrdersRes = await request(app)
      .get('/api/v1/me/gold-orders')
      .set('Authorization', `Bearer ${memberAccessToken}`)
      .expect(200);
    expect(goldOrdersRes.body.length).toBeGreaterThan(0);
    expect(goldOrdersRes.body[0].orderId).toBe(goldOrderRes.body.orderId);

    // 6. Check admin overview
    const adminOverviewRes = await request(app)
      .get('/api/v1/admin/overview')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(200);
    expect(adminOverviewRes.body.totalMembers).toBeGreaterThanOrEqual(1);
    expect(parseFloat(adminOverviewRes.body.fthusdSupply)).toBeGreaterThan(0);
    expect(adminOverviewRes.body.goldOrdersOutstanding).toBeGreaterThanOrEqual(1);
    expect(adminOverviewRes.body.latestPoR.coverageRatio).toBeGreaterThanOrEqual(100);

    // 7. Check admin ledger
    const adminLedgerRes = await request(app)
      .get('/api/v1/admin/ledger')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(200);
    expect(adminLedgerRes.body.transactions.length).toBeGreaterThan(0);
    expect(adminLedgerRes.body.transactions.some((tx: any) => tx.flow === 'fthusd_deposit')).toBe(true);
  });
});
