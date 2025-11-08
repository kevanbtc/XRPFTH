import { PrismaClient, Member, KYCStatus, MembershipTier } from '@prisma/client';
import { KYCService, KYCRecord, KYCStatus as ServiceKYCStatus } from '../KYCService';
import { getXRPLService } from '../xrpl';
import { getEVMService } from '../evm';
import { MockBankingAdapter, BankingAdapter, DepositIntent, WithdrawalRequest } from '../banking/BankingAdapter'; // Import BankingAdapter and Mock

const prisma = new PrismaClient();
const kycService = new KYCService();
const xrplService = getXRPLService();
const evmService = getEVMService();
const bankingAdapter: BankingAdapter = new MockBankingAdapter(); // Initialize mock banking adapter

export class MemberService {
  async getMemberById(memberId: string): Promise<Member | null> {
    return prisma.member.findUnique({ where: { memberId } });
  }

  async getMemberProfile(memberId: string): Promise<any | null> {
    const member = await this.getMemberById(memberId);
    if (!member) {
      return null;
    }

    // For now, we'll mock membershipTier and handle as they are not in the current Member model
    // In a real scenario, these would come from the DB or XRPL NFT metadata
    const mockMembershipTier = 'ELITE';
    const mockHandle = 'founder.fth';

    return {
      memberId: member.memberId,
      email: member.email,
      kycStatus: member.kycStatus,
      xrplAddress: member.primaryWallet,
      evmAddress: member.evmWallet,
      handle: mockHandle,
      membershipTier: mockMembershipTier,
      membershipNftId: member.membershipNftId, // Assuming this field exists in Member model
      mintedDate: member.membershipNftId ? new Date().toISOString() : undefined, // Placeholder
      profile: {
        firstName: 'John', // Placeholder
        lastName: 'Doe',   // Placeholder
        dateOfBirth: '1990-01-01', // Placeholder
        nationality: 'UAE', // Placeholder
      },
    };
  }

  async registerMember(email: string, passwordHash: string, xrplAddress: string, evmAddress: string): Promise<Member> {
    // In a real app, you'd hash the password and store it securely.
    // For now, we'll create a mock member.
    const newMember = await prisma.member.create({
      data: {
        memberId: `member-${Date.now()}`,
        email,
        primaryWallet: xrplAddress,
        evmWallet: evmAddress,
        kycStatus: KYCStatus.PENDING,
        jurisdiction: 784,
        flags: 0n,
        handle: `member-${Date.now()}.fth`, // Mock handle
        membershipTier: 'STANDARD', // Mock tier
        membershipNftId: `NFT-FTH-${Date.now()}`, // Mock NFT ID
      },
    });

    // Initiate KYC process (mock)
    await kycService.approveMember({
      memberId: newMember.memberId,
      walletAddress: evmAddress,
      status: ServiceKYCStatus.Pending, // Use service's KYCStatus
      jurisdictionCode: newMember.jurisdiction,
      flags: newMember.flags,
    });

    return newMember;
  }
}
