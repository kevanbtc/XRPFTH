// src/services/xrpl/XRPLCustomErrors.ts

export class XRPLTransactionError extends Error {
  public readonly errorCode?: string;
  public readonly errorMessage?: string;
  public readonly txHash?: string;

  constructor(message: string, errorCode?: string, errorMessage?: string, txHash?: string) {
    super(message);
    this.name = 'XRPLTransactionError';
    this.errorCode = errorCode;
    this.errorMessage = errorMessage;
    this.txHash = txHash;
    Object.setPrototypeOf(this, XRPLTransactionError.prototype);
  }
}

export class XRPLConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'XRPLConnectionError';
    Object.setPrototypeOf(this, XRPLConnectionError.prototype);
  }
}
