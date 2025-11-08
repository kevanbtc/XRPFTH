// src/services/evm/index.ts

import { loadEVMConfig } from "../../config/evmConfig";
import { EVMIntegrationService } from "./EVMIntegrationService";

let singleton: EVMIntegrationService | null = null;

export function getEVMService(): EVMIntegrationService {
  if (!singleton) {
    singleton = new EVMIntegrationService(loadEVMConfig());
  }
  return singleton;
}
