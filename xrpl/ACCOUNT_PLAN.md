# FTH XRPL Account Plan

This document defines the concrete XRPL account topology for the FTH Program:
which accounts exist, what they are for, how they are configured (flags, signers),
and how they should be used in production vs. test.

It complements `xrpl/README.md` (conceptual design) with operational detail.

---

## 1. Account Types Overview

We use the following XRPL account roles:

- **Master Governance Account**
- **Issuer Accounts**
  - `FTHUSD_issuer`
  - `USDF_issuer`
- **Gold Operations Account**
  - `GoldVault_account`
- **Oracle / Registry Account**
  - `ProgramOracle_account`
- **Ops Hot Wallets**
- **Member Wallets**

Each role may have different security requirements and signer configurations.

---

## 2. Environment Layout

We maintain separate account sets per environment:

- **Dev / Sandbox** — Localnet / testnet; low security; used for rapid iteration.
- **Staging** — Testnet / sidechain; closer to production topology.
- **Production** — Mainnet; hardened keys, HSM/KMS, multi-sig, ops procedures.

> NOTE: Concrete addresses are to be generated and documented privately.
> This plan defines required properties and behaviors.

---

## 3. Master Governance Account

**Role:** Top-level governance owner for the FTH XRPL footprint.

- Controls:
  - Issuer account configuration (at setup time).
  - Hook installation/removal (if centrally managed).
  - Emergency freeze/unfreeze actions (if needed).

**Config:**

- `master_disable`: **Yes** (disable master key once signer list is in place).
- **Signer list:** Multi-sig:
  - 3–5 signers (e.g., CEO, CTO, Compliance, External custodian).
  - Threshold: 2-of-3 or 3-of-5 depending on policy.
- Flags:
  - `DefaultRipple`: off.
  - `DisallowXRP`: optional (if you never want to send XRP from this account).

**Usage Pattern:**

- Rarely used in day-to-day operations.
- Used for:
  - Changing issuer flags (early in lifecycle).
  - Installing or updating Hooks.
  - Emergency freeze scenarios.

---

## 4. Issuer Accounts

### 4.1 `FTHUSD_issuer`

**Role:** Issues and redeems `FTHUSD` IOU (fiat-backed balance).

**Recommended config:**

- Flags:
  - `requireAuth = true` — all trustlines must be explicitly authorized.
  - `defaultRipple = false` — avoid unintended rippling between trustlines.
  - Consider `DisallowXRP = true` — to avoid mixing XRP operations.
- Auto-freeze strategy:
  - Use issuer-level freeze only for emergencies.
  - Optionally configure `NoFreeze` if you want to commit to never freezing individual accounts (regulatory choice).

**Security:**

- Master key disabled.
- Signer list:
  - At least 2-of-3 with hardware-backed keys (HSM, Ledger, etc.).
- Operational mint/burn actions are **not** submitted directly by issuer keys:
  - Instead, an **Ops Hot Wallet** signs transactions that move IOUs,
    while issuer keys maintain configuration-level authority.

---

### 4.2 `USDF_issuer`

**Role:** Issues and manages `USDF` (closed-loop membership credits).

**Config:**

- Flags:
  - `requireAuth = true` — keep USDF inside whitelisted ecosystem.
  - `defaultRipple = false`.
- May use stricter linking to `ComplianceHook`:
  - Any payment of USDF is checked for eligibility.

**Security:**

- Same pattern as `FTHUSD_issuer`:
  - Master key disabled.
  - Signer list 2-of-3 or 3-of-5.

**Business rules:**

- No fiat redemption.
- Flow only between:
  - `USDF_issuer`
  - `GoldVault_account`
  - Whitelisted member wallets
  - Possibly `FTHMERC`-style program accounts.

---

## 5. GoldVault Account

**Name:** `GoldVault_account`

**Role:**

- Receives USDF when members buy gold.
- Mints GoldOrderNFTs and (optionally) GoldCertificateNFTs.
- Sends USDF back to member on buybacks.

