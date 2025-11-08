# XRPL’s Job in FTH (One-Line Charter)

> XRPL is the **canonical ledger** for member balances, credits, and entitlements.
> It does **three things**:
>
> 1. Tracks FTHUSD and USDF balances under strict issuer control
> 2. Tracks membership and gold entitlements via NFTs
> 3. Enforces basic rules (auth, compliance, PoR freshness, caps) via flags + Hooks

Everything else (KYC, fiat rails, PoR computation, websites) is off-ledger.

---

## 1. XRPL Account Topology

High-level map of XRPL actors:

```mermaid
graph TD
  Bank[(Bank / Treasury Systems)] -. off-ledger .- Backend

  subgraph XRPL
    Master[FTH Master Account]
    IssFTH[FTHUSD_issuer]
    IssUSDF[USDF_issuer]
    GoldVault[GoldVault_account]
    Oracle[ProgramOracle_account]
    OpsHot[Ops Hot Wallet(s)]
    Member1[(Member Wallet A)]
    Member2[(Member Wallet B)]
  end

  Backend[Off-chain Backend\n(KYC, Treasury, GoldOps,\nXRPLIntegrationService)]
  
  Backend --> IssFTH
  Backend --> IssUSDF
  Backend --> GoldVault
  Backend --> Oracle
  Backend --> OpsHot

  IssFTH --- Member1
  IssFTH --- Member2
  IssUSDF --- Member1
  IssUSDF --- Member2
  GoldVault --- Member1
  GoldVault --- Member2
```

### 1.1 Core Accounts

* **FTH Master Account**

  * Owns the issuer accounts and special accounts at a governance level.
  * Has **high-security keys**, possibly multi-sign.
  * Used rarely (config changes, freeze, emergency ops).

* **`FTHUSD_issuer`**

  * Issues and redeems **FTHUSD IOU**.
  * Config:

    * `requireAuth = true` → users need pre-approved trustlines.
    * `defaultRipple = false` → prevent accidental rippling.
    * Can use `globalFreeze` and `NoFreeze` patterns depending on design.

* **`USDF_issuer`**

  * Issues and redeems **USDF credits**.
  * Similar flags:

    * `requireAuth = true` (keeps program closed-loop).
    * `defaultRipple = false`.

* **`GoldVault_account`**

  * Operational account that:

    * Receives **USDF** when members place gold orders.
    * Holds temporary balances while orders are pending.
    * Mints/burns GoldOrderNFTs.

* **`ProgramOracle_account`**

  * Stores:

    * Latest **PoR hash**,
    * Oracle snapshot metadata,
    * Gold price summary (optional).
  * May be Hook-enabled to block operations if data is stale.

* **Ops Hot Wallet(s)**

  * Operational accounts:

    * Submit transactions on behalf of the backend (`Payment`, `NFTokenMint`, `SetHook`).
    * Have limited permissions; master keys may be disabled with regular key rotation.

* **Member Wallets**

  * User-controlled accounts:

    * Hold XRP (for fees), FTHUSD, USDF, and Membership/Gold NFTs.
    * Created off-ledger (XUMM, Ledger, self-custody, etc.) but whitelisted by KYC.

---

## 2. XRPL Assets: Tokens, NFTs, Hooks

### 2.1 Token Models (Issued Currencies)

#### FTHUSD

* **Currency code:** e.g. `FTHUSD` (3-char or 160-bit depending on your preference).
* **Issuer:** `FTHUSD_issuer`.
* **Usage:**

  * Member program balance.
  * Reference point for bonus calculations (off-chain reads ledger).
* **Key behaviors:**

  * Only minted/burned when backend confirms fiat movements.
  * 2% early exit adjustment enforced off-chain (XRPL only sees normal redemption, but Hooks *can* check time since deposit if you want extra enforcement).

#### USDF

* **Currency code:** `USDF`.
* **Issuer:** `USDF_issuer`.
* **Usage:**

  * Membership bonuses.
  * Medium to purchase gold and merchandise inside program.
* **Key behaviors:**

  * Cannot be redeemed into fiat.
  * Bonus issuance must respect caps (Hook can enforce “no insane bonus spikes”).

### 2.2 Trustlines

For each member wallet:

* Trustlines to:

  * `FTHUSD_issuer:FTHUSD`
  * `USDF_issuer:USDF`
* Flow:

  1. Member passes KYC off-chain.
  2. Backend calls XRPL to **pre-authorize** account (via `TrustSet` + `Authorize`).
  3. Member can then hold and transfer FTHUSD/USDF (subject to Hooks).

### 2.3 NFTs (XLS-20)

#### MembershipNFT

* **Issuer:** likely `Master` or `USDF_issuer`.
* **Fields (in URI/metadata):**

  * MemberID (hashed)
  * Tier (BASIC/SILVER/GOLD/VIP)
  * KYC level reference (hash)
  * Eligibility flags (gold module allowed, geographic restrictions, etc.)
