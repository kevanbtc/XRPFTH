// src/services/evm/EVMIntegrationService.ts

import { ethers } from "ethers";
import { loadEVMConfig, EVMConfig } from "../../config/evmConfig";

// Hardhat artifacts (ensure your build outputs JSON there)
import FTHPoRRegistryArtifact from "../../../evm/artifacts/contracts/FTHPoRRegistry.sol/FTHPoRRegistry.json";
import ComplianceRegistryArtifact from "../../../evm/artifacts/contracts/ComplianceRegistry.sol/ComplianceRegistry.json";
import XRPLBridgeArtifact from "../../../evm/artifacts/contracts/XRPLBridge.sol/XRPLBridge.json";
import { LedgerTransaction } from "../../models/LedgerTransaction";
import { v4 as uuidv4 } from "uuid";

export class EVMIntegrationService {
  private cfg: EVMConfig;
  private provider: ethers.JsonRpcProvider;
  private signer: ethers.Wallet;

  private fthPoRRegistry: ethers.Contract;
  private complianceRegistry: ethers.Contract;
  private xrplBridge: ethers.Contract;

  constructor(cfg: EVMConfig) {
    this.cfg = cfg;
    this.provider = new ethers.JsonRpcProvider(cfg.rpcUrl, cfg.chainId);
    this.signer = new ethers.Wallet(cfg.operatorPrivateKey, this.provider);

    this.fthPoRRegistry = new ethers.Contract(
      cfg.fthPoRRegistry,
      FTHPoRRegistryArtifact.abi,
      this.signer
    );

    this.complianceRegistry = new ethers.Contract(
      cfg.complianceRegistry,
      ComplianceRegistryArtifact.abi,
      this.signer
    );

    this.xrplBridge = new ethers.Contract(
      cfg.xrplBridge,
      XRPLBridgeArtifact.abi,
      this.signer
    );
  }

  // ---------------- PoR interactions ----------------

  async recordPoRSnapshot(params: {
    hash: string;                 // 0x...
    timestamp: number;            // unix seconds
    coverageRatioBps: number;     // e.g. 10500
    totalAssets: bigint;          // e.g. parseUnits("1000000", 2)
    totalLiabilities: bigint;
    uri: string;
  }): Promise<ethers.TransactionReceipt> {
    const tx = await this.fthPoRRegistry.recordSnapshot(
      params.hash,
      params.timestamp,
      params.coverageRatioBps,
      params.totalAssets,
      params.totalLiabilities,
      params.uri
    );
    const receipt = await tx.wait();
    console.log("[EVM] Transaction successful:", {
      flow: "por_snapshot",
      txHash: receipt.hash,
      status: "confirmed",
      payloadSummary: JSON.stringify(params),
    });
    // In a real system, you would update the LedgerTransaction record in the database here.
    return receipt;
  }

  async getLatestPoR() {
    return this.fthPoRRegistry.latestSnapshot();
  }

  // ---------------- Compliance interactions ----------------

  async setKYCStatus(
    wallet: string,
    approved: boolean,
    jurisdictionCode: number,
    flags: bigint
  ) {
    const tx = await this.complianceRegistry.setKYCStatus(
      wallet,
      approved,
      jurisdictionCode,
      flags
    );
    const receipt = await tx.wait();
    console.log("[EVM] Transaction successful:", {
      flow: "kyc_update",
      txHash: receipt.hash,
      status: "confirmed",
      payloadSummary: JSON.stringify({ wallet, approved, jurisdictionCode, flags }),
    });
    // In a real system, you would update the LedgerTransaction record in the database here.
    return receipt;
  }

  async setSanctioned(wallet: string, sanctioned: boolean) {
    const tx = await this.complianceRegistry.setSanctioned(wallet, sanctioned);
    const receipt = await tx.wait();
    console.log("[EVM] Transaction successful:", {
      flow: "sanction_update",
      txHash: receipt.hash,
      status: "confirmed",
      payloadSummary: JSON.stringify({ wallet, sanctioned }),
    });
    // In a real system, you would update the LedgerTransaction record in the database here.
    return receipt;
  }

  async getComplianceStatus(wallet: string) {
    return this.complianceRegistry.getStatus(wallet);
  }

  // ---------------- XRPL bridge interactions ----------------

  async queueXRPLMessage(
    typeIndex: number,   // matches enum MessageType
    payloadHash: string, // 0x...
  ) {
    const tx = await this.xrplBridge.queueMessage(typeIndex, payloadHash);
    const receipt = await tx.wait();
    console.log("[EVM] Transaction successful:", {
      flow: "xrpl_message_queue",
      txHash: receipt.hash,
      status: "confirmed",
      payloadSummary: JSON.stringify({ typeIndex, payloadHash }),
    });
    // In a real system, you would update the LedgerTransaction record in the database here.
    return receipt;
  }

  async markXRPLMessageProcessed(
    id: bigint,
    xrplTxHash: string
  ) {
    const tx = await this.xrplBridge.markProcessed(id, xrplTxHash);
    const receipt = await tx.wait();
    console.log("[EVM] Transaction successful:", {
      flow: "xrpl_message_processed",
      txHash: receipt.hash,
      status: "confirmed",
      payloadSummary: JSON.stringify({ id, xrplTxHash }),
    });
    // In a real system, you would update the LedgerTransaction record in the database here.
    return receipt;
  }
}
