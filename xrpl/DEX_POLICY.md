# XRPL DEX / AMM Policy for FTH Program

## 1. Policy Decision

**FTHUSD and USDF are NOT intended to trade on the public XRP Ledger Decentralized Exchange (DEX) or Automated Market Maker (AMM).**

The FTH Program operates as a closed-loop system for its stablecoin (FTHUSD) and loyalty credits (USDF) to ensure regulatory compliance, maintain price stability, and align with the program's Shariah-compliant design principles.

## 2. Rationale

*   **Regulatory Compliance:** Operating a public DEX for FTHUSD/USDF could introduce complex regulatory challenges, including potential classification as securities or requiring additional licenses for operating an exchange. A closed-loop system simplifies the regulatory landscape.
*   **Price Stability & Control:** Direct trading on a public DEX could expose FTHUSD to market volatility and manipulation, undermining its 1:1 peg to USD. By controlling liquidity and transfer mechanisms, the program can better ensure price stability.
*   **Program Design & Shariah Compliance:** The FTH Program is designed around specific use cases (deposits, redemptions, gold purchases, bonuses) that do not involve speculative trading on public markets. This aligns with Shariah principles that discourage excessive speculation (gharar) and promote asset-backed transactions.
*   **Operational Risk:** Managing liquidity, spreads, and potential arbitrage opportunities on a public DEX adds significant operational complexity and risk.

## 3. Enforcement & Detection

### 3.1 On-Chain Enforcement (Account Flags & Trustlines)

*   **`defaultRipple`:** All issuer accounts (`FTHUSD_issuer`, `USDF_issuer`) will have `defaultRipple` set to `false`. This prevents automatic rippling through intermediate trustlines and ensures direct relationships between the issuer and holders.
*   **Trustline `NoRipple` Flag:** Member trustlines will be configured with `NoRipple` where appropriate to prevent unintended multi-hop payments or DEX interactions.
*   **Issuer Flags:** Other relevant `AccountSet` flags will be utilized to restrict unauthorized trading or liquidity provision.

### 3.2 Detection Script: `scripts/xrpl/scanDexForFTH.ts`

A dedicated script will be implemented to actively monitor the XRPL DEX for any unauthorized offers involving FTHUSD or USDF.

*   **Purpose:** Identify and alert on any attempts by external parties to create trading pairs or provide liquidity for FTHUSD/USDF on the public DEX.
*   **Functionality:**
    *   Queries the XRPL DEX for all active `Offer` transactions.
    *   Filters offers to identify those involving FTHUSD or USDF (by currency code and issuer).
    *   If unauthorized offers are detected:
        *   Logs a `LedgerTransaction` with `type: 'DEX_SCAN_ALERT'` and details of the offer.
        *   Triggers an alert to the compliance and operations teams.
*   **Action on Detection:**
    *   **Compliance Review:** Immediately review detected offers for potential regulatory or reputational risk.
    *   **Communication:** If necessary, issue public statements clarifying the program's DEX policy.
    *   **Legal Action:** Pursue legal action against parties attempting to create unauthorized markets if deemed necessary.

## 4. Preventing Accidental DEX Exposure

Even with a "closed-loop only" policy, it's crucial to document how accidental exposure is prevented:

*   **Clear Terms of Service:** Explicitly state that FTHUSD/USDF are not supported for trading on public exchanges or DEXes.
*   **Backend Validation:** All FTH Program backend services will validate transaction types and destinations to prevent internal accounts from interacting with the DEX.
*   **User Education:** Educate members about the intended use of FTHUSD/USDF and the risks associated with unauthorized trading.
*   **Monitoring:** The `scanDexForFTH.ts` script serves as a critical monitoring tool to detect and react to any deviations from this policy.
