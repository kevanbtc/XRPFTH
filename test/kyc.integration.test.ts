// test/kyc.integration.test.ts

import { getEVMService } from "../src/services/evm";
import { KYCService, KYCRecord, KYCStatus } from "../src/services/KYCService";
import { config as loadEnv } from "dotenv";
import { LedgerTransaction } from "../src/models/LedgerTransaction";
import { ethers, Wallet, HDNodeWallet } from "ethers"; // Import ethers for address validation

// Define TxStatus based on LedgerTransaction's status property for local use
type TxStatus = LedgerTransaction['status'];

loadEnv({ path: ".env.local" }); // Load environment variables for test

// Mock the database persistence for LedgerTransaction
const mockLedgerTransactions: LedgerTransaction[] = [];
jest.mock("../src/services/db", () => ({
  saveLedgerTransaction: jest.fn((tx: LedgerTransaction) => {
    mockLedgerTransactions.push(tx);
    return Promise.resolve(tx);
  }),
  updateLedgerTransaction: jest.fn((tx: LedgerTransaction) => {
    const index = mockLedgerTransactions.findIndex((t) => t.id === tx.id);
    if (index !== -1) {
      mockLedgerTransactions[index] = tx;
    }
    return Promise.resolve(tx);
  }),
  getLedgerTransactions: jest.fn(() => Promise.resolve(mockLedgerTransactions)),
}));

describe("KYC Pipeline End-to-End Integration Test", () => {
  let evmService: ReturnType<typeof getEVMService>;
  let kycService: KYCService;
  let testMemberWallet: HDNodeWallet;

  beforeAll(async () => {
    evmService = getEVMService();
    kycService = new KYCService();
    testMemberWallet = ethers.Wallet.createRandom(); // Correctly typed Wallet creation

    await evmService["provider"].ready; // Ensure EVM provider is connected
  });

  it("should successfully approve a member and reflect status on EVM ComplianceRegistry", async () => {
    const memberId = `test-member-${Date.now()}`;
    const walletAddress = testMemberWallet.address;
    const jurisdictionCode = 1; // Example: USA
    const flags = 1n; // Bit 0 for gold_module_allowed

    const kycRecord: KYCRecord = {
      memberId,
      walletAddress,
      status: KYCStatus.Pending, // Initial status
      jurisdictionCode,
      flags,
    };

    // Simulate approving the member
    await kycService.approveMember(kycRecord);

    // Verify on-chain status
    const onChainStatus = await evmService.getComplianceStatus(walletAddress);
    expect(onChainStatus.kycApproved).toBe(true);
    expect(onChainStatus.sanctioned).toBe(false); // Should be false by default
    expect(onChainStatus.jurisdictionCode).toBe(jurisdictionCode);
    expect(onChainStatus.flags).toBe(flags);

    // Verify LedgerTransaction record
    const evmKycTx = mockLedgerTransactions.find(
      (tx) => tx.flow === "kyc_update" && tx.walletAddress === walletAddress && tx.status === "confirmed"
    );
    expect(evmKycTx).toBeDefined();
    expect(evmKycTx?.ledger).toBe("evm");
    expect(evmKycTx?.payloadSummary).toContain(walletAddress);
    expect(evmKycTx?.payloadSummary).toContain("approved\":true");
  }, 30000); // Increase timeout for async operations

  it("should successfully block a member and reflect status on EVM ComplianceRegistry", async () => {
    const memberId = `test-member-blocked-${Date.now()}`;
    const walletAddress = Wallet.createRandom().address; // New random wallet for this test
    const jurisdictionCode = 1;
    const flags = 0n;

    const kycRecord: KYCRecord = {
      memberId,
      walletAddress,
      status: KYCStatus.Approved, // Assume previously approved
      jurisdictionCode,
      flags,
    };

    // First, approve the member to set initial state
    await kycService.approveMember(kycRecord);

    // Now, block the member
    await kycService.blockMember(kycRecord);

    // Verify on-chain status
    const onChainStatus = await evmService.getComplianceStatus(walletAddress);
    expect(onChainStatus.kycApproved).toBe(true); // KYC status remains, only sanctioned flag changes
    expect(onChainStatus.sanctioned).toBe(true);
    expect(onChainStatus.jurisdictionCode).toBe(jurisdictionCode);
    expect(onChainStatus.flags).toBe(flags);

    // Verify LedgerTransaction record for blocking
    const evmSanctionTx = mockLedgerTransactions.find(
      (tx) => tx.flow === "sanction_update" && tx.walletAddress === walletAddress && tx.status === "confirmed"
    );
    expect(evmSanctionTx).toBeDefined();
    expect(evmSanctionTx?.ledger).toBe("evm");
    expect(evmSanctionTx?.payloadSummary).toContain(walletAddress);
    expect(evmSanctionTx?.payloadSummary).toContain("sanctioned\":true");
  }, 30000);
});
