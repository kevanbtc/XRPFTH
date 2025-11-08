import { Request } from 'express';

declare global {
  namespace Express {
    interface Request {
      user?: {
        name: string;
        role: string;
        memberId: string;
      };
    }
  }
}

// Define API response types for the FTH Command Hub
export interface MemberProfileResponse {
  handle: string;
  status: 'VERIFIED' | 'PENDING_KYC' | 'REJECTED_KYC';
  membershipTier: 'ELITE' | 'STANDARD';
  xrplAddress: string;
  evmAddress: string;
  membershipNftId?: string;
  mintedDate?: string;
}

export interface BalanceResponse {
  fthusd: string;
  usdf: string;
}

export interface RecentTransaction {
  id: string;
  type: string;
  amount: string;
  currency: string;
  status: 'COMPLETED' | 'PENDING' | 'FAILED';
  fee?: string;
  netAmount?: string;
  timestamp: string;
}

export interface MetalsHoldingsResponse {
  totalHoldingsValue: string;
  metals: {
    type: 'GOLD' | 'SILVER' | 'PLATINUM';
    pricePerOunce: string;
  }[];
  recentOrders: {
    id: string;
    metalType: 'GOLD' | 'SILVER' | 'PLATINUM';
    ounces: string;
    price: string;
    status: 'PENDING' | 'CONFIRMED' | 'FULFILLED' | 'CANCELLED';
  }[];
}

export interface PorResponse {
  totalIssued: string;
  totalBacking: string;
  coverageRatio: string;
  asOf: string;
}

export interface MembershipNftResponse {
  nftId: string;
  tier: 'ELITE' | 'STANDARD';
  xrplAddress: string;
  minted: string;
  handle: string;
}
