// src/config/evmConfig.ts

export interface EVMConfig {
  rpcUrl: string;
  chainId: number;

  fthOracleAggregator: string;
  fthPoRRegistry: string;
  complianceRegistry: string;
  xrplBridge: string;

  // Deployer / operator private key (for dev/test; use KMS in prod)
  operatorPrivateKey: string;
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export function loadEVMConfig(): EVMConfig {
  return {
    rpcUrl: requireEnv("EVM_RPC_URL"),
    chainId: Number(requireEnv("EVM_CHAIN_ID")),
    fthOracleAggregator: requireEnv("EVM_FTH_ORACLE_AGGREGATOR"),
    fthPoRRegistry: requireEnv("EVM_FTH_POR_REGISTRY_ADDRESS"), // Corrected env var name
    complianceRegistry: requireEnv("EVM_COMPLIANCE_REGISTRY_ADDRESS"), // Corrected env var name
    xrplBridge: requireEnv("EVM_XRPL_BRIDGE_ADDRESS"), // Corrected env var name
    operatorPrivateKey: requireEnv("EVM_OPERATOR_PK"),
  };
}