* **Role on XRPL:**

  * Not the *source* of KYC; just a tag.
  * Used by Hooks and off-chain backend to:

    * Gate certain actions,
    * Adjust bonus multipliers.

#### GoldOrderNFT

* **Issuer:** `GoldVault_account`.
* **Fields:**

  * Order ID
  * Gold quantity (e.g., ounces)
  * Order timestamp and `lockUntil` (90-day timestamp)
  * Order status: PENDING / DELIVERED / BOUGHT_BACK / CANCELLED
  * Reference to off-chain order record hash
* **Lifecycle:**

  * Minted when user places a gold order (USDF sent to `GoldVault_account`).
  * Burned or updated at completion (delivery or buyback).

#### GoldCertificateNFT (optional)

* More “final” representation of a permanent gold allocation after the 90-day period, if you want a distinction between “order” vs “allocation”.

---

## 3. Hooks & On-Ledger Rules

Hooks are your little XRPL bouncers:

> They can’t see the whole universe, but they can reject or mutate transactions that violate your rules.

### 3.1 BonusHook

Attached to:

* `USDF_issuer` or `Master` or a dedicated “control” account that sees relevant flows.

Responsibilities:

1. **Bonus Caps**

   * Block USDF payments or mints that exceed per-day/per-account cap thresholds.
   * Example: If a “bonus issuance” transaction would push today’s bonus over X USDF for that account, reject.

2. **PoR Staleness Check**

   * Before large bonus distributions, check:

     * The latest PoR timestamp in `ProgramOracle_account`.
   * If older than N hours/days → reject or require smaller operations.

3. **Program Windows**

   * Enforce that some operations (e.g., special campaigns) only occur between defined ledger times.

> Note: Heavy business logic (like computing the bonus itself) stays off-chain; Hook is just a **guardrail**.

### 3.2 ComplianceHook

Attached to:

* `FTHUSD_issuer` and/or `USDF_issuer` or the `GoldVault_account`.

Responsibilities:

1. **Wallet Eligibility**

   * Check if sender/receiver wallets are flagged as:

     * KYC-approved,
     * Not sanctioned,
     * Not blocked by region rules.
   * Data reference:

     * Stored as bitfield / flags in Hook state per account,
     * Or as hashed lookups anchored via `ProgramOracle_account`.

2. **Product Restrictions**

   * Example:

     * Certain jurisdictions can hold FTHUSD but not interact with gold module.
   * Hook rejects `Payment` to `GoldVault_account` unless:

     * Wallet has “GoldAllowed” flag set.

3. **Freeze / Blocklist Controls**

   * Emergency block of certain addresses (fraud, sanctions update).
   * Works together with XRPL’s native freeze functions.

### 3.3 Oracle/PoR Hook (Optional)

* Hook on `ProgramOracle_account`:

  * Validates format and recency of PoR updates.
  * Could enforce that only pre-authorized OpsHot wallets update oracle entries.

---

## 4. Core XRPL Flows (End-to-End)

Let’s describe **what XRPL sees** for each major flow.

### 4.1 Member Onboarding

1. Member completes KYC off-chain.
2. Backend:

   * Creates MemberID and maps it to XRPL wallet address.
   * Writes hashed KYC reference to `KYCService` DB.
3. XRPL actions:

   * `TrustSet` to FTHUSD & USDF issuers (by member or OpsHot).
   * Issuers mark the trustline as authorized (`requireAuth` mechanics).
   * Optional: mint **MembershipNFT** to member wallet.

Result: Member wallet is now “seen” by XRPL as eligible to hold program assets.

---

### 4.2 FTHUSD Deposit (Fiat → XRPL IOU)

1. Member sends USD via bank rails.
2. Banking Adapter confirms receipt.
3. Backend computes:

   * Net FTHUSD to mint (1:1, minus fees if any).
4. XRPL actions:

   * `Payment` from `FTHUSD_issuer` → Member wallet, denomination `FTHUSD`.
   * This increases the member’s FTHUSD balance.

Hooks enforce:

* ComplianceHook checks member allowed → if not, transaction rejected.
* PoR updates & reconciliation live off-chain, but you *can* require that PoR is “fresh enough” before processing large mints.

---

### 4.3 FTHUSD Redemption (XRPL IOU → Fiat)

1. Member submits redemption request via frontend.
2. Backend:

   * Validates:

     * 90-day window / 2% early exit adjustment.
     * Compliance (account not blocked).
3. XRPL actions:

   * Member sends `Payment` of `FTHUSD` back to `FTHUSD_issuer`.
   * Issuer may **burn** FTHUSD by keeping balances internal and reducing total outstanding supply off-chain.
4. Banking Adapter:

   * Triggers USD payout via wire/ACH to member.

Hooks:

* ComplianceHook:

  * Can restrict outgoing `Payment` to issuer if wallet under investigation or blocked.
