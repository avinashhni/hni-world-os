import type { SupplierAdapter, SupplierSearchRequest, UnifiedSupplierOffer } from "./supplier.types";

interface HttpClient {
  get<T>(url: string, headers?: Record<string, string>): Promise<T>;
}

interface ExpediaHotelResult {
  id: string;
  name: string;
  location: string;
  totalPrice: number;
  currency: string;
  availableRooms: number;
  cancellationPolicy: string;
  refundable: boolean;
}

export class ExpediaAdapter implements SupplierAdapter {
  readonly supplier = "EXPEDIA" as const;

  constructor(
    private readonly httpClient: HttpClient,
    private readonly config: {
      baseUrl: string;
      apiKey: string;
      timeoutMs: number;
    },
  ) {}

  async searchHotels(request: SupplierSearchRequest): Promise<UnifiedSupplierOffer[]> {
    const query = new URLSearchParams({
      destination: request.destination,
      checkIn: request.checkIn,
      checkOut: request.checkOut,
      rooms: String(request.rooms),
      currency: request.currency,
    }).toString();

    const response = await this.httpClient.get<{ hotels: ExpediaHotelResult[] }>(
      `${this.config.baseUrl}/v1/hotels/search?${query}`,
      {
        "x-api-key": this.config.apiKey,
        "x-timeout-ms": String(this.config.timeoutMs),
      },
    );

    return response.hotels.map((hotel) => ({
      hotelId: hotel.id,
      name: hotel.name,
      location: hotel.location,
      price: hotel.totalPrice,
      currency: hotel.currency,
      availability: hotel.availableRooms,
      supplier: this.supplier,
      cancellationPolicy: hotel.cancellationPolicy,
      refundable: hotel.refundable,
    }));
  }

  async healthCheck(): Promise<{ supplier: "EXPEDIA"; healthy: boolean; message: string }> {
    return {
      supplier: this.supplier,
      healthy: Boolean(this.config.baseUrl && this.config.apiKey),
      message: this.config.baseUrl ? "expedia_adapter_configured" : "expedia_adapter_missing_configuration",
    };
  }
}
