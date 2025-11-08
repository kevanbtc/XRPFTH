/**
 * Membership NFT Service
 * 
 * Handles XLS-20 NFT minting, metadata management, and tier verification
 * for FTH membership tokens on XRPL
 */

import { PrismaClient } from '@prisma/client';
import { Client, Wallet, xrpl } from 'xrpl';
import { logger } from '../../logging/ledgerLogger';

const prisma = new PrismaClient();

export interface MembershipNFTMetadata {
  handle: string;
  tier: string;
  memberId: string;
  issuedBy: string;
  features: string[];
  benefits: {
    feeDiscount: number;
    rewardsMultiplier: number;
    goldDiscount: number;
  };
}

export interface NFTMintResult {
  nftTokenId: string;
  xrplTxHash: string;
  xrplAddress: string;
  metadata: MembershipNFTMetadata;
}

export class MembershipNFTService {
  private client: Client;
  private issuerWallet: Wallet;

  constructor(
    xrplServerUrl: string = process.env.XRPL_SERVER_URL || 'wss://s.altnet.rippletest.net:51233',
    issuerSeed: string = process.env.NFT_ISSUER_SEED || ''
  ) {
    this.client = new Client(xrplServerUrl);
    this.issuerWallet = Wallet.fromSeed(issuerSeed);
  }

  /**
   * Connect to XRPL
   */
  async connect(): Promise<void> {
    if (!this.client.isConnected()) {
      await this.client.connect();
      logger.info('Connected to XRPL for NFT operations');
    }
  }

  /**
   * Disconnect from XRPL
   */
  async disconnect(): Promise<void> {
    if (this.client.isConnected()) {
      await this.client.disconnect();
      logger.info('Disconnected from XRPL');
    }
  }

  /**
   * Mint a membership NFT for a member
   */
  async mintMembershipNFT(
    memberId: string,
    recipientAddress: string
  ): Promise<NFTMintResult> {
    await this.connect();

    // Get member details
    const member = await prisma.member.findUnique({
      where: { memberId },
    });

    if (!member) {
      throw new Error(`Member ${memberId} not found`);
    }

    if (member.membershipNftId) {
      throw new Error(`Member ${memberId} already has an NFT: ${member.membershipNftId}`);
    }

    // Build NFT metadata
    const metadata = this.buildMetadata(member);

    // Convert metadata to URI (IPFS or base64)
    const metadataUri = this.encodeMetadata(metadata);

    // Prepare NFTokenMint transaction
    const mintTx: xrpl.NFTokenMint = {
      TransactionType: 'NFTokenMint',
      Account: this.issuerWallet.address,
      URI: xrpl.convertStringToHex(metadataUri),
      Flags: 8, // tfTransferable (can be transferred)
      TransferFee: 0, // No transfer fee
      NFTokenTaxon: 0, // FTH Membership series
    };

    // Submit and wait for validation
    const prepared = await this.client.autofill(mintTx);
    const signed = this.issuerWallet.sign(prepared);
    const result = await this.client.submitAndWait(signed.tx_blob);

    if (result.result.meta && typeof result.result.meta === 'object' && 'TransactionResult' in result.result.meta) {
      if (result.result.meta.TransactionResult !== 'tesSUCCESS') {
        throw new Error(`NFT mint failed: ${result.result.meta.TransactionResult}`);
      }
    }

    // Extract NFTokenID from metadata
    const nftTokenId = this.extractNFTokenID(result);

    if (!nftTokenId) {
      throw new Error('Failed to extract NFT Token ID from transaction result');
    }

    logger.info('Minted membership NFT', {
      memberId,
      nftTokenId,
      recipientAddress,
      tier: member.membershipTier,
    });

    // Store NFT record in database
    await prisma.$transaction(async (tx) => {
      // Create NFT record
      await tx.membershipNFT.create({
        data: {
          memberId,
          nftTokenId,
          handle: member.handle,
          tier: member.membershipTier,
          xrplAddress: recipientAddress,
          metadata: metadata as any,
        },
      });

      // Update member with NFT ID
      await tx.member.update({
        where: { memberId },
        data: {
          membershipNftId: nftTokenId,
        },
      });
    });

    // If recipient is different from issuer, create an NFT offer and transfer
    if (recipientAddress !== this.issuerWallet.address) {
      await this.transferNFT(nftTokenId, recipientAddress);
    }

    return {
      nftTokenId,
      xrplTxHash: result.result.hash,
      xrplAddress: recipientAddress,
      metadata,
    };
  }

