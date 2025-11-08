// src/services/xrpl/XRPLIntegrationService.ts

import * as xrpl from "xrpl"; // Import all as a namespace
import { LedgerTransaction } from "../../models/LedgerTransaction";
import { v4 as uuidv4 } from "uuid";
import { XRPLTransactionError, XRPLConnectionError } from "./XRPLCustomErrors";

export interface XRPLConfig {
  rpcUrl: string;

  // Core accounts
  fthusdIssuer: string;
  usdfIssuer: string;
  goldVault: string;
  oracleAccount: string;

  // Ops wallets (seed/secret should come from env/KMS, not code)
  opsBonusSeed: string;
  opsGoldSeed: string;
  opsOracleSeed: string;
  opsIssuerSeed?: string; // optional if you sign issuer ops from here
}

export class XRPLIntegrationService {
  private client: xrpl.Client;
  private cfg: XRPLConfig;

  private opsBonus: xrpl.Wallet;
  private opsGold: xrpl.Wallet;
  private opsOracle: xrpl.Wallet;
  private opsIssuer?: xrpl.Wallet;

  constructor(cfg: XRPLConfig) {
    this.cfg = cfg;
    this.client = new xrpl.Client(cfg.rpcUrl);

    console.log("XRPLIntegrationService constructor - opsBonusSeed:", cfg.opsBonusSeed);
    this.opsBonus = xrpl.Wallet.fromSeed(cfg.opsBonusSeed);
    console.log("XRPLIntegrationService constructor - opsGoldSeed:", cfg.opsGoldSeed);
    this.opsGold = xrpl.Wallet.fromSeed(cfg.opsGoldSeed);
    console.log("XRPLIntegrationService constructor - opsOracleSeed:", cfg.opsOracleSeed);
    this.opsOracle = xrpl.Wallet.fromSeed(cfg.opsOracleSeed);
    console.log("XRPLIntegrationService constructor - opsIssuerSeed:", cfg.opsIssuerSeed);
    this.opsIssuer = cfg.opsIssuerSeed
      ? xrpl.Wallet.fromSeed(cfg.opsIssuerSeed)
      : undefined;
  }

  async connect() {
    if (!this.client.isConnected()) {
      try {
        await this.client.connect();
      } catch (error: any) {
        throw new XRPLConnectionError(`Failed to connect to XRPL client: ${error.message}`);
      }
    }
  }

  async disconnect() {
    if (this.client.isConnected()) {
      try {
        await this.client.disconnect();
      } catch (error: any) {
        console.warn(`Failed to disconnect XRPL client gracefully: ${error.message}`);
      }
    }
  }

