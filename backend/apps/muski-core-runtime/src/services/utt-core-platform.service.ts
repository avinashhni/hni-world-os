import { UttEnterpriseOsService, type UttAggregatedOffer, type UttCustomerLayer, type UttPriceQuote, type UttSearchRequest, type UttSupplierCode } from "./utt-enterprise-os.service";
import { SupplierAggregationWorker } from "./suppliers/supplier-aggregation.worker";
import type { SupplierAdapter } from "./suppliers/supplier.types";

export type PriceEngineMode = "MODE_A" | "MODE_B";
export type MarginType = "PERCENT" | "FIXED";

export interface MarginConfig {
  mode: PriceEngineMode;
  marginType: MarginType;
  dynamicMarginPct: number;
  fixedMarginAmount: number;
  minimalMarginPct: number;
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
}

export interface BookingInputPipeline {
  tenantId: string;
  bookingId: string;
  searchId: string;
  selectedHotelId: string;
  customerId: string;
  globalIdentityId: string;
  customerLayer: UttCustomerLayer;
  paymentGuaranteeRequired: boolean;
  paymentGuaranteed: boolean;
  holdMinutes: number;
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
    mode: "MODE_A",
    marginType: "PERCENT",
    dynamicMarginPct: 12,
    fixedMarginAmount: 25,
    minimalMarginPct: 0,
  };

  private readonly searchStore = new Map<string, UnifiedHotelRecord[]>();
  private readonly supplierAggregationWorker: SupplierAggregationWorker;

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
      minimalMarginPct: clampMargin(input.minimalMarginPct ?? this.marginConfig.minimalMarginPct),
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

    const normalized = aggregated.offers.map((offer, index) => this.toUnifiedHotel(offer, index));
    const deduped = this.dedupeByLowestSupplierPrice(normalized);
    const priced = deduped.map((hotel) => ({ ...hotel, price: this.applyPriceEngine(hotel.supplierPrice) }));
    const sorted = priced.sort((a, b) => a.price - b.price);

    this.searchStore.set(request.searchId, sorted);

    return {
      searchId: request.searchId,
      hotels: sorted,
      failures: aggregated.failures,
    };
  }

  routeBookingInputToPhase2(input: BookingInputPipeline) {
    const selected = this.requireSelectedHotel(input.searchId, input.selectedHotelId);
    const quote = this.buildPriceQuote(input, selected);

    return this.phase2Engine.executeBookingLifecycle({
      tenantId: input.tenantId,
      bookingId: input.bookingId,
      searchId: input.searchId,
      selectedHotelId: input.selectedHotelId,
      customerId: input.customerId,
      globalIdentityId: input.globalIdentityId,
      customerLayer: input.customerLayer,
      holdMinutes: input.holdMinutes,
      paymentGuaranteed: input.paymentGuaranteed,
      price: quote,
    });
  }

  getSearchResults(searchId: string): UnifiedHotelRecord[] {
    return this.searchStore.get(searchId) ?? [];
  }

  private toUnifiedHotel(offer: UttAggregatedOffer, index: number): UnifiedHotelRecord {
    return {
      hotelId: offer.hotelId,
      name: offer.name,
      location: offer.location,
      price: offer.price,
      supplierPrice: offer.price,
      currency: offer.currency,
      supplier: offer.supplier,
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

  private applyPriceEngine(supplierPrice: number): number {
    if (this.marginConfig.mode === "MODE_A") {
      const minimalMargin = (supplierPrice * this.marginConfig.minimalMarginPct) / 100;
      return Math.round(supplierPrice + minimalMargin);
    }

    if (this.marginConfig.marginType === "FIXED") {
      return Math.round(supplierPrice + this.marginConfig.fixedMarginAmount);
    }

    const dynamicMargin = (supplierPrice * this.marginConfig.dynamicMarginPct) / 100;
    return Math.round(supplierPrice + dynamicMargin);
  }

  private requireSelectedHotel(searchId: string, selectedHotelId: string): UnifiedHotelRecord {
    const results = this.searchStore.get(searchId) ?? [];
    const selected = results.find((row) => row.hotelId === selectedHotelId);
    if (!selected) {
      throw new Error("Selected hotel not found in unified search store");
    }
    return selected;
  }

  private buildPriceQuote(input: BookingInputPipeline, selected: UnifiedHotelRecord): UttPriceQuote {
    const marginAmount = Math.max(selected.price - selected.supplierPrice, 0);
    const marginPct = selected.supplierPrice > 0 ? Number(((marginAmount / selected.supplierPrice) * 100).toFixed(2)) : 0;

    return {
      pricingId: `PRC-${input.bookingId}`,
      costCurrency: selected.currency,
      sellCurrency: selected.currency,
      costAmount: selected.supplierPrice,
      sellAmount: selected.price,
      marginAmount,
      marginPct,
      roundedRule: "NO_DECIMALS",
      taxReady: {
        taxCode: "GST_READY",
        gstPct: 0,
        estimatedTax: 0,
      },
    };
  }
}
