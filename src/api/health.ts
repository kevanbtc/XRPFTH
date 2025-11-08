import { Request, Response, Router } from 'express';
import { getXRPLService } from '../services/xrpl';
import { getEVMService } from '../services/evm';
import { getLedgerTransactions } from '../services/db'; // Assuming a simple mock DB export
import { XRPLIntegrationService } from '../services/xrpl/XRPLIntegrationService';
import { EVMIntegrationService } from '../services/evm/EVMIntegrationService';

const router = Router();

interface HealthStatus {
    service: string;
    status: 'UP' | 'DOWN' | 'DEGRADED';
    details?: string;
    lastChecked: Date;
}

router.get('/health/ledger', async (req: Request, res: Response) => {
    const healthChecks: HealthStatus[] = [];
    const now = new Date();

    // XRPL Connectivity Check
    try {
        const xrplService = getXRPLService();
        // Temporarily make client public for health check
        const client = (xrplService as any).client as XRPLIntegrationService['client'];
        await client.connect(); // Attempt to connect
        const serverInfo = await client.request({ command: 'server_info' });
        await client.disconnect(); // Disconnect immediately after check
        healthChecks.push({
            service: 'XRPL Node',
            status: 'UP',
            details: `Version: ${serverInfo.result.info.build_version}, Ledger: ${serverInfo.result.info.validated_ledger?.seq}`,
            lastChecked: now,
        });
    } catch (error: any) {
        healthChecks.push({
            service: 'XRPL Node',
            status: 'DOWN',
            details: `Error: ${error.message}`,
            lastChecked: now,
        });
    }

    // EVM Connectivity Check
    try {
        const evmService = getEVMService();
        // Temporarily make provider public for health check
        const provider = (evmService as any).provider as EVMIntegrationService['provider'];
        const blockNumber = await provider.getBlockNumber();
        healthChecks.push({
            service: 'EVM Node',
            status: 'UP',
            details: `Current Block: ${blockNumber}`,
            lastChecked: now,
        });
    } catch (error: any) {
        healthChecks.push({
            service: 'EVM Node',
            status: 'DOWN',
            details: `Error: ${error.message}`,
            lastChecked: now,
        });
    }

    // Database Connectivity Check (mock for now)
    try {
        // In a real scenario, you'd perform a simple query like SELECT 1
        const transactions = await getLedgerTransactions();
        healthChecks.push({
            service: 'Database',
            status: 'UP',
            details: `Found ${transactions.length} ledger transactions.`,
            lastChecked: now,
        });
    } catch (error: any) {
        healthChecks.push({
            service: 'Database',
            status: 'DOWN',
            details: `Error: ${error.message}`,
            lastChecked: now,
        });
    }

    const overallStatus = healthChecks.some(check => check.status === 'DOWN') ? 'DEGRADED' : 'UP';

    res.status(overallStatus === 'UP' ? 200 : 503).json({
        overallStatus,
        checks: healthChecks,
    });
});

export default router;
