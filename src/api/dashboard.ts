/**
 * Dashboard API Endpoint
 * 
 * Unified endpoint that aggregates all data for the FTH Command Hub:
 * - Member identity & tier
 * - FTHUSD & USDF balances
 * - Recent transactions
 * - Metals holdings & orders
 * - PoR status
 * - Membership NFT metadata
 */

import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { BalanceService } from '../services/app/BalanceService';
import { USDFRewardsEngine } from '../services/rewards/USDFRewardsEngine';
import { MembershipNFTService } from '../services/nft/MembershipNFTService';
import { PorAppService } from '../services/app/PorAppService';

const router = Router();
const prisma = new PrismaClient();
const balanceService = new BalanceService();
const usdfRewardsEngine = new USDFRewardsEngine();
const membershipNFTService = new MembershipNFTService();
const porAppService = new PorAppService();

export interface DashboardResponse {
  member: {
    memberId: string;
    handle: string;
    email: string;
    membershipTier: string;
    kycStatus: string;
    verified: boolean;
    accountCreatedAt: string;
    xrplAddress: string;
    evmWallet: string;
  };
  balances: {
    fthusd: {
      amount: number;
      currency: string;
      backed: string;
    };
    usdf: {
      amount: number;
      currency: string;
      redeemable: boolean;
    };
  };
  recentTransactions: Array<{
    id: string;
    type: string;
    amount: number;
    currency: string;
    status: string;
    fee?: number;
    netAmount?: number;
    description?: string;
    timestamp: string;
  }>;
  metals: {
    currentPrices: {
      gold: number;
      silver: number;
      platinum: number;
    };
    holdings: Array<{
      metalType: string;
      ounces: number;
      pricePerOunce: number;
      totalValue: number;
      purchaseDate: string;
    }>;
    totalHoldingsValue: number;
  };
  membershipNft: {
    nftTokenId: string | null;
    tier: string;
    xrplAddress: string;
    mintedAt: string | null;
    benefits: {
      feeDiscount: number;
      rewardsMultiplier: number;
      goldDiscount: number;
    };
  } | null;
  proofOfReserves: {
    totalIssued: number;
    totalBacking: number;
    coverageRatio: number;
    lastUpdated: string;
    status: string;
  };
  quickActions: {
    canDeposit: boolean;
    canWithdraw: boolean;
    canTransfer: boolean;
    canBuyGold: boolean;
  };
}

/**
 * GET /v1/member/dashboard
 * Returns complete dashboard data for authenticated member
 */
