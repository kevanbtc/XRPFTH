# XRPL Security Plan

## 1. Key Control & Governance

### 1.1 Issuer Accounts

*   **FTHUSD_issuer**
    *   **Primary Key:** Stored in Hardware Security Module (HSM) / Key Management Service (KMS).
    *   **RegularKey:** Configured to a multi-signature `SignerList` (M-of-N scheme).
    *   **SignerList:**
        *   **Signers:** [List of key holders/roles, e.g., "CEO", "CTO", "Compliance Officer", "External Auditor"]
        *   **Threshold:** M-of-N (e.g., 3-of-5) for any `AccountSet` transactions (e.g., changing `RegularKey`, `Domain`, `WalletLocator`, `SetFlag`, `ClearFlag`).
        *   **Purpose:** Protect against single point of failure for critical issuer configurations.
*   **USDF_issuer**
    *   **Primary Key:** Stored in HSM/KMS.
    *   **RegularKey:** Configured to a multi-signature `SignerList` (M-of-N scheme), similar to `FTHUSD_issuer`.
    *   **SignerList:** Same as `FTHUSD_issuer`.
*   **GoldVault_account**
    *   **Primary Key:** Stored in HSM/KMS.
    *   **RegularKey:** Configured to a multi-signature `SignerList` (M-of-N scheme).
    *   **SignerList:** [List of key holders/roles, e.g., "Gold Operations Lead", "CTO", "Compliance Officer"]
    *   **Threshold:** M-of-N (e.g., 2-of-3) for transactions involving GoldOrderNFTs or USDF movements.
*   **ProgramOracle_account**
    *   **Primary Key:** Stored in HSM/KMS.
    *   **RegularKey:** Configured to a single `RegularKey` held by the automated PoR service.
    *   **Purpose:** Allows automated updates of PoR hashes without multi-sig overhead, but `RegularKey` can be changed via multi-sig if compromised.
*   **OpsHot_wallet**
    *   **Primary Key:** Stored in a secure, online wallet (e.g., AWS KMS-backed wallet).
    *   **Purpose:** Used for automated, low-value operational transactions (e.g., funding new member accounts with small XRP reserves, minor fee payments).
    *   **Limits:** Daily transaction limits and notional value limits enforced by backend service.

### 1.2 Key Rotation Playbook

#### Frequency
*   **Multi-Sign Signer Keys:** Quarterly rotation recommended
*   **Primary Keys:** Annually (if technically feasible with HSM/KMS)
*   **Emergency Rotation:** Immediately upon suspected compromise

#### Prerequisites
*   **Backup Current Configuration:**
    ```bash
    npm run xrpl:verify-security > backup/signer-config-$(date +%Y%m%d).txt
    ```
*   **Generate New Key Pairs:**
    - Use hardware wallets or HSM for production keys
    - Document key holders and contact information
    - Store public addresses securely before rotation
*   **Test Environment:**
    - Verify rotation procedure on testnet first
    - Confirm quorum signing works with new keys
*   **Communication:**
    - Notify all current signers of rotation schedule
    - Coordinate availability for quorum during rotation window

#### Procedure: Adding a New Signer (Key Rotation)

**Step 1: Add New Signer to SignerList**
```typescript
// Update .env with new signer (keeping old signers)
// For 3-of-5 rotation, temporarily go to 6 signers while rotating
FTHUSD_SIGNER_6_ADDRESS=rNewSignerAddress...

// Run setup to add new signer (maintains existing quorum)
npm run xrpl:setup-security
```

**Step 2: Test New Signer with Quorum**
```bash
# Test transaction signing with new signer participating
# Ensure new signer can successfully sign with quorum
# Verify on XRPL explorer that multi-sig transaction succeeds
```

**Step 3: Remove Old Signer**
```typescript
// Update .env to remove old signer
// Example: Rotate FTHUSD_SIGNER_1_ADDRESS
// Move SIGNER_6 -> SIGNER_1 position
FTHUSD_SIGNER_1_ADDRESS=rNewSignerAddress...
# Remove FTHUSD_SIGNER_6_ADDRESS line

// Run setup to update SignerList (back to 5 signers)
npm run xrpl:setup-security
```

**Step 4: Verify Configuration**
```bash
# Run verification script to confirm new configuration
npm run xrpl:verify-security

# Check output:
# - Verify signer count matches expected (5 for FTHUSD/USDF, 3 for GoldVault)
# - Confirm new signer address is present
# - Confirm old signer address is removed
# - Verify quorum is correct
```

**Step 5: Test Production Quorum**
```bash
# Execute a test transaction (e.g., minor AccountSet change) with quorum
# Ensure M-of-N signers can successfully authorize transactions
# Document successful test in rotation log
```

