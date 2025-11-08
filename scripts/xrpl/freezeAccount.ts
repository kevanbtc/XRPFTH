import { Client, Wallet, TrustSet, AccountSetAsfFlags, AccountSet, TransactionMetadata } from 'xrpl';
import { config } from 'dotenv';
import { exit } from 'process';

config(); // Load environment variables

const XRPL_NODE_URL = process.env.XRPL_NODE_URL || 'wss://s.altnet.rippletest.net:51233';
const FTHUSD_ISSUER_SEED = process.env.FTHUSD_ISSUER_SEED;
const USDF_ISSUER_SEED = process.env.USDF_ISSUER_SEED;

async function freezeTrustline(
    client: Client,
    issuerSeed: string | undefined,
    memberAddress: string,
    currency: string,
    freeze: boolean
) {
    if (!issuerSeed) {
        console.error(`Error: Issuer seed for ${currency} is not provided in .env`);
        return;
    }

    const issuerWallet = Wallet.fromSeed(issuerSeed);
    console.log(`${freeze ? 'Freezing' : 'Unfreezing'} ${currency} trustline for ${memberAddress} by issuer ${issuerWallet.address}...`);

    const tx: TrustSet = {
        TransactionType: 'TrustSet',
        Account: issuerWallet.address,
        LimitAmount: {
            currency: currency,
            issuer: memberAddress, // The member's address is the issuer of the trustline from the issuer's perspective
            value: '0', // Setting limit to 0 effectively freezes the trustline
        },
        Flags: freeze ? 0x00010000 : 0, // lsfSetNoRipple or 0 to clear
    };

    try {
        const prepared = await client.autofill(tx);
        const signed = issuerWallet.sign(prepared);
        const result = await client.submitAndWait(signed.tx_blob);
        const transactionResult = (result.result.meta as TransactionMetadata)?.TransactionResult;
        console.log(`TrustSet result for ${memberAddress} (${currency}):`, transactionResult);
        if (transactionResult === 'tesSUCCESS') {
            console.log(`Successfully ${freeze ? 'froze' : 'unfroze'} ${currency} trustline for ${memberAddress}.`);
            // TODO: Log to LedgerTransaction and KYCEvent tables in DB
            // TODO: Update EVM ComplianceRegistry
        } else {
            console.error(`Failed to ${freeze ? 'freeze' : 'unfreeze'} ${currency} trustline for ${memberAddress}.`);
        }
    } catch (error) {
        console.error(`Error ${freeze ? 'freezing' : 'unfreezing'} trustline for ${memberAddress} (${currency}):`, error);
    }
}

async function setGlobalFreeze(
    client: Client,
    issuerSeed: string | undefined,
    currency: string,
    freeze: boolean
) {
    if (!issuerSeed) {
        console.error(`Error: Issuer seed for ${currency} is not provided in .env`);
        return;
    }

    const issuerWallet = Wallet.fromSeed(issuerSeed);
    console.log(`${freeze ? 'Setting' : 'Clearing'} global freeze for ${currency} by issuer ${issuerWallet.address}...`);

    const tx: AccountSet = {
        TransactionType: 'AccountSet',
        Account: issuerWallet.address,
        SetFlag: freeze ? AccountSetAsfFlags.asfGlobalFreeze : undefined,
        ClearFlag: freeze ? undefined : AccountSetAsfFlags.asfGlobalFreeze,
    };

    // Remove SetFlag/ClearFlag if undefined to avoid XRPL errors
    if (tx.SetFlag === undefined) delete tx.SetFlag;
    if (tx.ClearFlag === undefined) delete tx.ClearFlag;

    if (tx.SetFlag === undefined && tx.ClearFlag === undefined) {
        console.log('No global freeze flag change requested.');
        return;
    }

    try {
        const prepared = await client.autofill(tx);
        const signed = issuerWallet.sign(prepared);
        const result = await client.submitAndWait(signed.tx_blob);
        const transactionResult = (result.result.meta as TransactionMetadata)?.TransactionResult;
        console.log(`Global Freeze AccountSet result for ${currency}:`, transactionResult);
        if (transactionResult === 'tesSUCCESS') {
            console.log(`Successfully ${freeze ? 'set' : 'cleared'} global freeze for ${currency}.`);
            // TODO: Log to LedgerTransaction and KYCEvent tables in DB
            // TODO: Update EVM ComplianceRegistry
        } else {
            console.error(`Failed to ${freeze ? 'set' : 'clear'} global freeze for ${currency}.`);
        }
    } catch (error) {
        console.error(`Error setting global freeze for ${currency}:`, error);
    }
}

async function main() {
    const args = process.argv.slice(2);
    const command = args[0]; // 'freeze-trustline', 'unfreeze-trustline', 'set-global-freeze', 'clear-global-freeze'
    const memberAddress = args[1]; // Required for trustline commands
    const currency = args[2]; // FTHUSD or USDF

    const client = new Client(XRPL_NODE_URL);
    await client.connect();
    console.log(`Connected to XRPL node: ${XRPL_NODE_URL}`);

    try {
        switch (command) {
            case 'freeze-trustline':
                if (!memberAddress || !currency) {
                    console.error('Usage: node freezeAccount.ts freeze-trustline <memberAddress> <currency>');
                    exit(1);
                }
                await freezeTrustline(client, currency === 'FTHUSD' ? FTHUSD_ISSUER_SEED : USDF_ISSUER_SEED, memberAddress, currency, true);
                break;
            case 'unfreeze-trustline':
                if (!memberAddress || !currency) {
                    console.error('Usage: node freezeAccount.ts unfreeze-trustline <memberAddress> <currency>');
                    exit(1);
                }
                await freezeTrustline(client, currency === 'FTHUSD' ? FTHUSD_ISSUER_SEED : USDF_ISSUER_SEED, memberAddress, currency, false);
                break;
            case 'set-global-freeze':
                if (!currency) {
                    console.error('Usage: node freezeAccount.ts set-global-freeze <currency>');
                    exit(1);
                }
                await setGlobalFreeze(client, currency === 'FTHUSD' ? FTHUSD_ISSUER_SEED : USDF_ISSUER_SEED, currency, true);
                break;
            case 'clear-global-freeze':
                if (!currency) {
                    console.error('Usage: node freezeAccount.ts clear-global-freeze <currency>');
                    exit(1);
                }
                await setGlobalFreeze(client, currency === 'FTHUSD' ? FTHUSD_ISSUER_SEED : USDF_ISSUER_SEED, currency, false);
                break;
            default:
                console.error('Invalid command. Use: freeze-trustline, unfreeze-trustline, set-global-freeze, clear-global-freeze');
                exit(1);
        }
    } finally {
        await client.disconnect();
        console.log('Disconnected from XRPL node.');
        exit(0);
    }
}

main().catch(console.error);