**Config:**

- Flags:
  - `DefaultRipple = false`.
  - `requireAuth` may be:
    - `false` if only receiving USDF from already-authorized wallets, **or**
    - `true` if you want an extra layer of explicit authorization.
- Hooks:
  - **ComplianceHook** attached here is strongly recommended:
    - Block USDF payments from unapproved wallets/jurisdictions.
    - Enforce per-account limits if desired.

**Security:**

- Controlled by Ops Hot Wallet(s) with limited scope:
  - Can mint/burn NFTs and move USDF within policy.
  - Cannot modify issuer or master settings.

---

## 6. ProgramOracle Account

**Name:** `ProgramOracle_account`

**Role:**

- Holds latest PoR and oracle-related metadata via:
  - Transaction memos, **and/or**
  - Hook state.

**Config:**

- Flags:
  - `DefaultRipple = false`.
  - No trustlines required for normal flows.
- Hooks:
  - Dedicated **OracleHook** (optional):
    - Validate structure of PoR updates (e.g., memo format).
    - Only accept updates from specific Ops Hot Wallets.

**Security:**

- Could be single-signer with hardware key, or 2-of-2:
  - One internal, one external auditor key for updates (depending on governance).

---

## 7. Ops Hot Wallets

**Role:**

- Submit transactions on behalf of backend services:
  - `Payment` (FTHUSD/USDF).
  - `NFTokenMint` / `NFTokenBurn`.
  - `SetTrust`, `AccountSet`, etc.

**Config:**

- Low balance of XRP (only enough for fees).
- No issuer authority.
- Whitelisted by Hooks for allowed actions.

**Security:**

- Keys stored in secure KMS/HSM where possible.
- Rate-limited by backend.
- Segmented by function:
  - One wallet for **bonus issuance**.
  - One wallet for **gold ops**.
  - One wallet for **oracle updates**.

---

## 8. Member Wallets

**Role:**

- User-controlled XRPL accounts that hold:
  - XRP (for fees).
  - FTHUSD and USDF trustlines.
  - MembershipNFT and GoldOrderNFT/GoldCertificateNFT.

**Config:**

- Created by user with their chosen wallet (XUMM, Ledger, etc.).
- Trustlines:
  - FTHUSD (to `FTHUSD_issuer`).
  - USDF (to `USDF_issuer`).

**Program requirements:**

- Must pass off-chain KYC.
- Must be authorized via `requireAuth` trustline flow.
- May require ownership of a **MembershipNFT** to access certain benefits.

---

## 9. Hook Placement Summary

Planned Hook placements:

- On `FTHUSD_issuer`:
  - **ComplianceHook** — enforce KYC/jurisdiction on FTHUSD transfers.

- On `USDF_issuer`:
  - **ComplianceHook** — enforce eligibility for USDF.
  - **BonusHook** — cap bonus issuance, validate PoR freshness (read from `ProgramOracle_account`).

- On `GoldVault_account`:
  - **ComplianceHook** — gate access to gold module; enforce product restrictions.

- On `ProgramOracle_account` (optional):
  - **OracleHook** — validate PoR update format and authorized senders.

---

## 10. Configuration Checklist

Before going live in any serious environment:

- [ ] Master governance account created, master key disabled, multi-sig configured.
- [ ] `FTHUSD_issuer` created, flags set, signer list configured.
- [ ] `USDF_issuer` created, flags set, signer list configured.
- [ ] `GoldVault_account` created, optional Hook installed.
- [ ] `ProgramOracle_account` created, optional Hook installed.
- [ ] Ops Hot Wallets created and documented by purpose.
- [ ] Hook code compiled, tested on devnet, and installed on issuers/vaults/oracle.
- [ ] Internal “Account Map” maintained with real addresses (kept out of public repos if needed).

This account plan should be reviewed by:
- Tech lead (correctness).
- Compliance lead (jurisdictions / freeze policies).
- Security lead (signer & key model).