**Step 6: Rollback Procedure (If Rotation Fails)**
```typescript
// If new signer cannot sign or quorum fails:
// 1. Restore old signer to .env
FTHUSD_SIGNER_1_ADDRESS=rOldSignerAddress...

// 2. Run setup to restore previous configuration
npm run xrpl:setup-security

// 3. Verify restoration
npm run xrpl:verify-security

// 4. Investigate why rotation failed before retry
```

**Step 7: Documentation & Cleanup**
```bash
# Document rotation in audit log
# - Date and time of rotation
# - Old signer address (last 8 characters only)
# - New signer address (last 8 characters only)
# - Key holder identity (role, not full name)
# - Reason for rotation (scheduled, emergency, personnel change)

# Archive old keys securely (do not delete immediately)
# - Retain for 90 days minimum for audit purposes
# - Use encrypted cold storage for archived keys

# Update key holder contact information
# - Verify all current signers have updated contact info
# - Test emergency communication channels
```

#### Testing Checklist Before Production Rotation
- [ ] Testnet rotation completed successfully
- [ ] New keys generated with hardware wallet/HSM
- [ ] Backup of current SignerList configuration saved
- [ ] All signers available during rotation window
- [ ] Emergency rollback procedure tested on testnet
- [ ] Communication plan activated (all signers notified)
- [ ] Quorum test transactions prepared
- [ ] Monitoring alerts configured for rotation period

### 1.3 Compromised Signer Response Plan

#### Detection Methods

**Automated Monitoring:**
- XRPL transaction monitoring for unauthorized AccountSet, SignerListSet, or Payment transactions
- Alert on any transaction signed by unexpected keys
- Monitor for failed multi-sig attempts (may indicate attacker probing)
- Alert on SignerList changes not initiated through approved channels

**Manual Detection:**
- Signer reports lost/stolen device with key material
- Signer reports unauthorized access to key storage
- Security audit discovers exposed key material
- Unusual activity reported by other signers

**Immediate Indicators:**
- Unauthorized transaction from issuer/vault account
- SignerList modified without approval workflow
- Quorum transaction signed without all required approvals
- Signer cannot access their key (potential theft)

#### Immediate Response (Within 1 Hour)

**Phase 1: Assess & Alert (0-15 minutes)**
```bash
# 1. Identify compromised signer
COMPROMISED_SIGNER="rSignerAddressHere..."

# 2. Check recent account activity
npm run xrpl:verify-security
# Review account_info for recent transactions

# 3. Alert security team via emergency channels
# - Slack #security-emergency channel
# - SMS to all remaining signers
# - Email to compliance@fth.com with "[URGENT]" prefix

# 4. Document initial findings
echo "$(date): Compromised signer detected: ${COMPROMISED_SIGNER}" >> incident-log.txt
```

**Phase 2: Emergency SignerList Update (15-60 minutes)**

For **3-of-5 Multi-Sign** (FTHUSD/USDF Issuers):
```typescript
// Emergency removal requires quorum from remaining signers
// If attacker has 1 key, we need 3 of remaining 4 signers

// 1. Immediately update .env to remove compromised signer
// Example: Remove FTHUSD_SIGNER_3 (compromised)
// FTHUSD_SIGNER_3_ADDRESS=rCompromisedAddress... // COMMENT OUT

// 2. Temporarily reduce to 4 signers, keep quorum at 3
// Or add emergency backup signer if available
FTHUSD_SIGNER_5_ADDRESS=rEmergencyBackupSigner...

// 3. Coordinate with 3+ remaining signers to approve removal
# Each signer must be online and ready to sign

// 4. Execute SignerList update (requires 3-of-4 remaining signers)
npm run xrpl:setup-security

// 5. Verify compromised signer removed
npm run xrpl:verify-security
```

For **2-of-3 Multi-Sign** (Gold Vault):
```typescript
// Emergency removal requires quorum from remaining signers
// If attacker has 1 key, we need 2 of remaining 2 signers (all remaining)

// 1. Update .env to remove compromised signer
// GOLD_VAULT_SIGNER_2_ADDRESS=rCompromisedAddress... // COMMENT OUT

// 2. Add emergency backup signer immediately
GOLD_VAULT_SIGNER_3_ADDRESS=rEmergencyBackupSigner...

// 3. Coordinate with ALL remaining signers (critical - no margin for error)
// 4. Execute SignerList update
npm run xrpl:setup-security

// 5. Verify
npm run xrpl:verify-security
```

