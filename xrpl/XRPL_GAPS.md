# XRPL Readiness – Missing Aspects & TODOs

Scope: This is **only** about the XRP Ledger side of FTH.
EVM, DB, API, KYC, banking, etc. live elsewhere.
This is: “Given the XRPL docs universe, what’s still missing for FTH?”

Statuses you can use mentally:

* 🧠 = design decision
* 🛠️ = code / config
* 🛰️ = infra / ops
* 📜 = docs / policy

---

## 1. XRPL Infra & Operations Plan

You currently: run a single `xrpld` in Docker and talk to it.
What’s missing is “how do we run this in the wild without crying?”.

### 1.1 Node topology & roles

* [ ] 🧠 Decide node strategy:

  * [ ] Single client node only (no validator)
  * [ ] Or: multiple nodes (read vs write, redundancy)
  * [ ] Or: validator participation (for reputation/governance)
* [ ] 🛰️ Define **primary + fallback endpoints** for the backend:

  * [ ] Local xrpld
  * [ ] Public backup API(s) (e.g. Ripple / Xpring / etc.)

### 1.2 Node configuration best practices

* [ ] 🛠️ Write a minimal `xrpld.cfg` profile for **FTH**:

  * [ ] History depth (how many ledgers kept)
  * [ ] Peers & network settings
  * [ ] Storage / RocksDB tuning
* [ ] 🛰️ Set up:

  * [ ] Disk monitoring (DB size, free space)
  * [ ] CPU/memory alerts
  * [ ] `server_state`, `validated_ledger` lag monitoring

### 1.3 Backup & DR

* [ ] 📜 Define disaster recovery approach:

  * [ ] Are you okay with **rebuilding from network** (no own full history)?
  * [ ] Or do you need a **full-history node** for audit / forensics?
* [ ] 🛰️ Document **RTO/RPO** for xrpld:

  * [ ] “How long can xrpl be down?”
  * [ ] “How much history are we willing to lose from *local* node?”

---

## 2. Account Security & Governance

You use issuers, requireAuth, defaultRipple tuning. Good. Now the grown-up version.

### 2.1 Multi-sign & SignerLists

* [ ] 🧠 Decide security model for:

  * [ ] `FTHUSD_issuer`
  * [ ] `USDF_issuer`
  * [ ] `GoldVault_account`
  * [ ] `ProgramOracle_account`
* [ ] 🛠️ Implement:

  * [ ] `RegularKey` separation (hot vs cold key)
  * [ ] Or **SignerList** (multi-sign M-of-N) for issuer-level changes
* [ ] 📜 Document:

  * [ ] Who holds which keys / roles
  * [ ] Key rotation procedure
  * [ ] “Compromised key” emergency playbook

### 2.2 Freeze / blacklist playbook

XRPL gives you `globalFreeze`, per-trustline freeze, etc.

* [ ] 🧠 Decide **freeze policy**:

  * [ ] When to freeze an individual wallet
  * [ ] When to use `globalFreeze` (if ever)
  * [ ] Whether to support “blackhole” patterns
* [ ] 🛠️ Implement flows:

  * [ ] XRPL: trustline freeze / issuer actions
  * [ ] EVM: `ComplianceRegistry` flags in sync
  * [ ] DB: member status + `KYCEvent` entry
* [ ] 📜 Document:

  * [ ] “How we handle a regulator request for wallet X”
  * [ ] “Freeze / unfreeze runbook” (including approvals and logs)

---

## 3. DEX / AMM Policy (On-Chain Finance vs Closed Loop)

Currently, FTH uses XRPL as a **closed ledger** for:

* FTHUSD/USDF IOUs
* NFTs
* PoR anchors

You haven’t frozen your stance on the **public DEX**.

### 3.1 Policy decision

* [ ] 🧠 Decide: **Can FTHUSD/USDF be traded on XRPL DEX?**

  * [ ] ❌ “No, closed-loop only”
  * [ ] ✅ “Yes, but controlled liquidity”
