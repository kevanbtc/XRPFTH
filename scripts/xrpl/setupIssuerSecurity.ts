import { Client, Wallet, AccountSetAsfFlags, AccountSet, SignerListSet, TransactionMetadata } from 'xrpl';
import { config } from 'dotenv';
import { exit } from 'process';

config(); // Load environment variables

const XRPL_NODE_URL = process.env.XRPL_NODE_URL || 'wss://s.altnet.rippletest.net:51233';
const FTHUSD_ISSUER_SEED = process.env.FTHUSD_ISSUER_SEED;
const USDF_ISSUER_SEED = process.env.USDF_ISSUER_SEED;
const GOLD_VAULT_SEED = process.env.GOLD_VAULT_SEED;
const PROGRAM_ORACLE_SEED = process.env.PROGRAM_ORACLE_SEED;
const OPS_HOT_WALLET_SEED = process.env.OPS_HOT_WALLET_SEED;

// Production Multi-Sign Configuration
// Environment variables for FTHUSD Issuer (3-of-5)
const FTHUSD_SIGNER_1 = process.env.FTHUSD_SIGNER_1_ADDRESS; // CEO
const FTHUSD_SIGNER_2 = process.env.FTHUSD_SIGNER_2_ADDRESS; // CTO
const FTHUSD_SIGNER_3 = process.env.FTHUSD_SIGNER_3_ADDRESS; // Compliance Officer
const FTHUSD_SIGNER_4 = process.env.FTHUSD_SIGNER_4_ADDRESS; // External Auditor
const FTHUSD_SIGNER_5 = process.env.FTHUSD_SIGNER_5_ADDRESS; // Backup Key
const FTHUSD_SIGNER_QUORUM = parseInt(process.env.FTHUSD_SIGNER_QUORUM || '3', 10); // Default 3-of-5

// Environment variables for USDF Issuer (3-of-5)
const USDF_SIGNER_1 = process.env.USDF_SIGNER_1_ADDRESS; // CEO
const USDF_SIGNER_2 = process.env.USDF_SIGNER_2_ADDRESS; // CTO
const USDF_SIGNER_3 = process.env.USDF_SIGNER_3_ADDRESS; // Compliance Officer
const USDF_SIGNER_4 = process.env.USDF_SIGNER_4_ADDRESS; // External Auditor
const USDF_SIGNER_5 = process.env.USDF_SIGNER_5_ADDRESS; // Backup Key
const USDF_SIGNER_QUORUM = parseInt(process.env.USDF_SIGNER_QUORUM || '3', 10); // Default 3-of-5

// Environment variables for Gold Vault (2-of-3)
const GOLD_VAULT_SIGNER_1 = process.env.GOLD_VAULT_SIGNER_1_ADDRESS; // Gold Operations Lead
const GOLD_VAULT_SIGNER_2 = process.env.GOLD_VAULT_SIGNER_2_ADDRESS; // CTO
const GOLD_VAULT_SIGNER_3 = process.env.GOLD_VAULT_SIGNER_3_ADDRESS; // Compliance Officer
const GOLD_VAULT_SIGNER_QUORUM = parseInt(process.env.GOLD_VAULT_SIGNER_QUORUM || '2', 10); // Default 2-of-3

/**
 * Build SignerList from environment variables with validation
 */
function buildSignerList(signerAddresses: (string | undefined)[], accountName: string): { SignerEntry: { Account: string; SignerWeight: number } }[] | undefined {
    const validSigners = signerAddresses.filter((addr): addr is string => {
        if (!addr || addr.trim() === '') return false;
        // Basic XRPL address validation (starts with 'r' and reasonable length)
        if (!addr.startsWith('r') || addr.length < 25 || addr.length > 35) {
            console.warn(`Warning: Invalid signer address for ${accountName}: ${addr}`);
            return false;
        }
        return true;
    });

    if (validSigners.length === 0) {
        console.warn(`Warning: No valid signers configured for ${accountName}. Multi-sign will not be enabled.`);
        return undefined;
    }

    if (validSigners.length < 2) {
        console.warn(`Warning: Only ${validSigners.length} signer configured for ${accountName}. Multi-sign requires at least 2 signers.`);
        return undefined;
    }

    return validSigners.map(addr => ({
        SignerEntry: { Account: addr, SignerWeight: 1 }
    }));
}

/**
 * Validate SignerList configuration
 */
function validateSignerConfig(
    signerList: { SignerEntry: { Account: string; SignerWeight: number } }[] | undefined,
    quorum: number,
    accountName: string
): boolean {
    if (!signerList || signerList.length === 0) {
        console.error(`Error: ${accountName} has no signers configured but quorum is ${quorum}`);
        return false;
    }

    const totalWeight = signerList.reduce((sum, signer) => sum + signer.SignerEntry.SignerWeight, 0);
    
    if (quorum > totalWeight) {
        console.error(`Error: ${accountName} quorum (${quorum}) exceeds total signer weight (${totalWeight})`);
        return false;
    }

    if (quorum < 1) {
        console.error(`Error: ${accountName} quorum must be at least 1`);
        return false;
    }

    // Check for duplicate signers
    const uniqueAddresses = new Set(signerList.map(s => s.SignerEntry.Account));
    if (uniqueAddresses.size !== signerList.length) {
        console.error(`Error: ${accountName} has duplicate signer addresses`);
        return false;
    }

    console.log(`✓ ${accountName} SignerList validated: ${signerList.length} signers, quorum ${quorum}, total weight ${totalWeight}`);
    return true;
}

