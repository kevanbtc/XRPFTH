import { Client, Wallet, AccountSet, TransactionMetadata } from 'xrpl';
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { exit } from 'process';

config(); // Load environment variables

const XRPL_NODE_URL = process.env.XRPL_NODE_URL || 'wss://s.altnet.rippletest.net:51233';
const FTHUSD_ISSUER_SEED = process.env.FTHUSD_ISSUER_SEED;
const USDF_ISSUER_SEED = process.env.USDF_ISSUER_SEED;
const GOLD_VAULT_SEED = process.env.GOLD_VAULT_SEED;

// Path to the compiled Hook WASM binary
const COMPLIANCE_HOOK_WASM_PATH = 'hooks/compliance/src/ComplianceHook.wasm';

async function deployHook(
    client: Client,
    accountName: string,
    seed: string | undefined,
    hookWasmPath: string
) {
    if (!seed) {
        console.error(`Error: ${accountName} seed is not provided in .env`);
        return;
    }

    const wallet = Wallet.fromSeed(seed);
    console.log(`Deploying Hook to ${accountName} (${wallet.address})...`);

    let hookWasmBinary: string;
    try {
        const wasmBuffer = readFileSync(hookWasmPath);
        hookWasmBinary = wasmBuffer.toString('hex').toUpperCase();
    } catch (error) {
        console.error(`Error reading Hook WASM binary from ${hookWasmPath}:`, error);
        return;
    }

    // The Hook definition for AccountSet transaction
    const hookDefinition = {
        HookHash: hookWasmBinary, // The WASM binary hash
        HookOn: '0000000000000000', // Placeholder: This should be a bitmask of transaction types the Hook applies to
        // For a compliance hook, you might want to apply it to Payments (0x0000000000000000 | 0x0000000000000001)
        // Or other transaction types that move assets.
        // HookNamespace: '...', // Optional: A unique namespace for the Hook
        // HookApiVersion: 1, // Optional: API version
        // HookSetTxnID: '...', // Optional: Transaction ID of the HookSet that installed this Hook
    };

    const tx: AccountSet = {
        TransactionType: 'AccountSet',
        Account: wallet.address,
        Hooks: [
            { Hook: hookDefinition }
        ],
    };

    try {
        const prepared = await client.autofill(tx);
        const signed = wallet.sign(prepared);
        const result = await client.submitAndWait(signed.tx_blob);
        const transactionResult = (result.result.meta as TransactionMetadata)?.TransactionResult;
        console.log(`Hook deployment result for ${accountName}:`, transactionResult);
        if (transactionResult === 'tesSUCCESS') {
            console.log(`Successfully deployed Hook to ${accountName}.`);
            // TODO: Log to LedgerTransaction and KYCEvent tables in DB
        } else {
            console.error(`Failed to deploy Hook to ${accountName}.`);
        }
    } catch (error) {
        console.error(`Error deploying Hook to ${accountName}:`, error);
    }
}

async function main() {
    const client = new Client(XRPL_NODE_URL);
    await client.connect();
    console.log(`Connected to XRPL node: ${XRPL_NODE_URL}`);

    // Deploy ComplianceHook to relevant issuer accounts
    await deployHook(client, 'FTHUSD_issuer', FTHUSD_ISSUER_SEED, COMPLIANCE_HOOK_WASM_PATH);
    await deployHook(client, 'USDF_issuer', USDF_ISSUER_SEED, COMPLIANCE_HOOK_WASM_PATH);
    await deployHook(client, 'GoldVault_account', GOLD_VAULT_SEED, COMPLIANCE_HOOK_WASM_PATH);

    await client.disconnect();
    console.log('Disconnected from XRPL node.');
    exit(0);
}

main().catch(console.error);
