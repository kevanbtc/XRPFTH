// scripts/simulateDevnetDay.ts

import { getXRPLService } from "../src/services/xrpl";
import { BonusEngine } from "../src/services/BonusEngine";
import { GoldOpsService } from "../src/services/GoldOpsService";
import { config as loadEnv } from "dotenv";
import xrpl from "xrpl";

loadEnv({ path: ".env.local" }); // Ensure environment variables are loaded

async function simulateDevnetDay() {
  console.log("Starting FTH Devnet Day Simulation...");

  const xrplService = getXRPLService();
  const bonusEngine = new BonusEngine();
  const goldOpsService = new GoldOpsService();

  try {
    await xrplService.connect();
    console.log("Connected to XRPL client.");

    // --- 1. Seed Environment (if not already done) ---
    // For a real simulation, you'd have a script to fund accounts,
    // create trustlines, and authorize them.
    // Here, we'll assume a "test member" is already set up.

    const testMemberAddress = process.env.XRPL_TEST_MEMBER_ADDRESS || "rTESTMEMBERADDRESS";
    const testMemberSeed = process.env.XRPL_TEST_MEMBER_SEED || "sTESTMEMBERSEED";
    const testMemberWallet = xrpl.Wallet.fromSeed(testMemberSeed);

    console.log(`Simulating for member: ${testMemberAddress}`);

    // Example: Authorize trustlines if not already authorized
    // In a real scenario, this would be part of an onboarding script
    // await xrplService.authorizeMemberTrustlines(testMemberAddress);
    // console.log("Test member trustlines authorized.");

    // Example: Credit FTHUSD (simulating a deposit)
    // const depositId = `sim-deposit-${Date.now()}`;
    // await xrplService.creditFTHUSD(testMemberAddress, "1000", depositId);
    // console.log(`Credited 1000 FTHUSD to ${testMemberAddress}`);

    // --- 2. Run Daily Bonus Engine ---
    console.log("\nRunning daily bonus engine...");
    const bonusInstructions = [
      { memberAddress: testMemberAddress, amountUSDF: "25.5", memberId: "test-member-1" },
    ];
    const bonusRunId = `daily-bonus-${Date.now()}`;
    await bonusEngine.executeDailyBonusRun(bonusInstructions, bonusRunId);
    console.log("Daily bonus issued.");

    // --- 3. Anchor a Fake PoR ---
    console.log("\nAnchoring fake PoR snapshot...");
    const porHash = "sim-por-hash-" + Date.now();
    const porTime = new Date().toISOString();
    await xrplService.anchorPoR(porHash, porTime);
    console.log("PoR snapshot anchored.");

    // --- 4. Create a Gold Order ---
    console.log("\nCreating a gold order...");
    const goldOrderId = `sim-gold-order-${Date.now()}`;
    const metadataUri = `ipfs://fakeipfsuri/${goldOrderId}`;

    // Simulate member paying USDF to GoldVault (frontend action)
    const paymentTx = await xrplService.createGoldOrder(
      testMemberAddress,
      "500",
      goldOrderId
    );
    // In a real app, this paymentTx would be sent to the frontend for member signing.
    // For simulation, we'll just log it.
    console.log("Simulated member payment for gold order:", paymentTx);

    // Simulate backend minting GoldOrderNFT after payment confirmation
    await xrplService.mintGoldOrderNFT(testMemberAddress, goldOrderId, metadataUri);
    console.log(`GoldOrderNFT minted for order ${goldOrderId}`);

    console.log("\nFTH Devnet Day Simulation Complete!");
  } catch (error) {
    console.error("Simulation failed:", error);
  } finally {
    await xrplService.disconnect();
    console.log("Disconnected from XRPL client.");
  }
}

simulateDevnetDay();