**Phase 3: Containment (Within 1 Hour)**
```bash
# If attacker already modified SignerList or sent unauthorized transactions:
# ESCALATE TO EMERGENCY QUORUM PROCEDURE (see below)

# Otherwise, monitor for 24 hours:
# - Watch for any attempted transactions from compromised key
# - Alert all signers to NOT sign any transactions except emergency removal
# - Enable enhanced logging on all XRPL nodes
```

#### Emergency Quorum Procedures

**Scenario: Multiple Signers Compromised (Quorum at Risk)**

If **2+ signers compromised** in 3-of-5 scheme:
```bash
# CRITICAL: Attacker may have or be close to quorum

# Option 1: Race to Remove (If we still have quorum)
# - Immediately coordinate remaining uncompromised signers
# - Execute SignerList update to remove ALL compromised signers
# - Add emergency backup signers to restore 5-signer config

# Option 2: Emergency Master Key Intervention (If we've lost quorum)
# - Use Primary Key (HSM/KMS) to set new SignerList
# - This is the "break glass" scenario
# - Requires highest-level authorization (CEO + Board approval)
# - Process:
#   1. Access HSM/KMS with emergency credentials
#   2. Sign SignerListSet transaction with Primary Key
#   3. Set entirely new SignerList with trusted signers
#   4. Document in emergency response log
```

If **2+ signers compromised** in 2-of-3 scheme:
```bash
# CRITICAL: We've lost quorum ability

# IMMEDIATE ACTION: Master Key Intervention
# - Access Primary Key (HSM/KMS) with emergency procedure
# - Sign new SignerListSet with all-new signers
# - This is automatic escalation - no time for approvals
# - Executive team notification concurrent with action
```

**Scenario: Attacker Successfully Modified SignerList**
```bash
# If attacker added themselves or removed legitimate signers:

# 1. Attempt to use remaining legitimate signers to reverse
#    - Check if we still have quorum with remaining signers
#    - If yes, execute immediate SignerListSet to restore correct config

# 2. If quorum lost, use Primary Key (Master Key)
#    - Access HSM/KMS emergency procedure
#    - Sign SignerListSet with Primary Key to restore control

# 3. Check for any unauthorized payments/trustlines
#    - Review all transactions since compromise
#    - Coordinate with exchanges/partners if funds moved

# 4. Consider Global Freeze as temporary measure
#    - Set lsfGlobalFreeze on issuer account to halt all token movement
#    - Requires multi-sig or Primary Key
#    - Buys time for investigation without fund loss
```

#### Post-Incident Recovery

**Immediate (1-24 Hours After Containment):**
- [ ] Verify all accounts have correct SignerList configuration
- [ ] Generate entirely new keys for compromised signers (new hardware)
- [ ] Run full `npm run xrpl:verify-security` and document results
- [ ] Test quorum signing with new configuration
- [ ] Notify affected parties (if funds moved or services impacted)
- [ ] Update incident log with timeline and actions taken

**Short-Term (1-7 Days):**
- [ ] Forensic analysis: How was key compromised?
- [ ] Review all transactions on compromised accounts for 30 days prior
- [ ] Audit key storage procedures for all signers
- [ ] Implement additional security controls identified in forensics
- [ ] Update emergency contact information for all signers
- [ ] Conduct tabletop exercise with new configuration

**Long-Term (7-30 Days):**
- [ ] Complete post-mortem report with root cause analysis
- [ ] Implement preventative measures from post-mortem
- [ ] Update security training for all key holders
- [ ] Review and update this response plan based on incident learnings
- [ ] Conduct external security audit if breach was severe
- [ ] Update insurance/legal documentation if applicable

#### Communication Plan

**Internal (Security Team):**
- Slack #security-emergency (real-time coordination)
- Emergency SMS to all signers
- Email to security@fth.com with "[INCIDENT]" prefix

**Executive (If Escalated):**
- Direct phone call to CEO, CTO, Head of Compliance
- Email to exec-team@fth.com with "[URGENT]" prefix
- Prepared talking points for board notification if needed

**External (If Required):**
- Regulatory notification: Within 24-72 hours depending on jurisdiction
- Partner notification: If their systems affected or funds at risk
- Member notification: If member funds affected (with legal review)
- Public disclosure: Only if legally required or significant member impact

**Communication Templates:**
```
Subject: [URGENT] XRPL Signer Key Compromise - Incident Response Active

Team,

We have detected a compromised signer key for [ACCOUNT_NAME].

Current Status:
- Compromised Signer: [LAST_8_CHARS_OF_ADDRESS]
- Detection Time: [TIMESTAMP]
- Current Account Status: [SECURE/COMPROMISED/UNKNOWN]
- Response Actions: [IN_PROGRESS/COMPLETED]

Immediate Actions:
1. [ACTION_ITEM_1]
2. [ACTION_ITEM_2]

Do NOT sign any transactions except emergency SignerList updates approved by Security Team.

Contact [SECURITY_LEAD_NAME] at [PHONE] for coordination.

Updated: [TIMESTAMP]
```