router.get('/dashboard', async (req: Request, res: Response) => {
  try {
    const memberId = req.user?.memberId;

    if (!memberId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Fetch all data in parallel for performance
    const [
      member,
      fthusdBalance,
      usdfBalance,
      recentTransactions,
      goldOrders,
      membershipNft,
      porStatus,
    ] = await Promise.all([
      prisma.member.findUnique({ where: { memberId } }),
      balanceService.getBalance(memberId, 'FTHUSD'),
      usdfRewardsEngine.getUsdfBalance(memberId),
      prisma.ledgerTransaction.findMany({
        where: { memberId },
        orderBy: { timestamp: 'desc' },
        take: 10,
      }),
      prisma.goldOrder.findMany({
        where: { memberId, status: 'FULFILLED' },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.membershipNFT.findUnique({ where: { memberId } }),
      porAppService.getLatestPoR(),
    ]);

    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }

    // Calculate metals holdings value
    const metalsPrices = await getMetalsPrices();
    const holdingsValue = goldOrders.reduce((sum, order) => {
      const currentPrice = metalsPrices[order.metalType.toLowerCase()] || 0;
      return sum + parseFloat(order.ounces.toString()) * currentPrice;
    }, 0);

    // Build dashboard response
    const dashboard: DashboardResponse = {
      member: {
        memberId: member.memberId,
        handle: member.handle,
        email: member.email,
        membershipTier: member.membershipTier,
        kycStatus: member.kycStatus,
        verified: member.kycStatus === 'APPROVED',
        accountCreatedAt: member.accountCreatedAt.toISOString(),
        xrplAddress: member.primaryWallet,
        evmWallet: member.evmWallet,
      },
      balances: {
        fthusd: {
          amount: fthusdBalance,
          currency: 'FTHUSD',
          backed: '1:1 USD Backed',
        },
        usdf: {
          amount: usdfBalance,
          currency: 'USDF',
          redeemable: false,
        },
      },
      recentTransactions: recentTransactions.map((tx) => ({
        id: tx.id,
        type: formatTransactionType(tx.type),
        amount: parseFloat(tx.amount.toString()),
        currency: tx.currency,
        status: tx.status,
        fee: tx.fee ? parseFloat(tx.fee.toString()) : undefined,
        netAmount: tx.netAmount ? parseFloat(tx.netAmount.toString()) : undefined,
        description: tx.description || undefined,
        timestamp: tx.timestamp.toISOString(),
      })),
      metals: {
        currentPrices: metalsPrices,
        holdings: goldOrders.map((order) => ({
          metalType: order.metalType,
          ounces: parseFloat(order.ounces.toString()),
          pricePerOunce: metalsPrices[order.metalType.toLowerCase()] || 0,
          totalValue:
            parseFloat(order.ounces.toString()) * (metalsPrices[order.metalType.toLowerCase()] || 0),
          purchaseDate: order.createdAt.toISOString(),
        })),
        totalHoldingsValue: holdingsValue,
      },
      membershipNft: membershipNft
        ? {
            nftTokenId: membershipNft.nftTokenId,
            tier: membershipNft.tier,
            xrplAddress: membershipNft.xrplAddress,
            mintedAt: membershipNft.mintedAt.toISOString(),
            benefits: (membershipNft.metadata as any)?.benefits || getTierBenefits(member.membershipTier),
          }
        : null,
      proofOfReserves: {
        totalIssued: porStatus.totalIssued,
        totalBacking: porStatus.totalBacking,
        coverageRatio: porStatus.coverageRatio,
        lastUpdated: porStatus.asOf,
        status: porStatus.coverageRatio >= 1.0 ? 'HEALTHY' : 'UNDERCOLLATERALIZED',
      },
      quickActions: {
        canDeposit: member.kycStatus === 'APPROVED' && member.usBankAccountLinked,
        canWithdraw: member.kycStatus === 'APPROVED' && fthusdBalance > 0,
        canTransfer: member.kycStatus === 'APPROVED' && fthusdBalance > 0,
        canBuyGold: member.kycStatus === 'APPROVED' && fthusdBalance > 0,
      },
    };

    return res.json(dashboard);
  } catch (error) {
    console.error('Dashboard error:', error);
    return res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

/**
 * Format transaction type for display
 */
function formatTransactionType(type: string): string {
  const typeMap: Record<string, string> = {
    BANK_DEPOSIT_ACH: 'ACH Deposit from US Bank',
    BANK_DEPOSIT_WIRE: 'Wire Transfer from US Bank',
    WITHDRAWAL_US_BANK_ACH: 'ACH Withdrawal to US Bank',
    WITHDRAWAL_US_BANK_WIRE: 'Wire Transfer to US Bank',
    TRANSFER_INTERNAL: 'Transfer to Member',
    GOLD_PURCHASE: 'Gold Purchase',
    REWARD_ACCRUAL_USDF: 'Quarterly USDF Rewards',
    USDF_SPEND: 'USDF Credits Applied',
    FEE_EXIT: 'Exit Fee',
  };

  return typeMap[type] || type;
}

/**
 * Get current metals prices (mock - replace with Chainlink in production)
 */
async function getMetalsPrices(): Promise<{ gold: number; silver: number; platinum: number }> {
  // TODO: Replace with Chainlink oracle integration
  return {
    gold: 2047.5,
    silver: 24.85,
    platinum: 925.0,
  };
}

/**
 * Get tier benefits
 */
function getTierBenefits(tier: string): {
  feeDiscount: number;
  rewardsMultiplier: number;
  goldDiscount: number;
} {
  const benefitsMap: Record<string, any> = {
    BRONZE: { feeDiscount: 0, rewardsMultiplier: 1.0, goldDiscount: 2 },
    SILVER: { feeDiscount: 10, rewardsMultiplier: 1.2, goldDiscount: 5 },
    GOLD: { feeDiscount: 20, rewardsMultiplier: 1.5, goldDiscount: 8 },
    ELITE: { feeDiscount: 35, rewardsMultiplier: 2.0, goldDiscount: 12 },
    PLATINUM: { feeDiscount: 50, rewardsMultiplier: 2.5, goldDiscount: 15 },
  };

  return benefitsMap[tier] || benefitsMap['BRONZE'];
}

export default router;
