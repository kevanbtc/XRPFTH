// src/services/FinancingService.ts
import { PrismaClient, FinancedOrder, FinancedPayment, FinancedOrderStatus, FinancedPaymentStatus, Member, LedgerType, Direction, TxStatus, Prisma } from '@prisma/client'; // Import Prisma and Decimal from @prisma/client
import { calculateFee, ActionType, FeeInput, FeeResult } from 'fth-xrpl-stable-desk/desk/pricingEngine';
import { XRPLIntegrationService } from './xrpl/XRPLIntegrationService'; // Import the class directly
import { logger } from '../logging/Logger'; // Corrected path to be relative from src/services

const prisma = new PrismaClient();
// const logger = new Logger('FinancingService'); // No longer instantiating Logger as it's a direct export
// Instantiate XRPLIntegrationService if needed, or pass it as a dependency
// const xrplService = new XRPLIntegrationService(xrplConfig); // Assuming xrplConfig is available

export interface CreateMurabahaFinancingInput {
  memberId: string;
  goldOrderId: string; // Or a more generalized assetOrderId
  principalAmount: number; // In FTHUSD or USDF
  termMonths: number;
  currency: 'FTHUSD' | 'USDF';
  membershipTier: string; // For markup calculation
}

export interface ApplyPaymentInput {
  memberId: string;
  financedOrderId: string;
  amount: number;
  currency: 'FTHUSD' | 'USDF';
}

export class FinancingService {
  /**
   * Creates a new Murabaha-style financing agreement for a member to purchase gold/goods.
   * @param input - Details for creating the financing agreement.
   * @returns The created FinancedOrder.
   */
  async createMurabahaFinancing(input: CreateMurabahaFinancingInput): Promise<FinancedOrder> {
    const { memberId, goldOrderId, principalAmount, termMonths, currency, membershipTier } = input;

    // 1. Calculate markup using the pricing engine (or a dedicated Murabaha pricing function)
    // For simplicity, let's assume a fixed markup percentage for now, or integrate with a more complex pricing rule.
    // The user's feedback suggested "e.g. principal * 8% depending on risk/tier".
    const markupRate = 0.08; // Example: 8% fixed markup
    const markupAmount = principalAmount * markupRate;
    const totalPayable = principalAmount + markupAmount;

    // 2. Generate repayment schedule
    const payments: { dueDate: Date; amount: number }[] = [];
    const installmentAmount = totalPayable / termMonths;
    let nextDueDate: Date | undefined;

    for (let i = 0; i < termMonths; i++) {
      const dueDate = new Date();
      dueDate.setMonth(dueDate.getMonth() + (i + 1)); // First payment due in 1 month
      payments.push({ dueDate, amount: installmentAmount });
      if (i === 0) {
        nextDueDate = dueDate;
      }
    }

    // 3. Create FinancedOrder and FinancedPayment records
    const newFinancedOrder = await prisma.financedOrder.create({
      data: {
        financedOrderId: `FIN-${Date.now()}-${memberId.substring(0, 4)}`, // Unique ID
        memberId,
        goldOrderId,
        principalAmount: new Prisma.Decimal(principalAmount),
        markupAmount: new Prisma.Decimal(markupAmount),
        totalPayable: new Prisma.Decimal(totalPayable),
        currency,
        termMonths,
        status: FinancedOrderStatus.ACTIVE,
        nextDueDate,
        paidSoFar: new Prisma.Decimal(0),
        payments: {
          create: payments.map(p => ({
            dueDate: p.dueDate,
            amount: new Prisma.Decimal(p.amount),
            status: FinancedPaymentStatus.DUE,
          })),
        },
      },
      include: { payments: true },
    });

    logger.info(`Murabaha financing created for member ${memberId}, order ${newFinancedOrder.financedOrderId}`);

    // 4. Log LedgerTransaction
    await prisma.ledgerTransaction.create({
      data: {
        ledger: LedgerType.EVM, // Assuming internal financing is tracked on EVM ledger conceptually
        flow: 'FINANCING_CREATE',
        direction: Direction.OUTBOUND, // Funds "out" from FTH to cover gold purchase
        correlationId: newFinancedOrder.financedOrderId,
        memberId,
        status: TxStatus.CONFIRMED,
        payloadSummary: `Created Murabaha financing for ${principalAmount} ${currency} + ${markupAmount} markup. Total payable: ${totalPayable}`,
      },
    });

    return newFinancedOrder;
  }

