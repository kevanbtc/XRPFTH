/**
 * US Banking Adapter
 * 
 * Handles ACH and Wire transfers for US bank accounts only
 * Features:
 * - ACH deposit/withdrawal processing
 * - Wire transfer support
 * - 2% exit fee for balances held < 90 days
 * - Reconciliation webhooks
 * - US-only compliance
 */

import { PrismaClient, Prisma } from '@prisma/client';
import { logger as ledgerLogger } from '../../logging/ledgerLogger';

const prisma = new PrismaClient();
const logger = ledgerLogger;

export interface BankAccountDetails {
  accountNumber: string;
  routingNumber: string;
  accountType: 'CHECKING' | 'SAVINGS';
  bankName: string;
  accountHolderName: string;
}

export interface DepositRequest {
  memberId: string;
  amount: number;
  method: 'ACH' | 'WIRE';
  bankAccountId: string;
  referenceNumber?: string;
}

export interface WithdrawalRequest {
  memberId: string;
  amount: number;
  method: 'ACH' | 'WIRE';
  bankAccountId: string;
}

export interface WithdrawalResult {
  grossAmount: number;
  feeAmount: number;
  netAmount: number;
  feePercentage: number;
  transactionId: string;
}

export interface FeeCalculation {
  grossAmount: number;
  feePercentage: number;
  feeAmount: number;
  netAmount: number;
  reason: string;
}

export class USBankingAdapter {
  private static EXIT_FEE_PERCENTAGE = 2.0; // 2%
  private static EXIT_FEE_GRACE_PERIOD_DAYS = 90; // 90 days

  /**
   * Link a US bank account to a member
   */
  async linkBankAccount(
    memberId: string,
    accountDetails: BankAccountDetails
  ): Promise<string> {
    // Verify member is US-based (jurisdiction check)
    const member = await prisma.member.findUnique({
      where: { memberId },
    });

    if (!member) {
      throw new Error(`Member ${memberId} not found`);
    }

    // TODO: Add jurisdiction check when implemented
    // if (member.jurisdiction !== JURISDICTION_US) {
    //   throw new Error('Only US members can link bank accounts');
    // }

    // Encrypt sensitive account data (in production, use proper encryption)
    const encryptedAccountNumber = this.encryptAccountNumber(accountDetails.accountNumber);

    // Create bank account record
    const bankAccount = await prisma.uSBankAccount.create({
      data: {
        memberId,
        accountNumber: encryptedAccountNumber,
        routingNumber: accountDetails.routingNumber,
        accountType: accountDetails.accountType,
        bankName: accountDetails.bankName,
        accountHolderName: accountDetails.accountHolderName,
        verified: false, // Requires micro-deposit verification
      },
    });

    logger.info('Linked US bank account', {
      memberId,
      bankAccountId: bankAccount.id,
      bankName: accountDetails.bankName,
    });

    // TODO: Initiate micro-deposit verification

    return bankAccount.id;
  }

  /**
   * Process ACH deposit from US bank
   */
  async processDeposit(request: DepositRequest): Promise<string> {
    // Verify bank account exists and is verified
    const bankAccount = await this.verifyBankAccount(request.memberId, request.bankAccountId);

    // Create pending deposit transaction
    const transaction = await prisma.ledgerTransaction.create({
      data: {
        memberId: request.memberId,
        type: request.method === 'ACH' ? 'BANK_DEPOSIT_ACH' : 'BANK_DEPOSIT_WIRE',
        amount: new Prisma.Decimal(request.amount),
        currency: 'FTHUSD',
        status: 'PENDING',
        bankAccountId: request.bankAccountId,
        description: `${request.method} deposit from ${bankAccount.bankName}`,
        metadata: {
          referenceNumber: request.referenceNumber,
          method: request.method,
        },
      },
    });

    logger.info('Created deposit transaction', {
      transactionId: transaction.id,
      memberId: request.memberId,
      amount: request.amount,
      method: request.method,
    });

    // In production, this would trigger actual bank transfer
    // For now, simulate instant completion (or use webhook reconciliation)

    return transaction.id;
  }

