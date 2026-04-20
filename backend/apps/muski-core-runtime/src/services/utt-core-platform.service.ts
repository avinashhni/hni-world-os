import {
  UttEnterpriseOsService,
  type UttAggregatedOffer,
  type UttCustomerLayer,
  type UttPriceQuote,
  type UttSearchRequest,
  type UttSupplierCode,
} from "./utt-enterprise-os.service";
import { UttPriceEngineService, type UttMarkupType, type UttPriceCalculationResult } from "./utt-price-engine.service";
import { SupplierAggregationWorker } from "./suppliers/supplier-aggregation.worker";
import type { SupplierAdapter } from "./suppliers/supplier.types";

export type PriceEngineMode = "standard" | "country_layer";

export interface MarginConfig {
  mode: PriceEngineMode;
  markupType: UttMarkupType;
  dynamicMarginPct: number;
  fixedMarginAmount: number;
  minimumMarginAmount: number;
}

export interface UnifiedHotelRecord {
  hotelId: string;
  name: string;
  location: string;
  price: number;
  supplierPrice: number;
  currency: string;
  supplier: UttSupplierCode;
  rating: number;
  images: string[];
  pricing: UttPriceCalculationResult["breakdown"];
}

export interface BookingInputPipeline {
  tenantId: string;
  bookingId: string;
  searchId: string;
  selectedHotelId: string;
  customerId: string;
  customerName: string;
  globalIdentityId: string;
  customerLayer: UttCustomerLayer;
  paymentGuaranteeRequired: boolean;
  paymentGuaranteed: boolean;
  holdMinutes: number;
  countryCode?: string;
  signature?: string;
  gstPercent?: number;
}

export interface PriceQuoteInput {
  tenantId: string;
  bookingId: string;
  searchId: string;
  selectedHotelId: string;
  customerLayer: UttCustomerLayer;
  countryCode?: string;
  source?: string;
}

function normalizeHotelKey(input: Pick<UnifiedHotelRecord, "name" | "location">): string {
  return `${input.name.toLowerCase().trim()}|${input.location.toLowerCase().replace(/\s+/g, " ").trim()}`;
}

function clampMargin(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, value);
}

export class UttCorePlatformService {
  private marginConfig: MarginConfig = {
    mode: "standard",
    markupType: "percent",
    dynamicMarginPct: 12,
    fixedMarginAmount: 25,
    minimumMarginAmount: 0,
  };

  private readonly searchStore = new Map<string, UnifiedHotelRecord[]>();
  private readonly supplierAggregationWorker: SupplierAggregationWorker;
  private readonly priceEngine = new UttPriceEngineService();

  constructor(
    private readonly phase2Engine: UttEnterpriseOsService,
    supplierAdapters: SupplierAdapter[],
  ) {
    this.supplierAggregationWorker = new SupplierAggregationWorker(supplierAdapters);
  }

  getMarginConfig(): MarginConfig {
    return { ...this.marginConfig };
  }

  setMarginConfig(input: Partial<MarginConfig>): MarginConfig {
    this.marginConfig = {
      ...this.marginConfig,
      ...input,
      dynamicMarginPct: clampMargin(input.dynamicMarginPct ?? this.marginConfig.dynamicMarginPct),
      fixedMarginAmount: clampMargin(input.fixedMarginAmount ?? this.marginConfig.fixedMarginAmount),
      minimumMarginAmount: clampMargin(input.minimumMarginAmount ?? this.marginConfig.minimumMarginAmount),
    };
    return this.getMarginConfig();
  }

  async unifiedHotelSearch(
    request: UttSearchRequest,
  ): Promise<{ searchId: string; hotels: UnifiedHotelRecord[]; failures: Array<{ supplier: string; error: string }> }> {
    const aggregated = await this.supplierAggregationWorker.aggregate({
      tenantId: request.tenantId,
      destination: request.destination,
      checkIn: request.checkIn,
      checkOut: request.checkOut,
      rooms: request.rooms.length,
      currency: request.currency,
    });

    const normalized = aggregated.offers.map((offer, index) => this.toUnifiedHotel(offer, index, request.tenantId));
    const deduped = this.dedupeByLowestSupplierPrice(normalized);
    const sorted = deduped.sort((a, b) => a.price - b.price);

    this.searchStore.set(request.searchId, sorted);

    return {
      searchId: request.searchId,
      hotels: sorted,
      failures: aggregated.failures,
    };
  }

