import { Client, IssuedCurrencyAmount } from 'xrpl';
import { config } from 'dotenv';
import { exit } from 'process';
import { getLedgerTransactions, saveLedgerTransaction, LedgerType, Direction, TxStatus } from '../src/services/db';
import { TreasuryService } from '../src/services/treasury/TreasuryService';
import { getEVMService } from '../src/services/evm';

config(); // Load environment variables

const XRPL_NODE_URL = process.env.XRPL_NODE_URL || 'wss://s.altnet.rippletest.net:51233';
const FTHUSD_ISSUER_ADDRESS = process.env.FTHUSD_ISSUER_ADDRESS || 'rFTHUSD_ISSUER_ADDRESS';
const USDF_ISSUER_ADDRESS = process.env.USDF_ISSUER_ADDRESS || 'rUSDF_ISSUER_ADDRESS';

const treasuryService = new TreasuryService();
const evmService = getEVMService();

interface ReconciliationReport {
    timestamp: Date;
    status: 'success' | 'failure';
    details: string;
    onChainFTHUSDSupply: number;
    onChainUSDFSupply: number;
    dbFTHUSDSupply: number;
    dbUSDFSupply: number;
    porLiabilitiesFTHUSD: number;
    porLiabilitiesUSDF: number;
    porTotalAssets: number;
    porCoverageRatio: number;
    invariants: {
        onChainFTHUSDMatchesDB: boolean;
        onChainUSDFMatchesDB: boolean;
        onChainFTHUSDMatchesPoRLiabilities: boolean;
        onChainUSDFMatchesPoRLiabilities: boolean;
        porCoverageAboveThreshold: boolean;
    };
}

async function getOnChainSupply(client: Client, issuerAddress: string, currency: string): Promise<number> {
    try {
        const response = await client.request({
            command: 'account_lines', // Use account_lines to get trustlines
            account: issuerAddress,
            ledger_index: 'validated',
        });

        let totalIssued = 0;
        if (response.result.lines) {
            for (const line of response.result.lines) {
                if (line.currency === currency) {
                    // For an issuer, the balance represents the total issued amount
                    // to other accounts. The balance is negative from the issuer's perspective.
                    totalIssued += parseFloat(line.balance);
                }
            }
        }
        return Math.abs(totalIssued); // Return absolute value as issued amount
    } catch (error) {
        console.error(`Error getting on-chain supply for ${currency} from ${issuerAddress}:`, error);
        return 0;
    }
}

async function getDbSupply(currency: string): Promise<number> {
    // This is a mock implementation. In a real system, you would query your database
    // to sum up all FTHUSD/USDF balances held by members and internal accounts.
    // For now, we'll return a placeholder.
    const allTxs = await getLedgerTransactions();
    let dbSupply = 0;
    if (currency === 'FTHUSD') {
        // Sum of all fthusd_deposit minus fthusd_redemption
        const deposits = allTxs.filter(tx => tx.flow === 'fthusd_deposit' && tx.status === TxStatus.CONFIRMED);
        const redemptions = allTxs.filter(tx => tx.flow === 'fthusd_redemption' && tx.status === TxStatus.CONFIRMED);
        const totalDeposited = deposits.reduce((sum, tx) => sum + parseFloat(JSON.parse(tx.payloadSummary || '{}').amount || '0'), 0);
        const totalRedeemed = redemptions.reduce((sum, tx) => sum + parseFloat(JSON.parse(tx.payloadSummary || '{}').amount || '0'), 0);
        dbSupply = totalDeposited - totalRedeemed;
    } else if (currency === 'USDF') {
        // Sum of all bonus_issue minus gold_order_create (USDF spent)
        const bonuses = allTxs.filter(tx => tx.flow === 'bonus_issue' && tx.status === TxStatus.CONFIRMED);
        const goldOrders = allTxs.filter(tx => tx.flow === 'gold_order_create' && tx.status === TxStatus.CONFIRMED);
        const totalBonuses = bonuses.reduce((sum, tx) => sum + parseFloat(JSON.parse(tx.payloadSummary || '{}').amountUSDF || '0'), 0);
        const totalSpent = goldOrders.reduce((sum, tx) => sum + parseFloat(JSON.parse(tx.payloadSummary || '{}').usdfAmount || '0'), 0);
        dbSupply = totalBonuses - totalSpent;
    }
    return dbSupply;
}