#### Testing & Drills

**Quarterly Tabletop Exercise:**
- Simulate compromised signer scenario
- Practice emergency communication channels
- Test quorum coordination under time pressure
- Verify all signers can access emergency procedures

**Annual Full-Scale Drill (Testnet):**
- Execute actual SignerList update on testnet accounts
- Practice Primary Key access from HSM/KMS
- Test backup key activation
- Document response time metrics

**Success Criteria:**
- Compromised signer removed within 1 hour
- Quorum restored within 2 hours
- All signers successfully contacted within 15 minutes
- No unauthorized transactions executed during incident

## 2. Freeze / Blacklist Playbook

### 2.1 Policy Decisions

*   **Individual Wallet Freeze:**
    *   **Trigger:** Regulatory request, suspected fraud, AML violation, court order.
    *   **Mechanism:** Per-trustline freeze (setting `lsfNoRipple` on the trustline from the issuer's perspective for the specific member).
    *   **Impact:** Member cannot send or receive FTHUSD/USDF.
*   **Global Freeze:**
    *   **Trigger:** Extreme systemic risk, major regulatory directive, critical vulnerability affecting all accounts.
    *   **Mechanism:** Setting `lsfGlobalFreeze` flag on issuer accounts.
    *   **Impact:** All FTHUSD/USDF transfers are halted across the entire ledger.
    *   **Usage:** Extremely rare, last resort. Requires multi-sig approval from highest authority.
*   **Blackhole Patterns:** Not supported for FTH program accounts. All accounts must retain `RegularKey` or `SignerList` for recovery/governance.

### 2.2 Implementation Flows

*   **XRPL Actions:**
    *   `XRPLIntegrationService.freezeTrustline(memberAddress, currency)`: Sets `lsfNoRipple` on the trustline.
    *   `XRPLIntegrationService.unfreezeTrustline(memberAddress, currency)`: Clears `lsfNoRipple` on the trustline.
    *   `XRPLIntegrationService.setGlobalFreeze(currency, true/false)`: Sets/clears `lsfGlobalFreeze` on the issuer account (requires multi-sig).
*   **EVM Sync:**
    *   `ComplianceRegistry.setMemberStatus(memberAddress, BLOCKED)`: Updates the EVM-side compliance registry.
    *   Ensures consistency across both ledgers for compliance checks.
*   **DB Updates:**
    *   `members` table: Update `kyc_status` to `BLOCKED` or `FROZEN`.
    *   `KYCEvent` table: Log the freeze/unfreeze event with timestamp, reason, and authorizing party.
    *   `LedgerTransaction` table: Log the XRPL transaction hash for the freeze/unfreeze action.

### 2.3 Runbook: Regulator Request for Wallet Freeze

1.  **Receive Request:** Legal/Compliance team receives formal request (e.g., subpoena, court order) for wallet X.
2.  **Verification:** Legal/Compliance verifies authenticity and legality of request.
3.  **Internal Approval:** Obtain necessary internal approvals (e.g., Head of Compliance, CEO).
4.  **Execute Freeze:**
    *   Compliance team uses Admin Dashboard to initiate `freezeTrustline` for wallet X.
    *   System logs `KYCEvent` and `LedgerTransaction` for the freeze.
    *   EVM `ComplianceRegistry` is updated.
5.  **Confirmation:** Verify freeze on XRPL explorer and internal systems.
6.  **Communication:** Respond to regulator with confirmation of action taken.
7.  **Monitoring:** Monitor wallet X for any attempted activity.

### 2.4 Runbook: Freeze / Unfreeze (Internal)

1.  **Initiate:** Authorized personnel (e.g., Head of Compliance) identifies need for freeze/unfreeze.
2.  **Approval:** Obtain multi-sig approval for the action (e.g., 2-of-3 from Compliance/Legal/Ops).
3.  **Execute:**
    *   Use `scripts/xrpl/freezeAccount.ts` or Admin Dashboard.
    *   Provide wallet address, currency, and reason.
    *   Script/Dashboard executes XRPL transaction, updates EVM `ComplianceRegistry`, and logs to DB.
4.  **Verify:** Confirm action on XRPL explorer and internal systems.
5.  **Document:** Ensure all approvals, reasons, and actions are logged in an immutable audit trail.
