import { PrismaClient } from '@prisma/client';
import { PoRComposer } from '../por/PoRComposer';
import { TreasuryService } from '../treasury/TreasuryService';
import { getEVMService } from '../evm';
import { getLedgerTransactions, TxStatus } from '../db'; // Import TxStatus from db service
// import { ReconciliationReport } from '../../scripts/reconcileSupplyAndReserves'; // Removed as it's not a globally exported type

const prisma = new PrismaClient();
const porComposer = new PoRComposer();
const treasuryService = new TreasuryService();
const evmService = getEVMService();

export class PorAppService {
  async getLatestSnapshot(): Promise<any | null> {
    const latestPoR = await evmService.getLatestPoR();
    if (!latestPoR) {
      return null;
    }

    // Optionally, fetch the XRPL anchoring transaction
    const xrplAnchorTx = (await getLedgerTransactions()).find(
      tx => tx.flow === 'por_anchoring' && tx.status === TxStatus.CONFIRMED && tx.payloadSummary?.includes(latestPoR.hash)
    );

    return {
      latestPoR: {
        timestamp: latestPoR.timestamp.toISOString(),
        totalAssets: latestPoR.totalAssets,
        totalLiabilities: latestPoR.totalLiabilities,
        coverageRatio: latestPoR.coverageRatioBps / 100,
        fthusdCirculating: latestPoR.fthusdCirculating,
        usdfCirculating: latestPoR.usdfCirculating,
        goldOzCommitted: latestPoR.goldOzCommitted,
        snapshotHash: latestPoR.hash,
        reportURI: latestPoR.reportURI,
      },
      xrplAnchorTx: xrplAnchorTx ? {
        id: xrplAnchorTx.id,
        txHash: xrplAnchorTx.txHash,
        createdAt: xrplAnchorTx.createdAt.toISOString(),
        payloadSummary: xrplAnchorTx.payloadSummary, // Use payloadSummary instead of details
      } : null,
    };
  }

  async getReconciliationStatus(): Promise<any | null> { // Changed return type to any
    // Fetch the latest reconciliation report from the LedgerTransactions
    const latestReconciliationTx = (await getLedgerTransactions())
      .filter(tx => tx.flow === 'SUPPLY_RECONCILIATION')
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

    if (latestReconciliationTx && latestReconciliationTx.payloadSummary) {
      return JSON.parse(latestReconciliationTx.payloadSummary); // Removed type assertion
    }
    return null;
  }
}