export async function reconcileSupplyAndReserves() { // Export the function
    const client = new Client(XRPL_NODE_URL);
    await client.connect();
    console.log(`Connected to XRPL node: ${XRPL_NODE_URL}`);

    let report: ReconciliationReport = {
        timestamp: new Date(),
        status: 'failure',
        details: 'Reconciliation failed due to unknown error.',
        onChainFTHUSDSupply: 0,
        onChainUSDFSupply: 0,
        dbFTHUSDSupply: 0,
        dbUSDFSupply: 0,
        porLiabilitiesFTHUSD: 0,
        porLiabilitiesUSDF: 0,
        porTotalAssets: 0,
        porCoverageRatio: 0,
        invariants: {
            onChainFTHUSDMatchesDB: false,
            onChainUSDFMatchesDB: false,
            onChainFTHUSDMatchesPoRLiabilities: false,
            onChainUSDFMatchesPoRLiabilities: false,
            porCoverageAboveThreshold: false,
        },
    };

    try {
        // 1. Read on-chain FTHUSD & USDF total supplies
        report.onChainFTHUSDSupply = await getOnChainSupply(client, FTHUSD_ISSUER_ADDRESS, 'FTHUSD');
        report.onChainUSDFSupply = await getOnChainSupply(client, USDF_ISSUER_ADDRESS, 'USDF');

        // 2. Read DB state
        report.dbFTHUSDSupply = await getDbSupply('FTHUSD');
        report.dbUSDFSupply = await getDbSupply('USDF');

        // 3. Read latest PoR snapshot
        const latestPoR = await evmService.getLatestPoR();
        report.porLiabilitiesFTHUSD = latestPoR.fthusdCirculating;
        report.porLiabilitiesUSDF = latestPoR.usdfCirculating;
        report.porTotalAssets = latestPoR.totalAssets;
        report.porCoverageRatio = latestPoR.coverageRatioBps / 100; // Convert basis points to percentage

        // 4. Compute invariants
        const tolerance = 0.001; // Small tolerance for floating point comparisons

        report.invariants.onChainFTHUSDMatchesDB = Math.abs(report.onChainFTHUSDSupply - report.dbFTHUSDSupply) < tolerance;
        report.invariants.onChainUSDFMatchesDB = Math.abs(report.onChainUSDFSupply - report.dbUSDFSupply) < tolerance;
        report.invariants.onChainFTHUSDMatchesPoRLiabilities = Math.abs(report.onChainFTHUSDSupply - report.porLiabilitiesFTHUSD) < tolerance;
        report.invariants.onChainUSDFMatchesPoRLiabilities = Math.abs(report.onChainUSDFSupply - report.porLiabilitiesUSDF) < tolerance;
        report.invariants.porCoverageAboveThreshold = report.porCoverageRatio >= 100; // Assuming 100% is the minimum

        if (
            report.invariants.onChainFTHUSDMatchesDB &&
            report.invariants.onChainUSDFMatchesDB &&
            report.invariants.onChainFTHUSDMatchesPoRLiabilities &&
            report.invariants.onChainUSDFMatchesPoRLiabilities &&
            report.invariants.porCoverageAboveThreshold
        ) {
            report.status = 'success';
            report.details = 'All supply and reserve invariants satisfied.';
            console.log('✅ All supply and reserve invariants satisfied.');
        } else {
            report.status = 'failure';
            report.details = 'One or more supply and reserve invariants failed.';
            console.error('❌ One or more supply and reserve invariants failed.');
        }

    } catch (error) {
        report.status = 'failure';
        report.details = `Reconciliation failed: ${error instanceof Error ? error.message : String(error)}`;
        console.error('Error during reconciliation:', error);
    } finally {
        await client.disconnect();
        console.log('Disconnected from XRPL node.');

        // Log the reconciliation report to the LedgerTransaction table
        await saveLedgerTransaction({
            id: `reconciliation-${report.timestamp.getTime()}`,
            ledger: LedgerType.INTERNAL, // Use enum value
            flow: 'SUPPLY_RECONCILIATION',
            direction: Direction.INTERNAL, // Use enum value
            status: report.status === 'success' ? TxStatus.CONFIRMED : TxStatus.FAILED, // Use enum values
            payloadSummary: JSON.stringify(report),
            errorCode: report.status === 'failure' ? 'RECONCILIATION_FAILED' : null, // Add errorCode
        });

        if (report.status === 'failure') {
            exit(1);
        }
    }
}

async function main() {
    await reconcileSupplyAndReserves();
    exit(0);
}

main().catch(console.error);
