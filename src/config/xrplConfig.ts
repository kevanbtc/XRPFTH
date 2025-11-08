// src/config/xrplConfig.ts

import { XRPLConfig } from "../services/xrpl/XRPLIntegrationService";
// dotenv is now loaded in jest.setup.js for tests, and should be handled by the application's entry point for production.

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required env var: ${name}`);
    throw new Error(`Missing required env var: ${name}`);
  }
  return v.trim(); // Trim whitespace from environment variables
}

export function loadXRPLConfig(): XRPLConfig {
  return {
    rpcUrl: requireEnv("XRPL_RPC_URL"),

    fthusdIssuer: requireEnv("XRPL_FTHUSD_ISSUER"),
    usdfIssuer: requireEnv("XRPL_USDF_ISSUER"),
    goldVault: requireEnv("XRPL_GOLD_VAULT"),
    oracleAccount: requireEnv("XRPL_ORACLE_ACCOUNT"),

    opsBonusSeed: requireEnv("XRPL_OPS_BONUS_SEED"),
    opsGoldSeed: requireEnv("XRPL_OPS_GOLD_SEED"),
    opsOracleSeed: requireEnv("XRPL_OPS_ORACLE_SEED"),
    opsIssuerSeed: process.env.XRPL_OPS_ISSUER_SEED, // optional
  };
}
