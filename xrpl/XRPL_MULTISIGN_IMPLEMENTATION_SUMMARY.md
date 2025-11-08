# XRPL Multisig Implementation Summary

> **System:** FTHUSD / USDF Issuer & Treasury Security  
> **Objective:** Eliminate single-key risk for all program-critical XRPL accounts

---

## 1. Objectives

- Enforce **multi-signature** protection on:
  - FTHUSD issuer accounts
  - USDF issuer accounts
  - Treasury / operating hot wallets (as appropriate)
- Ensure **no single key** can:
  - Mint or burn FTHUSD/USDF
  - Move treasury funds
- Provide:
  - Automated verification (`xrpl:verify-security`)
  - CI enforcement (`xrpl-security-check` GitHub Action)
  - Operational playbooks for key rotation and incident response

This implements **FR-009: XRPL Multi-Signature Issuer & Treasury** from the FTH Command Hub PRD.

---

## 2. Accounts & Multisig Policy

### 2.1 Account Roles

- `ISSUER_FTHUSD` – primary token issuer (FTHUSD)
- `ISSUER_USDF` – rewards token issuer (USDF)
- `TREASURY_FTH` – program treasury / hot wallet
- `GOLD_VAULT` – gold-related custody account (future use)

### 2.2 Multisig Thresholds

- **Issuers (FTHUSD / USDF):**
  - Policy: **3-of-5 multisig**
  - Rationale: High assurance, multiple independent signers, tolerance for one signer loss.

- **Gold Vault (future):**
  - Policy: **2-of-3 multisig**
  - Rationale: Operational speed with compromise tolerance.

- **Treasury (operational hot account):**
  - Policy: **2-of-3 multisig**
  - Rationale: Daily activity, but no single-operator power.

Signer keys are loaded from environment variables and **must not** be stored in the repo.

---

## 3. Implementation Components

### 3.1 Setup Script – `setupIssuerSecurity.ts`

**Responsibility:**  
Configure XRPL SignerLists for issuer/treasury accounts.

**Key behaviors:**

- Reads:
  - `XRPL_NODE_URL`
  - `FTHUSD_ISSUER_SEED`
  - `USDF_ISSUER_SEED`
  - `GOLD_VAULT_SEED`
  - `FTHUSD_SIGNER_1_ADDRESS` through `FTHUSD_SIGNER_5_ADDRESS`
  - `USDF_SIGNER_1_ADDRESS` through `USDF_SIGNER_5_ADDRESS`
  - `GOLD_VAULT_SIGNER_1_ADDRESS` through `GOLD_VAULT_SIGNER_3_ADDRESS`
- Validates:
  - All required signer accounts are present.
  - No duplicate signers.
  - Quorum does not exceed total signer weight.
  - Minimum 2 signers for multi-sign.
- Submits:
  - `SignerListSet` transactions with the correct `SignerQuorum` and signer entries.

**Usage:**

```bash
npm run xrpl:setup-security
```

> ⚠️ Only run this against funded **testnet/devnet** accounts unless explicitly scheduled for production.

---

### 3.2 Verification Script – `verifyIssuerSecurity.ts`

**Responsibility:**
Programmatically confirm that all security invariants are satisfied.

Checks per account:

* `SignerList` exists.
* `SignerQuorum` matches policy:
  * Issuer → 3-of-5
  * Gold vault → 2-of-3
* All signers:
  * Are on the approved list.
  * Are unique.
* **Prod mode:** fails hard if issuer seed(s) are present in env (prevents "god key" in prod).

**Usage:**

```bash
npm run xrpl:verify-security
```

**Output:**

* ✅ Healthy configuration → process exit code `0`
* ❌ Misconfiguration / missing list / bad quorum → process exit code `1` with detailed messages.

---

### 3.3 Validation Script – `testMultiSignValidation.ts`

**Responsibility:**
Offline test harness for the verification logic.

Coverage (17 tests):

1. **Environment & config (4 tests)**
   * Required env vars present.
   * Missing or malformed env → proper errors.
2. **Signer logic (10 tests)**
   * Detects duplicate signers.
   * Detects under/over threshold.
   * Detects unauthorized signers.
   * Accepts valid configurations.
3. **Production enforcement (3 tests)**
   * `NODE_ENV=production` + issuer seed present → fail.
   * `NODE_ENV=production` + correct multisig → pass.
   * `NODE_ENV=development` → relaxed checks on seeds.

**Usage:**

```bash
npx ts-node scripts/xrpl/testMultiSignValidation.ts
```

> All tests must pass (17/17) before marking a security change as complete.

---

## 4. CI Integration – `xrpl-security-check`

A GitHub Action enforces that the multisig configuration stays healthy.

* Runs on:
  * `push` to `main`
  * `pull_request` targeting `main`
* Steps:
  * Install dependencies
  * Load XRPL env (from GitHub Secrets)
  * Run `npm run xrpl:verify-security`
* Fails the build if:
  * No SignerList on an issuer/treasury account.
  * Quorum/threshold mismatch.
  * Unapproved signer detected.
  * Issuer seeds present in production-mode env.

> See **Section 6** for the workflow file.

---

## 5. Operational Playbooks

### 5.1 Key Rotation Playbook

Summarized here; full detail in `SECURITY_PLAN.md` §1.2.

High-level steps:

1. **Prepare new keypair(s)** on hardware wallet/HSM.
2. Add new signer to SignerList with a temporary higher quorum (e.g., 4-of-6).
3. Confirm:
   * New signer can co-sign valid transactions.
   * All existing flows still work.
4. Remove old signer(s) from list; restore desired quorum (3-of-5, 2-of-3).
5. Run:
   * `npm run xrpl:verify-security`
   * CI `xrpl-security-check` workflow on the new config.
6. Update:
   * Internal signer registry.
   * Machine-readable inventory (if applicable).

### 5.2 Compromised Signer Response

Summarized; full detail in `SECURITY_PLAN.md` §1.3.

1. **Immediate actions:**
   * Freeze compromised signer in internal registry.
   * Increase `SignerQuorum` temporarily if needed.
2. **Containment:**
   * Add new trusted signer.
   * Remove compromised signer from SignerList ASAP.
3. **Verification:**
   * Run `xrpl:verify-security`.
   * Confirm no unauthorized transactions occurred.
4. **Post-incident:**
   * Document event in `XRPL_AUDIT_REPORT.md`.
   * Review signer practices (HSM, hardware, op-sec).

---

## 6. Mapping to PRD (FR-009)

This implementation satisfies:

* **FR-009: XRPL Multi-Signature Issuer & Treasury**
  * 3-of-5 and 2-of-3 policies enforced.
  * Automated verification script.
  * CI enforcement.
  * Key rotation and compromise playbooks documented.

Remaining steps before *production*:

* Move from test signer keys to **HSM/hardware-managed keys**.
* Execute `setupIssuerSecurity.ts` against **funded testnet** accounts.
* Run a live test of multi-signed transactions by actual signers.
* Schedule **quarterly key rotation drills** as part of ops.

---
