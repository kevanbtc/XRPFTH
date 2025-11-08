/**
 * USDF Rewards Engine
 * 
 * Calculates and accrues USDF reward credits based on:
 * - FTHUSD balance tenure
 * - Membership tier multipliers
 * - Activity bonuses (gold purchases, volume)
 * 
 * USDF is non-withdrawable; can only be spent within FTH ecosystem
 */

import { PrismaClient, Prisma } from '@prisma/client';
import { Logger } from '../../logging/Logger';

const prisma = new PrismaClient();
const logger = Logger.getInstance();

export interface RewardsCalculation {
  memberId: string;
  fthusdBalance: number;
  tenureMonths: number;
  membershipTier: string;
  baseRewardRate: number; // Annual percentage
  tierMultiplier: number;
  activityBonus: number;
  totalRewards: number;
}

export interface TierConfig {
  tier: string;
  multiplier: number;
  minBalance: number;
}

export class USDFRewardsEngine {
  // Tier-based multipliers
  private static TIER_MULTIPLIERS: Record<string, number> = {
    BRONZE: 1.0,
    SILVER: 1.2,
    GOLD: 1.5,
    ELITE: 2.0,
    PLATINUM: 2.5,
  };

  // Base reward rates by tenure (annual %)
  private static TENURE_RATES: Array<{ months: number; rate: number }> = [
    { months: 0, rate: 2.0 },   // 0-6 months: 2% annual
    { months: 6, rate: 4.0 },   // 6-12 months: 4% annual
    { months: 12, rate: 6.0 },  // 12-18 months: 6% annual
    { months: 18, rate: 8.0 },  // 18+ months: 8% annual
  ];

  /**
   * Calculate quarterly USDF rewards for a single member
   */
  async calculateMemberRewards(memberId: string): Promise<RewardsCalculation> {
    const member = await prisma.member.findUnique({
      where: { memberId },
    });

    if (!member) {
      throw new Error(`Member ${memberId} not found`);
    }

    // Calculate tenure in months
    const tenureMonths = this.calculateTenureMonths(member.accountCreatedAt);

    // Get base reward rate from tenure
    const baseRewardRate = this.getBaseRewardRate(tenureMonths);

    // Get tier multiplier
    const tierMultiplier = USDFRewardsEngine.TIER_MULTIPLIERS[member.membershipTier] || 1.0;

    // Calculate activity bonus (based on recent gold purchases)
    const activityBonus = await this.calculateActivityBonus(memberId);

    // Calculate quarterly rewards
    // Formula: (Balance × Annual Rate × Tier Multiplier) / 4 quarters + Activity Bonus
    const fthusdBalance = parseFloat(member.fthusdBalance.toString());
    const quarterlyBaseRewards = (fthusdBalance * (baseRewardRate / 100) * tierMultiplier) / 4;
    const totalRewards = quarterlyBaseRewards + activityBonus;

    logger.info('Calculated USDF rewards', {
      memberId,
      fthusdBalance,
      tenureMonths,
      baseRewardRate,
      tierMultiplier,
      activityBonus,
      totalRewards,
    });

    return {
      memberId,
      fthusdBalance,
      tenureMonths,
      membershipTier: member.membershipTier,
      baseRewardRate,
      tierMultiplier,
      activityBonus,
      totalRewards,
    };
  }

  /**
   * Accrue USDF rewards to a member's account
   */
  async accrueRewards(memberId: string): Promise<void> {
    const calculation = await this.calculateMemberRewards(memberId);

    if (calculation.totalRewards <= 0) {
      logger.info('No rewards to accrue', { memberId });
      return;
    }

    // Update member USDF balance and last accrual time
    await prisma.$transaction(async (tx) => {
      // Update member balance
      await tx.member.update({
        where: { memberId },
        data: {
          usdfBalance: {
            increment: new Prisma.Decimal(calculation.totalRewards),
          },
          lastRewardsAccrual: new Date(),
        },
      });

      // Create ledger transaction
      await tx.ledgerTransaction.create({
        data: {
          memberId,
          type: 'REWARD_ACCRUAL_USDF',
          amount: new Prisma.Decimal(calculation.totalRewards),
          currency: 'USDF',
          status: 'COMPLETED',
          description: `Quarterly USDF rewards accrual`,
          metadata: {
            calculation,
          },
        },
      });
    });

    logger.info('Accrued USDF rewards', {
      memberId,
      amount: calculation.totalRewards,
    });
  }