* BonusHook:

  * Not directly involved; redemptions are pure IOU settlements.

---

### 4.4 USDF Bonus Issuance

1. Backend runs `BonusEngine` off-chain:

   * Reads XRPL FTHUSD balances.
   * Reads MembershipNFT tiers.
   * Applies bonus rules, cap logic, etc.
2. For each member:

   * Construct a `Payment` or `TrustSet + Payment` from `USDF_issuer` → member.

Hooks:

* **BonusHook**:

  * Rejects any issuance that would:

    * Exceed per-day/per-account bonus cap.
    * Occur when PoR data is stale.
* ComplianceHook:

  * Ensures bonus only goes to KYC-approved, allowed jurisdictions.

---

### 4.5 Gold Order Creation (USDF → GoldVault)

1. Member selects “buy gold with USDF” in frontend.
2. Backend:

   * Quotes price (from oracle/EVM).
   * Confirms off-chain that member accepts.
3. XRPL actions:

   * `Payment` of USDF:

     * From Member wallet → `GoldVault_account`.
   * `NFTokenMint`:

     * GoldVault mints **GoldOrderNFT** to Member wallet with:

       * Quantity,
       * Order timestamp,
       * `lockUntil` (90 days),
       * Off-chain order hash pointer.

Hooks:

* ComplianceHook:

  * Blocks USDF payments to `GoldVault_account` from ineligible regions or non-KYC wallets.
* BonusHook (optional):

  * Could enforce that cumulative gold buying per account per day stays under risk thresholds.

---

### 4.6 Gold Order Completion (Delivery or Buyback)

After 90 days:

**Delivery path:**

1. Backend verifies:

   * GoldOps inventory,
   * Shipping details (off-chain).
2. XRPL actions:

   * Option A: Update GoldOrderNFT metadata (status: DELIVERED).
   * Option B: Burn GoldOrderNFT and optionally mint GoldCertificateNFT.

**Buyback path:**

1. Backend:

   * Computes USDF amount at spot minus 2% adjustment.
2. XRPL actions:

   * `NFTokenBurn` for GoldOrderNFT (order completed).
   * `Payment` of USDF:

     * GoldVault → Member.

Hooks:

* ComplianceHook:

  * Ensures wallet still allowed to receive USDF.
* BonusHook:

  * Can enforce caps on total buyback-flows per unit time if desired.

---

### 4.7 PoR & Price Anchoring

1. Off-chain PoR engine:

   * Aggregates bank balances, gold holdings, token supply.
   * Computes PoR snapshot hash.
2. EVM side writes to `FTHPoRRegistry`.
3. XRPL anchoring:

   * Backend submits `Payment` or `AccountSet` or `TrustSet` with:

     * Memo containing PoR hash, timestamp, and optional reference to EVM block.
   * Optionally store latest PoR in **Hook state** on `ProgramOracle_account`.

Hooks:

* BonusHook & ComplianceHook can:

  * Read PoR timestamp from Hook state.
  * Reject actions if PoR older than threshold (e.g., 24 hours).

---

## 5. XRPL Safety & Configuration

**Flags & Settings:**

* `FTHUSD_issuer` & `USDF_issuer`:

  * `requireAuth = true`
  * `defaultRipple = false`
  * Consider:

    * `DisallowXRP` to prevent confusion with native XRP flows.
    * Freeze logic (global freeze only for emergencies).

* **Master Account:**

  * Multi-sign enforced.
  * Regular key disabled; signer list required.

* **Ops Accounts:**

  * Strictly limited permissions.
  * Daily/weekly key rotation.

**Patterns:**

* **“Closed-Loop” Pattern for USDF**

  * No external gateways or market-making.
  * USDF only flows between:

    * Issuer,
    * GoldVault,
    * Approved member wallets.

* **“Fiat-Tracked IOU” Pattern for FTHUSD**

  * Off-chain ledger reconciled vs XRPL supply at high frequency.
  * PoR anchoring binds off-chain accounting to on-chain supply.

---

## 6. What XRPL Does *Not* Do

To keep regulators calm and devs sane:

* XRPL **does not**:

  * Store PII.
  * Run heavy business logic (KYC, bonus math, gold pricing).
  * Directly connect to banks or payment networks.

XRPL **only**:

* Holds balances, entitlements, and hashes.
* Enforces simple, local rules via Hooks and flags.
* Provides an immutable audit trail of “who got what, when”.

---

That’s your **high-level full XRPL system**: every on-ledger piece, what it does, and how it plays with the rest of the beast.

From here, a natural next layer (later) is:

* `xrpl/ACCOUNT_PLAN.md` — concrete addresses, flags, signer lists.
* `xrpl/FLOWS.md` — each flow as a sequence of XRPL JSON-RPC calls (ready to wire into `XRPLIntegrationService.js`).

But structurally, this is the full XRPL side of FTH in one mental map.
