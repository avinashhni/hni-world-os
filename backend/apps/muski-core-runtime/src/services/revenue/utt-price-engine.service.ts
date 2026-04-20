import type { SupplierCode } from "../suppliers/supplier.types";

export interface UttPriceEngineConfig {
  globalMarginPercent: number;
  supplierMarginOverride: Partial<Record<SupplierCode, number>>;
  dynamicPricingEnabled: boolean;
  competitorPricingHook: "ready_not_active";
  demandSurgeMultiplierHook: "ready_not_active";
}

export interface UttPriceResult {
  tenantId: string;
  bookingId?: string;
  costPrice: number;
  marginPercent: number;
  marginAmount: number;
  sellPrice: number;
  lossFlag: boolean;
}

export interface UttPriceInput {
  tenantId: string;
  bookingId?: string;
  supplier: SupplierCode;
  costPrice: number;
  amount?: number;
}

export class UttPriceEngineService {
  constructor(
    private readonly config: UttPriceEngineConfig,
    private readonly telemetry?: (eventName: string, payload: Record<string, unknown>) => void,
  ) {
    this.assertMarginPercent(config.globalMarginPercent, "globalMarginPercent");
    for (const [supplierCode, marginPercent] of Object.entries(config.supplierMarginOverride)) {
      if (marginPercent === undefined) {
        continue;
      }
      this.assertMarginPercent(marginPercent, `supplierMarginOverride.${supplierCode}`);
    }
  }

  calculateSellPrice(input: UttPriceInput): UttPriceResult {
    if (!input.tenantId?.trim()) {
      throw new Error("tenantId is required for UTT price calculation");
    }

    this.assertAmount(input.costPrice, "costPrice");

    const marginPercent = this.config.supplierMarginOverride[input.supplier] ?? this.config.globalMarginPercent;
    this.assertMarginPercent(marginPercent, "marginPercent");

    const marginAmount = Number(((input.costPrice * marginPercent) / 100).toFixed(2));
    const computedSellPrice = Number((input.costPrice + marginAmount).toFixed(2));
    const requestedAmount = input.amount ?? computedSellPrice;
    this.assertAmount(requestedAmount, "amount");

    const normalizedAmount = Number(requestedAmount.toFixed(2));
    const safeMargin = Number(Math.max(normalizedAmount - input.costPrice, 0).toFixed(2));
    const lossFlag = input.costPrice > normalizedAmount;

    if (lossFlag) {
      this.telemetry?.("utt_price_loss_flag", {
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

  getConfig(): UttPriceEngineConfig {
    return this.config;
  }

  private assertAmount(value: number, label: string): void {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`${label} must be a finite number greater than or equal to 0`);
    }
  }

  private assertMarginPercent(value: number, label: string): void {
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      throw new Error(`${label} must be a finite percentage between 0 and 100`);
    }
  }
}