  generatePriceQuote(input: PriceQuoteInput): { quote: UttPriceQuote; breakdown: UttPriceCalculationResult } {
    const selected = this.requireSelectedHotel(input.searchId, input.selectedHotelId);

    const breakdown = this.priceEngine.calculate({
      supplierBasePrice: selected.supplierPrice,
      bookingId: input.bookingId,
      correlationId: `${input.searchId}:${input.selectedHotelId}`,
      rule: {
        tenantId: input.tenantId,
        supplier: selected.supplier,
        customerLayer: input.customerLayer,
        countryCode: input.countryCode,
        markupType: this.marginConfig.markupType,
        markupValue: this.marginConfig.markupType === "fixed" ? this.marginConfig.fixedMarginAmount : this.marginConfig.dynamicMarginPct,
        minimumMarginAmount: this.marginConfig.minimumMarginAmount,
        currency: selected.currency,
        source: input.source ?? "UTT_PRICE_ENGINE",
      },
    });

    const quote: UttPriceQuote = {
      pricingId: `PRC-${input.bookingId}`,
      costCurrency: selected.currency,
      sellCurrency: selected.currency,
      costAmount: breakdown.breakdown.supplierPrice,
      sellAmount: breakdown.breakdown.finalSellPrice,
      marginAmount: breakdown.breakdown.markup,
      marginPct:
        breakdown.breakdown.supplierPrice > 0
          ? Number(((breakdown.breakdown.markup / breakdown.breakdown.supplierPrice) * 100).toFixed(2))
          : 0,
      roundedRule: "NO_DECIMALS",
      taxReady: {
        taxCode: "GST_READY",
        gstPct: 0,
        estimatedTax: 0,
      },
    };

    return { quote, breakdown };
  }

  async routeBookingInputToPhase2(input: BookingInputPipeline) {
    this.requireSelectedHotel(input.searchId, input.selectedHotelId);
    return this.phase2Engine.executeBookingPaymentInvoiceLifecycle({
      tenantId: input.tenantId,
      bookingId: input.bookingId,
      searchId: input.searchId,
      selectedHotelId: input.selectedHotelId,
      customerId: input.customerId,
      customerName: input.customerName,
      globalIdentityId: input.globalIdentityId,
      customerLayer: input.customerLayer,
      holdMinutes: input.holdMinutes,
      countryCode: input.countryCode,
      signature: input.signature ?? "SYSTEM_SIGNATURE",
      gstPercent: input.gstPercent ?? 0,
    });
  }

  getSearchResults(searchId: string): UnifiedHotelRecord[] {
    return this.searchStore.get(searchId) ?? [];
  }

  getHotelDetails(searchId: string, hotelId: string): UnifiedHotelRecord {
    const selected = this.requireSelectedHotel(searchId, hotelId);
    return { ...selected };
  }

  private toUnifiedHotel(offer: UttAggregatedOffer, index: number, tenantId: string): UnifiedHotelRecord {
    const pricing = this.priceEngine.calculate({
      supplierBasePrice: offer.price,
      rule: {
        tenantId,
        supplier: offer.supplier,
        customerLayer: "B2B",
        markupType: this.marginConfig.markupType,
        markupValue: this.marginConfig.markupType === "fixed" ? this.marginConfig.fixedMarginAmount : this.marginConfig.dynamicMarginPct,
        minimumMarginAmount: this.marginConfig.minimumMarginAmount,
        currency: offer.currency,
        source: `SUPPLIER_${offer.supplier}`,
      },
      correlationId: offer.hotelId,
    });

    return {
      hotelId: offer.hotelId,
      name: offer.name,
      location: offer.location,
      price: pricing.breakdown.finalSellPrice,
      supplierPrice: pricing.breakdown.supplierPrice,
      currency: offer.currency,
      supplier: offer.supplier,
      pricing: pricing.breakdown,
      rating: 3.8 + (index % 6) * 0.2,
      images: [
        `https://images.unsplash.com/photo-1566073771259-6a8506099945?sig=${index + 1}`,
        `https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?sig=${index + 11}`,
      ],
    };
  }

  private dedupeByLowestSupplierPrice(records: UnifiedHotelRecord[]): UnifiedHotelRecord[] {
    const deduped = new Map<string, UnifiedHotelRecord>();
    for (const record of records) {
      const key = normalizeHotelKey(record);
      const existing = deduped.get(key);
      if (!existing || record.supplierPrice < existing.supplierPrice) {
        deduped.set(key, record);
      }
    }
    return [...deduped.values()];
  }

  private requireSelectedHotel(searchId: string, selectedHotelId: string): UnifiedHotelRecord {
    const results = this.searchStore.get(searchId) ?? [];
    const selected = results.find((row) => row.hotelId === selectedHotelId);
    if (!selected) {
      throw new Error("Selected hotel not found in unified search store");
    }
    return selected;
  }
}
