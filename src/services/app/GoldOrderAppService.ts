import { PrismaClient, GoldOrder, Member } from '@prisma/client';
import { GoldOpsService } from '../GoldOpsService';
import { getXRPLService } from '../xrpl';
import { getEVMService } from '../evm';
import { v4 as uuidv4 } from 'uuid';

enum GoldOrderStatus {
  PENDING = "PENDING",
  FULFILLED = "FULFILLED",
  CANCELLED = "CANCELLED",
}

const prisma = new PrismaClient();
const goldOpsService = new GoldOpsService();
const xrplService = getXRPLService();
const evmService = getEVMService();

export class GoldOrderAppService {
  async listMemberOrders(memberId: string): Promise<GoldOrder[]> {
    return prisma.goldOrder.findMany({
      where: { memberId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createMetalOrder(memberId: string, metalType: 'GOLD' | 'SILVER' | 'PLATINUM', quantityOunces: number): Promise<GoldOrder> {
    const member = await prisma.member.findUnique({ where: { memberId } });
    if (!member) {
      throw new Error('Member not found.');
    }

    // Mock prices for different metals
    const metalPrices: Record<string, number> = {
      'GOLD': 2047.50,
      'SILVER': 24.85,
      'PLATINUM': 925.00,
    };

    const currentPricePerOunce = metalPrices[metalType];
    if (!currentPricePerOunce) {
      throw new Error('Invalid metal type.');
    }

    const totalPrice = quantityOunces * currentPricePerOunce;

    // Create the metal order in the database
    const newMetalOrder = await prisma.goldOrder.create({
      data: {
        memberId,
        metalType,
        ounces: quantityOunces,
        pricePerOunce: currentPricePerOunce,
        price: totalPrice,
        status: GoldOrderStatus.PENDING,
      },
    });

    // In a real system, this would involve actual payment processing and logistics.
    // For now, we'll simulate it as fulfilled.
    await prisma.goldOrder.update({
      where: { id: newMetalOrder.id },
      data: { status: GoldOrderStatus.FULFILLED },
    });

    return newMetalOrder;
  }

  async getMemberMetalHoldings(memberId: string): Promise<any> {
    const orders = await this.listMemberOrders(memberId);

    const totalHoldingsValue = orders.reduce((sum, order) => sum + (order.price?.toNumber() || 0), 0);

    const metalPrices: Record<string, number> = {
      'GOLD': 2047.50,
      'SILVER': 24.85,
      'PLATINUM': 925.00,
    };

    const metals = Object.keys(metalPrices).map(type => ({
      type: type as 'GOLD' | 'SILVER' | 'PLATINUM',
      pricePerOunce: metalPrices[type],
    }));

    return {
      totalHoldingsValue,
      metals,
    };
  }
}
