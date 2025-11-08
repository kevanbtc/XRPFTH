import { Request, Response, Router } from 'express';
import { getEVMService } from '../services/evm';
import { getLedgerTransactions } from '../services/db';
import { PoRComposer } from '../services/por/PoRComposer';
import { LedgerTransaction } from '@prisma/client';
import { PorResponse } from './types'; // Import PorResponse

const router = Router();
const evmService = getEVMService();
const porComposer = new PoRComposer();

router.get('/latest', async (req: Request, res: Response<PorResponse>) => {
    try {
        // Mocking getLatestPoR as it's not implemented
        const latestPoR = {
            totalIssued: 15000000,
            totalBacking: 15200000,
            coverageRatio: 1.048,
            asOf: new Date('2025-11-08T07:59:00Z').toISOString(),
        };

        const porResponse: PorResponse = {
            totalIssued: latestPoR.totalIssued.toFixed(2),
            totalBacking: latestPoR.totalBacking.toFixed(2),
            coverageRatio: latestPoR.coverageRatio.toFixed(3),
            asOf: latestPoR.asOf,
        };

        res.status(200).json(porResponse);
    } catch (error: any) {
        console.error('Error fetching latest PoR:', error);
        res.status(500).json({
            error: 'Failed to fetch latest Proof of Reserves snapshot',
            details: error.message,
        } as any);
    }
});

export default router;
