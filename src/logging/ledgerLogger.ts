// src/logging/ledgerLogger.ts
import winston from "winston";
import { LedgerTransaction } from "../models/LedgerTransaction";

export const ledgerLogger = winston.createLogger({
  level: "info",
  transports: [new winston.transports.Console()],
  format: winston.format.json(),
});

export function logLedgerEvent(event: {
  flow: LedgerTransaction["flow"];
  ledger: LedgerTransaction["ledger"];
  status: LedgerTransaction["status"];
  correlationId?: string;
  memberId?: string;
  wallet?: string;
  txHash?: string;
  errorCode?: string;
  errorMessage?: string;
  payloadSummary?: string;
}) {
  ledgerLogger.info(event);
}
