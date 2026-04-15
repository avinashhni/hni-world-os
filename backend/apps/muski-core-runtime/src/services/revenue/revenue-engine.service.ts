import type { SupplierCode } from "../suppliers/supplier.types";

export interface RevenueEngineConfig {
  globalMarginPercent: number;
  supplierMarginOverride: Partial<Record<SupplierCode, number>>;
  dynamicPricingEnabled: boolean;
  competitorPricingHook: "ready_not_active";
  demandSurgeMultiplierHook: "ready_not_active";
}

export interface RevenuePriceResult {
  tenantId: string;
  bookingId?: string;
  costPrice: number;
  marginPercent: number;
  marginAmount: number;
  sellPrice: number;
  lossFlag: boolean;
}

export class RevenueEngineService {
  constructor(
    private readonly config: RevenueEngineConfig,
    private readonly telemetry?: (eventName: string, payload: Record<string, unknown>) => void,
  ) {}

  calculateSellPrice(input: { tenantId: string; bookingId?: string; supplier: SupplierCode; costPrice: number; amount?: number }): RevenuePriceResult {
    if (!input.tenantId) {
      throw new Error("tenantId is required for revenue calculation");
    }
    const marginPercent = this.config.supplierMarginOverride[input.supplier] ?? this.config.globalMarginPercent;
    const marginAmount = Number(((input.costPrice * marginPercent) / 100).toFixed(2));
    const sellPrice = Number((input.costPrice + marginAmount).toFixed(2));
    const amount = input.amount ?? sellPrice;
    const normalizedAmount = Number(amount.toFixed(2));
    const safeMargin = Number(Math.max(normalizedAmount - input.costPrice, 0).toFixed(2));
    const lossFlag = input.costPrice > normalizedAmount;

    if (lossFlag) {
      this.telemetry?.("revenue_loss_flag", {
        tenantId: input.tenantId,
        bookingId: input.bookingId,
        supplier: input.supplier,
        costPrice: Number(input.costPrice.toFixed(2)),
        amount: normalizedAmount,
        lossFlag: true,
      });
    }

    return {
      tenantId: input.tenantId,
      bookingId: input.bookingId,
      costPrice: Number(input.costPrice.toFixed(2)),
      marginPercent,
      marginAmount: safeMargin,
      sellPrice: normalizedAmount,
      lossFlag,
    };
  }

  getConfig(): RevenueEngineConfig {
    return this.config;
  }
}
