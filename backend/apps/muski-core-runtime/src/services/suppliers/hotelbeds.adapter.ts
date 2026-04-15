import type { SupplierAdapter, SupplierSearchRequest, UnifiedSupplierOffer } from "./supplier.types";

interface HttpClient {
  post<T>(url: string, body: Record<string, unknown>, headers?: Record<string, string>): Promise<T>;
}

interface HotelbedsHotelResult {
  code: string;
  hotelName: string;
  city: string;
  net: number;
  currency: string;
  allotment: number;
  cancellationPolicy: string;
  refundable: boolean;
}

export class HotelbedsAdapter implements SupplierAdapter {
  readonly supplier = "HOTELBEDS" as const;

  constructor(
    private readonly httpClient: HttpClient,
    private readonly config: {
      baseUrl: string;
      apiKey: string;
      secret: string;
      timeoutMs: number;
    },
  ) {}

  async searchHotels(request: SupplierSearchRequest): Promise<UnifiedSupplierOffer[]> {
    try {
      const response = await this.httpClient.post<{ hotels: HotelbedsHotelResult[] }>(
        `${this.config.baseUrl}/hotel-api/1.0/hotels`,
        {
          destination: request.destination,
          stay: { checkIn: request.checkIn, checkOut: request.checkOut },
          occupancies: [{ rooms: request.rooms }],
          currency: request.currency,
        },
        {
          "x-api-key": this.config.apiKey,
          "x-signature": this.config.secret,
          "x-timeout-ms": String(this.config.timeoutMs),
        },
      );

      return (response.hotels ?? []).map((hotel) => ({
        hotelId: hotel.code,
        name: hotel.hotelName,
        location: hotel.city,
        price: hotel.net,
        currency: hotel.currency,
        availability: hotel.allotment,
        supplierCode: this.supplier,
        supplier: this.supplier,
        cancellationPolicy: hotel.cancellationPolicy,
        refundable: hotel.refundable,
      }));
    } catch (error) {
      console.warn("supplier_api_failed", {
        tenantId: request.tenantId,
        bookingId: request.bookingId ?? null,
        supplierCode: this.supplier,
        error: error instanceof Error ? error.message : "supplier_api_failed",
      });
      return [];
    }
  }

  async healthCheck(): Promise<{ supplier: "HOTELBEDS"; healthy: boolean; message: string }> {
    return {
      supplier: this.supplier,
      healthy: Boolean(this.config.baseUrl && this.config.apiKey && this.config.secret),
      message: this.config.baseUrl ? "hotelbeds_adapter_configured" : "hotelbeds_adapter_missing_configuration",
    };
  }
}
