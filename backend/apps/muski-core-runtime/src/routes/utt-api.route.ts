import type { PaymentRecord } from "../services/payment/payment.service";
import { UttCorePlatformService, type BookingInputPipeline, type UnifiedHotelRecord } from "../services/utt-core-platform.service";
import { UttEnterpriseOsService } from "../services/utt-enterprise-os.service";

interface TenantScopedRequest {
  tenantId: string;
}

interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: string[];
  };
}

interface HotelSearchRequest extends TenantScopedRequest {
  searchId: string;
  destination: string;
  checkIn: string;
  checkOut: string;
  rooms: Array<{ roomId: string; adults: number; childAges: number[] }>;
  currency: string;
  filters: {
    minStars?: number;
    maxBudget?: number;
    amenities?: string[];
  };
}

interface PriceQuoteRequest extends TenantScopedRequest {
  bookingId: string;
  searchId: string;
  selectedHotelId: string;
  customerLayer: "B2C" | "B2B" | "CORPORATE";
  countryCode?: string;
}

interface BookingRetrieveRequest extends TenantScopedRequest {
  bookingId: string;
}

interface InvoiceRetrieveRequest extends TenantScopedRequest {
  bookingId: string;
}

function validationError(details: string[]): ApiResponse<never> {
  return {
    ok: false,
    error: {
      code: "VALIDATION_ERROR",
      message: "Request validation failed",
      details,
    },
  };
}

function internalError(error: unknown): ApiResponse<never> {
  return {
    ok: false,
    error: {
      code: "INTERNAL_ERROR",
      message: error instanceof Error ? error.message : "Unknown runtime failure",
    },
  };
}

function validateRequiredString(value: unknown, field: string, errors: string[]): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    errors.push(`${field} is required`);
  }
}

