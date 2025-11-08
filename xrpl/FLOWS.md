# FTH XRPL Core Flows

This document describes the main business flows of the FTH Program **as seen on XRPL**:
which transactions are sent, by whom, and how Hooks and flags are expected to behave.

Higher-level product behavior is defined in `FTH_PROGRAM_SYSTEM_OVERVIEW.md`.
Account roles and configuration are defined in `xrpl/ACCOUNT_PLAN.md`.

---

## 0. Conventions

- `ADDR_MEMBER` — member XRPL address.
- `ADDR_FTHUSD_ISSUER` — FTHUSD issuer address.
- `ADDR_USDF_ISSUER` — USDF issuer address.
- `ADDR_GOLDVAULT` — GoldVault account address.
- `ADDR_ORACLE` — ProgramOracle account address.
- `ADDR_OPS_*` — Ops Hot Wallet addresses.

XRPL transactions are shown as JSON-like structures for clarity.

---

## 1. Member Onboarding

### 1.1 Off-Chain Steps

1. Member completes KYC/AML.
2. Backend assigns `MemberID` and stores mapping:
   - `MemberID → ADDR_MEMBER`.
3. `ComplianceRegistry` (EVM) is updated with KYC tier and jurisdiction info.

### 1.2 XRPL Steps

**(a) Member creates wallet**  
Done by user via XUMM, Ledger, etc.

**(b) Establish Trustlines**

Member (or Ops acting on their behalf) submits:

```jsonc
{
  "TransactionType": "TrustSet",
  "Account": "ADDR_MEMBER",
  "LimitAmount": {
    "currency": "FTHUSD",
    "issuer": "ADDR_FTHUSD_ISSUER",
    "value": "1000000" // high ceiling, real limit enforced off-chain
  }
}
```

```jsonc
{
  "TransactionType": "TrustSet",
  "Account": "ADDR_MEMBER",
  "LimitAmount": {
    "currency": "USDF",
    "issuer": "ADDR_USDF_ISSUER",
    "value": "1000000000"
  }
}
```

**(c) Issuer Authorization**

Because `requireAuth = true`, issuers must authorize the trustline:

```jsonc
{
  "TransactionType": "TrustSet",
  "Account": "ADDR_FTHUSD_ISSUER",
  "Flags": 262144, // tfSetfAuth
  "LimitAmount": {
    "currency": "FTHUSD",
    "issuer": "ADDR_MEMBER",
    "value": "0"
  }
}
```

Similar for `USDF_issuer`.

**Hook behavior:**

* ComplianceHook checks whether `ADDR_MEMBER` is allowed:

  * If not, issuer authorization is rejected or never submitted.

---

## 2. FTHUSD Deposit (Fiat → XRPL IOU)

### 2.1 Off-Chain Steps

1. Member sends fiat (wire/ACH/etc.) to FTH bank account.
2. Banking Adapter confirms funds received and reconciled.
3. Backend calculates FTHUSD amount to credit (1:1 minus any off-chain fees).

### 2.2 XRPL Transaction

Ops Hot Wallet (or issuer via multi-sig) sends:

```jsonc
{
  "TransactionType": "Payment",
  "Account": "ADDR_FTHUSD_ISSUER",
  "Destination": "ADDR_MEMBER",
  "Amount": {
    "currency": "FTHUSD",
    "issuer": "ADDR_FTHUSD_ISSUER",
    "value": "1000"
  },
  "Memos": [
    {
      "Memo": {
        "MemoType": "6465706f7369745f6964",   // "deposit_id" hex
        "MemoData": "..."                     // deposit reference
      }
    }
  ]
}
```

**Hooks:**

* ComplianceHook validates:

  * Member is KYC’d and allowed.
* If the Hook rejects, backend rolls back and **does not** mark fiat as settled.

---

## 3. FTHUSD Redemption (XRPL IOU → Fiat)

### 3.1 Off-Chain Steps

1. Member initiates redemption via FTHUSD.com.
2. Backend:

   * Checks 90-day commitment and calculates 2% early exit adjustment if needed.
   * Approves redemption.

### 3.2 XRPL Transaction

Member sends FTHUSD back to issuer:

