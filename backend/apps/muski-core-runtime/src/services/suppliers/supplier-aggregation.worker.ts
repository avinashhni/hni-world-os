import type { SupplierAdapter, SupplierSearchRequest, UnifiedSupplierOffer } from "./supplier.types";

export interface SupplierAggregationResult {
  offers: UnifiedSupplierOffer[];
  failures: Array<{ supplier: string; error: string }>;
}

function normalizeKey(offer: UnifiedSupplierOffer): string {
  const location = offer.location.toLowerCase().replace(/\s+/g, " ").trim();
  const name = offer.name.toLowerCase().replace(/\s+/g, " ").trim();
  return `${offer.hotelId}|${name}|${location}`;
}

export class SupplierAggregationWorker {
  constructor(private readonly adapters: SupplierAdapter[]) {}

  async aggregate(request: SupplierSearchRequest): Promise<SupplierAggregationResult> {
    const collected: UnifiedSupplierOffer[] = [];
    const failures: Array<{ supplier: string; error: string }> = [];

    await Promise.all(
      this.adapters.map(async (adapter) => {
        try {
          const offers = await adapter.searchHotels(request);
          collected.push(...offers);
        } catch (error) {
          failures.push({
            supplier: adapter.supplier,
            error: error instanceof Error ? error.message : "supplier_adapter_error",
          });
        }
      }),
    );

    const deduped = new Map<string, UnifiedSupplierOffer>();
    for (const offer of collected) {
      const key = normalizeKey(offer);
      const existing = deduped.get(key);
      if (!existing || offer.price < existing.price) {
        deduped.set(key, offer);
      }
    }

    return {
      offers: [...deduped.values()].sort((a, b) => a.price - b.price),
      failures,
    };
  }

  async health(): Promise<Array<{ supplier: string; healthy: boolean; message: string }>> {
    return Promise.all(this.adapters.map((adapter) => adapter.healthCheck()));
  }
}
