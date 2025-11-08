# XRPL Testing Strategy

## 1. Networks & Accounts

### 1.1 Which XRPL Networks to Use

*   **Local `xrpld` in Docker:**
    *   **Purpose:** Primary environment for local development, unit tests, and rapid iteration.
    *   **Benefits:** Isolated, deterministic, fast, no reliance on external network.
    *   **Usage:** All new XRPL-related code should first be developed and tested against a local `xrpld` instance.
*   **Public Testnet / Devnet:**
    *   **Purpose:** Integration testing with a more realistic network environment, including public faucets and potential amendment activations.
    *   **Benefits:** Simulates mainnet behavior more closely, allows testing of cross-network interactions (e.g., with EVM testnets).
    *   **Usage:** Integration tests, end-to-end hero journey tests, and pre-deployment verification.
*   **Mainnet:**
    *   **Purpose:** Production deployment.
    *   **Usage:** Only after extensive testing on local and testnet environments, security audits, and regulatory approvals.

### 1.2 Account Separation

*   **Test Accounts:**
    *   **Creation:** Ephemeral, created programmatically for each test run (where possible) or from a dedicated testnet faucet.
    *   **Naming Convention:** All automated test accounts should use a clear prefix in their metadata or tags (e.g., `TEST_FTH_MEMBER_1`).
    *   **Rules:**
        *   **No real issuer accounts:** Automated tests must *never* interact with production or staging issuer accounts.
        *   **Isolation:** Tests should be designed to avoid polluting shared state between test runs.
        *   **Cleanup:** Ephemeral accounts should be funded and then drained/deleted after tests if possible, or clearly marked as test accounts.
*   **Staging Accounts:**
    *   **Purpose:** Mirror production accounts on a testnet for pre-production testing.
    *   **Rules:**
        *   Managed with similar security protocols as production (e.g., HSM/KMS for seeds).
        *   Used for final end-to-end testing before mainnet deployment.
*   **Production Accounts:**
    *   **Purpose:** Live operations on XRPL Mainnet.
    *   **Rules:**
        *   Strict key management (HSM/KMS, multi-sig).
        *   Dedicated monitoring and alerting.
        *   Access restricted to authorized personnel only.

## 2. Faucets & Funding

### 2.1 Utility for Funding Test Accounts

*   **`scripts/xrpl/fundTestAccount.ts`:**
    *   **Functionality:**
        *   Takes a target XRPL address and an optional amount of XRP.
        *   If running against Testnet/Devnet: Uses a public faucet API to request XRP.
        *   If running against local `xrpld`: Uses a local "funder" wallet (e.g., `OpsHot_wallet` or a dedicated test funder) to send XRP.
        *   Can also be extended to fund with FTHUSD/USDF from test issuer accounts.
    *   **Usage:** Integrated into automated test setups to provision new accounts.

### 2.2 Integration Test Account Provisioning

*   **Ephemeral Accounts:** Integration tests should be able to:
    1.  Generate a new XRPL wallet.
    2.  Fund it with XRP using `fundTestAccount.ts`.
    3.  Establish trustlines to test issuer accounts.
    4.  Perform test transactions.
    5.  Verify outcomes.
    6.  (Optional) Clean up the account by sending remaining XRP back to the funder and deleting the account.
*   **Non-Polluting State:** Ensure that test runs do not leave behind artifacts that could interfere with subsequent tests.

## 3. Stress / Chaos Tests

### 3.1 XRPL-Focused Chaos Cases

*   **Node Temporarily Unreachable:**
    *   **Scenario:** Simulate the XRPL node (local or public) going offline for a short period.
    *   **Test:** Verify `XRPLIntegrationService` handles connection loss gracefully, retries with backoff, and alerts appropriately.
*   **High Fee Conditions:**
    *   **Scenario:** Simulate network congestion by submitting many low-priority transactions, causing transaction fees to rise.
    *   **Test:** Verify FTH transactions (especially critical ones like mint/burn) either succeed with higher fees or fail gracefully with appropriate error messages and retry logic.
*   **Ledger Close Delays:**
    *   **Scenario:** Simulate a slower-than-usual ledger closing time.
    *   **Test:** Verify backend services waiting for transaction validation do not time out prematurely and handle delayed confirmations.
*   **Issuer Account Freeze (Simulated):**
    *   **Scenario:** Temporarily set `lsfGlobalFreeze` on a test issuer account.
    *   **Test:** Verify all transactions attempting to use that issuer fail with the expected error.

### 3.2 Extending Hero Journey Tests

*   **Graceful Downtime Handling:**
    *   Modify existing hero journey and PoR pipelines to include steps that simulate XRPL downtime.
    *   Assert that the system:
        *   Retries XRPL submissions with exponential backoff.
        *   Logs errors clearly.
        *   Fails safely without corrupting internal state (e.g., no double-mints, no lost redemptions).
*   **Retry Logic:**
    *   Implement and test robust retry mechanisms in `XRPLIntegrationService` for transient XRPL errors.
    *   Ensure idempotency for critical operations.
*   **Fail-Safe Mechanisms:**
    *   Verify that if XRPL becomes inconsistent or unreachable for an extended period, the FTH system can enter a "maintenance mode" or "fail-safe" state, preventing further operations that rely on XRPL.
