import { PrismaClient, KYCStatus, GoldOrderStatus } from '@prisma/client';
import { getXRPLService } from '../xrpl';
import { getEVMService } from '../evm';
import { PorAppService } from './PorAppService';
import { getLedgerTransactions, TxStatus, LedgerType, Direction } from '../db'; // Import enums from db service
import { reconcileSupplyAndReserves } from 'scripts/reconcileSupplyAndReserves'; // Import the function directly
import { XRPLIntegrationService } from '../xrpl/XRPLIntegrationService';

const prisma = new PrismaClient();
const xrplService = getXRPLService();
const evmService = getEVMService();
const porAppService = new PorAppService();

export class AdminService {
  async getOverview(): Promise<any> {
    const totalMembers = await prisma.member.count();
    const goldOrdersOutstanding = await prisma.goldOrder.count({
      where: {
        status: {
          in: [GoldOrderStatus.PENDING, GoldOrderStatus.LOCKED],
        },
      },
    });

    // Fetch XRPL supply
    let fthusdSupply = '0';
    let usdfIssued = '0';
    try {
      // Assuming XRPLIntegrationService has a method to get total issued supply
      // This would typically involve querying the issuer's account_lines
      const client = (xrplService as any).client as XRPLIntegrationService['client']; // Access private client
      await client.connect(); // Connect to XRPL
      const fthusdLines = await client.request({
        command: 'account_lines',
        account: process.env.FTHUSD_ISSUER_ADDRESS || '',
        ledger_index: 'validated',
      });
      const usdfLines = await client.request({
        command: 'account_lines',
        account: process.env.USDF_ISSUER_ADDRESS || '',
        ledger_index: 'validated',
      });
      await client.disconnect(); // Disconnect after use

      fthusdSupply = fthusdLines.result.lines
        .filter(line => line.currency === 'FTHUSD')
        .reduce((sum, line) => sum + parseFloat(line.balance), 0)
        .toFixed(2);
      usdfIssued = usdfLines.result.lines
        .filter(line => line.currency === 'USDF')
        .reduce((sum, line) => sum + parseFloat(line.balance), 0)
        .toFixed(2);

    } catch (error) {
      console.error('Error fetching XRPL supply for admin overview:', error);
    }

    const latestPoR = await porAppService.getLatestSnapshot();
    const reconciliationStatus = await porAppService.getReconciliationStatus();

    // Fetch recent alerts (DEX_SCAN_ALERT, SUPPLY_RECONCILIATION failures)
    const recentAlerts = (await getLedgerTransactions())
      .filter(tx =>
        tx.flow === 'DEX_SCAN_ALERT' ||
        (tx.flow === 'SUPPLY_RECONCILIATION' && tx.status === TxStatus.FAILED)
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 10) // Get top 10 recent alerts
      .map(tx => ({
        id: tx.id,
        flow: tx.flow,
        status: tx.status,
        timestamp: tx.createdAt.toISOString(),
        summary: tx.payloadSummary || '', // Use payloadSummary instead of details
      }));

    return {
      totalMembers,
      fthusdSupply,
      usdfIssued,
      goldOrdersOutstanding,
      latestPoR: latestPoR?.latestPoR || null,
      reconciliationStatus: reconciliationStatus || null,
      recentAlerts,
    };
  }

  async getPaginatedLedgerTransactions(
    page: number = 1,
    limit: number = 20,
    flowType?: string,
    memberId?: string
  ): Promise<any> {
    let transactions = await getLedgerTransactions();

    if (flowType) {
      transactions = transactions.filter(tx => tx.flow === flowType);
    }
    if (memberId) {
      transactions = transactions.filter(tx => tx.memberId === memberId);
    }

    transactions.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const totalCount = transactions.length;
    const totalPages = Math.ceil(totalCount / limit);
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;

    const paginatedTransactions = transactions.slice(startIndex, endIndex).map(tx => ({
      id: tx.id,
      ledger: tx.ledger,
      flow: tx.flow,
      direction: tx.direction,
      memberId: tx.memberId,
      walletAddress: tx.wallet, // Corrected to use 'wallet' property
      txHash: tx.txHash,
      status: tx.status,
      createdAt: tx.createdAt.toISOString(),
      payloadSummary: tx.payloadSummary,
    }));

    return {
      transactions: paginatedTransactions,
      totalCount,
      currentPage: page,
      totalPages,
    };
  }
}
