// scripts/runPorSnapshot.ts
import { PoRComposer } from "../src/services/por/PoRComposer";
import { TreasuryService } from "../src/services/treasury/TreasuryService";
import { config as loadEnv } from "dotenv";
import { logLedgerEvent } from "../src/logging/ledgerLogger"; // Assuming this file will be created

loadEnv({ path: ".env.local" }); // Ensure environment variables are loaded

(async () => {
  const treasury = new TreasuryService();
  const composer = new PoRComposer();

  const asOf = new Date();
  console.log(`[PoR Runner] Starting PoR snapshot run for: ${asOf.toISOString()}`);

  try {
    const input = await treasury.buildSnapshotInput(asOf);
    const result = await composer.publishSnapshot(input);

    console.log("[PoR Runner] PoR Snapshot published successfully.");
    console.log("[PoR Runner] Hash:", result.hash);
    console.log("[PoR Runner] Coverage Ratio (BPS):", result.coverageRatioBps);
    console.log("[PoR Runner] EVM Tx Hash:", result.evmTx);

    logLedgerEvent({
      flow: "por_snapshot",
      ledger: "evm",
      status: "confirmed",
      correlationId: result.evmTx, // Using EVM tx hash as correlation ID for the run
      payloadSummary: JSON.stringify({ hash: result.hash, coverage: result.coverageRatioBps }),
    });
  } catch (err: any) {
    console.error("[PoR Runner] PoR Snapshot failed:", err.message);
    logLedgerEvent({
      flow: "por_snapshot",
      ledger: "evm", // Or 'mixed' if both failed
      status: "failed",
      errorMessage: err.message,
    });
    process.exit(1);
  }
})().catch((err) => {
  console.error("[PoR Runner] Uncaught error:", err);
  process.exit(1);
});
