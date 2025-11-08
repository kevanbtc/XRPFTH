import express from 'express';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv'; // Keep dotenv import
dotenv.config(); // Explicitly load .env at the very beginning
console.log('EVM_CHAIN_ID:', process.env.EVM_CHAIN_ID);
console.log('EVM_RPC_URL:', process.env.EVM_RPC_URL);
console.log('EVM_FTH_ORACLE_AGGREGATOR:', process.env.EVM_FTH_ORACLE_AGGREGATOR);
console.log('EVM_POR_REGISTRY_ADDRESS:', process.env.EVM_POR_REGISTRY_ADDRESS);
console.log('EVM_COMPLIANCE_REGISTRY_ADDRESS:', process.env.EVM_COMPLIANCE_REGISTRY_ADDRESS);
console.log('EVM_XRPL_BRIDGE_ADDRESS:', process.env.EVM_XRPL_BRIDGE_ADDRESS);
console.log('EVM_OPERATOR_PK:', process.env.EVM_OPERATOR_PK ? '******' : 'NOT SET'); // Mask sensitive info
import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import morgan from 'morgan'; // For request logging
import rateLimit from 'express-rate-limit'; // For rate limiting
import cors from 'cors'; // For CORS

import healthRouter from './health'; // Import health routes
import porRouter from './por';     // Import PoR routes

import { MemberService } from '../services/app/MemberService';
import { BalanceService } from '../services/app/BalanceService';
import { GoldOrderAppService } from '../services/app/GoldOrderAppService';
import { PorAppService } from '../services/app/PorAppService';
import { AdminService } from '../services/app/AdminService';
import { XRPLIntegrationService } from '../services/xrpl/XRPLIntegrationService';
import { loadXRPLConfig } from '../config/xrplConfig'; // Import loadXRPLConfig
import {
  MemberProfileResponse,
  BalanceResponse,
  RecentTransaction,
  MetalsHoldingsResponse,
  PorResponse,
  MembershipNftResponse,
} from './types';

const app = express();
const prisma = new PrismaClient();
const port = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretjwtkey';

// Initialize app services
const memberService = new MemberService();
const balanceService = new BalanceService();
const goldOrderAppService = new GoldOrderAppService();
const porAppService = new PorAppService();
const adminService = new AdminService();
const xrplConfig = loadXRPLConfig(); // Load XRPL configuration
const xrplIntegrationService = new XRPLIntegrationService(xrplConfig); // Initialize with config

// --- API Security Hardening ---
// Request logging
app.use(morgan('combined'));

// Rate limiting for authentication routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Max 100 requests per 15 minutes
  message: 'Too many authentication attempts from this IP, please try again after 15 minutes',
});

// Rate limiting for general API requests
const apiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 1000, // Max 1000 requests per hour
  message: 'Too many requests from this IP, please try again after an hour',
});

// CORS configuration
const corsOptions = {
  origin: ['http://localhost:3001', 'https://fthusd.com', 'https://myusdf.com'], // Whitelist your frontend origins
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  credentials: true,
  optionsSuccessStatus: 204,
};
app.use(cors(corsOptions));

app.use(express.json());

// Use the new API routes
app.use('/health', healthRouter); // Prefix health routes with /health
app.use('/por', porRouter);     // Prefix PoR routes with /por

// Use the new API routes
app.use('/health', healthRouter); // Prefix health routes with /health
app.use('/por', porRouter);     // Prefix PoR routes with /por

// Middleware for JWT authentication
const authenticateToken = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token == null) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) return res.sendStatus(403);
    req.user = user; // Attach user payload to request
    next();
  });
};

// Login route (for demonstration purposes)
app.get('/api/v1/', apiLimiter, (req: Request, res: Response) => {
  res.send('FTH API v1 is running!');
});

