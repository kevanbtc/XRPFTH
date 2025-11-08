// src/services/por/PoRComposer.ts

import { ethers } from "ethers";
import { getEVMService } from "../evm";
import { getXRPLService } from "../xrpl";
import { PoRSnapshotInput } from "./PoRTypes";

export class PoRComposer {
  async publishSnapshot(input: PoRSnapshotInput) {
    const evm = getEVMService();
    const xrpl = getXRPLService();

    const totalAssets =
      input.bankUsdCents +
      input.goldUsdCents +
      input.otherAssetsUsdCents;

    const totalLiabilities = input.fthusdLiabilitiesCents;

    if (totalAssets < totalLiabilities) {
      // You may allow this with a warning, but for now be strict:
      throw new Error("Assets < liabilities, cannot publish PoR snapshot");
    }

    const coverageRatioBps =
      totalLiabilities === 0n
        ? 0
        : Number((totalAssets * 10000n) / totalLiabilities);

    // Create a canonical JSON representation for hashing
    const payload = JSON.stringify({
      asOf: input.asOf.toISOString(),
      bankUsdCents: input.bankUsdCents.toString(),
      goldUsdCents: input.goldUsdCents.toString(),
      otherAssetsUsdCents: input.otherAssetsUsdCents.toString(),
      totalAssets: totalAssets.toString(),
      totalLiabilities: totalLiabilities.toString(),
      coverageRatioBps,
      uri: input.uri,
    });

    const hash = ethers.keccak256(ethers.toUtf8Bytes(payload));
    const timestamp = Math.floor(input.asOf.getTime() / 1000);

    // 1) Write to EVM PoR registry
    const receipt = await evm.recordPoRSnapshot({
      hash,
      timestamp,
      coverageRatioBps,
      totalAssets,
      totalLiabilities,
      uri: input.uri,
    });

    // 2) Anchor to XRPL
    await xrpl.anchorPoR(hash, input.asOf.toISOString());

    return { hash, coverageRatioBps, evmTx: receipt.hash };
  }
}
