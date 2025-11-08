import { Client, AccountInfoRequest, AccountInfoResponse } from 'xrpl';
import { config } from 'dotenv';
import { exit } from 'process';

config(); // Load environment variables

const XRPL_NODE_URL = process.env.XRPL_NODE_URL || 'wss://s.altnet.rippletest.net:51233';

// Expected signer addresses from environment
const FTHUSD_EXPECTED_SIGNERS = [
    process.env.FTHUSD_SIGNER_1_ADDRESS,
    process.env.FTHUSD_SIGNER_2_ADDRESS,
    process.env.FTHUSD_SIGNER_3_ADDRESS,
    process.env.FTHUSD_SIGNER_4_ADDRESS,
    process.env.FTHUSD_SIGNER_5_ADDRESS,
].filter((addr): addr is string => !!addr && addr.trim() !== '');

const USDF_EXPECTED_SIGNERS = [
    process.env.USDF_SIGNER_1_ADDRESS,
    process.env.USDF_SIGNER_2_ADDRESS,
    process.env.USDF_SIGNER_3_ADDRESS,
    process.env.USDF_SIGNER_4_ADDRESS,
    process.env.USDF_SIGNER_5_ADDRESS,
].filter((addr): addr is string => !!addr && addr.trim() !== '');

const GOLD_VAULT_EXPECTED_SIGNERS = [
    process.env.GOLD_VAULT_SIGNER_1_ADDRESS,
    process.env.GOLD_VAULT_SIGNER_2_ADDRESS,
    process.env.GOLD_VAULT_SIGNER_3_ADDRESS,
].filter((addr): addr is string => !!addr && addr.trim() !== '');

const FTHUSD_EXPECTED_QUORUM = parseInt(process.env.FTHUSD_SIGNER_QUORUM || '3', 10);
const USDF_EXPECTED_QUORUM = parseInt(process.env.USDF_SIGNER_QUORUM || '3', 10);
const GOLD_VAULT_EXPECTED_QUORUM = parseInt(process.env.GOLD_VAULT_SIGNER_QUORUM || '2', 10);

// Account addresses to verify
const FTHUSD_ISSUER_SEED = process.env.FTHUSD_ISSUER_SEED;
const USDF_ISSUER_SEED = process.env.USDF_ISSUER_SEED;
const GOLD_VAULT_SEED = process.env.GOLD_VAULT_SEED;

interface VerificationResult {
    accountName: string;
    accountAddress: string;
    passed: boolean;
    issues: string[];
    signerListPresent: boolean;
    actualQuorum?: number;
    expectedQuorum?: number;
    actualSigners?: string[];
    expectedSigners?: string[];
    requireAuthEnabled?: boolean;
    defaultRippleDisabled?: boolean;
}

