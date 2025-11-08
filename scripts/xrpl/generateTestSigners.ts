import { Wallet } from 'xrpl';
import { writeFileSync } from 'fs';
import { join } from 'path';

/**
 * Generate test signer wallets for multi-sign testing
 * This script generates 5 signers for FTHUSD/USDF and 3 for Gold Vault
 */

console.log('Generating test signer wallets...\n');

// Generate FTHUSD/USDF signers (3-of-5)
console.log('=== FTHUSD/USDF Issuer Signers (3-of-5) ===');
const fthusdSigners = [];
for (let i = 1; i <= 5; i++) {
    const wallet = Wallet.generate();
    fthusdSigners.push({
        role: ['CEO', 'CTO', 'Compliance Officer', 'External Auditor', 'Backup Key'][i - 1],
        address: wallet.address,
        seed: wallet.seed,
    });
    console.log(`FTHUSD_SIGNER_${i}:`, wallet.address);
}

console.log('\n=== USDF Issuer Signers (3-of-5) ===');
const usdfSigners = [];
for (let i = 1; i <= 5; i++) {
    const wallet = Wallet.generate();
    usdfSigners.push({
        role: ['CEO', 'CTO', 'Compliance Officer', 'External Auditor', 'Backup Key'][i - 1],
        address: wallet.address,
        seed: wallet.seed,
    });
    console.log(`USDF_SIGNER_${i}:`, wallet.address);
}

console.log('\n=== Gold Vault Signers (2-of-3) ===');
const goldVaultSigners = [];
for (let i = 1; i <= 3; i++) {
    const wallet = Wallet.generate();
    goldVaultSigners.push({
        role: ['Gold Operations Lead', 'CTO', 'Compliance Officer'][i - 1],
        address: wallet.address,
        seed: wallet.seed,
    });
    console.log(`GOLD_VAULT_SIGNER_${i}:`, wallet.address);
}

// Generate .env snippet
console.log('\n' + '='.repeat(80));
console.log('Copy these lines to your .env file for testing:');
console.log('='.repeat(80) + '\n');

let envContent = '# XRPL Multi-Sign Test Configuration (Generated)\n';
envContent += '# DO NOT USE THESE KEYS IN PRODUCTION\n\n';

envContent += '# FTHUSD Issuer Signers (3-of-5)\n';
fthusdSigners.forEach((signer, idx) => {
    envContent += `FTHUSD_SIGNER_${idx + 1}_ADDRESS=${signer.address}  # ${signer.role}\n`;
});
envContent += 'FTHUSD_SIGNER_QUORUM=3\n\n';

envContent += '# USDF Issuer Signers (3-of-5)\n';
usdfSigners.forEach((signer, idx) => {
    envContent += `USDF_SIGNER_${idx + 1}_ADDRESS=${signer.address}  # ${signer.role}\n`;
});
envContent += 'USDF_SIGNER_QUORUM=3\n\n';

envContent += '# Gold Vault Signers (2-of-3)\n';
goldVaultSigners.forEach((signer, idx) => {
    envContent += `GOLD_VAULT_SIGNER_${idx + 1}_ADDRESS=${signer.address}  # ${signer.role}\n`;
});
envContent += 'GOLD_VAULT_SIGNER_QUORUM=2\n';

console.log(envContent);

// Save to file
const outputPath = join(process.cwd(), 'scripts', 'xrpl', 'test-signers.env');
writeFileSync(outputPath, envContent);
console.log(`\n✓ Test signer configuration saved to: ${outputPath}`);

// Save full details (including seeds) to separate file
const fullDetailsPath = join(process.cwd(), 'scripts', 'xrpl', 'test-signers-full.json');
const fullDetails = {
    fthusdSigners,
    usdfSigners,
    goldVaultSigners,
    generated: new Date().toISOString(),
    warning: 'DO NOT USE THESE KEYS IN PRODUCTION - TEST ONLY',
};
writeFileSync(fullDetailsPath, JSON.stringify(fullDetails, null, 2));
console.log(`✓ Full signer details (with seeds) saved to: ${fullDetailsPath}`);
console.log('\n⚠️  WARNING: These are test keys only. Never use in production!\n');