  /**
   * Transfer NFT to a member
   */
  private async transferNFT(nftTokenId: string, recipientAddress: string): Promise<void> {
    // Create NFT sell offer for 0 XRP (free transfer)
    const sellOfferTx: xrpl.NFTokenCreateOffer = {
      TransactionType: 'NFTokenCreateOffer',
      Account: this.issuerWallet.address,
      NFTokenID: nftTokenId,
      Amount: '0',
      Destination: recipientAddress,
      Flags: 1, // tfSellNFToken
    };

    const prepared = await this.client.autofill(sellOfferTx);
    const signed = this.issuerWallet.sign(prepared);
    const result = await this.client.submitAndWait(signed.tx_blob);

    logger.info('Created NFT transfer offer', {
      nftTokenId,
      recipientAddress,
      txHash: result.result.hash,
    });
  }

  /**
   * Get NFT metadata for a member
   */
  async getNFTMetadata(memberId: string): Promise<MembershipNFTMetadata | null> {
    const nft = await prisma.membershipNFT.findUnique({
      where: { memberId },
    });

    if (!nft || !nft.metadata) {
      return null;
    }

    return nft.metadata as MembershipNFTMetadata;
  }

  /**
   * Verify member has required tier
   */
  async verifyTier(memberId: string, requiredTier: string): Promise<boolean> {
    const member = await prisma.member.findUnique({
      where: { memberId },
    });

    if (!member) {
      return false;
    }

    const tierHierarchy = ['BRONZE', 'SILVER', 'GOLD', 'ELITE', 'PLATINUM'];
    const memberTierIndex = tierHierarchy.indexOf(member.membershipTier);
    const requiredTierIndex = tierHierarchy.indexOf(requiredTier);

    return memberTierIndex >= requiredTierIndex;
  }

  /**
   * Upgrade member tier
   */
  async upgradeTier(memberId: string, newTier: string): Promise<void> {
    const member = await prisma.member.findUnique({
      where: { memberId },
    });

    if (!member) {
      throw new Error(`Member ${memberId} not found`);
    }

    // Update member tier
    await prisma.member.update({
      where: { memberId },
      data: {
        membershipTier: newTier,
      },
    });

    // Update NFT metadata if NFT exists
    if (member.membershipNftId) {
      const updatedMetadata = this.buildMetadata({ ...member, membershipTier: newTier });

      await prisma.membershipNFT.update({
        where: { memberId },
        data: {
          tier: newTier,
          metadata: updatedMetadata as any,
        },
      });
    }

    logger.info('Upgraded member tier', {
      memberId,
      oldTier: member.membershipTier,
      newTier,
    });
  }

  /**
   * Build NFT metadata from member details
   */
  private buildMetadata(member: any): MembershipNFTMetadata {
    const tierBenefits = this.getTierBenefits(member.membershipTier);

    return {
      handle: member.handle,
      tier: member.membershipTier,
      memberId: member.memberId,
      issuedBy: 'FTH Finance',
      features: [
        'FTHUSD Issuance',
        'USDF Rewards',
        'Gold Marketplace Access',
        'Proof of Reserves',
      ],
      benefits: tierBenefits,
    };
  }

  /**
   * Get tier-specific benefits
   */
  private getTierBenefits(tier: string): {
    feeDiscount: number;
    rewardsMultiplier: number;
    goldDiscount: number;
  } {
    const benefitsMap: Record<string, any> = {
      BRONZE: { feeDiscount: 0, rewardsMultiplier: 1.0, goldDiscount: 2 },
      SILVER: { feeDiscount: 10, rewardsMultiplier: 1.2, goldDiscount: 5 },
      GOLD: { feeDiscount: 20, rewardsMultiplier: 1.5, goldDiscount: 8 },
      ELITE: { feeDiscount: 35, rewardsMultiplier: 2.0, goldDiscount: 12 },
      PLATINUM: { feeDiscount: 50, rewardsMultiplier: 2.5, goldDiscount: 15 },
    };

    return benefitsMap[tier] || benefitsMap['BRONZE'];
  }

  /**
   * Encode metadata as URI (simplified - use IPFS in production)
   */
  private encodeMetadata(metadata: MembershipNFTMetadata): string {
    const json = JSON.stringify(metadata);
    return `data:application/json;base64,${Buffer.from(json).toString('base64')}`;
  }

  /**
   * Extract NFToken ID from transaction result
   */
  private extractNFTokenID(result: any): string | null {
    if (!result.result.meta || typeof result.result.meta !== 'object') {
      return null;
    }

    const meta = result.result.meta as any;

    if (!meta.nftoken_id) {
      // Try to extract from AffectedNodes
      if (meta.AffectedNodes) {
        for (const node of meta.AffectedNodes) {
          if (node.CreatedNode && node.CreatedNode.LedgerEntryType === 'NFTokenPage') {
            const nfTokens = node.CreatedNode.NewFields?.NFTokens;
            if (nfTokens && nfTokens.length > 0) {
              return nfTokens[0].NFToken.NFTokenID;
            }
          }
        }
      }
    }

    return meta.nftoken_id || null;
  }
}