async function verifyAccountSecurity(
    client: Client,
    accountName: string,
    accountAddress: string,
    expectedSigners: string[],
    expectedQuorum: number,
    requireMultiSign: boolean = true
): Promise<VerificationResult> {
    const result: VerificationResult = {
        accountName,
        accountAddress,
        passed: true,
        issues: [],
        signerListPresent: false,
    };

    try {
        const request: AccountInfoRequest = {
            command: 'account_info',
            account: accountAddress,
            ledger_index: 'validated',
            signer_lists: true, // Request signer lists
        };

        const response = await client.request(request) as AccountInfoResponse;
        const accountData = response.result.account_data;

        // Check RequireAuth flag (bit 2 = 0x00040000)
        const lsfRequireAuth = 0x00040000;
        result.requireAuthEnabled = !!(accountData.Flags && (accountData.Flags & lsfRequireAuth));
        
        if (!result.requireAuthEnabled) {
            result.issues.push('RequireAuth flag is NOT enabled (recommended for issuers)');
            result.passed = false;
        }

        // Check DefaultRipple flag (bit 8 = 0x00800000) - should be DISABLED for issuers
        const lsfDefaultRipple = 0x00800000;
        result.defaultRippleDisabled = !(accountData.Flags && (accountData.Flags & lsfDefaultRipple));
        
        if (!result.defaultRippleDisabled) {
            result.issues.push('DefaultRipple flag is enabled (should be disabled for issuers)');
            result.passed = false;
        }

        // Check SignerList
        if ('signer_lists' in response.result && response.result.signer_lists && response.result.signer_lists.length > 0) {
            result.signerListPresent = true;
            const signerList = response.result.signer_lists[0];
            result.actualQuorum = signerList.SignerQuorum;
            result.actualSigners = signerList.SignerEntries?.map(entry => entry.SignerEntry.Account) || [];

            // Verify quorum
            result.expectedQuorum = expectedQuorum;
            if (result.actualQuorum !== expectedQuorum) {
                result.issues.push(`SignerQuorum mismatch: expected ${expectedQuorum}, got ${result.actualQuorum}`);
                result.passed = false;
            }

            // Verify signer count
            result.expectedSigners = expectedSigners;
            if (result.actualSigners.length !== expectedSigners.length) {
                result.issues.push(`Signer count mismatch: expected ${expectedSigners.length}, got ${result.actualSigners.length}`);
                result.passed = false;
            }

            // Verify signer addresses (order-independent)
            const actualSet = new Set(result.actualSigners);
            const expectedSet = new Set(expectedSigners);
            
            const missingSigners = expectedSigners.filter(addr => !actualSet.has(addr));
            const extraSigners = result.actualSigners.filter(addr => !expectedSet.has(addr));

            if (missingSigners.length > 0) {
                result.issues.push(`Missing signers: ${missingSigners.join(', ')}`);
                result.passed = false;
            }

            if (extraSigners.length > 0) {
                result.issues.push(`Unexpected signers: ${extraSigners.join(', ')}`);
                result.passed = false;
            }

            // Verify total weight >= quorum
            const totalWeight = signerList.SignerEntries?.reduce((sum, entry) => sum + entry.SignerEntry.SignerWeight, 0) || 0;
            if (totalWeight < result.actualQuorum) {
                result.issues.push(`Total signer weight (${totalWeight}) is less than quorum (${result.actualQuorum})`);
                result.passed = false;
            }

        } else {
            result.signerListPresent = false;
            
            if (requireMultiSign) {
                result.issues.push('SignerList is NOT configured (multi-sign required for production)');
                result.passed = false;
            } else {
                result.issues.push('SignerList is NOT configured (acceptable for development only)');
            }
        }

    } catch (error) {
        result.passed = false;
        result.issues.push(`Error verifying account: ${error}`);
    }

    return result;
}

function printVerificationReport(results: VerificationResult[]) {
    console.log('\n' + '='.repeat(80));
    console.log('XRPL ISSUER SECURITY VERIFICATION REPORT');
    console.log('='.repeat(80) + '\n');

    let totalPassed = 0;
    let totalFailed = 0;

    for (const result of results) {
        const status = result.passed ? '✓ PASS' : '✗ FAIL';
        const statusColor = result.passed ? '\x1b[32m' : '\x1b[31m'; // Green or Red
        const resetColor = '\x1b[0m';

        console.log(`${statusColor}${status}${resetColor} - ${result.accountName} (${result.accountAddress})`);
        
        if (result.requireAuthEnabled !== undefined) {
            console.log(`  RequireAuth: ${result.requireAuthEnabled ? '✓ Enabled' : '✗ Disabled'}`);
        }
        
        if (result.defaultRippleDisabled !== undefined) {
            console.log(`  DefaultRipple: ${result.defaultRippleDisabled ? '✓ Disabled' : '✗ Enabled'}`);
        }
        
        if (result.signerListPresent) {
            console.log(`  Multi-Sign: ✓ Configured`);
            console.log(`    Quorum: ${result.actualQuorum} (expected: ${result.expectedQuorum})`);
            console.log(`    Signers: ${result.actualSigners?.length} (expected: ${result.expectedSigners?.length})`);
            
            if (result.actualSigners && result.actualSigners.length > 0) {
                result.actualSigners.forEach((addr, idx) => {
                    const isExpected = result.expectedSigners?.includes(addr);
                    const marker = isExpected ? '✓' : '?';
                    console.log(`      ${marker} ${idx + 1}. ${addr}`);
                });
            }
        } else {
            console.log(`  Multi-Sign: ✗ NOT Configured`);
        }

        if (result.issues.length > 0) {
            console.log(`  Issues:`);
            result.issues.forEach(issue => console.log(`    - ${issue}`));
        }

        console.log(''); // Blank line between accounts

        if (result.passed) {
            totalPassed++;
        } else {
            totalFailed++;
        }
    }

    console.log('='.repeat(80));
    console.log(`Summary: ${totalPassed} passed, ${totalFailed} failed`);
    console.log('='.repeat(80) + '\n');

    return totalFailed === 0;
}

