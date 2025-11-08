import { Client, Wallet, Payment, xrpToDrops } from 'xrpl';
import { config } from 'dotenv';
import { exit } from 'process';
import axios from 'axios';

config(); // Load environment variables

const XRPL_NODE_URL = process.env.XRPL_NODE_URL || 'wss://s.altnet.rippletest.net:51233';
const FUNDER_WALLET_SEED = process.env.OPS_HOT_WALLET_SEED; // Using OpsHot_wallet as a funder for local dev

// Public faucet for Testnet/Devnet
const TESTNET_FAUCET_URL = 'https://faucet.altnet.rippletest.net/accounts';

async function fundFromFaucet(address: string) {
    console.log(`Funding ${address} from Testnet Faucet...`);
    try {
        const response = await axios.post(TESTNET_FAUCET_URL, { destination: address });
        if (response.data && response.data.account && response.data.account.xrp) {
            console.log(`Successfully funded ${address} with ${response.data.account.xrp} XRP from faucet.`);
            return true;
        }
        console.error('Faucet funding failed:', response.data);
        return false;
    } catch (error) {
        console.error('Error funding from faucet:', error);
        return false;
    }
}

async function fundFromLocalWallet(client: Client, funderWallet: Wallet, targetAddress: string, amountXRP: number) {
    console.log(`Funding ${targetAddress} with ${amountXRP} XRP from local wallet ${funderWallet.address}...`);

    const payment: Payment = {
        TransactionType: 'Payment',
        Account: funderWallet.address,
        Amount: xrpToDrops(amountXRP.toString()),
        Destination: targetAddress,
    };

    try {
        const prepared = await client.autofill(payment);
        const signed = funderWallet.sign(prepared);
        const result = await client.submitAndWait(signed.tx_blob);
        const transactionResult = (result.result.meta as any)?.TransactionResult; // Using 'any' for meta to avoid deep type issues
        console.log(`Payment result:`, transactionResult);
        if (transactionResult === 'tesSUCCESS') {
            console.log(`Successfully sent ${amountXRP} XRP to ${targetAddress}.`);
            return true;
        } else {
            console.error(`Failed to send XRP to ${targetAddress}.`);
            return false;
        }
    } catch (error) {
        console.error(`Error sending XRP from local wallet:`, error);
        return false;
    }
}

async function main() {
    const args = process.argv.slice(2);
    const targetAddress = args[0];
    const amountXRP = parseFloat(args[1] || '100'); // Default to 100 XRP

    if (!targetAddress) {
        console.error('Usage: node fundTestAccount.ts <targetAddress> [amountXRP]');
        exit(1);
    }

    const client = new Client(XRPL_NODE_URL);
    await client.connect();
    console.log(`Connected to XRPL node: ${XRPL_NODE_URL}`);

    try {
        // Determine if we are on a public testnet or local devnet
        const serverInfo = await client.request({ command: 'server_info' });
        const isPublicTestnet = serverInfo.result.info.build_version.includes('altnet') || serverInfo.result.info.build_version.includes('testnet');

        let funded = false;
        if (isPublicTestnet) {
            funded = await fundFromFaucet(targetAddress);
        } else {
            // Assume local devnet
            if (!FUNDER_WALLET_SEED) {
                console.error('Error: FUNDER_WALLET_SEED (OPS_HOT_WALLET_SEED) is not provided in .env for local funding.');
                exit(1);
            }
            const funderWallet = Wallet.fromSeed(FUNDER_WALLET_SEED);
            funded = await fundFromLocalWallet(client, funderWallet, targetAddress, amountXRP);
        }

        if (funded) {
            console.log(`Account ${targetAddress} funding process completed.`);
        } else {
            console.error(`Account ${targetAddress} could not be funded.`);
            exit(1);
        }
    } finally {
        await client.disconnect();
        console.log('Disconnected from XRPL node.');
        exit(0);
    }
}

main().catch(console.error);
