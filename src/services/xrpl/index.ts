// src/services/xrpl/index.ts

import { loadXRPLConfig } from "../../config/xrplConfig";
import { XRPLIntegrationService, XRPLConfig } from "./XRPLIntegrationService";

let xrplServiceSingleton: XRPLIntegrationService | null = null;

export function getXRPLService(testConfig?: XRPLConfig): XRPLIntegrationService {
  if (!xrplServiceSingleton || testConfig) {
    // If a testConfig is provided, create a new instance for testing purposes
    // Otherwise, use the singleton with the loaded config
    xrplServiceSingleton = new XRPLIntegrationService(testConfig || loadXRPLConfig());
  }
  return xrplServiceSingleton;
}