export function createUttApiRoute(core: UttCorePlatformService, enterprise: UttEnterpriseOsService) {
  return {
    health(): ApiResponse<{ service: string; status: string; readiness: Record<string, unknown> }> {
      try {
        return {
          ok: true,
          data: {
            service: "THE_UTT_API",
            status: "ready",
            readiness: enterprise.getReadinessSnapshot("HNI_GLOBAL"),
          },
        };
      } catch (error) {
        return internalError(error);
      }
    },

    async hotelSearch(request: HotelSearchRequest): Promise<ApiResponse<{ searchId: string; hotels: UnifiedHotelRecord[] }>> {
      const errors: string[] = [];
      validateRequiredString(request.tenantId, "tenantId", errors);
      validateRequiredString(request.searchId, "searchId", errors);
      validateRequiredString(request.destination, "destination", errors);
      validateRequiredString(request.checkIn, "checkIn", errors);
      validateRequiredString(request.checkOut, "checkOut", errors);
      validateRequiredString(request.currency, "currency", errors);

      if (!Array.isArray(request.rooms) || request.rooms.length === 0) {
        errors.push("rooms must include at least one room");
      }

      if (errors.length > 0) {
        return validationError(errors);
      }

      try {
        const result = await core.unifiedHotelSearch(request);
        return {
          ok: true,
          data: {
            searchId: result.searchId,
            hotels: result.hotels,
          },
        };
      } catch (error) {
        return internalError(error);
      }
    },

    hotelDetails(request: TenantScopedRequest & { searchId: string; hotelId: string }): ApiResponse<UnifiedHotelRecord> {
      const errors: string[] = [];
      validateRequiredString(request.tenantId, "tenantId", errors);
      validateRequiredString(request.searchId, "searchId", errors);
      validateRequiredString(request.hotelId, "hotelId", errors);
      if (errors.length > 0) {
        return validationError(errors);
      }

      try {
        const hotel = core.getHotelDetails(request.searchId, request.hotelId);
        return { ok: true, data: hotel };
      } catch (error) {
        return internalError(error);
      }
    },

    priceQuote(request: PriceQuoteRequest) {
      const errors: string[] = [];
      validateRequiredString(request.tenantId, "tenantId", errors);
      validateRequiredString(request.bookingId, "bookingId", errors);
      validateRequiredString(request.searchId, "searchId", errors);
      validateRequiredString(request.selectedHotelId, "selectedHotelId", errors);

      if (errors.length > 0) {
        return validationError(errors);
      }

      try {
        const quote = core.generatePriceQuote(request);
        return {
          ok: true,
          data: {
            quote: quote.quote,
            breakdown: quote.breakdown.breakdown,
            observability: {
              quoteInputs: quote.breakdown.quoteInputs,
              selectedPricingMode: quote.breakdown.breakdown.mode,
              appliedMarkupType: quote.breakdown.appliedMarkupType,
              appliedMarkupValue: quote.breakdown.appliedMarkupValue,
              minimumMarginApplied: quote.breakdown.minimumMarginApplied,
              sourceSupplier: quote.breakdown.breakdown.supplier,
            },
          },
        };
      } catch (error) {
        return internalError(error);
      }
    },

    async bookingCreate(request: BookingInputPipeline) {
      const errors: string[] = [];
      validateRequiredString(request.tenantId, "tenantId", errors);
      validateRequiredString(request.bookingId, "bookingId", errors);
      validateRequiredString(request.searchId, "searchId", errors);
      validateRequiredString(request.selectedHotelId, "selectedHotelId", errors);
      validateRequiredString(request.customerId, "customerId", errors);
      validateRequiredString(request.customerName, "customerName", errors);
      validateRequiredString(request.globalIdentityId, "globalIdentityId", errors);

      if (errors.length > 0) {
        return validationError(errors);
      }

      try {
        const lifecycle = await core.routeBookingInputToPhase2(request);
        return {
          ok: true,
          data: lifecycle,
        };
      } catch (error) {
        return internalError(error);
      }
    },

    bookingRetrieve(request: BookingRetrieveRequest) {
      const errors: string[] = [];
      validateRequiredString(request.tenantId, "tenantId", errors);
      validateRequiredString(request.bookingId, "bookingId", errors);
      if (errors.length > 0) {
        return validationError(errors);
      }

      try {
        return {
          ok: true,
          data: enterprise.getBookingById(request.tenantId, request.bookingId),
        };
      } catch (error) {
        return internalError(error);
      }
    },

    paymentStatus(request: BookingRetrieveRequest): ApiResponse<PaymentRecord> {
      const errors: string[] = [];
      validateRequiredString(request.tenantId, "tenantId", errors);
      validateRequiredString(request.bookingId, "bookingId", errors);
      if (errors.length > 0) {
        return validationError(errors);
      }

      try {
        return {
          ok: true,
          data: enterprise.getPaymentStatusByBooking(request.tenantId, request.bookingId),
        };
      } catch (error) {
        return internalError(error);
      }
    },

    invoiceRetrieve(request: InvoiceRetrieveRequest) {
      const errors: string[] = [];
      validateRequiredString(request.tenantId, "tenantId", errors);
      validateRequiredString(request.bookingId, "bookingId", errors);
      if (errors.length > 0) {
        return validationError(errors);
      }

      try {
        return {
          ok: true,
          data: enterprise.getInvoiceByBooking(request.tenantId, request.bookingId),
        };
      } catch (error) {
        return internalError(error);
      }
    },

    bookingStatusTimeline(request: BookingRetrieveRequest) {
      const errors: string[] = [];
      validateRequiredString(request.tenantId, "tenantId", errors);
      validateRequiredString(request.bookingId, "bookingId", errors);
      if (errors.length > 0) {
        return validationError(errors);
      }

      try {
        return {
          ok: true,
          data: {
            bookingId: request.bookingId,
            timeline: enterprise.getBookingStatusTimeline(request.tenantId, request.bookingId),
          },
        };
      } catch (error) {
        return internalError(error);
      }
    },
  };
}
