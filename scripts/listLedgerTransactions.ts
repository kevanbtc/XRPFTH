// scripts/listLedgerTransactions.ts

import { config as loadEnv } from "dotenv";
import { getLedgerTransactions } from "../src/services/db"; // Assuming a simple mock DB for now
import { LedgerTransaction } from "@prisma/client"; // Import LedgerTransaction from Prisma client

loadEnv({ path: ".env.local" }); // Load environment variables

/**
 * @notice Script to list recorded ledger transactions with optional filters.
 * This simulates an "ops view" or debugging tool.
 */
async function listLedgerTransactions() {
  console.log("Fetching ledger transactions...");

  // Parse command-line arguments for filters
  const args = process.argv.slice(2);
  const filters: {
    flow?: LedgerTransaction["flow"];
    ledger?: LedgerTransaction["ledger"];
    status?: LedgerTransaction["status"];
    memberId?: string;
  } = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--flow" && args[i + 1]) {
      filters.flow = args[++i] as LedgerTransaction["flow"];
    } else if (arg === "--ledger" && args[i + 1]) {
      filters.ledger = args[++i] as LedgerTransaction["ledger"];
    } else if (arg === "--status" && args[i + 1]) {
      filters.status = args[++i] as LedgerTransaction["status"];
    } else if (arg === "--memberId" && args[i + 1]) {
      filters.memberId = args[++i];
    }
  }

  try {
    const allTransactions = await getLedgerTransactions();

    const filteredTransactions = allTransactions.filter((tx) => {
      let match = true;
      if (filters.flow && tx.flow !== filters.flow) match = false;
      if (filters.ledger && tx.ledger !== filters.ledger) match = false;
      if (filters.status && tx.status !== filters.status) match = false;
      if (filters.memberId && tx.memberId !== filters.memberId) match = false;
      return match;
    });

    if (filteredTransactions.length === 0) {
      console.log("No transactions found matching the criteria.");
      return;
    }

    console.log(`Found ${filteredTransactions.length} transactions:`);
    filteredTransactions.forEach((tx) => {
      console.log(
        `[${tx.createdAt.toISOString()}] [${tx.ledger.toUpperCase()}] [${tx.flow}] [${tx.status.toUpperCase()}] TxHash: ${tx.txHash || "N/A"} Member: ${tx.memberId || "N/A"} Error: ${tx.errorCode || "N/A"}`
      ); // Use errorCode
      if (tx.payloadSummary) {
        console.log(`  Payload: ${tx.payloadSummary}`);
      }
    });
  } catch (error: any) {
    console.error("Error listing transactions:", error.message);
    process.exit(1);
  }
}

listLedgerTransactions();
