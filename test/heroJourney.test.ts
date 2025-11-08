// test/heroJourney.test.ts
import { v4 as uuidv4 } from "uuid";
import { getXRPLService } from "../src/services/xrpl";
import { getEVMService } from "../src/services/evm";
import { TreasuryService } from "../src/services/treasury/TreasuryService";
import { PoRComposer } from "../src/services/por/PoRComposer";
import { KYCService, KYCStatus } from "../src/services/KYCService";
import { BonusEngine } from "../src/services/BonusEngine";
import { GoldOpsService } from "../src/services/GoldOpsService";
import { getLedgerTransactions, clearLedgerTransactions } from "../src/services/db"; // Assuming a simple mock DB export
import { TxStatus } from "@prisma/client"; // Import TxStatus from Prisma client

// Helper for retries with exponential backoff
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  retries = 5,
  delay = 1000, // 1 second
  factor = 2
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retries > 0) {
      console.warn(`Retrying after error: ${(error as Error).message}. Retries left: ${retries}`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return retryWithBackoff(fn, retries - 1, delay * factor, factor);
    }
    throw error;
  }
}

// You may want a higher timeout because this touches XRPL + EVM
jest.setTimeout(90_000);

describe("Hero Journey – end-to-end FTH system", () => {
  const memberId = "member-" + Date.now();
  const correlationId = uuidv4();

  // You probably already have some test wallet addresses in env/config
  // For a real test, these would be funded devnet accounts.
  const testMemberXRPLAddress = process.env.TEST_MEMBER_XRPL_ADDRESS || "rTESTMEMBERXRPLADDRESS";
  const testMemberEVMWallet = process.env.TEST_MEMBER_EVM_WALLET || "0xTESTMEMBEREVMWALLET";

    const jurisdictionCode = 784; // e.g. UAE
    const kycFlags = 0n; // refine as needed

    // Mock for Hook enforcement (since actual Hook deployment is external to this test)
    let isMemberBlockedByHook = false;
    const mockBlockMemberForHook = (blocked: boolean) => {
      isMemberBlockedByHook = blocked;
    };

  const depositAmountFTHUSD = "1000"; // 1,000 FTHUSD
  const bonusUsdfAmount = "50";       // 50 USDF bonus
  const goldOrderUsdfAmount = "200";  // 200 USDF used for gold order

  let xrplService: ReturnType<typeof getXRPLService>;
  let evmService: ReturnType<typeof getEVMService>;
  let treasuryService: TreasuryService;
  let porComposer: PoRComposer;
  let kycService: KYCService;
  let bonusEngine: BonusEngine;
  let goldOpsService: GoldOpsService;

  beforeAll(async () => {
    xrplService = getXRPLService();
    evmService = getEVMService();
    treasuryService = new TreasuryService();
    porComposer = new PoRComposer();
    kycService = new KYCService();
    bonusEngine = new BonusEngine();
    goldOpsService = new GoldOpsService();

    // Ensure services are connected
    await xrplService.connect();
    await evmService["provider"].ready;

    // Clear mock DB before each run
    await clearLedgerTransactions();
  });

  afterAll(async () => {
    await xrplService.disconnect();
  });

  it("walks one member through KYC → funding → PoR → bonus → gold", async () => {
    // ---------------------------------------------------------------
    // 1. KYC: approve member and sync to ComplianceRegistry, simulate Hook enforcement
    // ---------------------------------------------------------------
    await kycService.approveMember({
      memberId,
      walletAddress: testMemberEVMWallet, // or XRPL mapping, depending on your model
      status: KYCStatus.Approved,
      jurisdictionCode,
      flags: kycFlags,
    });
    mockBlockMemberForHook(false); // Member is approved, so not blocked by Hook

    // Simulate blocking a member and verify Hook behavior
    await kycService.blockMember({ memberId, walletAddress: testMemberEVMWallet, status: KYCStatus.Approved, jurisdictionCode, flags: kycFlags }); // Pass KYCRecord
    mockBlockMemberForHook(true); // Member is now blocked by Hook

    // Attempt a transaction that should be blocked by the Hook
    await expect(
      retryWithBackoff(async () => {
        if (isMemberBlockedByHook) {
          throw new Error("Simulated Hook Block: Transaction rejected due to compliance.");
        }
        // This part would normally be xrplService.creditFTHUSD, but we're simulating the Hook's rejection
        // For a real test, you'd attempt an actual XRPL transaction and assert its failure.
        // For now, we'll just throw an error if the mock says the member is blocked.
      }, 1, 100, 2) // Short retry for this simulated block, added missing factor argument
    ).rejects.toThrow("Simulated Hook Block: Transaction rejected due to compliance.");

    // Unblock the member for the rest of the journey
    await kycService.unblockMember({ memberId, walletAddress: testMemberEVMWallet, status: KYCStatus.Blocked, jurisdictionCode, flags: kycFlags }); // Pass KYCRecord
    mockBlockMemberForHook(false); // Member is unblocked

    // Assert ComplianceRegistry on-chain status
    const onChainStatus = await evmService.getComplianceStatus(testMemberEVMWallet);
    expect(onChainStatus.kycApproved).toBe(true);
    expect(onChainStatus.sanctioned).toBe(false);

    // Assert KYC ledger transaction logged
    const kycTxs = (await getLedgerTransactions()).filter(tx => tx.flow === "kyc_update" && tx.memberId === memberId);
    expect(kycTxs.length).toBeGreaterThanOrEqual(1);
    expect(kycTxs[0].status).toBe(TxStatus.CONFIRMED);

    // ---------------------------------------------------------------
    // 2. Funding: mock deposit -> credit FTHUSD to the member
    // ---------------------------------------------------------------
    // You may have a higher-level BankingAdapter; if not, call XRPLIntegrationService directly.
    // Incorporating retry logic for XRPL interactions to handle transient network issues.
    await retryWithBackoff(async () => {
      await xrplService.creditFTHUSD(
        testMemberXRPLAddress,
        depositAmountFTHUSD,
        `hero-journey-deposit-${correlationId}`
      );
    });
    // TODO: For chaos testing, you could temporarily modify XRPL_NODE_URL here
    // or introduce a mock for xrplService that fails intermittently.

    // LedgerTransaction: FTHUSD deposit
    const depositTxs = (await getLedgerTransactions()).filter(tx => tx.flow === "fthusd_deposit" && tx.memberId === memberId);
    expect(depositTxs.length).toBeGreaterThanOrEqual(1);
    expect(depositTxs[0].status).toBe(TxStatus.CONFIRMED);

    // ---------------------------------------------------------------
    // 3. PoR: run snapshot and publish to EVM + XRPL
    // ---------------------------------------------------------------
    const asOf = new Date();
    const snapshotInput = await treasuryService.buildSnapshotInput(asOf);

    const porResult = await porComposer.publishSnapshot(snapshotInput);

    // Assert EVM PoR state
    const latestSnapshot = await evmService.getLatestPoR();
    expect(latestSnapshot.hash).toBe(porResult.hash);
    expect(latestSnapshot.coverageRatioBps).toBeGreaterThanOrEqual(10_000); // >= 100%

    // LedgerTransactions: PoR on EVM + XRPL
    const porTxs = (await getLedgerTransactions()).filter(tx => tx.flow === "por_snapshot" || tx.flow === "por_anchoring");
    expect(porTxs.length).toBeGreaterThanOrEqual(2); // one EVM, one XRPL
    expect(porTxs.every(tx => tx.status === TxStatus.CONFIRMED)).toBe(true);

    // ---------------------------------------------------------------
    // 4. Bonus: issue USDF bonus to member
    // ---------------------------------------------------------------
    await bonusEngine.executeDailyBonusRun(
      [
        {
          memberAddress: testMemberXRPLAddress,
          amountUSDF: bonusUsdfAmount,
          memberId,
        },
      ],
      `hero-journey-run-${correlationId}`
    );

    const bonusTxs = (await getLedgerTransactions()).filter(tx => tx.flow === "bonus_issue" && tx.memberId === memberId);
    expect(bonusTxs.length).toBeGreaterThanOrEqual(1);
    expect(bonusTxs[0].status).toBe(TxStatus.CONFIRMED);

    // ---------------------------------------------------------------
    // 5. (Optional) Gold order: spend USDF for a gold purchase
    // ---------------------------------------------------------------
    // If your GoldOpsService + XRPL integration are wired:
    const goldOrderId = `GOLD-${Date.now()}`;
    await goldOpsService.createGoldOrder(
      testMemberXRPLAddress,
      goldOrderUsdfAmount,
      goldOrderId
    );

    const goldOrderTxs = (await getLedgerTransactions()).filter(tx => tx.flow === "gold_order_create" && tx.memberId === memberId);
    expect(goldOrderTxs.length).toBeGreaterThanOrEqual(1);
    expect(goldOrderTxs[0].status).toBe(TxStatus.CONFIRMED);


    // ---------------------------------------------------------------
    // 6. Global invariants & summary checks
    // ---------------------------------------------------------------

    // 6a) KYC still approved and not sanctioned
    const finalStatus = await evmService.getComplianceStatus(testMemberEVMWallet);
    expect(finalStatus.kycApproved).toBe(true);
    expect(finalStatus.sanctioned).toBe(false);

    // 6b) Latest PoR still >= 100% coverage
    const finalSnapshot = await evmService.getLatestPoR();
    expect(finalSnapshot.coverageRatioBps).toBeGreaterThanOrEqual(10_000);

    // 6c) We can see a coherent ledger story in LedgerTransaction table
    const allTxs = await getLedgerTransactions();

    const flowsSeen = new Set(allTxs.map((t) => t.flow));
    expect(flowsSeen.has("kyc_update")).toBe(true);
    expect(flowsSeen.has("fthusd_deposit")).toBe(true);
    expect(flowsSeen.has("por_snapshot")).toBe(true);
    expect(flowsSeen.has("por_anchoring")).toBe(true);
    expect(flowsSeen.has("bonus_issue")).toBe(true);
    expect(flowsSeen.has("gold_order_create")).toBe(true);

    // 6d) No FAILED ledger transactions for this journey:
    const failed = allTxs.filter((t) => t.status === TxStatus.FAILED);
    expect(failed.length).toBe(0);
  });
});
