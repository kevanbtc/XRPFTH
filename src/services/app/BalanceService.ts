import { PrismaClient, Member, LedgerTransaction } from '@prisma/client';
import { getXRPLService } from '../xrpl';
import { getEVMService } from '../evm';

const prisma = new PrismaClient();
const xrplService = getXRPLService();
const evmService = getEVMService();

export class BalanceService {
  async getMemberBalances(memberId: string): Promise<any | null> {
    const member = await prisma.member.findUnique({ where: { memberId } });
    if (!member) {
      return null;
    }

    const now = new Date();

    // Fetch FTHUSD balance from XRPL
    let fthusdBalance = '0';
    let usdfBalance = '0';
    let xrpBalance = '0';

    try {
      const xrplAccountInfo = await xrplService.getAccountInfo(member.primaryWallet);
      xrpBalance = xrplAccountInfo.xrpBalance;

      const xrplAccountBalances = await xrplService.getAccountBalances(member.primaryWallet);
      const fthusd = xrplAccountBalances.find(b => b.currency === 'FTHUSD' && b.issuer === process.env.FTHUSD_ISSUER_ADDRESS);
      const usdf = xrplAccountBalances.find(b => b.currency === 'USDF' && b.issuer === process.env.USDF_ISSUER_ADDRESS);

      if (fthusd) fthusdBalance = fthusd.value;
      if (usdf) usdfBalance = usdf.value;

    } catch (error) {
      console.error(`Error fetching XRPL balances for ${member.primaryWallet}:`, error);
      // Continue with default '0' balances if XRPL fetch fails
    }

    return {
      fthusd: {
        amount: fthusdBalance,
        issuer: process.env.FTHUSD_ISSUER_ADDRESS,
        asOf: now.toISOString(),
      },
      usdf: {
        amount: usdfBalance,
        issuer: process.env.USDF_ISSUER_ADDRESS,
        asOf: now.toISOString(),
      },
      xrp: {
        amount: xrpBalance,
        asOf: now.toISOString(),
      },
    };
  }

  async getRecentTransactions(memberId: string): Promise<any[]> {
    // For demonstration, return mock transactions
    // In a real application, this would query the database for LedgerTransaction records
    // and potentially enrich them with XRPL transaction details.
    return [
      {
        id: 'tx-ach-123',
        type: 'BANK_DEPOSIT_ACH',
        amount: 50000,
        currency: 'FTHUSD',
        status: 'COMPLETED',
        timestamp: new Date('2025-10-26T10:00:00Z'),
      },
      {
        id: 'tx-withdrawal-456',
        type: 'WITHDRAWAL_US_BANK',
        amount: 10000,
        currency: 'FTHUSD',
        status: 'COMPLETED',
        fee: 200,
        netAmount: 9800,
        timestamp: new Date('2025-10-25T15:30:00Z'),
      },
      {
        id: 'tx-usdf-reward-789',
        type: 'REWARD_ACCRUAL_USDF',
        amount: 150,
        currency: 'USDF',
        status: 'COMPLETED',
        timestamp: new Date('2025-10-01T08:00:00Z'),
      },
      {
        id: 'tx-gold-purchase-012',
        type: 'GOLD_PURCHASE',
        amount: 4095,
        currency: 'FTHUSD',
        status: 'COMPLETED',
        timestamp: new Date('2025-09-20T11:45:00Z'),
      },
    ];
  }
}
