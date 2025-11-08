# FTH XRPL Hook Design

> **⚠️ CRITICAL - IMPLEMENTATION STATUS**  
> **This document describes FUTURE ARCHITECTURE - NOT CURRENT PRODUCTION**
> 
> - **Status**: Design specification only. **ZERO CODE IMPLEMENTED.**
> - **Current Enforcement**: ALL business logic runs **OFF-CHAIN** in NodeJS backend services
> - **Production Timeline**: Hooks are **Phase 2+** - not required for launch
> - **Authority**: Backend services (KYCService, FinancingService, etc.) are **authoritative**
> - **Risk Assessment**: See `xrpl/XRPL_AUDIT_REPORT.md` Issue #4
> 
> **For Stakeholders**: Do NOT assume any enforcement happens via Hooks. All compliance, caps, and validation logic is currently in PostgreSQL + NodeJS backend.

---

This document outlines the **future design** and responsibilities of XRPL Hooks for the FTH Program. Hooks are on-ledger smart contracts that would enforce specific rules and invariants, acting as guardrails for transactions.

**Current Reality**: No Hook code exists. All enforcement described below is currently handled by off-chain services.

It complements `xrpl/README.md` (conceptual design) and `xrpl/ACCOUNT_PLAN.md` (account topology) by detailing the proposed on-ledger logic for future implementation.

---

## 1. Hook Philosophy

Hooks in FTH are designed to be:

*   **Minimalist:** Only enforce critical, non-negotiable rules that cannot be reliably managed off-chain.
*   **Deterministic:** Their behavior must be predictable and auditable.
*   **Defensive:** Primarily act as "bouncers" to reject invalid transactions, rather than executing complex business logic.
*   **Upgradeable:** Designed with upgradeability in mind where possible, or with clear procedures for replacement.

Heavy business logic (KYC, bonus calculations, gold pricing) remains off-chain. Hooks provide a final layer of enforcement on the ledger.

---

## 2. Hook Placement and Responsibilities

### 2.1 ComplianceHook

**Attached to:** `FTHUSD_issuer`, `USDF_issuer`, and `GoldVault_account`.

**Purpose:** Enforce wallet eligibility, product restrictions, and blocklist controls based on off-chain KYC and compliance data.

**State Management:**
*   **Account Flags/Bitfields:** The Hook will maintain a mapping (e.g., in its Hook state or by referencing `ProgramOracle_account` state) of member XRPL addresses to a bitfield or set of flags indicating:
    *   `is_kyc_approved`: Boolean, true if the wallet has passed KYC.
    *   `is_sanctioned`: Boolean, true if the wallet is on a sanctions list.
    *   `gold_module_allowed`: Boolean, true if the wallet is eligible for gold-related transactions.
    *   `jurisdiction_code`: (Optional) A numerical code representing the member's jurisdiction, used for more granular product restrictions.

**Enforcement Rules:**

1.  **`FTHUSD_issuer` (on `Payment` transactions):**
    *   **Outgoing FTHUSD (minting to member):**
        *   Reject if `Destination` wallet `is_kyc_approved` is false.
        *   Reject if `Destination` wallet `is_sanctioned` is true.
    *   **Incoming FTHUSD (redemption from member):**
        *   Reject if `Source` wallet `is_sanctioned` is true (e.g., during investigation).

2.  **`USDF_issuer` (on `Payment` transactions):**
    *   **Outgoing USDF (bonus issuance to member):**
        *   Reject if `Destination` wallet `is_kyc_approved` is false.
        *   Reject if `Destination` wallet `is_sanctioned` is true.
        *   Reject if `Destination` wallet `jurisdiction_code` does not permit USDF.
    *   **Incoming USDF (from GoldVault on buyback):**
        *   Reject if `Source` wallet `is_sanctioned` is true.

3.  **`GoldVault_account` (on `Payment` transactions):**
    *   **Incoming USDF (from member for gold order):**
        *   Reject if `Source` wallet `is_kyc_approved` is false.
        *   Reject if `Source` wallet `is_sanctioned` is true.
        *   Reject if `Source` wallet `gold_module_allowed` is false.
        *   Reject if `Source` wallet `jurisdiction_code` does not permit gold transactions.
    *   **Outgoing USDF (to member on buyback):**
        *   Reject if `Destination` wallet `is_sanctioned` is true.

