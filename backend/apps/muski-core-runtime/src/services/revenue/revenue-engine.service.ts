import type { SupplierCode } from "../suppliers/supplier.types";

export interface RevenueEngineConfig {
  globalMarginPercent: number;
  supplierMarginOverride: Partial<Record<SupplierCode, number>>;
  dynamicPricingEnabled: boolean;
  competitorPricingHook: "ready_not_active";
  demandSurgeMultiplierHook: "ready_not_active";
}

export interface RevenuePriceResult {
  costPrice: number;
  marginPercent: number;
  marginAmount: number;
  sellPrice: number;
}

export class RevenueEngineService {
  constructor(private readonly config: RevenueEngineConfig) {}

  calculateSellPrice(input: { supplier: SupplierCode; costPrice: number }): RevenuePriceResult {
    const marginPercent = this.config.supplierMarginOverride[input.supplier] ?? this.config.globalMarginPercent;
    const marginAmount = Number(((input.costPrice * marginPercent) / 100).toFixed(2));
    return {
      costPrice: input.costPrice,
      marginPercent,
      marginAmount,
      sellPrice: Number((input.costPrice + marginAmount).toFixed(2)),
    };
  }

  getConfig(): RevenueEngineConfig {
    return this.config;
  }
}
