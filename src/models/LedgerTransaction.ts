// src/models/LedgerTransaction.ts

/**
 * @interface LedgerTransaction
 * @description Represents a record of an interaction with an on-chain ledger (XRPL or EVM).
 *              This model is intended to be persisted in an off-chain database for
 *              auditing, reconciliation, and observability.
 */
export interface LedgerTransaction {
  id: string; // Unique identifier for the transaction record (e.g., UUID)
  ledger: "xrpl" | "evm"; // Which ledger the transaction pertains to
  flow:
    | "por_snapshot"
    | "bonus_issue"
    | "fthusd_deposit"
    | "fthusd_redemption"
    | "gold_order_create"
    | "gold_order_nft_mint"
    | "gold_order_buyback"
    | "kyc_update"
    | "sanction_update"
    | "xrpl_message_queue"
    | "xrpl_message_processed"
    | "member_onboarding_fthusd_auth"
    | "member_onboarding_usdf_auth"
    | "por_anchoring"
    | "oracle_price_update"
    | "DEX_SCAN_ALERT" // Added for DEX monitoring
    | "SUPPLY_RECONCILIATION" // Added for supply reconciliation
    | "HOOK_DEPLOY" // Added for Hook deployment
    | "other"; // High-level business flow
  direction: "outbound" | "inbound" | "internal"; // Direction from the backend's perspective
  requestId?: string; // Optional: Correlation ID from a higher-level business request
  memberId?: string; // Optional: Internal FTH member ID
  walletAddress?: string; // XRPL or EVM address involved
  txHash?: string; // On-chain transaction hash or XRPL transaction ID
  status: "pending" | "confirmed" | "failed" | "detected"; // Current status of the transaction, added 'detected' for alerts
  type?: string; // Added for DEX_SCAN_ALERT type
  errorCode?: string; // Optional: Error code if the transaction failed (e.g., XRPL engine_result, EVM revert reason)
  errorMessage?: string; // Optional: Detailed error message
  payloadSummary?: string; // Optional: A small JSON or string summary of the transaction payload
  createdAt: Date; // Timestamp when the record was created
  updatedAt: Date; // Timestamp when the record was last updated
}
