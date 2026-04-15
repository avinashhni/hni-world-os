import type { SupplierAdapter, SupplierSearchRequest, UnifiedSupplierOffer } from "./supplier.types";

interface HttpClient {
  post<T>(url: string, body: Record<string, unknown>, headers?: Record<string, string>): Promise<T>;
}

interface WebbedsHotelResult {
  hotelCode: string;
  name: string;
  destinationName: string;
  amount: number;
  currency: string;
  availability: number;
  cancellationPolicy: string;
  refundable: boolean;
}

export class WebbedsAdapter implements SupplierAdapter {
  readonly supplier = "WEBBEDS" as const;

  constructor(
    private readonly httpClient: HttpClient,
    private readonly config: {
      baseUrl: string;
      username: string;
      password: string;
      timeoutMs: number;
    },
  ) {}

  async searchHotels(request: SupplierSearchRequest): Promise<UnifiedSupplierOffer[]> {
    try {
      const response = await this.httpClient.post<{ hotels: WebbedsHotelResult[] }>(
        `${this.config.baseUrl}/api/search`,
        {
          destination: request.destination,
          checkIn: request.checkIn,
          checkOut: request.checkOut,
          rooms: request.rooms,
          currency: request.currency,
        },
        {
          authorization: `Basic ${Buffer.from(`${this.config.username}:${this.config.password}`).toString("base64")}`,
          "x-timeout-ms": String(this.config.timeoutMs),
        },
      );

      return (response.hotels ?? []).map((hotel) => ({
        hotelId: hotel.hotelCode,
        name: hotel.name,
        location: hotel.destinationName,
        price: hotel.amount,
        currency: hotel.currency,
        availability: hotel.availability,
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

  async healthCheck(): Promise<{ supplier: "WEBBEDS"; healthy: boolean; message: string }> {
    return {
      supplier: this.supplier,
      healthy: Boolean(this.config.baseUrl && this.config.username && this.config.password),
      message: this.config.baseUrl ? "webbeds_adapter_configured" : "webbeds_adapter_missing_configuration",
    };
  }
}
