// src/services/gold/GoldLogisticsAdapter.ts

export interface DeliveryStatus {
  deliveryId: string;
  orderId: string;
  memberId: string;
  status: 'PENDING' | 'SHIPPED' | 'DELIVERED' | 'FAILED';
  trackingNumber?: string;
  carrier?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface GoldLogisticsAdapter {
  reserveGold(orderId: string, ounces: number): Promise<boolean>;
  releaseGold(orderId: string): Promise<boolean>;
  initiateDelivery(orderId: string, memberAddress: string, deliveryAddress: any): Promise<DeliveryStatus>;
  getInventory(): Promise<number>; // For PoR - total physical gold on hand
}

// Mock implementation for development and testing
export class MockGoldLogisticsAdapter implements GoldLogisticsAdapter {
  private reservedGold: { [orderId: string]: number } = {};
  private physicalInventory: number = 1000; // Starting with 1000 oz mock physical gold

  async reserveGold(orderId: string, ounces: number): Promise<boolean> {
    if (this.physicalInventory >= ounces) {
      this.physicalInventory -= ounces;
      this.reservedGold[orderId] = ounces;
      console.log(`[MockGoldLogisticsAdapter] Reserved ${ounces} oz for order ${orderId}. Remaining inventory: ${this.physicalInventory}`);
      return true;
    }
    console.warn(`[MockGoldLogisticsAdapter] Insufficient physical inventory to reserve ${ounces} oz for order ${orderId}.`);
    return false;
  }

  async releaseGold(orderId: string): Promise<boolean> {
    const ounces = this.reservedGold[orderId];
    if (ounces) {
      this.physicalInventory += ounces; // Return to inventory (e.g., after buyback)
      delete this.reservedGold[orderId];
      console.log(`[MockGoldLogisticsAdapter] Released ${ounces} oz for order ${orderId}. Remaining inventory: ${this.physicalInventory}`);
      return true;
    }
    console.warn(`[MockGoldLogisticsAdapter] No reserved gold found for order ${orderId} to release.`);
    return false;
  }

  async initiateDelivery(orderId: string, memberAddress: string, deliveryAddress: any): Promise<DeliveryStatus> {
    const ounces = this.reservedGold[orderId];
    if (!ounces) {
      throw new Error(`No reserved gold for order ${orderId} to deliver.`);
    }

    const deliveryId = `del-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const status: DeliveryStatus = {
      deliveryId,
      orderId,
      memberId: 'mock-member-id', // Placeholder
      status: 'PENDING',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    console.log(`[MockGoldLogisticsAdapter] Initiated delivery for order ${orderId}: ${JSON.stringify(status)}`);

    // Simulate shipping
    setTimeout(() => {
      status.status = 'SHIPPED';
      status.trackingNumber = `TRACK-${deliveryId.substring(4, 10).toUpperCase()}`;
      status.carrier = 'MockCarrier';
      status.updatedAt = new Date();
      console.log(`[MockGoldLogisticsAdapter] Order ${orderId} shipped: ${JSON.stringify(status)}`);

      // Simulate delivery
      setTimeout(() => {
        status.status = 'DELIVERED';
        status.updatedAt = new Date();
        console.log(`[MockGoldLogisticsAdapter] Order ${orderId} delivered: ${JSON.stringify(status)}`);
        // In a real system, this would trigger a callback to your GoldOpsService
        // to update the GoldOrder status.
      }, 3000); // Delivered after 3 seconds
    }, 2000); // Shipped after 2 seconds

    return status;
  }

  async getInventory(): Promise<number> {
    return this.physicalInventory;
  }
}
