// src/services/BonusEngine.ts

import { getXRPLService } from "./xrpl";
import { formatISO } from "date-fns";

interface BonusInstruction {
  memberAddress: string;
  amountUSDF: string;
  memberId: string;
}

export class BonusEngine {
  async executeDailyBonusRun(instructions: BonusInstruction[], runId: string) {
    const xrpl = getXRPLService();
    const dateISO = formatISO(new Date(), { representation: "date" });

    for (const instr of instructions) {
      // You might batch, retry, etc. later; keeping it simple here.
      await xrpl.issueUSDFBonus(
        instr.memberAddress,
        instr.amountUSDF,
        `${runId}:${instr.memberId}`,
        dateISO
      );
    }
  }
}
