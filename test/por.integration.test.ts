// test/por.integration.test.ts

import { getEVMService } from "../src/services/evm";
import { getXRPLService } from "../src/services/xrpl";
import { PoRComposer } from "../src/services/por/PoRComposer";
import { TreasuryService } from "../src/services/treasury/TreasuryService";
import { config as loadEnv } from "dotenv";
import { LedgerTransaction } from "../src/models/LedgerTransaction";

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

describe("PoR Pipeline End-to-End Integration Test", () => {
  let evmService: ReturnType<typeof getEVMService>;
  let xrplService: ReturnType<typeof getXRPLService>;
  let porComposer: PoRComposer;
  let treasuryService: TreasuryService;

  beforeAll(async () => {
    evmService = getEVMService();
    xrplService = getXRPLService();
    porComposer = new PoRComposer();
    treasuryService = new TreasuryService();

    await evmService["provider"].ready; // Ensure EVM provider is connected
    await xrplService.connect(); // Ensure XRPL client is connected
  });

  afterAll(async () => {
    await xrplService.disconnect();
  });

  it("should successfully publish a PoR snapshot to both EVM and XRPL", async () => {
    const asOf = new Date();
    const input = await treasuryService.buildSnapshotInput(asOf);

    const { hash, coverageRatioBps, evmTx } = await porComposer.publishSnapshot(input);

    // Assertions for EVM side
    const latestPoR = await evmService.getLatestPoR();
    expect(latestPoR.hash).toEqual(hash);
    expect(latestPoR.coverageRatioBps).toEqual(BigInt(coverageRatioBps));
    expect(latestPoR.totalAssets).toEqual(input.bankUsdCents + input.goldUsdCents + input.otherAssetsUsdCents);
    expect(latestPoR.totalLiabilities).toEqual(input.fthusdLiabilitiesCents);
    expect(latestPoR.uri).toEqual(input.uri);
    expect(latestPoR.coverageRatioBps).toBeGreaterThanOrEqual(10000); // >= 100%

    // Assertions for XRPL side (checking LedgerTransaction records)
    // In a real test, you'd query XRPL directly for the memo, but for this integration,
    // we rely on the LedgerTransaction record indicating successful submission.
    const xrplPorTx = mockLedgerTransactions.find(
      (tx) => tx.flow === "por_anchoring" && tx.txHash && tx.status === "confirmed"
    );
    expect(xrplPorTx).toBeDefined();
    expect(xrplPorTx?.payloadSummary).toContain(hash); // Check if hash is in memo

    // Assertions for LedgerTransaction records
    const evmPorTx = mockLedgerTransactions.find(
      (tx) => tx.flow === "por_snapshot" && tx.txHash === evmTx && tx.status === "confirmed" // Assume evmTx is the hash string
    );
    expect(evmPorTx).toBeDefined();
    expect(evmPorTx?.ledger).toBe("evm");
    expect(evmPorTx?.payloadSummary).toContain(hash);

    expect(mockLedgerTransactions.length).toBeGreaterThanOrEqual(2); // At least one EVM and one XRPL record
  }, 30000); // Increase timeout for async operations
});