  /**
   * Batch accrue rewards for all eligible members
   */
  async batchAccrueRewards(): Promise<{ processed: number; failed: number }> {
    logger.info('Starting batch USDF rewards accrual');

    // Get all approved members with positive FTHUSD balances
    const members = await prisma.member.findMany({
      where: {
        kycStatus: 'APPROVED',
        fthusdBalance: {
          gt: 0,
        },
      },
    });

    let processed = 0;
    let failed = 0;

    for (const member of members) {
      try {
        await this.accrueRewards(member.memberId);
        processed++;
      } catch (error) {
        logger.error('Failed to accrue rewards', {
          memberId: member.memberId,
          error: error instanceof Error ? error.message : String(error),
        });
        failed++;
      }
    }

    logger.info('Completed batch USDF rewards accrual', {
      total: members.length,
      processed,
      failed,
    });

    return { processed, failed };
  }

  /**
   * Calculate tenure in months from account creation
   */
  private calculateTenureMonths(accountCreatedAt: Date): number {
    const now = new Date();
    const monthsDiff =
      (now.getFullYear() - accountCreatedAt.getFullYear()) * 12 +
      (now.getMonth() - accountCreatedAt.getMonth());
    return monthsDiff;
  }

  /**
   * Get base reward rate based on tenure
   */
  private getBaseRewardRate(tenureMonths: number): number {
    const rates = USDFRewardsEngine.TENURE_RATES;

    // Find the highest applicable rate
    for (let i = rates.length - 1; i >= 0; i--) {
      if (tenureMonths >= rates[i].months) {
        return rates[i].rate;
      }
    }

    return rates[0].rate; // Default to lowest rate
  }

  /**
   * Calculate activity bonus based on recent gold purchases
   */
  private async calculateActivityBonus(memberId: string): Promise<number> {
    // Get gold purchases in the last quarter
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    const goldOrders = await prisma.goldOrder.findMany({
      where: {
        memberId,
        status: 'FULFILLED',
        createdAt: {
          gte: threeMonthsAgo,
        },
      },
    });

    // Activity bonus: 0.5% of total gold purchases in the quarter
    const totalGoldPurchases = goldOrders.reduce(
      (sum, order) => sum + parseFloat(order.totalPrice.toString()),
      0
    );

    const activityBonus = totalGoldPurchases * 0.005; // 0.5%

    return activityBonus;
  }

  /**
   * Get member's current USDF balance
   */
  async getUsdfBalance(memberId: string): Promise<number> {
    const member = await prisma.member.findUnique({
      where: { memberId },
      select: { usdfBalance: true },
    });

    if (!member) {
      throw new Error(`Member ${memberId} not found`);
    }

    return parseFloat(member.usdfBalance.toString());
  }

  /**
   * Spend USDF credits (e.g., for gold discounts)
   */
  async spendUsdf(
    memberId: string,
    amount: number,
    purpose: string,
    relatedOrderId?: string
  ): Promise<void> {
    const currentBalance = await this.getUsdfBalance(memberId);

    if (currentBalance < amount) {
      throw new Error(`Insufficient USDF balance. Available: ${currentBalance}, Required: ${amount}`);
    }

    await prisma.$transaction(async (tx) => {
      // Deduct USDF balance
      await tx.member.update({
        where: { memberId },
        data: {
          usdfBalance: {
            decrement: new Prisma.Decimal(amount),
          },
        },
      });

      // Create ledger transaction
      await tx.ledgerTransaction.create({
        data: {
          memberId,
          type: 'USDF_SPEND',
          amount: new Prisma.Decimal(-amount),
          currency: 'USDF',
          status: 'COMPLETED',
          description: purpose,
          relatedOrderId,
        },
      });
    });

    logger.info('Spent USDF credits', { memberId, amount, purpose });
  }
}