```jsonc
{
  "TransactionType": "Payment",
  "Account": "ADDR_MEMBER",
  "Destination": "ADDR_FTHUSD_ISSUER",
  "Amount": {
    "currency": "FTHUSD",
    "issuer": "ADDR_FTHUSD_ISSUER",
    "value": "1000"
  },
  "Memos": [
    {
      "Memo": {
        "MemoType": "72656465656d7074696f6e5f6964", // "redemption_id"
        "MemoData": "..."
      }
    }
  ]
}
```

Backend then instructs Banking Adapter to send fiat out (less early-exit adjustment, handled off-ledger).

**Hooks:**

* ComplianceHook can prevent redemptions from frozen/sanctioned accounts.

---

## 4. USDF Bonus Issuance

### 4.1 Off-Chain Steps

1. `BonusEngine` calculates daily bonuses:

   * Inputs: XRPL FTHUSD balances, MembershipNFT, program rules.
2. Produces a list: `[ (ADDR_MEMBER, bonusAmountUSDF), ... ]`.

### 4.2 Batch Issuance (Per Member)

Ops Hot Wallet calls:

```jsonc
{
  "TransactionType": "Payment",
  "Account": "ADDR_USDF_ISSUER",
  "Destination": "ADDR_MEMBER",
  "Amount": {
    "currency": "USDF",
    "issuer": "ADDR_USDF_ISSUER",
    "value": "25.5"
  },
  "Memos": [
    {
      "Memo": {
        "MemoType": "626f6e75735f64617465", // "bonus_date"
        "MemoData": "323032352d31312d3037" // "2025-11-07" hex
      }
    }
  ]
}
```

**Hooks:**

* **BonusHook**:

  * Checks cumulative bonus for the day vs cap.
  * Checks PoR freshness (reads timestamp from `ADDR_ORACLE` Hook state).
  * Rejects if caps exceeded or PoR stale.
* **ComplianceHook**:

  * Ensures member is still eligible (no sanctions, etc.).

---

## 5. Gold Order Creation (USDF → GoldVault + NFT Mint)

### 5.1 Off-Chain Steps

1. Member requests “buy gold with USDF”.
2. Backend:

   * Pulls gold price from oracle (EVM/Chainlink).
   * Computes required USDF.
   * Locks quote off-chain and records order.

### 5.2 XRPL Steps

**(a) USDF Payment to GoldVault**

Member pays USDF to `GoldVault_account`:

```jsonc
{
  "TransactionType": "Payment",
  "Account": "ADDR_MEMBER",
  "Destination": "ADDR_GOLDVAULT",
  "Amount": {
    "currency": "USDF",
    "issuer": "ADDR_USDF_ISSUER",
    "value": "500"
  },
  "Memos": [
    {
      "Memo": {
        "MemoType": "676f6c645f6f726465725f6964", // "gold_order_id"
        "MemoData": "..."
      }
    }
  ]
}
```

**(b) GoldOrderNFT Mint**

Ops Hot Wallet controlling `ADDR_GOLDVAULT` mints NFT:

```jsonc
{
  "TransactionType": "NFTokenMint",
  "Account": "ADDR_GOLDVAULT",
  "NFTokenTaxon": 1,
  "Flags": 8, // tfTransferable
  "URI": "697066733a2f2f... (IPFS or metadata URL)",
  "Memos": [
    {
      "Memo": {
        "MemoType": "676f6c645f6f726465725f6964",
        "MemoData": "..."
      }
    }
  ]
}
```

Recipient (`NFTokenMint` destination) is typically the GoldVault account; a subsequent `NFTokenCreateOffer` + `NFTokenAcceptOffer` can deliver to member, or you mint directly to the member if desired.

**Hooks:**

* ComplianceHook on `ADDR_GOLDVAULT`:

  * Validates sender eligibility (gold product allowed).
* Optional: BonusHook could enforce gold-volume caps.

---

## 6. Gold Order Completion

### 6.1 Delivery Path (Physical Gold)

Off-chain:

1. GoldOps verifies inventory and shipping details.
2. Updates off-chain order status.

On-chain:

* Option A: Update metadata off-ledger only.
* Option B: Burn order NFT and mint certificate NFT.

**Burn Order NFT:**

```jsonc
{
  "TransactionType": "NFTokenBurn",
  "Account": "ADDR_MEMBER",
  "NFTokenID": "0008...ORDER_NFT_ID"
}
```

