import type { UttCustomerLayer, UttSupplierCode } from "./utt-enterprise-os.service";

export type UttMarkupType = "percent" | "fixed";
export type UttPricingMode = "standard" | "country_layer";

export interface UttPricingRuleInput {
  tenantId: string;
  supplier: UttSupplierCode;
  customerLayer: UttCustomerLayer;
  countryCode?: string;
  markupType: UttMarkupType;
  markupValue: number;
  minimumMarginAmount?: number;
  currency: string;
  source: string;
}

export interface UttPriceCalculationInput {
  supplierBasePrice: number;
  rule: UttPricingRuleInput;
  bookingId?: string;
  correlationId?: string;
}

export interface UttPriceBreakdown {
  supplierPrice: number;
  markup: number;
  finalSellPrice: number;
  currency: string;
  supplier: UttSupplierCode;
  source: string;
  mode: UttPricingMode;
}

export interface UttPriceCalculationResult {
  breakdown: UttPriceBreakdown;
  appliedMarkupType: UttMarkupType;
  appliedMarkupValue: number;
  minimumMarginApplied: boolean;
  quoteInputs: {
    supplierBasePrice: number;
    customerLayer: UttCustomerLayer;
    countryCode?: string;
    bookingId?: string;
    correlationId?: string;
  };
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function safeNumber(value: number | undefined, fallback = 0): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return value;
}

export class UttPriceEngineService {
  calculate(input: UttPriceCalculationInput): UttPriceCalculationResult {
    const supplierBasePrice = roundCurrency(Math.max(0, safeNumber(input.supplierBasePrice)));
    const markupValue = Math.max(0, safeNumber(input.rule.markupValue));
    const minMarginAmount = Math.max(0, safeNumber(input.rule.minimumMarginAmount));

    const rawMarkup =
      input.rule.markupType === "percent"
        ? roundCurrency((supplierBasePrice * markupValue) / 100)
        : roundCurrency(markupValue);

    const markup = roundCurrency(Math.max(rawMarkup, minMarginAmount));
    const finalSellPrice = roundCurrency(supplierBasePrice + markup);

    return {
      breakdown: {
        supplierPrice: supplierBasePrice,
        markup,
        finalSellPrice,
        currency: input.rule.currency,
        supplier: input.rule.supplier,
        source: input.rule.source,
        mode: input.rule.countryCode || input.rule.customerLayer !== "B2B" ? "country_layer" : "standard",
      },
      appliedMarkupType: input.rule.markupType,
      appliedMarkupValue: markupValue,
      minimumMarginApplied: markup > rawMarkup,
      quoteInputs: {
        supplierBasePrice,
        customerLayer: input.rule.customerLayer,
        countryCode: input.rule.countryCode,
        bookingId: input.bookingId,
        correlationId: input.correlationId,
      },
    };
  }
}
