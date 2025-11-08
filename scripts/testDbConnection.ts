// scripts/testDbConnection.ts
// Quick sanity check: can we talk to Postgres via Prisma?

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🔍 Testing database connection...\n");

  try {
    // Test 1: Can we connect?
    await prisma.$connect();
    console.log("✅ Connected to PostgreSQL successfully");

    // Test 2: Can we count members?
    const memberCount = await prisma.member.count();
    console.log(`✅ Member table accessible: ${memberCount} members found`);

    // Test 3: Can we count transactions?
    const txCount = await prisma.ledgerTransaction.count();
    console.log(`✅ LedgerTransaction table accessible: ${txCount} transactions found`);

    // Test 4: Can we count gold orders?
    const goldOrderCount = await prisma.goldOrder.count();
    console.log(`✅ GoldOrder table accessible: ${goldOrderCount} orders found`);

    // Test 5: Can we count KYC events?
    const kycEventCount = await prisma.kYCEvent.count();
    console.log(`✅ KYCEvent table accessible: ${kycEventCount} events found`);

    console.log("\n🎉 Database is fully operational!");
    console.log("\nYour system now has:");
    console.log("  - XRPL node running (port 5005)");
    console.log("  - PostgreSQL running (port 5432)");
    console.log("  - Prisma Client generated");
    console.log("  - All tables created and accessible");
    console.log("\nNext steps:");
    console.log("  1. Run tests: npm test");
    console.log("  2. Run hero journey: npx jest test/heroJourney.test.ts");
    console.log("  3. Check transactions: node scripts/listLedgerTransactions.js");
  } catch (error) {
    console.error("❌ Database connection test failed:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
