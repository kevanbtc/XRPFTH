// src/services/banking/BankingAdapter.ts

export interface DepositIntent {
  depositId: string;
  memberId: string;
  amount: number;
  currency: string;
  referenceCode: string; // Unique code for wire matching
  status: 'PENDING' | 'SETTLED' | 'FAILED';
  createdAt: Date;
  updatedAt: Date;
}

export interface WithdrawalRequest {
  withdrawalId: string;
  memberId: string;
  amount: number;
  currency: string;
  bankAccountDetails: any; // Sensitive: should be encrypted/tokenized
  status: 'PENDING' | 'PROCESSED' | 'FAILED';
  createdAt: Date;
  updatedAt: Date;
}

export interface BankingAdapter {
  createDepositIntent(memberId: string, amount: number, currency: string): Promise<DepositIntent>;
  markDepositSettled(depositId: string, transactionDetails: any): Promise<void>;
  initiateWithdrawal(memberId: string, amount: number, currency: string, bankAccountDetails: any): Promise<WithdrawalRequest>;
  getAccountBalance(): Promise<number>; // For PoR - total fiat held by the program
}

// Mock implementation for development and testing
export class MockBankingAdapter implements BankingAdapter {
  private deposits: DepositIntent[] = [];
  private withdrawals: WithdrawalRequest[] = [];
  private programFiatBalance: number = 1_000_000; // Starting with $1M mock fiat

  async createDepositIntent(memberId: string, amount: number, currency: string): Promise<DepositIntent> {
    const depositId = `dep-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const intent: DepositIntent = {
      depositId,
      memberId,
      amount,
      currency,
      referenceCode: `REF-${depositId.substring(4, 10).toUpperCase()}`,
      status: 'PENDING',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.deposits.push(intent);
    console.log(`[MockBankingAdapter] Created deposit intent: ${JSON.stringify(intent)}`);
    return intent;
  }

  async markDepositSettled(depositId: string, transactionDetails: any): Promise<void> {
    const deposit = this.deposits.find(d => d.depositId === depositId);
    if (deposit) {
      deposit.status = 'SETTLED';
      deposit.updatedAt = new Date();
      this.programFiatBalance += deposit.amount;
      console.log(`[MockBankingAdapter] Deposit ${depositId} settled. Program fiat balance: ${this.programFiatBalance}`);
      // TODO: Trigger FTHUSD minting via XRPLIntegrationService
    } else {
      throw new Error(`Deposit intent ${depositId} not found.`);
    }
  }

  async initiateWithdrawal(memberId: string, amount: number, currency: string, bankAccountDetails: any): Promise<WithdrawalRequest> {
    if (this.programFiatBalance < amount) {
      throw new Error('Insufficient program fiat balance for withdrawal.');
    }

    const withdrawalId = `wdr-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const request: WithdrawalRequest = {
      withdrawalId,
      memberId,
      amount,
      currency,
      bankAccountDetails,
      status: 'PENDING',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.withdrawals.push(request);
    this.programFiatBalance -= amount;
    console.log(`[MockBankingAdapter] Initiated withdrawal: ${JSON.stringify(request)}. Program fiat balance: ${this.programFiatBalance}`);
    // Simulate immediate processing for mock
    request.status = 'PROCESSED';
    request.updatedAt = new Date();
    // TODO: Trigger FTHUSD burning via XRPLIntegrationService
    return request;
  }

  async getAccountBalance(): Promise<number> {
    return this.programFiatBalance;
  }
}
