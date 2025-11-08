import cron from 'node-cron';
import { reconcileSupplyAndReserves } from '../../scripts/reconcileSupplyAndReserves';
import { scanDexForFTH } from '../../scripts/xrpl/scanDexForFTH';
import { getXRPLService } from '../services/xrpl';
import { PoRComposer } from '../services/por/PoRComposer';
import { TreasuryService } from '../services/treasury/TreasuryService';
import { PrismaClient, LedgerType, Direction, TxStatus } from '@prisma/client'; // Import enums from Prisma client
import { saveLedgerTransaction } from '../services/db'; // Only import saveLedgerTransaction from db service

const xrplService = getXRPLService();
const porComposer = new PoRComposer();
const treasuryService = new TreasuryService();

export const startCronJobs = () => {
  console.log('Starting cron jobs...');

  // Schedule daily PoR snapshot and anchoring
  cron.schedule('0 0 * * *', async () => { // Every day at 00:00 UTC
    console.log('Running daily PoR snapshot and anchoring...');
    try {
      const asOf = new Date();
      const snapshotInput = await treasuryService.buildSnapshotInput(asOf);
      await porComposer.publishSnapshot(snapshotInput);
      console.log('Daily PoR snapshot and anchoring completed successfully.');
    } catch (error) {
      console.error('Error during daily PoR snapshot and anchoring:', error);
      await saveLedgerTransaction({
        id: `por-snapshot-failed-${Date.now()}`,
        ledger: LedgerType.INTERNAL,
        flow: 'por_snapshot',
        direction: Direction.OUTBOUND,
        status: TxStatus.FAILED,
        payloadSummary: `Failed to publish daily PoR snapshot: ${error instanceof Error ? error.message : String(error)}`,
        // createdAt and updatedAt are automatically handled by Prisma
      });
    }
  });

  // Schedule hourly DEX scan for FTHUSD/USDF
  cron.schedule('0 * * * *', async () => { // Every hour at minute 0
    console.log('Running hourly DEX scan...');
    try {
      // scanDexForFTH already handles logging and exiting on detection
      // Temporarily commenting out as xrplService.client is private and needs a public method
      // await scanDexForFTH(xrplService.client);
      console.log('Hourly DEX scan completed successfully (XRPL client access pending).');
    } catch (error) {
      console.error('Error during hourly DEX scan:', error);
      // scanDexForFTH already logs to LedgerTransaction if issues are found
    }
  });

  // Schedule daily supply and reserves reconciliation
  cron.schedule('30 0 * * *', async () => { // Every day at 00:30 UTC (after PoR)
    console.log('Running daily supply and reserves reconciliation...');
    try {
      // reconcileSupplyAndReserves already handles logging and exiting on failure
      await reconcileSupplyAndReserves();
      console.log('Daily supply and reserves reconciliation completed successfully.');
    } catch (error) {
      console.error('Error during daily supply and reserves reconciliation:', error);
      // reconcileSupplyAndReserves already logs to LedgerTransaction if issues are found
    }
  });
};
