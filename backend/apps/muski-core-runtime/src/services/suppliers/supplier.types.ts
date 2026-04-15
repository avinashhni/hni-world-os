export type SupplierCode = "EXPEDIA" | "HOTELBEDS" | "WEBBEDS";

export interface SupplierSearchRequest {
  tenantId: string;
  bookingId?: string;
  destination: string;
  checkIn: string;
  checkOut: string;
  rooms: number;
  currency: string;
}

export interface UnifiedSupplierOffer {
  hotelId: string;
  name: string;
  location: string;
  price: number;
  currency: string;
  availability: number;
  supplierCode: SupplierCode;
  supplier: SupplierCode;
  cancellationPolicy: string;
  refundable: boolean;
}

export interface SupplierAdapter {
  readonly supplier: SupplierCode;
  searchHotels(request: SupplierSearchRequest): Promise<UnifiedSupplierOffer[]>;
  healthCheck(): Promise<{ supplier: SupplierCode; healthy: boolean; message: string }>;
}