async function main() {
    const client = new Client(XRPL_NODE_URL);
    await client.connect();
    console.log(`Connected to XRPL node: ${XRPL_NODE_URL}\n`);

    // Check environment configuration
    const requireMultiSign = process.env.NODE_ENV === 'production' || process.env.REQUIRE_MULTI_SIGN === 'true';
    
    if (requireMultiSign) {
        console.log('⚠️  PRODUCTION MODE: Multi-sign is REQUIRED\n');
    } else {
        console.log('ℹ️  DEVELOPMENT MODE: Multi-sign is recommended but not required\n');
    }

    const results: VerificationResult[] = [];

    // Verify FTHUSD Issuer
    if (FTHUSD_ISSUER_SEED) {
        const { Wallet } = await import('xrpl');
        const wallet = Wallet.fromSeed(FTHUSD_ISSUER_SEED);
        const result = await verifyAccountSecurity(
            client,
            'FTHUSD_issuer',
            wallet.address,
            FTHUSD_EXPECTED_SIGNERS,
            FTHUSD_EXPECTED_QUORUM,
            requireMultiSign
        );
        results.push(result);
    } else {
        console.warn('Warning: FTHUSD_ISSUER_SEED not configured, skipping verification\n');
    }

    // Verify USDF Issuer
    if (USDF_ISSUER_SEED) {
        const { Wallet } = await import('xrpl');
        const wallet = Wallet.fromSeed(USDF_ISSUER_SEED);
        const result = await verifyAccountSecurity(
            client,
            'USDF_issuer',
            wallet.address,
            USDF_EXPECTED_SIGNERS,
            USDF_EXPECTED_QUORUM,
            requireMultiSign
        );
        results.push(result);
    } else {
        console.warn('Warning: USDF_ISSUER_SEED not configured, skipping verification\n');
    }

    // Verify Gold Vault
    if (GOLD_VAULT_SEED) {
        const { Wallet } = await import('xrpl');
        const wallet = Wallet.fromSeed(GOLD_VAULT_SEED);
        const result = await verifyAccountSecurity(
            client,
            'GoldVault_account',
            wallet.address,
            GOLD_VAULT_EXPECTED_SIGNERS,
            GOLD_VAULT_EXPECTED_QUORUM,
            requireMultiSign
        );
        results.push(result);
    } else {
        console.warn('Warning: GOLD_VAULT_SEED not configured, skipping verification\n');
    }

    await client.disconnect();

    // Print report and exit with appropriate code
    const allPassed = printVerificationReport(results);
    
    if (!allPassed) {
        console.error('❌ VERIFICATION FAILED: Some accounts do not meet security requirements\n');
        exit(1);
    } else {
        console.log('✅ VERIFICATION PASSED: All accounts meet security requirements\n');
        exit(0);
    }
}

main().catch((error) => {
    console.error('Fatal error:', error);
    exit(1);
});
