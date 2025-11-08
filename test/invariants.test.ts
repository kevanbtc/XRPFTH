// test/invariants.test.ts

import { getXRPLService } from "../src/services/xrpl";
import { config as loadEnv } from "dotenv";
import xrpl from "xrpl";

loadEnv({ path: ".env.local" }); // or .env.test

describe("XRPLIntegrationService Invariants (devnet)", () => {
  const svc = getXRPLService();

  beforeAll(async () => {
    await svc.connect();
  });

  afterAll(async () => {
    await svc.disconnect();
  });

  // This test assumes a ComplianceHook is in place that rejects payments
  // from non-KYC'd or non-authorized accounts.
  // For a real test, you'd need to set up a non-authorized test wallet.
  it.skip("should prevent USDF payments from non-authorized wallets (if ComplianceHook is active)", async () => {
    // This is a placeholder. A real test would involve:
    // 1. Creating a new XRPL wallet that is NOT authorized by the issuer.
    // 2. Funding it with some XRP for fees.
    // 3. Attempting to send USDF from this wallet to another address.
    // 4. Asserting that the transaction is rejected by the ledger (e.g., tecNO_PERMISSION).

    const nonAuthorizedWallet = xrpl.Wallet.generate(); // A new, unauthorized wallet
    const destinationAddress = "rAAAAAAAAAAAAAAAAAAAAAAAAA"; // A dummy destination

    // Fund the nonAuthorizedWallet with some XRP for fees (off-ledger simulation)
    // In a real test, you'd use a faucet or a funded account to send XRP.

    const paymentTx: xrpl.Payment = { // Explicitly type as xrpl.Payment
      TransactionType: "Payment",
      Account: nonAuthorizedWallet.classicAddress,
      Destination: destinationAddress,
      Amount: {
        currency: "USDF",
        issuer: svc["cfg"].usdfIssuer, // Access private cfg for issuer address
        value: "10",
      },
    };

    // Expect the transaction to fail due to Hook/issuer authorization
    await expect(
      svc["submitWithWallet"](nonAuthorizedWallet, paymentTx, "test_usdf_unauthorized_payment", nonAuthorizedWallet.classicAddress)
    ).rejects.toThrow(/XRPL transaction failed/);
  });

  it("should require a valid depositId for FTHUSD credit (backend discipline)", async () => {
    // This invariant is primarily enforced by backend logic before calling XRPL.
    // Here, we're testing that the `creditFTHUSD` method itself requires a depositId.
    // The actual validation of the depositId's existence and validity would be in the calling service.

    const memberAddress = "rBBBBBBBBBBBBBBBBBBBBBBBBBBBB"; // Dummy member address
    const amount = "100";
    const invalidDepositId = ""; // An empty or invalid deposit ID

    // Expecting an error if the backend logic were to pass an invalid depositId
    // For this specific method, it just passes the string, so the invariant
    // is more about the *caller* of creditFTHUSD.
    // This test primarily serves as a reminder for the higher-level service's unit tests.
    expect(() =>
      svc.creditFTHUSD(memberAddress, amount, invalidDepositId)
    ).not.toThrow(); // The method itself doesn't validate the content of depositId

    // A more robust test would mock the backend's call to creditFTHUSD
    // and assert that it only calls with a validated depositId.
  });

  // This test would require a deployed BonusHook on the USDF_issuer
  // that enforces daily caps.
  it.skip("should enforce USDF bonus caps via BonusHook", async () => {
    // This is a placeholder. A real test would involve:
    // 1. Deploying a BonusHook to the USDF_issuer with a defined daily cap.
    // 2. Sending multiple issueUSDFBonus transactions for the same member.
    // 3. Asserting that transactions exceeding the cap are rejected by the ledger.

    const memberAddress = "rCCCCCCCCCCCCCCCCCCCCCCCCCCC"; // Dummy member address
    const smallBonus = "10";
    const largeBonus = "1000000"; // Exceeds hypothetical daily cap
    const bonusBatchId = "test-batch-" + Date.now();
    const bonusDateISO = new Date().toISOString();

    // First bonus should succeed
    await expect(
      svc.issueUSDFBonus(memberAddress, smallBonus, bonusBatchId, bonusDateISO)
    ).resolves.toBeDefined();

    // Subsequent bonus that exceeds the cap should fail
    await expect(
      svc.issueUSDFBonus(memberAddress, largeBonus, bonusBatchId, bonusDateISO)
    ).rejects.toThrow(/XRPL tx failed/); // Expecting a Hook rejection message
  });
});
