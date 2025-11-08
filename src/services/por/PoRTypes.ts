// src/services/por/PoRTypes.ts

export interface PoRSnapshotInput {
  asOf: Date;
  bankUsdCents: bigint;
  goldUsdCents: bigint;
  otherAssetsUsdCents: bigint;
  fthusdLiabilitiesCents: bigint;
  usdfOffBalanceCents: bigint; // if tracked separately
  uri: string; // where the detailed report will live
}