**Update Mechanism:**
*   The Hook state for compliance flags will be updated by `ProgramOracle_account` or a dedicated `OpsHotWallet` via `SetHookState` transactions, with strict authorization checks within the Hook.

### 2.2 BonusHook

**Attached to:** `USDF_issuer`.

**Purpose:** Enforce daily bonus issuance caps and check for PoR data freshness before large bonus distributions.

**State Management:**
*   **`daily_bonus_total[account]`:** Stores the cumulative USDF bonus issued to a specific member account for the current day.
*   **`last_bonus_day[account]`:** Stores the ledger day (or timestamp) of the last bonus issuance for a specific member account.
*   **`bonus_cap_per_day`:** A global Hook parameter defining the maximum USDF bonus per member per day.
*   **`por_max_age_seconds`:** A global Hook parameter defining the maximum acceptable age for PoR data.

**Enforcement Rules (on `Payment` transactions from `USDF_issuer`):**

1.  **Daily Cap Enforcement:**
    *   Read `daily_bonus_total[Destination]` and `last_bonus_day[Destination]`.
    *   If `current_ledger_day` is different from `last_bonus_day[Destination]`, reset `daily_bonus_total[Destination]` to 0.
    *   Calculate `new_total = daily_bonus_total[Destination] + Amount.value`.
    *   If `new_total > bonus_cap_per_day`, reject the transaction.
    *   If successful, update `daily_bonus_total[Destination]` and `last_bonus_day[Destination]`.

2.  **PoR Staleness Check:**
    *   Read `last_por_timestamp` from `ProgramOracle_account`'s Hook state (or a dedicated field).
    *   If `current_ledger_time - last_por_timestamp > por_max_age_seconds`, reject the transaction (especially for large bonus batches, a threshold could be applied).

**Update Mechanism:**
*   `bonus_cap_per_day` and `por_max_age_seconds` can be updated by the `Master Governance Account` or an authorized `OpsHotWallet` via `SetHookState`.

### 2.3 OracleHook (Optional)

**Attached to:** `ProgramOracle_account`.

**Purpose:** Validate the format and recency of PoR updates and restrict who can submit them.

**State Management:**
*   **`last_por_timestamp`:** Stores the timestamp of the last valid PoR update.
*   **`authorized_updaters`:** A list or bitfield of `OpsHotWallet` addresses authorized to submit PoR updates.

**Enforcement Rules (on `Payment` or `AccountSet` transactions to `ProgramOracle_account`):**

1.  **Authorized Sender:**
    *   Reject if `Source` account is not in `authorized_updaters`.
2.  **Memo Format Validation:**
    *   Reject if the transaction does not contain `por_hash` and `por_time` memos in the expected hex format.
3.  **Timestamp Monotonicity:**
    *   Reject if `por_time` in the memo is older than `last_por_timestamp` stored in Hook state.
    *   If successful, update `last_por_timestamp` with the new `por_time`.

**Update Mechanism:**
*   `authorized_updaters` can be updated by the `Master Governance Account` via `SetHookState`.

---

## 3. Hook Development Considerations

*   **Language:** C or Rust (depending on XRPL Hooks SDK availability and preference).
*   **Testing:** Extensive unit tests for Hook logic, and integration tests on devnet/testnet to verify on-ledger behavior.
*   **Deployment:** Hooks will be deployed via `SetHook` transactions, typically by the `Master Governance Account`.
*   **Upgradeability:** Design Hooks to be easily replaceable or upgradeable if business logic changes, potentially using a proxy pattern or by simply deploying a new Hook and updating account associations.
*   **Gas Costs:** Optimize Hook code for minimal execution cost.
*   **Error Handling:** Hooks should return appropriate `tec` (Transaction Error Code) results to indicate specific failure reasons.

---

This Hook design provides a robust framework for on-ledger enforcement, ensuring the FTH Program's core invariants are maintained even as off-chain services evolve.