**Mint GoldCertificateNFT (optional):**

```jsonc
{
  "TransactionType": "NFTokenMint",
  "Account": "ADDR_GOLDVAULT",
  "NFTokenTaxon": 2,
  "Flags": 8,
  "URI": "697066733a2f2f... (certificate metadata)"
}
```

Then transfer to `ADDR_MEMBER` via `NFTokenCreateOffer` / `NFTokenAcceptOffer`.

---

### 6.2 Buyback Path (USDF Return)

Off-chain:

1. Backend calculates USDF returned:

   * Spot price minus 2% trading adjustment.

On-chain:

1. Burn GoldOrderNFT (same as above).
2. Pay USDF to member from `ADDR_GOLDVAULT`:

```jsonc
{
  "TransactionType": "Payment",
  "Account": "ADDR_GOLDVAULT",
  "Destination": "ADDR_MEMBER",
  "Amount": {
    "currency": "USDF",
    "issuer": "ADDR_USDF_ISSUER",
    "value": "480"
  },
  "Memos": [
    {
      "Memo": {
        "MemoType": "676f6c645f6275796261636b5f6964", // "gold_buyback_id"
        "MemoData": "..."
      }
    }
  ]
}
```

**Hooks:**

* ComplianceHook ensures member remains eligible to receive USDF.
* Optional: BonusHook can enforce max daily buybacks volume.

---

## 7. PoR & Oracle Anchoring

### 7.1 Off-Chain Steps

1. Treasury/LPEngine builds PoR snapshot:

   * Bank balances, gold holdings, liabilities.
2. Writes snapshot to `FTHPoRRegistry` (EVM).
3. Computes PoR hash (e.g., hash of full PoR document).

### 7.2 XRPL Anchor Transaction

Ops Hot Wallet updates oracle account via a small payment or `AccountSet` with memo:

```jsonc
{
  "TransactionType": "Payment",
  "Account": "ADDR_OPS_ORACLE",
  "Destination": "ADDR_ORACLE",
  "Amount": "1", // 1 drop of XRP
  "Memos": [
    {
      "Memo": {
        "MemoType": "706f725f68617368", // "por_hash"
        "MemoData": "..." // hex of PoR hash
      }
    },
    {
      "Memo": {
        "MemoType": "706f725f74696d65", // "por_time"
        "MemoData": "323032352d31312d30375431323a30303a30305a" // ISO date in hex
      }
    }
  ]
}
```

Optional: Hook on `ADDR_ORACLE` writes timestamp into Hook state for easy lookups by BonusHook/ComplianceHook.

**Hooks:**

* OracleHook validates:

  * Sender is authorized (ADDR_OPS_ORACLE).
  * Memo structure is correct.

---

## 8. Error & Reconciliation Patterns

* If a Hook **rejects** a transaction:

  * The operation is not committed to ledger.
  * Backend must:

    * Log the rejection,
    * Roll back any related off-chain state (e.g., do not mark a deposit as completed).

* Regular reconciliations:

  * Compare:

    * Total FTHUSD supply on XRPL vs bank ledgers.
    * Total USDF in circulation vs bonus logs and promotion rules.
    * NFT counts vs gold order database.

---

## 9. Implementation Notes for `XRPLIntegrationService.js`

`XRPLIntegrationService.js` should provide **high-level methods** that wrap these flows:

* `createMemberTrustlines(memberAddress)`
* `authorizeMemberTrustlines(memberAddress)`
* `creditFTHUSD(memberAddress, amount, depositId)`
* `redeemFTHUSD(memberAddress, amount, redemptionId)`
* `issueUSDFBonus(memberAddress, amount, bonusBatchId)`
* `createGoldOrder(memberAddress, amountUSDF, orderId)`
* `completeGoldDelivery(memberAddress, orderNftId, orderId)`
* `completeGoldBuyback(memberAddress, orderNftId, buybackAmountUSDF, orderId)`
* `anchorPoR(porHash, porTimestamp)`

Each method:

* Constructs the exact XRPL transaction(s) described in this doc.
* Handles signing via the appropriate Ops Hot Wallet.
* Verifies success on-ledger and logs tx hashes for audit.

---
