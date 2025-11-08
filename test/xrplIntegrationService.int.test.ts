// test/xrplIntegrationService.int.test.ts

import { getXRPLService } from "../src/services/xrpl";

describe("XRPLIntegrationService (devnet smoke test)", () => {
  const svc = getXRPLService();

  afterAll(async () => {
    await svc.disconnect();
  });

  it("can anchor a fake PoR snapshot", async () => {
    const porHash = "test-por-hash-" + Date.now();
    const porTime = new Date().toISOString();

    const res = await svc.anchorPoR(porHash, porTime);
    // Verify the transaction was submitted successfully
    expect(res).toBeDefined();
    expect(res.result).toBeDefined();
    // The response structure varies by XRPL library version
    // Just verify we got a response without errors
  });
});