  /**
   * Reconcile deposit (called by webhook when bank confirms funds)
   */
  async reconcileDeposit(transactionId: string, confirmed: boolean): Promise<void> {
    const transaction = await prisma.ledgerTransaction.findUnique({
      where: { id: transactionId },
    });

    if (!transaction) {
      throw new Error(`Transaction ${transactionId} not found`);
    }

    if (transaction.status !== 'PENDING') {
      throw new Error(`Transaction ${transactionId} is not pending`);
    }

    if (confirmed) {
      // Mark transaction as completed and mint FTHUSD
      await prisma.$transaction(async (tx) => {
        // Update transaction status
        await tx.ledgerTransaction.update({
          where: { id: transactionId },
          data: {
            status: 'COMPLETED',
          },
        });

        // Update member FTHUSD balance
        await tx.member.update({
          where: { memberId: transaction.memberId },
          data: {
            fthusdBalance: {
              increment: transaction.amount,
            },
          },
        });
      });

      logger.info('Reconciled deposit', {
        transactionId,
        memberId: transaction.memberId,
        amount: transaction.amount.toString(),
      });
    } else {
      // Mark transaction as failed
      await prisma.ledgerTransaction.update({
        where: { id: transactionId },
        data: {
          status: 'FAILED',
        },
      });

      logger.warn('Deposit failed', { transactionId });
    }
  }

  /**
   * Process withdrawal to US bank account
   */
  async processWithdrawal(request: WithdrawalRequest): Promise<WithdrawalResult> {
    // Verify bank account
    const bankAccount = await this.verifyBankAccount(request.memberId, request.bankAccountId);

    // Get member to check FTHUSD balance
    const member = await prisma.member.findUnique({
      where: { memberId: request.memberId },
    });

    if (!member) {
      throw new Error(`Member ${request.memberId} not found`);
    }

    // Check sufficient balance
    const currentBalance = parseFloat(member.fthusdBalance.toString());
    if (currentBalance < request.amount) {
      throw new Error(
        `Insufficient FTHUSD balance. Available: ${currentBalance}, Requested: ${request.amount}`
      );
    }

    // Calculate exit fee based on balance tenure
    const feeCalculation = await this.calculateExitFee(request.memberId, request.amount);

    // Create withdrawal transaction
    const transaction = await prisma.$transaction(async (tx) => {
      // Deduct gross amount from FTHUSD balance
      await tx.member.update({
        where: { memberId: request.memberId },
        data: {
          fthusdBalance: {
            decrement: new Prisma.Decimal(request.amount),
          },
        },
      });

      // Create withdrawal transaction
      const withdrawalTx = await tx.ledgerTransaction.create({
        data: {
          memberId: request.memberId,
          type: request.method === 'ACH' ? 'WITHDRAWAL_US_BANK_ACH' : 'WITHDRAWAL_US_BANK_WIRE',
          amount: new Prisma.Decimal(-request.amount), // Negative for withdrawal
          currency: 'FTHUSD',
          status: 'PENDING',
          fee: new Prisma.Decimal(feeCalculation.feeAmount),
          netAmount: new Prisma.Decimal(feeCalculation.netAmount),
          bankAccountId: request.bankAccountId,
          description: `${request.method} withdrawal to ${bankAccount.bankName}`,
          metadata: {
            method: request.method,
            feeCalculation,
          },
        },
      });

      // Create separate fee transaction
      await tx.ledgerTransaction.create({
        data: {
          memberId: request.memberId,
          type: 'FEE_EXIT',
          amount: new Prisma.Decimal(feeCalculation.feeAmount),
          currency: 'FTHUSD',
          status: 'COMPLETED',
          relatedOrderId: withdrawalTx.id,
          description: `Exit fee: ${feeCalculation.reason}`,
        },
      });

      return withdrawalTx;
    });

    logger.info('Processed withdrawal', {
      transactionId: transaction.id,
      memberId: request.memberId,
      grossAmount: request.amount,
      feeAmount: feeCalculation.feeAmount,
      netAmount: feeCalculation.netAmount,
    });

    // In production, trigger actual bank transfer for netAmount

    return {
      grossAmount: request.amount,
      feeAmount: feeCalculation.feeAmount,
      netAmount: feeCalculation.netAmount,
      feePercentage: feeCalculation.feePercentage,
      transactionId: transaction.id,
    };
  }

