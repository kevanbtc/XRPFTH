// src/services/GoldOpsService.ts

import { getXRPLService } from "./xrpl";

interface GoldOrderRequest {
  memberAddress: string;
  memberId: string;
  usdfAmount: string;
  orderId: string;
  metadataUri: string; // IPFS, S3, etc.
}

export class GoldOpsService {
  async createGoldOrder(memberAddress: string, usdfAmount: string, orderId: string) {
    const xrpl = getXRPLService();

    // 1) Build tx for member to pay USDF to GoldVault
    const paymentTx = await xrpl.createGoldOrder(
      memberAddress,
      usdfAmount,
      orderId
    );

    // You’d typically return this to frontend to sign via XUMM/Ledger:
    // return { xrplPaymentTx: paymentTx, orderId: req.orderId };

    // 2) After you see the payment land on-chain (webhook or polling),
    // you mint the GoldOrderNFT:
    // This method now only builds the payment transaction.
    // The actual minting of the NFT will be handled by the GoldOrderAppService
    // after the payment is confirmed.
    return paymentTx;
  }

  async mintGoldOrderNFT(toAddress: string, orderId: string, metadataUri: string) {
    const xrpl = getXRPLService();
    return xrpl.mintGoldOrderNFT(toAddress, orderId, metadataUri);

    // plus off-chain DB updates, timers for 90 days, etc.
  }

  async completeBuyback(
    memberAddress: string,
    orderNftId: string,
    usdfAmount: string,
    buybackId: string
  ) {
    const xrpl = getXRPLService();
    const { burnTx, paymentTx } = await xrpl.completeGoldBuyback(
      memberAddress,
      orderNftId,
      usdfAmount,
      buybackId
    );

    // Likely pattern:
    // - return burnTx to member for signing (they own the NFT)
    // - after burn confirmed, submit paymentTx from GoldVault via ops

    return { burnTx, paymentTx };
  }
}
