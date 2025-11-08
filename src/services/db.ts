// src/services/db.ts
import { PrismaClient, Prisma, LedgerTransaction } from "@prisma/client";

const prisma = new PrismaClient();

type NewLedgerTransaction = Omit<
  Prisma.LedgerTransactionCreateInput,
  'createdAt' | 'updatedAt'
>;

export async function saveLedgerTransaction(
  data: NewLedgerTransaction
) {
  return prisma.ledgerTransaction.create({ data });
}

export const updateLedgerTransaction = async (
  tx: LedgerTransaction
): Promise<LedgerTransaction> => {
  // In a real DB, this would find and update an existing record.
  const updatedTx = await prisma.ledgerTransaction.update({
    where: { id: tx.id },
    data: {
      ...tx,
      metadata: tx.metadata as Prisma.InputJsonValue, // Cast metadata to InputJsonValue
    },
  });
  return updatedTx;
};

export const getLedgerTransactions = async (): Promise<LedgerTransaction[]> => {
  // In a real DB, this would query all records.
  return prisma.ledgerTransaction.findMany();
};

export const clearLedgerTransactions = async (): Promise<void> => {
  await prisma.ledgerTransaction.deleteMany({});
};
