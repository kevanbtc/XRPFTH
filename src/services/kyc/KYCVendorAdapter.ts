// src/services/kyc/KYCVendorAdapter.ts

export enum KYCApplicationStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  RESUBMIT_REQUIRED = 'RESUBMIT_REQUIRED',
}

export interface KYCApplicationResult {
  applicationId: string;
  memberId: string;
  status: KYCApplicationStatus;
  vendorScore?: number;
  vendorDetails?: any; // Raw response from vendor
  rejectionReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface KYCVendorAdapter {
  initiateKYC(memberId: string, userData: any): Promise<KYCApplicationResult>;
  getKYCStatus(applicationId: string): Promise<KYCApplicationResult>;
  // Potentially a webhook handler for vendor callbacks
}

// Mock implementation for development and testing
export class MockKYCVendorAdapter implements KYCVendorAdapter {
  private applications: KYCApplicationResult[] = [];

  async initiateKYC(memberId: string, userData: any): Promise<KYCApplicationResult> {
    const applicationId = `kyc-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const result: KYCApplicationResult = {
      applicationId,
      memberId,
      status: KYCApplicationStatus.PENDING,
      vendorDetails: { mockData: 'initial submission' },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.applications.push(result);
    console.log(`[MockKYCVendorAdapter] Initiated KYC for ${memberId}: ${JSON.stringify(result)}`);

    // Simulate asynchronous approval
    setTimeout(() => {
      const approvedResult = this.applications.find(app => app.applicationId === applicationId);
      if (approvedResult) {
        approvedResult.status = KYCApplicationStatus.APPROVED;
        approvedResult.updatedAt = new Date();
        approvedResult.vendorScore = 85;
        console.log(`[MockKYCVendorAdapter] Auto-approved KYC for ${memberId}: ${JSON.stringify(approvedResult)}`);
        // In a real system, this would trigger a callback to your KYCService
        // to update the member's status in your DB and ComplianceRegistry.
      }
    }, 5000); // Auto-approve after 5 seconds

    return result;
  }

  async getKYCStatus(applicationId: string): Promise<KYCApplicationResult> {
    const application = this.applications.find(app => app.applicationId === applicationId);
    if (!application) {
      throw new Error(`KYC application ${applicationId} not found.`);
    }
    return application;
  }
}