  // Utility: sign & submit & wait
  private async submitWithWallet<T extends xrpl.Transaction>(
    wallet: xrpl.Wallet,
    tx: T,
    flow: string,
    memberAddress?: string // Keep memberAddress parameter
  ): Promise<xrpl.TxResponse> {
    await this.connect();
    const prepared = await this.client.autofill(tx as any); // Keep as any for autofill
    const signed = wallet.sign(prepared);

    // Helper to extract amount and currency from various transaction types
    const getAmountAndCurrency = (transaction: xrpl.Transaction): { amount: string | undefined; currency: string | undefined } => {
      if ('Amount' in transaction && transaction.Amount !== undefined) {
        if (typeof transaction.Amount === 'object' && transaction.Amount !== null && 'currency' in transaction.Amount && 'value' in transaction.Amount) {
          // This is an IssuedCurrencyAmount
          const issuedAmount = transaction.Amount as xrpl.IssuedCurrencyAmount;
          return {
            amount: issuedAmount.value,
            currency: issuedAmount.currency,
          };
        } else if (typeof transaction.Amount === 'string') {
          // This is a string amount (XRP in drops)
          return {
            amount: xrpl.dropsToXrp(transaction.Amount).toString(),
            currency: 'XRP',
          };
        }
      }
      return { amount: undefined, currency: undefined };
    };

    const { amount, currency } = getAmountAndCurrency(tx);

    // Determine destination more robustly
    let destination: string | undefined;
    if ('Destination' in tx && typeof tx.Destination === 'string') {
      destination = tx.Destination;
    } else if ('Account' in tx && typeof tx.Account === 'string') {
      destination = tx.Account;
    }

    const txRecord: LedgerTransaction = {
      id: uuidv4(),
      ledger: "xrpl",
      flow: flow as LedgerTransaction["flow"],
      direction: "outbound",
      memberId: memberAddress, // Use the passed memberAddress
      walletAddress: wallet.classicAddress,
      txHash: signed.hash,
      status: "pending",
      payloadSummary: JSON.stringify({
        type: tx.TransactionType,
        destination: destination,
        amount: amount || '', // Ensure amount is a string
        currency: currency || '', // Ensure currency is a string
      }),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    console.log("[XRPL] Submitting transaction:", txRecord);
    // In a real system, you would persist txRecord to a database here.

    try {
      const res = await this.client.submitAndWait(signed.tx_blob);
      // Cast res.result to any to access engine_result and engine_result_message
      const result: any = res.result;
      if (result.engine_result !== "tesSUCCESS") {
        txRecord.status = "failed";
        txRecord.errorCode = result.engine_result;
        txRecord.errorMessage = result.engine_result_message;
        txRecord.updatedAt = new Date();
        console.error("[XRPL] Transaction failed:", txRecord);
        // In a real system, you would update txRecord in the database here.
        throw new XRPLTransactionError(
          `XRPL transaction failed: ${result.engine_result} - ${result.engine_result_message}`,
          result.engine_result,
          result.engine_result_message,
          signed.hash
        );
      }

      txRecord.status = "confirmed";
      txRecord.updatedAt = new Date();
      console.log("[XRPL] Transaction successful:", txRecord);
      // In a real system, you would update txRecord in the database here.
      return res;
    } catch (error: any) {
      txRecord.status = "failed";
      txRecord.errorMessage = error.message;
        txRecord.updatedAt = new Date();
      console.error("[XRPL] Transaction submission error:", txRecord);
      // In a real system, you would update txRecord in the database here.
      if (error instanceof XRPLConnectionError || error instanceof XRPLTransactionError) {
        throw error; // Re-throw custom errors directly
      }
      throw new XRPLTransactionError(
        `Unknown error during XRPL transaction submission: ${error.message}`,
        undefined,
        error.message,
        signed.hash
      );
    }
  }

  // ---------------------------------------------------------------------------
  // 1. Member Onboarding
  // ---------------------------------------------------------------------------

  /**
   * Create trustlines for FTHUSD and USDF on a member account.
   * Assumes member controls the wallet / signs the tx elsewhere.
   * Here we just build the tx JSON if needed, or you can call XRPL directly
   * from frontend/wallet integrations.
   * 
   * SECURITY: Sets tfSetNoRipple flag to prevent rippling (Issue #2)
   */
  buildMemberTrustSetTx(memberAddress: string): xrpl.TrustSet[] {
    const tfSetNoRipple = 131072; // 0x00020000
    
    const fthusdTrust: xrpl.TrustSet = {
      TransactionType: "TrustSet",
      Account: memberAddress,
      Flags: tfSetNoRipple, // MUST set NoRipple to prevent rippling
      LimitAmount: {
        currency: "FTHUSD",
        issuer: this.cfg.fthusdIssuer,
        value: "1000000", // logical ceiling, not actual risk limit
      },
    };

    const usdfTrust: xrpl.TrustSet = {
      TransactionType: "TrustSet",
      Account: memberAddress,
      Flags: tfSetNoRipple, // MUST set NoRipple to prevent rippling
      LimitAmount: {
        currency: "USDF",
        issuer: this.cfg.usdfIssuer,
        value: "1000000000",
      },
    };

    return [fthusdTrust, usdfTrust];
  }

  /**
   * Authorize a member's trustline on the issuer (requireAuth pattern).
   * NOTE: requires issuer signing authority (opsIssuer or multi-sig flow).
   */
  async authorizeMemberTrustlines(memberAddress: string) {
    if (!this.opsIssuer) {
      throw new XRPLTransactionError("opsIssuer wallet not configured for authorization.");
    }

    const txFth: xrpl.TrustSet = {
      TransactionType: "TrustSet",
      Account: this.cfg.fthusdIssuer,
      Flags: xrpl.TrustSetFlags.tfSetfAuth,
      LimitAmount: {
        currency: "FTHUSD",
        issuer: memberAddress,
        value: "0",
      },
    };

    const txUsdf: xrpl.TrustSet = {
      TransactionType: "TrustSet",
      Account: this.cfg.usdfIssuer,
      Flags: xrpl.TrustSetFlags.tfSetfAuth,
      LimitAmount: {
        currency: "USDF",
        issuer: memberAddress,
        value: "0",
      },
    };

    await this.submitWithWallet(this.opsIssuer, txFth, "member_onboarding_fthusd_auth", memberAddress);
    await this.submitWithWallet(this.opsIssuer, txUsdf, "member_onboarding_usdf_auth", memberAddress);
  }

  // ---------------------------------------------------------------------------
  // 2. FTHUSD credit / redeem
  // ---------------------------------------------------------------------------

  async creditFTHUSD(
    memberAddress: string,
    amount: string,
    depositId: string
  ) {
    if (!this.opsIssuer) {
      throw new XRPLTransactionError("opsIssuer wallet not configured for FTHUSD credit.");
    }

    const tx: xrpl.Payment = {
      TransactionType: "Payment",
      Account: this.cfg.fthusdIssuer,
      Destination: memberAddress,
      Amount: {
        currency: "FTHUSD",
        issuer: this.cfg.fthusdIssuer,
        value: amount,
      },
      Memos: [
        {
          Memo: {
            MemoType: Buffer.from("deposit_id").toString("hex"),
            MemoData: Buffer.from(depositId).toString("hex"),
          },
        },
      ],
      // SECURITY: No Flags set - MUST NOT use tfPartialPayment (Issue #2)
      // SECURITY: No Paths field - direct IOU payment only, no pathfinding (Issue #2)
    };

    // Validate payment construction
    if (tx.Flags && typeof tx.Flags === 'number' && (tx.Flags & 131072)) { // tfPartialPayment = 0x00020000
      throw new XRPLTransactionError("Partial payments not allowed for FTHUSD");
    }
    if ('Paths' in tx) {
      throw new XRPLTransactionError("Pathfinding not allowed for FTHUSD - use direct payments only");
    }

    return this.submitWithWallet(this.opsIssuer, tx, "fthusd_credit", memberAddress);
  }

  /**
   * This builds the *member* side redemption payment; signing happens in wallet.
   * 
   * SECURITY: No partial payments or pathfinding allowed (Issue #2)
   */
  buildFTHUSDRedemptionTx(
    memberAddress: string,
    amount: string,
    redemptionId: string
  ): xrpl.Payment {
    return {
      TransactionType: "Payment",
      Account: memberAddress,
      Destination: this.cfg.fthusdIssuer,
      Amount: {
        currency: "FTHUSD",
        issuer: this.cfg.fthusdIssuer,
        value: amount,
      },
      Memos: [
        {
          Memo: {
            MemoType: Buffer.from("redemption_id").toString("hex"),
            MemoData: Buffer.from(redemptionId).toString("hex"),
          },
        },
      ],
      // SECURITY: No Flags - MUST NOT use tfPartialPayment
      // SECURITY: No Paths - direct IOU payment only, no pathfinding
    };
  }

  // ---------------------------------------------------------------------------
  // 3. USDF bonus issuance
  // ---------------------------------------------------------------------------

  async issueUSDFBonus(
    memberAddress: string,
    amount: string,
    bonusBatchId: string,
    bonusDateISO: string
  ) {
    const tx: xrpl.Payment = {
      TransactionType: "Payment",
      Account: this.cfg.usdfIssuer,
      Destination: memberAddress,
      Amount: {
        currency: "USDF",
        issuer: this.cfg.usdfIssuer,
        value: amount,
      },
      Memos: [
        {
          Memo: {
            MemoType: Buffer.from("bonus_batch_id").toString("hex"),
            MemoData: Buffer.from(bonusBatchId).toString("hex"),
          },
        },
        {
          Memo: {
            MemoType: Buffer.from("bonus_date").toString("hex"),
            MemoData: Buffer.from(bonusDateISO).toString("hex"),
          },
        },
      ],
      // SECURITY: No Flags set - MUST NOT use tfPartialPayment (Issue #2)
      // SECURITY: No Paths field - direct IOU payment only, no pathfinding (Issue #2)
    };

    // Validate payment construction
    if (tx.Flags && typeof tx.Flags === 'number' && (tx.Flags & 131072)) { // tfPartialPayment = 0x00020000
      throw new XRPLTransactionError("Partial payments not allowed for USDF");
    }
    if ('Paths' in tx) {
      throw new XRPLTransactionError("Pathfinding not allowed for USDF - use direct payments only");
    }

    return this.submitWithWallet(this.opsBonus, tx, "usdf_bonus_issuance", memberAddress);
  }

  // ---------------------------------------------------------------------------
  // 4. Gold orders
  // ---------------------------------------------------------------------------

  async createGoldOrder(
    memberAddress: string,
    usdfAmount: string,
    orderId: string
  ) {
    const paymentTx: xrpl.Payment = {
      TransactionType: "Payment",
      Account: memberAddress,
      Destination: this.cfg.goldVault,
      Amount: {
        currency: "USDF",
        issuer: this.cfg.usdfIssuer,
        value: usdfAmount,
      },
      Memos: [
        {
          Memo: {
            MemoType: Buffer.from("gold_order_id").toString("hex"),
            MemoData: Buffer.from(orderId).toString("hex"),
          },
        },
      ],
      // SECURITY: No Flags - MUST NOT use tfPartialPayment (Issue #2)
      // SECURITY: No Paths - direct IOU payment only, no pathfinding (Issue #2)
    };

    return paymentTx;
  }

  async mintGoldOrderNFT(
    toAddress: string,
    orderId: string,
    metadataUri: string
  ) {
    const GOLD_ORDER_NFT_TAXON = 1; 

    const tx: xrpl.NFTokenMint = {
      TransactionType: "NFTokenMint",
      Account: this.cfg.goldVault,
      NFTokenTaxon: GOLD_ORDER_NFT_TAXON,
      Flags: xrpl.NFTokenMintFlags.tfTransferable,
      URI: Buffer.from(metadataUri).toString("hex"),
      Memos: [
        {
          Memo: {
            MemoType: Buffer.from("gold_order_id").toString("hex"),
            MemoData: Buffer.from(orderId).toString("hex"),
          },
        },
      ],
    };

    return this.submitWithWallet(this.opsGold, tx, "gold_order_nft_mint", toAddress);
  }

  async completeGoldBuyback(
    memberAddress: string,
    orderNftId: string,
    usdfAmount: string,
    buybackId: string
  ) {
    const burnTx: xrpl.NFTokenBurn = {
      TransactionType: "NFTokenBurn",
      Account: memberAddress,
      NFTokenID: orderNftId,
      Memos: [
        {
          Memo: {
            MemoType: Buffer.from("gold_buyback_id").toString("hex"),
            MemoData: Buffer.from(buybackId).toString("hex"),
          },
        },
      ],
    };

    const paymentTx: xrpl.Payment = {
      TransactionType: "Payment",
      Account: this.cfg.goldVault,
      Destination: memberAddress,
      Amount: {
        currency: "USDF",
        issuer: this.cfg.usdfIssuer,
        value: usdfAmount,
      },
      Memos: [
        {
          Memo: {
            MemoType: Buffer.from("gold_buyback_id").toString("hex"),
            MemoData: Buffer.from(buybackId).toString("hex"),
          },
        },
      ],
      // SECURITY: No Flags - MUST NOT use tfPartialPayment (Issue #2)
      // SECURITY: No Paths - direct IOU payment only, no pathfinding (Issue #2)
    };

    // Validate payment construction
    if (paymentTx.Flags && typeof paymentTx.Flags === 'number' && (paymentTx.Flags & 131072)) {
      throw new XRPLTransactionError("Partial payments not allowed for USDF");
    }
    if ('Paths' in paymentTx) {
      throw new XRPLTransactionError("Pathfinding not allowed for USDF - use direct payments only");
    }

    return { burnTx, paymentTx };
  }

  // ---------------------------------------------------------------------------
  // 5. Membership NFTs
  // ---------------------------------------------------------------------------

  async mintMembershipNFT(
    toAddress: string,
    memberId: string,
    metadataUri: string,
    issuerAddress: string // The issuer of the MembershipNFT, likely the Master Account
  ) {
    const MEMBERSHIP_NFT_TAXON = 2; // Example taxon, ensure this is documented

    const nftMintTx: xrpl.NFTokenMint = { // Renamed 'tx' to 'nftMintTx' to avoid redeclaration
      TransactionType: "NFTokenMint",
      Account: issuerAddress, // Issuer of the MembershipNFT
      NFTokenTaxon: MEMBERSHIP_NFT_TAXON,
      Flags: xrpl.NFTokenMintFlags.tfTransferable,
      URI: Buffer.from(metadataUri).toString("hex"),
      Memos: [
        {
          Memo: {
            MemoType: Buffer.from("member_id").toString("hex"),
            MemoData: Buffer.from(memberId).toString("hex"),
          },
        },
      ],
      Destination: toAddress, // Mint directly to the member's address
    };

    if (!this.opsIssuer) {
      throw new XRPLTransactionError("opsIssuer wallet not configured for MembershipNFT minting.");
    }
    return this.submitWithWallet(this.opsIssuer, nftMintTx, "membership_nft_mint", toAddress);
  }

  // ---------------------------------------------------------------------------
  // 6. PoR anchoring
  // ---------------------------------------------------------------------------

  async anchorPoR(porHash: string, porTimestampISO: string) {
    const tx: xrpl.Payment = {
      TransactionType: "Payment",
      Account: this.opsOracle.classicAddress,
      Destination: this.cfg.oracleAccount,
      Amount: "1", // 1 drop, purely for memo anchoring
      Memos: [
        {
          Memo: {
            MemoType: Buffer.from("por_hash").toString("hex"),
            MemoData: Buffer.from(porHash).toString("hex"),
          },
        },
        {
          Memo: {
            MemoType: Buffer.from("por_time").toString("hex"),
            MemoData: Buffer.from(porTimestampISO).toString("hex"),
          },
        },
      ],
    };

    return this.submitWithWallet(this.opsOracle, tx, "por_anchoring");
  }

  async getAccountInfo(address: string): Promise<{ xrpBalance: string }> {
    await this.connect();
    const accountInfo = await this.client.request({
      command: 'account_info',
      account: address,
      ledger_index: 'validated',
    });
    await this.disconnect();
    return { xrpBalance: xrpl.dropsToXrp(accountInfo.result.account_data.Balance).toString() };
  }

  async getAccountBalances(address: string): Promise<{ currency: string; issuer: string; value: string }[]> {
    await this.connect();
    const accountLines = await this.client.request({
      command: 'account_lines',
      account: address,
      ledger_index: 'validated',
    });
    await this.disconnect();
    return accountLines.result.lines.map((line: any) => ({ // Changed type to any to resolve AccountLine error
      currency: line.currency,
      issuer: line.account, // For trustlines, the 'account' field is the issuer
      value: line.balance,
    }));
  }
}