// Build SignerLists from environment variables
const FTHUSD_SIGNERS = buildSignerList([FTHUSD_SIGNER_1, FTHUSD_SIGNER_2, FTHUSD_SIGNER_3, FTHUSD_SIGNER_4, FTHUSD_SIGNER_5], 'FTHUSD_issuer');
const USDF_SIGNERS = buildSignerList([USDF_SIGNER_1, USDF_SIGNER_2, USDF_SIGNER_3, USDF_SIGNER_4, USDF_SIGNER_5], 'USDF_issuer');
const GOLD_VAULT_SIGNERS = buildSignerList([GOLD_VAULT_SIGNER_1, GOLD_VAULT_SIGNER_2, GOLD_VAULT_SIGNER_3], 'GoldVault_account');

async function setupAccountSecurity(
    client: Client,
    accountName: string,
    seed: string | undefined,
    signerList?: { SignerEntry: { Account: string; SignerWeight: number } }[],
    signerQuorum?: number,
    regularKey?: string // Optional RegularKey address
) {
    if (!seed) {
        console.error(`Error: ${accountName} seed is not provided in .env`);
        return;
    }

    const wallet = Wallet.fromSeed(seed);
    console.log(`Setting up security for ${accountName} (${wallet.address})...`);

    const tx: AccountSet = {
        TransactionType: 'AccountSet',
        Account: wallet.address,
        SetFlag: AccountSetAsfFlags.asfRequireAuth, // Enable RequireAuth for issuers
        ClearFlag: AccountSetAsfFlags.asfDefaultRipple, // Disable DefaultRipple for issuers
    };

    // Set RegularKey if provided
    if (regularKey) {
        console.log(`Setting RegularKey for ${accountName} to ${regularKey}`);
        tx.RegularKey = regularKey;
    }

    // Configure SignerList for multi-sig if provided
    if (signerList && signerQuorum) {
        // Validate configuration before submitting
        if (!validateSignerConfig(signerList, signerQuorum, accountName)) {
            console.error(`Skipping SignerList setup for ${accountName} due to validation errors`);
            return;
        }

        console.log(`Configuring SignerList for ${accountName} with quorum ${signerQuorum}`);
        console.log(`  Signers (${signerList.length}):`);
        signerList.forEach((signer, idx) => {
            console.log(`    ${idx + 1}. ${signer.SignerEntry.Account} (weight: ${signer.SignerEntry.SignerWeight})`);
        });

        const signerListSetTx: SignerListSet = {
            TransactionType: 'SignerListSet',
            Account: wallet.address,
            SignerQuorum: signerQuorum,
            SignerEntries: signerList,
        };
        try {
            const prepared = await client.autofill(signerListSetTx);
            const signed = wallet.sign(prepared);
            const result = await client.submitAndWait(signed.tx_blob);
            const transactionResult = (result.result.meta as TransactionMetadata)?.TransactionResult;
            console.log(`✓ SignerListSet result for ${accountName}:`, transactionResult);
            if (transactionResult !== 'tesSUCCESS') {
                console.error(`✗ Failed to set SignerList for ${accountName}: ${transactionResult}`);
                throw new Error(`SignerListSet failed with result: ${transactionResult}`);
            }
        } catch (error) {
            console.error(`✗ Error setting SignerList for ${accountName}:`, error);
            throw error;
        }
    } else if (!signerList && signerQuorum) {
        console.warn(`Warning: ${accountName} has quorum set but no signers configured. Skipping multi-sign setup.`);
    }

    try {
        const prepared = await client.autofill(tx);
        const signed = wallet.sign(prepared);
        const result = await client.submitAndWait(signed.tx_blob);
        const transactionResult = (result.result.meta as TransactionMetadata)?.TransactionResult;
        console.log(`AccountSet result for ${accountName}:`, transactionResult);
        if (transactionResult !== 'tesSUCCESS') {
            console.error(`Failed to set AccountSet flags for ${accountName}`);
        }
    } catch (error) {
        console.error(`Error setting AccountSet flags for ${accountName}:`, error);
    }
}

async function main() {
    const client = new Client(XRPL_NODE_URL);
    await client.connect();
    console.log(`Connected to XRPL node: ${XRPL_NODE_URL}`);

    // Setup FTHUSD Issuer
    await setupAccountSecurity(client, 'FTHUSD_issuer', FTHUSD_ISSUER_SEED, FTHUSD_SIGNERS, FTHUSD_SIGNER_QUORUM);

    // Setup USDF Issuer
    await setupAccountSecurity(client, 'USDF_issuer', USDF_ISSUER_SEED, USDF_SIGNERS, USDF_SIGNER_QUORUM);

    // Setup GoldVault Account
    await setupAccountSecurity(client, 'GoldVault_account', GOLD_VAULT_SEED, GOLD_VAULT_SIGNERS, GOLD_VAULT_SIGNER_QUORUM);

    // Setup ProgramOracle Account (with a simple RegularKey for automation, assuming it's a separate key)
    // For this example, we'll use the OpsHot_wallet as the RegularKey for ProgramOracle.
    // In a real scenario, ProgramOracle would have its own dedicated RegularKey.
    const programOracleRegularKey = OPS_HOT_WALLET_SEED ? Wallet.fromSeed(OPS_HOT_WALLET_SEED).address : undefined;
    await setupAccountSecurity(client, 'ProgramOracle_account', PROGRAM_ORACLE_SEED, undefined, undefined, programOracleRegularKey);

    // OpsHot_wallet (no special multi-sig or RegularKey setup needed for this example,
    // as it's assumed to be a hot wallet with its own security measures)
    await setupAccountSecurity(client, 'OpsHot_wallet', OPS_HOT_WALLET_SEED);


    await client.disconnect();
    console.log('Disconnected from XRPL node.');
    exit(0);
}

main().catch(console.error);