* [ ] 📜 Write explicit DEX policy:

  * [ ] If **NO DEX**:

    * [ ] State that FTHUSD/USDF are *not supported* on public markets
    * [ ] Explain why (regulatory, program design, Shariah)
  * [ ] If **YES DEX**:

    * [ ] Define allowed trading pairs (e.g., FTHUSD/XRP)
    * [ ] Define who provides liquidity (program treasury? partners?)
    * [ ] Define spread / fee / risk management

### 3.2 Implementation (if you *do* support DEX)

* [ ] 🛠️ Implement:

  * [ ] DEX operations (`OfferCreate`, `OfferCancel`) for treasury accounts
  * [ ] AMM interactions if XRPL AMM is used
* [ ] 🛠️ Compliance overlays:

  * [ ] Screening DEX counterparties if required
  * [ ] Limits on notional volume
* [ ] 🧠 Testing strategy:

  * [ ] “What happens if someone tries to spoof our price via silly offers?”
  * [ ] “What if we withdraw all liquidity?”

If your final answer is **“closed-loop only”**, most of 3.2 becomes: **document how you prevent accidental DEX exposure**.

---

## 4. Payment Semantics, Pathfinding & Rippling

You’ve designed simple flows, but XRPL payments are… creative.

### 4.1 Pathfinding & partial payments

* [ ] 🧠 Policy:

  * [ ] Reject partial payments where not explicitly intended.
  * [ ] Avoid pathfinding / multi-hop weirdness for FTHUSD/USDF.
* [ ] 🛠️ Implementation:

  * [ ] Set appropriate `Flags` on Payment txs (`tfPartialPayment` usage rules)
  * [ ] XRPLIntegrationService: **disable** path-based payments for program flows.

### 4.2 Rippling & trustline flags

* [ ] 🧠 Decide rippling stance:

  * [ ] No rippling for user trustlines (likely)
  * [ ] Controlled rippling for internal treasury / vault accounts (maybe)
* [ ] 🛠️ Ensure:

  * [ ] `defaultRipple` is configured correctly on issuer accounts.
  * [ ] Trustlines have `NoRipple` where appropriate.
* [ ] 🧪 Tests:

  * [ ] Ensure that a Payment to member A **cannot accidentally traverse** via member B’s trustline.
  * [ ] Ensure that your XRPL flows **only** use direct simple paths.

---

## 5. Hooks: From Design to Production Behavior

You have **BonusHook**, **ComplianceHook**, **OracleHook** specs. Now you need the “this actually runs on mainnet/devnet without drama” work.

### 5.1 Hook deployment & lifecycle

* [ ] 🧠 Define:

  * [ ] How you **deploy** Hooks to accounts (migration plan)
  * [ ] How you **upgrade** a Hook (v1 → v2)
  * [ ] How you **roll back** if a new Hook starts misbehaving
* [ ] 🛠️ Implement:

  * [ ] Hook installer script(s)
  * [ ] Versioning scheme in code + metadata
  * [ ] Tests that simulate “swapping” Hook code on-accounts

### 5.2 Hook performance and costs

* [ ] 🧪 Benchmark:

  * [ ] CPU/time usage per Hook under typical flows (bonuses, transfers)
  * [ ] Worst-case load scenario (lots of members transacting at once)
* [ ] 🧠 Set guardrails:

  * [ ] Max complexity per Hook
  * [ ] When to move logic off-chain instead

### 5.3 Hook observability

* [ ] 🛠️ Implement:

  * [ ] Logging of Hook-related failures/events (from XRPL tx results)
  * [ ] DB mapping: which Hook version was active for which tx
* [ ] 🧪 Tests:

  * [ ] Simulate Hook-internal failure and verify:

    * [ ] Proper error codes
    * [ ] No inconsistent state on FTH side
    * [ ] Proper alerts raised

---

## 6. XRPL Testing Strategy (Devnet, Testnet, Local)

You’re using your own node + integration tests, but XRPL world offers more networks & tools.

### 6.1 Networks & accounts

* [ ] 🧠 Decide:

  * [ ] Which XRPL networks you’ll use:

    * [ ] Local docker xrpld
    * [ ] Testnet / Devnet
    * [ ] Mainnet (later)
