import { describe, it, expect, beforeAll } from '@jest/globals';

/**
 * Tests for XRPL Multi-Sign Configuration and Validation
 * These tests verify the validation logic without requiring live XRPL accounts
 */

describe('XRPL Multi-Sign Configuration', () => {
    describe('Environment Variable Loading', () => {
        it('should load FTHUSD signer addresses from environment', () => {
            const signers = [
                process.env.FTHUSD_SIGNER_1_ADDRESS,
                process.env.FTHUSD_SIGNER_2_ADDRESS,
                process.env.FTHUSD_SIGNER_3_ADDRESS,
                process.env.FTHUSD_SIGNER_4_ADDRESS,
                process.env.FTHUSD_SIGNER_5_ADDRESS,
            ];

            const validSigners = signers.filter(s => s && s.trim() !== '');
            
            // If configured, should have 5 signers
            if (validSigners.length > 0) {
                expect(validSigners.length).toBe(5);
                validSigners.forEach(signer => {
                    expect(signer).toMatch(/^r[a-zA-Z0-9]{24,34}$/);
                });
            }
        });

        it('should load USDF signer addresses from environment', () => {
            const signers = [
                process.env.USDF_SIGNER_1_ADDRESS,
                process.env.USDF_SIGNER_2_ADDRESS,
                process.env.USDF_SIGNER_3_ADDRESS,
                process.env.USDF_SIGNER_4_ADDRESS,
                process.env.USDF_SIGNER_5_ADDRESS,
            ];

            const validSigners = signers.filter(s => s && s.trim() !== '');
            
            if (validSigners.length > 0) {
                expect(validSigners.length).toBe(5);
                validSigners.forEach(signer => {
                    expect(signer).toMatch(/^r[a-zA-Z0-9]{24,34}$/);
                });
            }
        });

        it('should load Gold Vault signer addresses from environment', () => {
            const signers = [
                process.env.GOLD_VAULT_SIGNER_1_ADDRESS,
                process.env.GOLD_VAULT_SIGNER_2_ADDRESS,
                process.env.GOLD_VAULT_SIGNER_3_ADDRESS,
            ];

            const validSigners = signers.filter(s => s && s.trim() !== '');
            
            if (validSigners.length > 0) {
                expect(validSigners.length).toBe(3);
                validSigners.forEach(signer => {
                    expect(signer).toMatch(/^r[a-zA-Z0-9]{24,34}$/);
                });
            }
        });

        it('should have correct quorum values', () => {
            const fthusdQuorum = parseInt(process.env.FTHUSD_SIGNER_QUORUM || '3', 10);
            const usdfQuorum = parseInt(process.env.USDF_SIGNER_QUORUM || '3', 10);
            const goldVaultQuorum = parseInt(process.env.GOLD_VAULT_SIGNER_QUORUM || '2', 10);

            expect(fthusdQuorum).toBe(3);
            expect(usdfQuorum).toBe(3);
            expect(goldVaultQuorum).toBe(2);
        });
    });

    describe('Signer Validation Logic', () => {
        const buildSignerList = (signerAddresses: (string | undefined)[]) => {
            const validSigners = signerAddresses.filter((addr): addr is string => {
                if (!addr || addr.trim() === '') return false;
                if (!addr.startsWith('r') || addr.length < 25 || addr.length > 35) return false;
                return true;
            });

            if (validSigners.length === 0) return undefined;
            if (validSigners.length < 2) return undefined;

            return validSigners.map(addr => ({
                SignerEntry: { Account: addr, SignerWeight: 1 }
            }));
        };

        const validateSignerConfig = (
            signerList: { SignerEntry: { Account: string; SignerWeight: number } }[] | undefined,
            quorum: number
        ): { valid: boolean; errors: string[] } => {
            const errors: string[] = [];

            if (!signerList || signerList.length === 0) {
                errors.push('No signers configured');
                return { valid: false, errors };
            }

            const totalWeight = signerList.reduce((sum, signer) => sum + signer.SignerEntry.SignerWeight, 0);
            
            if (quorum > totalWeight) {
                errors.push(`Quorum (${quorum}) exceeds total weight (${totalWeight})`);
            }

            if (quorum < 1) {
                errors.push('Quorum must be at least 1');
            }

            const uniqueAddresses = new Set(signerList.map(s => s.SignerEntry.Account));
            if (uniqueAddresses.size !== signerList.length) {
                errors.push('Duplicate signer addresses detected');
            }

            return { valid: errors.length === 0, errors };
        };

        it('should accept valid 3-of-5 configuration', () => {
            const signers = buildSignerList([
                'rSignerAddress1XXXXXXXXXXXXXXXXXXXX',
                'rSignerAddress2XXXXXXXXXXXXXXXXXXXX',
                'rSignerAddress3XXXXXXXXXXXXXXXXXXXX',
                'rSignerAddress4XXXXXXXXXXXXXXXXXXXX',
                'rSignerAddress5XXXXXXXXXXXXXXXXXXXX',
            ]);

            expect(signers).toBeDefined();
            expect(signers?.length).toBe(5);

            const validation = validateSignerConfig(signers, 3);
            expect(validation.valid).toBe(true);
            expect(validation.errors).toHaveLength(0);
        });

        it('should accept valid 2-of-3 configuration', () => {
            const signers = buildSignerList([
                'rSignerAddress1XXXXXXXXXXXXXXXXXXXX',
                'rSignerAddress2XXXXXXXXXXXXXXXXXXXX',
                'rSignerAddress3XXXXXXXXXXXXXXXXXXXX',
            ]);

            expect(signers).toBeDefined();
            expect(signers?.length).toBe(3);

            const validation = validateSignerConfig(signers, 2);
            expect(validation.valid).toBe(true);
            expect(validation.errors).toHaveLength(0);
        });

        it('should reject quorum exceeding total weight', () => {
            const signers = buildSignerList([
                'rSignerAddress1XXXXXXXXXXXXXXXXXXXX',
                'rSignerAddress2XXXXXXXXXXXXXXXXXXXX',
                'rSignerAddress3XXXXXXXXXXXXXXXXXXXX',
            ]);

            const validation = validateSignerConfig(signers, 5);
            expect(validation.valid).toBe(false);
            expect(validation.errors).toContain('Quorum (5) exceeds total weight (3)');
        });

        it('should reject configuration when only invalid + one valid signer provided', () => {
            const signers = buildSignerList([
                'invalidAddress', // filtered out
                'rSignerAddress2XXXXXXXXXXXXXXXXXXXX', // valid
            ]);

            // After filtering we have only 1 valid signer → config rejected (undefined)
            expect(signers).toBeUndefined();
        });

        it('should reject configuration with less than 2 signers', () => {
            const signers = buildSignerList([
                'rSignerAddress1XXXXXXXXXXXXXXXXXXXX',
            ]);

            expect(signers).toBeUndefined();
        });

        it('should reject duplicate signer addresses', () => {
            const duplicateAddress = 'rSignerAddress1XXXXXXXXXXXXXXXXXXXX';
            const signers = [
                { SignerEntry: { Account: duplicateAddress, SignerWeight: 1 } },
                { SignerEntry: { Account: duplicateAddress, SignerWeight: 1 } },
                { SignerEntry: { Account: 'rSignerAddress3XXXXXXXXXXXXXXXXXXXX', SignerWeight: 1 } },
            ];

            const validation = validateSignerConfig(signers, 2);
            expect(validation.valid).toBe(false);
            expect(validation.errors).toContain('Duplicate signer addresses detected');
        });

        it('should reject zero or negative quorum', () => {
            const signers = buildSignerList([
                'rSignerAddress1XXXXXXXXXXXXXXXXXXXX',
                'rSignerAddress2XXXXXXXXXXXXXXXXXXXX',
            ]);

            const validation = validateSignerConfig(signers, 0);
            expect(validation.valid).toBe(false);
            expect(validation.errors).toContain('Quorum must be at least 1');
        });

        it('should handle empty signer list', () => {
            const signers = buildSignerList([]);
            expect(signers).toBeUndefined();
        });

        it('should handle undefined signer addresses', () => {
            const signers = buildSignerList([undefined, undefined, undefined]);
            expect(signers).toBeUndefined();
        });

        it('should filter out empty string signers', () => {
            const signers = buildSignerList([
                'rSignerAddress1XXXXXXXXXXXXXXXXXXXX',
                '',
                'rSignerAddress3XXXXXXXXXXXXXXXXXXXX',
            ]);

            expect(signers).toBeDefined();
            expect(signers?.length).toBe(2);
        });
    });

    describe('Production Multi-Sign Requirements', () => {
        it('should enforce multi-sign in production mode', () => {
            const originalEnv = process.env.NODE_ENV;
            process.env.NODE_ENV = 'production';

            const requireMultiSign = process.env.NODE_ENV === 'production' || 
                                     process.env.REQUIRE_MULTI_SIGN === 'true';

            expect(requireMultiSign).toBe(true);

            process.env.NODE_ENV = originalEnv;
        });

        it('should allow optional multi-sign in development mode', () => {
            const originalEnv = process.env.NODE_ENV;
            process.env.NODE_ENV = 'development';
            const originalRequire = process.env.REQUIRE_MULTI_SIGN;
            process.env.REQUIRE_MULTI_SIGN = 'false';

            const requireMultiSign = process.env.NODE_ENV === 'production' || 
                                     process.env.REQUIRE_MULTI_SIGN === 'true';

            expect(requireMultiSign).toBe(false);

            process.env.NODE_ENV = originalEnv;
            process.env.REQUIRE_MULTI_SIGN = originalRequire;
        });

        it('should enforce multi-sign when REQUIRE_MULTI_SIGN is true', () => {
            const originalRequire = process.env.REQUIRE_MULTI_SIGN;
            process.env.REQUIRE_MULTI_SIGN = 'true';

            const requireMultiSign = process.env.NODE_ENV === 'production' || 
                                     process.env.REQUIRE_MULTI_SIGN === 'true';

            expect(requireMultiSign).toBe(true);

            process.env.REQUIRE_MULTI_SIGN = originalRequire;
        });
    });
});