  /**
   * Applies a payment to an existing financing agreement.
   * @param input - Details for applying the payment.
   * @returns The updated FinancedOrder.
   */
  async applyPayment(input: ApplyPaymentInput): Promise<FinancedOrder> {
    const { memberId, financedOrderId, amount, currency } = input;

    const financedOrder = await prisma.financedOrder.findUnique({
      where: { financedOrderId },
      include: { payments: { orderBy: { dueDate: 'asc' } }, member: true },
    });

    if (!financedOrder || financedOrder.memberId !== memberId) {
      throw new Error('Financed order not found or unauthorized.');
    }
    if (financedOrder.status !== FinancedOrderStatus.ACTIVE) {
      throw new Error('Financed order is not active.');
    }
    if (new Prisma.Decimal(amount).lessThanOrEqualTo(0)) {
      throw new Error('Payment amount must be positive.');
    }
    if (financedOrder.currency !== currency) {
      throw new Error(`Payment currency mismatch. Expected ${financedOrder.currency}, got ${currency}.`);
    }

    let remainingPaymentAmount = new Prisma.Decimal(amount);
    let updatedPaidSoFar = financedOrder.paidSoFar;

    // Process payments against due installments
    for (const payment of financedOrder.payments) {
      if (payment.status === FinancedPaymentStatus.DUE || payment.status === FinancedPaymentStatus.LATE) {
        const amountToPayForInstallment = payment.amount.minus(payment.lateFee); // Pay off late fee first if any

        if (remainingPaymentAmount.greaterThanOrEqualTo(amountToPayForInstallment)) {
          // Fully pay this installment
          await prisma.financedPayment.update({
            where: { id: payment.id },
            data: {
              status: FinancedPaymentStatus.PAID,
              paidAt: new Date(),
              lateFee: new Prisma.Decimal(0), // Clear late fee on payment
            },
          });
          updatedPaidSoFar = updatedPaidSoFar.plus(amountToPayForInstallment);
          remainingPaymentAmount = remainingPaymentAmount.minus(amountToPayForInstallment);
        } else if (remainingPaymentAmount.greaterThan(0)) {
          // Partially pay this installment (for simplicity, we assume full installment payments for now)
          // In a real system, partial payments would require more complex logic to track remaining installment amount
          logger.warn(`Partial payment for installment ${payment.id} not fully supported yet. Remaining: ${remainingPaymentAmount}`);
          // For now, if partial, we don't mark as PAID, just update paidSoFar
          updatedPaidSoFar = updatedPaidSoFar.plus(remainingPaymentAmount);
          remainingPaymentAmount = new Prisma.Decimal(0);
          break; // Stop processing if no remaining payment amount
        } else {
          break; // No remaining payment amount
        }
      }
    }

    // Update financed order status
    let newOrderStatus: FinancedOrderStatus = financedOrder.status; // Explicitly type
    if (updatedPaidSoFar.greaterThanOrEqualTo(financedOrder.totalPayable)) {
      newOrderStatus = FinancedOrderStatus.PAID;
    }

    const updatedOrder = await prisma.financedOrder.update({
      where: { id: financedOrder.id },
      data: {
        paidSoFar: updatedPaidSoFar,
        status: newOrderStatus,
        // lastPaymentDate is not directly on FinancedOrder, it's on FinancedPayment
        nextDueDate: this.calculateNextDueDate(financedOrder.payments, newOrderStatus),
      },
      include: { payments: true },
    });

    logger.info(`Payment applied to financed order ${financedOrderId}. New status: ${updatedOrder.status}`);

    // 4. Trigger XRPL or internal ledger transfer (simulated)
    // This would involve calling the XRPLIntegrationService to move funds from member to desk/treasury
    // For now, we'll just log it.
    await prisma.ledgerTransaction.create({
      data: {
        ledger: LedgerType.XRPL, // Assuming XRPL for FTHUSD/USDF transfers
        flow: 'FINANCING_PAYMENT',
        direction: Direction.INBOUND, // Funds "in" to FTH from member
        correlationId: financedOrderId,
        memberId,
        wallet: financedOrder.member.primaryWallet, // Assuming payment from primary wallet
        status: TxStatus.CONFIRMED,
        payloadSummary: `Received ${amount} ${currency} payment for financed order ${financedOrderId}`,
      },
    });

    return updatedOrder;
  }

  /**
   * Calculates the next due date based on remaining payments.
   * @param payments - Array of FinancedPayment objects.
   * @param currentOrderStatus - The current status of the financed order.
   * @returns The next due date or undefined if fully paid.
   */
  private calculateNextDueDate(payments: FinancedPayment[], currentOrderStatus: FinancedOrderStatus): Date | undefined {
    if (currentOrderStatus === FinancedOrderStatus.PAID) {
      return undefined;
    }
    const nextDuePayment = payments.find(p => p.status === FinancedPaymentStatus.DUE || p.status === FinancedPaymentStatus.LATE);
    return nextDuePayment ? nextDuePayment.dueDate : undefined;
  }

  /**
   * Retrieves all financed orders for a given member.
   * @param memberId - The ID of the member.
   * @returns An array of FinancedOrder objects.
   */
  async getFinancedOrdersForMember(memberId: string): Promise<FinancedOrder[]> {
    return prisma.financedOrder.findMany({
      where: { memberId },
      include: { payments: { orderBy: { dueDate: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
  }
}