* [ ] 📜 Document:

  * [ ] How you **separate**:

    * [ ] Test accounts
    * [ ] Staging accounts
    * [ ] Production accounts

### 6.2 Faucets & funding

* [ ] 🛠️ Implement:

  * [ ] Small utility to:

    * [ ] Request Testnet/Devnet XRP from faucets
    * [ ] Fund new XRPL test accounts as part of tests
* [ ] 🧪 Ensure:

  * [ ] Integration tests can stand up ephemeral accounts, run flows, and not pollute shared state.

### 6.3 Stress / chaos tests

* [ ] 🧪 Design XRPL-focused chaos cases:

  * [ ] Node temporarily unreachable
  * [ ] High fee conditions
  * [ ] Ledger close delays
* [ ] 🛠️ Extend tests:

  * [ ] Your hero journey and PoR pipelines should:

    * [ ] Handle XRPL downtime gracefully
    * [ ] Retry with backoff
    * [ ] Fail safe when XRPL is inconsistent

---

## 7. Governance & Amendments Tracking

XRPL evolves via amendments. You are depending on some of them (NFTs, Hooks, possibly AMM).

### 7.1 Amendment inventory

* [ ] 📜 List XRPL amendments FTH *requires*:

  * [ ] XLS-20 (NFTs)
  * [ ] Hooks
  * [ ] AMM (if you ever use it)
  * [ ] Others impacting IOUs, DEX, reserves
* [ ] 🧠 For each:

  * [ ] Confirm it’s enabled on:

    * [ ] Your devnet / testnet
    * [ ] Mainnet (when you’re closer to launch)

### 7.2 Governance monitoring

* [ ] 🛰️ Assign responsibility:

  * [ ] “Who monitors XRPL amendments / governance changes?”
* [ ] 📜 Process:

  * [ ] How changes in XRPL are:

    * [ ] Detected
    * [ ] Assessed (risk, impact)
    * [ ] Reflected in FTH docs + code

---

## 8. Reserves, Fees & Forensics (XRPL-Specific)

This is where XRPL meets regulators.

### 8.1 XRP reserve & fee management

* [ ] 🧠 Policy:

  * [ ] Minimum XRP per account (issuer, oracle, vault, ops)
  * [ ] How you top-up those reserves
* [ ] 🛠️ Implement:

  * [ ] A small “XRP reserve check” job:

    * [ ] Queries balances
    * [ ] Alerts when below threshold
* [ ] 📜 Document:

  * [ ] “What happens if an account runs out of XRP? Impact & recovery.”

### 8.2 Ledger archival & forensic workflow

* [ ] 🧠 Decide:

  * [ ] Do you rely on public explorers for history?
  * [ ] Or run at least one **full-history node** for audit purposes?
* [ ] 📜 Define:

  * [ ] How to answer:

    * [ ] “Show all FTHUSD redemptions between date X and Y”
    * [ ] “Prove total FTHUSD supply matches PoR ledger at block Z”
* [ ] 🛠️ Implement:

  * [ ] Scripts or services that:

    * [ ] Pull XRPL tx history
    * [ ] Cross-check with:

      * [ ] DB (LedgerTransaction)
      * [ ] PoR snapshots on EVM
      * [ ] Banking ledger (later)

---

### Ultra-Short Summary

From the XRPL Developer Resources universe, the **remaining FTH-specific XRPL work** is:

1. Treat `xrpld` like production infra: topology, monitoring, DR.
2. Harden accounts: multi-sign, key rotation, freeze policy.
3. Decide your DEX/AMM stance and enforce it.
4. Lock down payments: no weird pathfinding/rippling, tested invariants.
5. Take Hooks from “spec” to “deployed, observable, rollback-able”.
6. Write a real XRPL testing strategy: multiple networks, faucets, chaos cases.
7. Track XRPL amendments: you’re now tied to XRPL governance.
8. Nail reserves & forensics: XRP fees, history, and auditability.

That’s the XRPL “what’s left” list. It’s no longer “learn XRPL” — it’s “treat XRPL like a regulated subsystem of a financial institution”, which is exactly what you’re building.