// Auth routes
app.post(
  '/api/v1/auth/register',
  authLimiter, // Apply rate limiting to registration
  [
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters long'),
    body('xrplAddress').notEmpty().withMessage('XRPL address is required'),
    body('evmAddress').notEmpty().withMessage('EVM address is required'),
  ],
  async (req: Request, res: Response) => {
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
  authLimiter, // Apply rate limiting to login
  [
    body('username').notEmpty().withMessage('Username is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  (req: Request, res: Response) => {
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

// Apply authentication middleware to all routes below this point
app.use('/api/v1', authenticateToken);

// Member routes
app.get('/api/v1/member/me', apiLimiter, async (req: Request, res: Response<MemberProfileResponse>) => {
  try {
    const memberId = req.user?.memberId;
    if (!memberId) {
      return res.status(401).json({ error: 'Unauthorized', details: 'Member ID not found in token' } as any);
    }

    const member = await memberService.getMemberById(memberId);
    if (!member) {
      return res.status(404).json({ error: 'Member not found' } as any);
    }

    // Fetch membership NFT details
    let membershipNft: MembershipNftResponse | undefined;
    if (member.membershipNftId) {
      // Mocking nftDetails as xrplIntegrationService.getNftDetails is not implemented
      const nftDetails = {
        NFTokenID: member.membershipNftId,
        date: new Date(), // Mock date
      };
      if (nftDetails) {
        membershipNft = {
          nftId: nftDetails.NFTokenID,
          tier: member.membershipTier as 'ELITE' | 'STANDARD',
          xrplAddress: member.primaryWallet, // Use primaryWallet for xrplAddress
          minted: new Date(nftDetails.date).toISOString(),
          handle: member.handle,
        };
      }
    }

    const memberProfile: MemberProfileResponse = {
      handle: member.handle,
      status: member.kycStatus as 'VERIFIED' | 'PENDING_KYC' | 'REJECTED_KYC',
      membershipTier: member.membershipTier as 'ELITE' | 'STANDARD',
      xrplAddress: member.primaryWallet, // Use primaryWallet for xrplAddress
      evmAddress: member.evmWallet,
      membershipNftId: membershipNft?.nftId,
      mintedDate: membershipNft?.minted,
    };

    res.json(memberProfile);
  } catch (error: any) {
    console.error('Error fetching member profile:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message } as any);
  }
});

app.get('/api/v1/balances', apiLimiter, async (req: Request, res: Response<BalanceResponse>) => {
  try {
    const memberId = req.user?.memberId;
    if (!memberId) {
      return res.status(401).json({ error: 'Unauthorized', details: 'Member ID not found in token' } as any);
    }

    const balances = await balanceService.getMemberBalances(memberId);
    if (!balances) {
      return res.status(404).json({ error: 'Balances not found for member' } as any);
    }

    const balanceResponse: BalanceResponse = {
      fthusd: balances.fthusd.toFixed(2),
      usdf: balances.usdf.toFixed(2),
    };

    res.json(balanceResponse);
  } catch (error: any) {
    console.error('Error fetching member balances:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message } as any);
  }
});

app.get('/api/v1/transactions/recent', apiLimiter, async (req: Request, res: Response<RecentTransaction[]>) => {
  try {
    const memberId = req.user?.memberId;
    if (!memberId) {
      return res.status(401).json({ error: 'Unauthorized', details: 'Member ID not found in token' } as any);
    }

    const transactions = await balanceService.getRecentTransactions(memberId);
    const recentTransactions: RecentTransaction[] = transactions.map((tx: any) => ({ // Added any type for tx
      id: tx.id,
      type: tx.type,
      amount: tx.amount.toFixed(2),
      currency: tx.currency,
      status: tx.status as 'COMPLETED' | 'PENDING' | 'FAILED',
      fee: tx.fee?.toFixed(2),
      netAmount: tx.netAmount?.toFixed(2),
      timestamp: tx.timestamp.toISOString(),
    }));

    res.json(recentTransactions);
  } catch (error: any) {
    console.error('Error fetching recent transactions:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message } as any);
  }
});

app.get('/api/v1/metals/holdings', apiLimiter, async (req: Request, res: Response<MetalsHoldingsResponse>) => {
  try {
    const memberId = req.user?.memberId;
    if (!memberId) {
      return res.status(401).json({ error: 'Unauthorized', details: 'Member ID not found in token' } as any);
    }

    // Mocking getMemberMetalHoldings as it's not implemented
    const holdings = {
      totalHoldingsValue: 6262.50,
      metals: [
        { type: 'GOLD', pricePerOunce: 2047.50 },
        { type: 'SILVER', pricePerOunce: 24.85 },
        { type: 'PLATINUM', pricePerOunce: 925.00 },
      ],
    };
    const recentOrders = await goldOrderAppService.listMemberOrders(memberId);

    const metalsHoldingsResponse: MetalsHoldingsResponse = {
      totalHoldingsValue: holdings.totalHoldingsValue.toFixed(2),
      metals: holdings.metals.map((metal: any) => ({ // Added any type for metal
        type: metal.type,
        pricePerOunce: metal.pricePerOunce.toFixed(2),
      })),
      recentOrders: recentOrders.map((order: any) => ({ // Added any type for order
        id: order.id,
        metalType: order.metalType as 'GOLD' | 'SILVER' | 'PLATINUM', // Cast to specific types
        ounces: order.ounces.toFixed(2),
        price: order.price.toFixed(2),
        status: order.status as 'PENDING' | 'CONFIRMED' | 'FULFILLED' | 'CANCELLED', // Cast to specific types
      })),
    };

    res.json(metalsHoldingsResponse);
  } catch (error: any) {
    console.error('Error fetching metal holdings:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message } as any);
  }
});

app.post(
  '/api/v1/metals/orders', // Changed endpoint to be more specific
  apiLimiter, // Apply rate limiting to gold orders
  [
    body('metalType').isIn(['GOLD', 'SILVER', 'PLATINUM']).withMessage('Invalid metal type'),
    body('quantityOunces').isFloat({ gt: 0 }).withMessage('Metal quantity must be a positive number'),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    try {
      const memberId = req.user?.memberId;
      if (!memberId) {
        return res.status(401).json({ error: 'Unauthorized', details: 'Member ID not found in token' } as any);
      }
      const { metalType, quantityOunces } = req.body;
      // Mocking createMetalOrder as it's not implemented
      const result = {
        id: `order-${Date.now()}`,
        memberId,
        metalType,
        ounces: quantityOunces,
        price: 0, // Placeholder
        status: 'PENDING',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      res.status(200).json(result);
    } catch (error: any) {
      console.error('Error placing metal order:', error);
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }
);

app.get('/api/v1/nft/membership', apiLimiter, async (req: Request, res: Response<MembershipNftResponse>) => {
  try {
    const memberId = req.user?.memberId;
    if (!memberId) {
      return res.status(401).json({ error: 'Unauthorized', details: 'Member ID not found in token' } as any);
    }

    const member = await memberService.getMemberById(memberId);
    if (!member || !member.membershipNftId) {
      return res.status(404).json({ error: 'Membership NFT not found for member' } as any);
    }

    // Mocking nftDetails as xrplIntegrationService.getNftDetails is not implemented
    const nftDetails = {
      NFTokenID: member.membershipNftId,
      date: new Date(), // Mock date
    };
    if (!nftDetails) {
      return res.status(404).json({ error: 'Membership NFT details not found on XRPL' } as any);
    }

    const membershipNftResponse: MembershipNftResponse = {
      nftId: nftDetails.NFTokenID,
      tier: member.membershipTier as 'ELITE' | 'STANDARD',
      xrplAddress: member.primaryWallet, // Use primaryWallet for xrplAddress
      minted: new Date(nftDetails.date).toISOString(),
      handle: member.handle,
    };

    res.json(membershipNftResponse);
  } catch (error: any) {
    console.error('Error fetching membership NFT:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message } as any);
  }
});

// Admin routes
app.get('/api/v1/admin/overview', authenticateToken, apiLimiter, async (req: Request, res: Response) => {
  try {
    if ((req as any).user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden', details: 'Admin access required' });
    }
    const overview = await adminService.getOverview();
    res.json(overview);
  } catch (error: any) {
    console.error('Error fetching admin overview:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

app.get('/api/v1/admin/ledger', authenticateToken, apiLimiter, async (req: Request, res: Response) => {
  try {
    if ((req as any).user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden', details: 'Admin access required' });
    }
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.que