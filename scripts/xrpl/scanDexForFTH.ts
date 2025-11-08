import { Client, TransactionMetadata } from 'xrpl'; // Removed Offer, OfferCreate, OfferCancel as they are not directly exported
import { config } from 'dotenv';
import { exit } from 'process';
import { getLedgerTransactions, saveLedgerTransaction, LedgerType, Direction, TxStatus } from '../../src/services/db';

config(); // Load environment variables

const XRPL_NODE_URL = process.env.XRPL_NODE_URL || 'wss://s.altnet.rippletest.net:51233';
const FTHUSD_ISSUER_ADDRESS = process.env.FTHUSD_ISSUER_ADDRESS || 'rFTHUSD_ISSUER_ADDRESS';
const USDF_ISSUER_ADDRESS = process.env.USDF_ISSUER_ADDRESS || 'rUSDF_ISSUER_ADDRESS';

const TARGET_CURRENCIES = ['FTHUSD', 'USDF'];
const TARGET_ISSUERS = [FTHUSD_ISSUER_ADDRESS, USDF_ISSUER_ADDRESS];

export async function scanDexForFTH(client: Client) { // Export the function
    console.log('Scanning XRPL DEX for FTHUSD/USDF offers...');

    try {
        const offersResult = await client.request({
            command: 'book_offers',
            taker_gets: { currency: 'XRP' }, // Look for offers where XRP is being bought
            taker_pays: { currency: 'FTHUSD', issuer: FTHUSD_ISSUER_ADDRESS }, // And FTHUSD is being sold
        });

        const offersResult2 = await client.request({
            command: 'book_offers',
            taker_gets: { currency: 'FTHUSD', issuer: FTHUSD_ISSUER_ADDRESS }, // Look for offers where FTHUSD is being bought
            taker_pays: { currency: 'XRP' }, // And XRP is being sold
        });

        const offersResultUSDF = await client.request({
            command: 'book_offers',
            taker_gets: { currency: 'XRP' },
            taker_pays: { currency: 'USDF', issuer: USDF_ISSUER_ADDRESS },
        });

        const offersResultUSDF2 = await client.request({
            command: 'book_offers',
            taker_gets: { currency: 'USDF', issuer: USDF_ISSUER_ADDRESS },
            taker_pays: { currency: 'XRP' },
        });

        const allOffers = [
            ...(offersResult.result.offers || []),
            ...(offersResult2.result.offers || []),
            ...(offersResultUSDF.result.offers || []),
            ...(offersResultUSDF2.result.offers || []),
        ];

        let unauthorizedOffersDetected = false;

        for (const offer of allOffers) {
            const takerGetsCurrency = (offer.TakerGets as any).currency || 'XRP';
            const takerGetsIssuer = (offer.TakerGets as any).issuer;
            const takerPaysCurrency = (offer.TakerPays as any).currency || 'XRP';
            const takerPaysIssuer = (offer.TakerPays as any).issuer;

            const isFTHCurrency = (c: string) => TARGET_CURRENCIES.includes(c);
            const isFTHIssuer = (i: string | undefined) => i && TARGET_ISSUERS.includes(i);

            const involvesFTH =
                (isFTHCurrency(takerGetsCurrency) && isFTHIssuer(takerGetsIssuer)) ||
                (isFTHCurrency(takerPaysCurrency) && isFTHIssuer(takerPaysIssuer));

            if (involvesFTH) {
                console.warn(`UNAUTHORIZED DEX OFFER DETECTED:`);
                console.warn(`  Account: ${offer.Account}`);
                console.warn(`  TakerGets: ${JSON.stringify(offer.TakerGets)}`);
                console.warn(`  TakerPays: ${JSON.stringify(offer.TakerPays)}`);
                console.warn(`  Sequence: ${offer.Sequence}`);
                unauthorizedOffersDetected = true;

                await saveLedgerTransaction({
                    id: `dex-scan-alert-${Date.now()}-${offer.Account}-${offer.Sequence}`,
                    ledger: LedgerType.XRPL,
                    member: { connect: { memberId: 'system' } }, // Connect to a 'system' member
                    flow: 'DEX_SCAN_ALERT',
                    direction: Direction.OUTBOUND, // Changed from INTERNAL to OUTBOUND (as INTERNAL is not defined)
                    status: TxStatus.FAILED, // Changed from DETECTED to FAILED (as DETECTED is not defined)
                    payloadSummary: JSON.stringify({
                        account: offer.Account,
                        takerGets: offer.TakerGets,
                        takerPays: offer.TakerPays,
                        sequence: offer.Sequence,
                    }),
                });
            }
        }

        if (!unauthorizedOffersDetected) {
            console.log('No unauthorized FTHUSD/USDF DEX offers detected.');
        } else {
            console.error('Unauthorized FTHUSD/USDF DEX offers were detected. Alerts have been logged.');
            exit(1); // Exit with error code if unauthorized offers are found
        }

    } catch (error) {
        console.error('Error scanning DEX:', error);
        exit(1);
    }
}

async function main() {
    const client = new Client(XRPL_NODE_URL);
    await client.connect();
    console.log(`Connected to XRPL node: ${XRPL_NODE_URL}`);

    try {
        await scanDexForFTH(client);
    } finally {
        await client.disconnect();
        console.log('Disconnected from XRPL node.');
        exit(0);
    }
}

main().catch(console.error);
