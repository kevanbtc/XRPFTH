// src/services/KYCService.ts

import { getEVMService } from "./evm";
import { MockKYCVendorAdapter, KYCApplicationStatus, KYCApplicationResult, KYCVendorAdapter } from "./kyc/KYCVendorAdapter"; // Import mock adapter and interfaces
import { PrismaClient, KYCStatus as PrismaKYCStatus } from '@prisma/client'; // Import Prisma's KYCStatus

const prisma = new PrismaClient();

export enum KYCStatus {
  Pending = "PENDING",
  Approved = "APPROVED",
  Blocked = "BLOCKED",
  ResubmitRequired = "RESUBMIT_REQUIRED", // Added for vendor adapter
}

export interface KYCRecord {
  memberId: string;
  walletAddress: string; // XRPL or EVM, depending on mapping strategy
  status: KYCStatus;
  jurisdictionCode: number;
  flags: bigint; // internal product flags, mirrored to ComplianceRegistry
  applicationId?: string; // Added for vendor adapter
}

export class KYCService {
  private kycVendorAdapter: KYCVendorAdapter;

  constructor(kycVendorAdapter: KYCVendorAdapter = new MockKYCVendorAdapter()) {
    this.kycVendorAdapter = kycVendorAdapter;
  }

  async approveMember(record: KYCRecord) {
    const evm = getEVMService();

    // 1) Update EVM ComplianceRegistry
    await evm.setKYCStatus(
      record.walletAddress,
      true,
      record.jurisdictionCode,
      record.flags
    );

    // 2) Persist in your DB and trigger XRPL Hook state update via a separate worker
    // (e.g. emit an internal event "KYC_APPROVED" consumed by HookSyncWorker)
    await this.updateMemberKYCStatusInDb(record.memberId, PrismaKYCStatus.APPROVED);
    await this.onComplianceStatusChanged(record.memberId, record.walletAddress);
  }

  async blockMember(record: KYCRecord) {
    const evm = getEVMService();
    const member = await prisma.member.findUnique({ where: { memberId: record.memberId } });
    if (!member) throw new Error('Member not found');

    await evm.setSanctioned(record.walletAddress, true);
    await this.updateMemberKYCStatusInDb(record.memberId, PrismaKYCStatus.BLOCKED);
    await this.onComplianceStatusChanged(record.memberId, record.walletAddress);
  }

  async unblockMember(record: KYCRecord) {
    const evm = getEVMService();
    const member = await prisma.member.findUnique({ where: { memberId: record.memberId } });
    if (!member) throw new Error('Member not found');

    await evm.setSanctioned(record.walletAddress, false);
    await this.updateMemberKYCStatusInDb(record.memberId, PrismaKYCStatus.APPROVED); // Assuming unblock means approved
    await this.onComplianceStatusChanged(record.memberId, record.walletAddress);
  }

  async initiateKYCVerification(memberId: string, userData: any): Promise<KYCApplicationResult> {
    const member = await prisma.member.findUnique({ where: { memberId } });
    if (!member) throw new Error('Member not found');

    const applicationResult = await this.kycVendorAdapter.initiateKYC(memberId, userData);
    // Store application ID in DB for tracking
    // await prisma.member.update({ where: { memberId }, data: { kycApplicationId: applicationResult.applicationId } });
    return applicationResult;
  }

  async getMemberKYCStatus(memberId: string): Promise<KYCRecord | null> {
    const member = await prisma.member.findUnique({ where: { memberId } });
    if (!member) return null;

    return {
      memberId: member.memberId,
      walletAddress: member.evmWallet || member.primaryWallet,
      status: member.kycStatus as KYCStatus, // Cast Prisma status to service status
      jurisdictionCode: member.jurisdiction,
      flags: member.flags,
    };
  }

  private async updateMemberKYCStatusInDb(memberId: string, status: PrismaKYCStatus) {
    await prisma.member.update({
      where: { memberId },
      data: { kycStatus: status, updatedAt: new Date() },
    });
  }

  private async onComplianceStatusChanged(memberId: string, wallet: string) {
    // For now, just log; later, push into a queue / Kafka / whatever
    console.log("[KYC] Compliance status changed", { memberId, wallet });
    // In a real system, this would trigger a worker to update XRPL Hook state
  }
}