  /**
   * Calculate exit fee based on balance tenure
   * Rule: 2% fee if funds held < 90 days
   */
  private async calculateExitFee(memberId: string, amount: number): Promise<FeeCalculation> {
    // Get all FTHUSD deposits for this member
    const deposits = await prisma.ledgerTransaction.findMany({
      where: {
        memberId,
        type: {
          in: ['BANK_DEPOSIT_ACH', 'BANK_DEPOSIT_WIRE'],
        },
        status: 'COMPLETED',
      },
      orderBy: {
        timestamp: 'asc',
      },
    });

    // Calculate weighted average age of deposits
    const now = new Date();
    let totalAmount = 0;
    let weightedAgeDays = 0;

    for (const deposit of deposits) {
      const depositAmount = parseFloat(deposit.amount.toString());
      const ageDays = (now.getTime() - deposit.timestamp.getTime()) / (1000 * 60 * 60 * 24);

      totalAmount += depositAmount;
      weightedAgeDays += ageDays * depositAmount;
    }

    const averageAgeDays = totalAmount > 0 ? weightedAgeDays / totalAmount : 0;

    // Apply fee if average age < 90 days
    let feePercentage = 0;
    let reason = 'No exit fee';

    if (averageAgeDays < USBankingAdapter.EXIT_FEE_GRACE_PERIOD_DAYS) {
      feePercentage = USBankingAdapter.EXIT_FEE_PERCENTAGE;
      reason = `Balance held < ${USBankingAdapter.EXIT_FEE_GRACE_PERIOD_DAYS} days (avg: ${Math.round(averageAgeDays)} days)`;
    }

    const feeAmount = (amount * feePercentage) / 100;
    const netAmount = amount - feeAmount;

    return {
      grossAmount: amount,
      feePercentage,
      feeAmount,
      netAmount,
      reason,
    };
  }

  /**
   * Verify bank account exists and is verified
   */
  private async verifyBankAccount(memberId: string, bankAccountId: string): Promise<any> {
    const bankAccount = await prisma.uSBankAccount.findUnique({
      where: { id: bankAccountId },
    });

    if (!bankAccount) {
      throw new Error(`Bank account ${bankAccountId} not found`);
    }

    if (bankAccount.memberId !== memberId) {
      throw new Error(`Bank account ${bankAccountId} does not belong to member ${memberId}`);
    }

    if (!bankAccount.verified) {
      throw new Error(`Bank account ${bankAccountId} is not verified`);
    }

    return bankAccount;
  }

  /**
   * Encrypt account number (placeholder - use proper encryption in production)
   */
  private encryptAccountNumber(accountNumber: string): string {
    // In production, use proper encryption (AES-256, KMS, etc.)
    // For now, just mask it
    return `****${accountNumber.slice(-4)}`;
  }

  /**
   * Get withdrawal fee estimate
   */
  async getWithdrawalFeeEstimate(memberId: string, amount: number): Promise<FeeCalculation> {
    return await this.calculateExitFee(memberId, amount);
  }

  /**
   * Get member's linked bank accounts
   */
  async getMemberBankAccounts(memberId: string): Promise<any[]> {
    return await prisma.uSBankAccount.findMany({
      where: { memberId },
      select: {
        id: true,
        accountNumber: true, // Will show masked version
        routingNumber: true,
        accountType: true,
        bankName: true,
        accountHolderName: true,
        verified: true,
        isPrimary: true,
        createdAt: true,
      },
    });
  }
}
