type CustomerLayer = "B2C" | "B2B" | "CORPORATE";
type PaymentStatus = "initiated" | "authorized" | "captured" | "failed" | "verified";
type PaymentGateway = "RAZORPAY" | "STRIPE";

interface UttAggregatedOffer {
  hotelId: string;
  name: string;
  location: string;
  price: number;
  currency: string;
  availability: number;
  supplier: "EXPEDIA" | "HOTELBEDS" | "WEBBEDS" | "MANUAL";
  cancellationPolicy?: string;
  refundable?: boolean;
}

interface UttPriceQuote {
  pricingId: string;
  costCurrency: string;
  sellCurrency: string;
  costAmount: number;
  sellAmount: number;
  marginAmount: number;
  marginPct: number;
  roundedRule: "NO_DECIMALS";
  taxReady: {
    taxCode: string;
    gstPct: number;
    estimatedTax: number;
  };
}

interface UttSearchRequest {
  tenantId: string;
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

interface PaymentRecord {
  paymentId: string;
  tenantId: string;
  bookingId: string;
  amount: number;
  currency: string;
  paymentGateway: PaymentGateway;
  paymentStatus: PaymentStatus;
  createdAt: string;
  updatedAt: string;
}

interface InvoiceRecord {
  invoiceId: string;
  bookingId: string;
  customer: { customerId: string; name: string };
  amount: number;
  GST: number;
  total: number;
  vendorPayable: number;
  margin: number;
  createdAt: string;
}

interface UttBookingSummary {
  bookingId: string;
  stage: string;
  status: string;
  paymentGuaranteed: boolean;
}

interface UttApiServicePort {
  aggregateSupplierOffersFromApi(
    request: UttSearchRequest,
  ): Promise<{ offers: UttAggregatedOffer[]; failures: Array<{ supplier: string; error: string }> }>;
  priceOffer(input: {
    tenantId: string;
    pricingId: string;
    offer: UttAggregatedOffer;
    sellCurrency: string;
    marginPct: number;
    exchangeRates: Record<string, number>;
    taxProfile?: {
      gstPct?: number;
      taxCode?: string;
    };
  }): UttPriceQuote;
  executeBookingPaymentInvoiceLifecycle(input: CreateBookingRequest): Promise<{
    booking: UttBookingSummary;
    payment: PaymentRecord;
    invoice: InvoiceRecord;
  }>;
  getBookingById(tenantId: string, bookingId: string): UttBookingSummary;
}

interface ApiSuccess<T> {
  ok: true;
  data: T;
}

interface ApiError {
  ok: false;
  error: string;
  details?: string[];
}

type ApiResponse<T> = ApiSuccess<T> | ApiError;

interface HotelDetailsRequest {
  searchId: string;
  hotelId: string;
}

interface CreateBookingRequest {
  tenantId: string;
  bookingId: string;
  searchId: string;
  selectedHotelId: string;
  customerId: string;
  customerName: string;
  globalIdentityId: string;
  customerLayer: CustomerLayer;
  holdMinutes: number;
  countryCode?: string;
  signature: string;
  gstPercent: number;
}

interface BookingStatusRequest {
  tenantId: string;
  bookingId: string;
}

interface PaymentStatusRequest {
  tenantId: string;
  bookingId: string;
}

interface InvoiceRequest {
  tenantId: string;
  bookingId: string;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validateSearchRequest(input: UttSearchRequest): string[] {
  const errors: string[] = [];

  if (!isNonEmptyString(input.tenantId)) errors.push("tenantId is required");
  if (!isNonEmptyString(input.searchId)) errors.push("searchId is required");
  if (!isNonEmptyString(input.destination)) errors.push("destination is required");
  if (!isNonEmptyString(input.checkIn)) errors.push("checkIn is required");
  if (!isNonEmptyString(input.checkOut)) errors.push("checkOut is required");
  if (!isNonEmptyString(input.currency)) errors.push("currency is required");

  if (!Array.isArray(input.rooms) || input.rooms.length === 0) {
    errors.push("rooms must include at least one room");
  }

  return errors;
}

function validateHotelDetailsRequest(input: HotelDetailsRequest): string[] {
  const errors: string[] = [];
  if (!isNonEmptyString(input.searchId)) errors.push("searchId is required");
  if (!isNonEmptyString(input.hotelId)) errors.push("hotelId is required");
  return errors;
}

function validatePriceQuoteRequest(input: {
  tenantId: string;
  pricingId: string;
  offer: UttAggregatedOffer;
  sellCurrency: string;
  marginPct: number;
  exchangeRates: Record<string, number>;
  taxProfile?: {
    gstPct?: number;
    taxCode?: string;
  };
}): string[] {
  const errors: string[] = [];
  if (!isNonEmptyString(input.tenantId)) errors.push("tenantId is required");
  if (!isNonEmptyString(input.pricingId)) errors.push("pricingId is required");
  if (!isNonEmptyString(input.sellCurrency)) errors.push("sellCurrency is required");
  if (!Number.isFinite(input.marginPct) || input.marginPct < 0) errors.push("marginPct must be a non-negative number");
  if (!input.offer || !isNonEmptyString(input.offer.hotelId)) errors.push("offer.hotelId is required");
  if (!input.exchangeRates || Object.keys(input.exchangeRates).length === 0) errors.push("exchangeRates are required");
  return errors;
}

function validateCreateBookingRequest(input: CreateBookingRequest): string[] {
  const errors: string[] = [];
  const requiredStrings: Array<[keyof CreateBookingRequest, unknown]> = [
    ["tenantId", input.tenantId],
    ["bookingId", input.bookingId],
    ["searchId", input.searchId],
    ["selectedHotelId", input.selectedHotelId],
    ["customerId", input.customerId],
    ["customerName", input.customerName],
    ["globalIdentityId", input.globalIdentityId],
    ["customerLayer", input.customerLayer],
    ["signature", input.signature],
  ];

  for (const [key, value] of requiredStrings) {
    if (!isNonEmptyString(value)) {
      errors.push(`${String(key)} is required`);
    }
  }

  if (!Number.isFinite(input.holdMinutes) || input.holdMinutes <= 0) {
    errors.push("holdMinutes must be a number greater than 0");
  }

  if (!Number.isFinite(input.gstPercent) || input.gstPercent < 0) {
    errors.push("gstPercent must be a non-negative number");
  }

  return errors;
}

function validateBookingStatusRequest(input: BookingStatusRequest): string[] {
  const errors: string[] = [];
  if (!isNonEmptyString(input.tenantId)) errors.push("tenantId is required");
  if (!isNonEmptyString(input.bookingId)) errors.push("bookingId is required");
  return errors;
}

function fail<T>(error: string, details?: string[]): ApiResponse<T> {
  return { ok: false, error, details };
}

export function createUttApiRoute(uttEnterprise: UttApiServicePort) {
  const searchResults = new Map<string, UttAggregatedOffer[]>();
  const paymentByBooking = new Map<string, PaymentRecord>();
  const invoiceByBooking = new Map<string, InvoiceRecord>();

  const bookingKey = (tenantId: string, bookingId: string) => `${tenantId}::${bookingId}`;

  return {
    "/health": (): ApiResponse<{ service: string; status: string; timestamp: string }> => ({
      ok: true,
      data: {
        service: "utt-api-layer",
        status: "ok",
        timestamp: new Date().toISOString(),
      },
    }),

    "/search-hotels": async (request: UttSearchRequest): Promise<ApiResponse<{ searchId: string; offers: UttAggregatedOffer[]; failures: Array<{ supplier: string; error: string }> }>> => {
      const validationErrors = validateSearchRequest(request);
      if (validationErrors.length > 0) {
        return fail("Invalid /search-hotels request", validationErrors);
      }

      try {
        const result = await uttEnterprise.aggregateSupplierOffersFromApi(request);
        searchResults.set(request.searchId, result.offers);
        return {
          ok: true,
          data: {
            searchId: request.searchId,
            offers: result.offers,
            failures: result.failures,
          },
        };
      } catch (error) {
        return fail("Failed to search hotels", [error instanceof Error ? error.message : "Unknown error"]);
      }
    },

    "/hotel-details": (request: HotelDetailsRequest): ApiResponse<UttAggregatedOffer> => {
      const validationErrors = validateHotelDetailsRequest(request);
      if (validationErrors.length > 0) {
        return fail("Invalid /hotel-details request", validationErrors);
      }

      const offers = searchResults.get(request.searchId) ?? [];
      const selected = offers.find((offer) => offer.hotelId === request.hotelId);
      if (!selected) {
        return fail("Hotel not found for searchId/hotelId");
      }

      return { ok: true, data: selected };
    },

    "/price-quote": (request: {
      tenantId: string;
      pricingId: string;
      offer: UttAggregatedOffer;
      sellCurrency: string;
      marginPct: number;
      exchangeRates: Record<string, number>;
      taxProfile?: {
        gstPct?: number;
        taxCode?: string;
      };
    }): ApiResponse<UttPriceQuote> => {
      const validationErrors = validatePriceQuoteRequest(request);
      if (validationErrors.length > 0) {
        return fail("Invalid /price-quote request", validationErrors);
      }

      try {
        const quote = uttEnterprise.priceOffer(request);
        return { ok: true, data: quote };
      } catch (error) {
        return fail("Failed to generate price quote", [error instanceof Error ? error.message : "Unknown error"]);
      }
    },

    "/create-booking": async (
      request: CreateBookingRequest,
    ): Promise<ApiResponse<{ bookingId: string; bookingStatus: string; paymentStatus: string; invoiceId: string }>> => {
      const validationErrors = validateCreateBookingRequest(request);
      if (validationErrors.length > 0) {
        return fail("Invalid /create-booking request", validationErrors);
      }

      try {
        const { booking, payment, invoice } = await uttEnterprise.executeBookingPaymentInvoiceLifecycle(request);
        paymentByBooking.set(bookingKey(request.tenantId, request.bookingId), payment);
        invoiceByBooking.set(bookingKey(request.tenantId, request.bookingId), invoice);

        return {
          ok: true,
          data: {
            bookingId: booking.bookingId,
            bookingStatus: booking.status,
            paymentStatus: payment.paymentStatus,
            invoiceId: invoice.invoiceId,
          },
        };
      } catch (error) {
        return fail("Failed to create booking", [error instanceof Error ? error.message : "Unknown error"]);
      }
    },

    "/booking-status": (request: BookingStatusRequest): ApiResponse<{ bookingId: string; stage: string; status: string; paymentGuaranteed: boolean }> => {
      const validationErrors = validateBookingStatusRequest(request);
      if (validationErrors.length > 0) {
        return fail("Invalid /booking-status request", validationErrors);
      }

      try {
        const booking = uttEnterprise.getBookingById(request.tenantId, request.bookingId);
        return {
          ok: true,
          data: {
            bookingId: booking.bookingId,
            stage: booking.stage,
            status: booking.status,
            paymentGuaranteed: booking.paymentGuaranteed,
          },
        };
      } catch (error) {
        return fail("Failed to fetch booking status", [error instanceof Error ? error.message : "Unknown error"]);
      }
    },

    "/payment-status": (request: PaymentStatusRequest): ApiResponse<{ bookingId: string; paymentId: string; paymentStatus: string; gateway: string }> => {
      const validationErrors = validateBookingStatusRequest(request);
      if (validationErrors.length > 0) {
        return fail("Invalid /payment-status request", validationErrors);
      }

      const payment = paymentByBooking.get(bookingKey(request.tenantId, request.bookingId));
      if (!payment) {
        return fail("Payment not found for tenantId/bookingId");
      }

      return {
        ok: true,
        data: {
          bookingId: request.bookingId,
          paymentId: payment.paymentId,
          paymentStatus: payment.paymentStatus,
          gateway: payment.paymentGateway,
        },
      };
    },

    "/invoice": (request: InvoiceRequest): ApiResponse<{
      invoiceId: string;
      bookingId: string;
      customer: { customerId: string; name: string };
      amount: number;
      GST: number;
      total: number;
      vendorPayable: number;
      margin: number;
      createdAt: string;
    }> => {
      const validationErrors = validateBookingStatusRequest(request);
      if (validationErrors.length > 0) {
        return fail("Invalid /invoice request", validationErrors);
      }

      const invoice = invoiceByBooking.get(bookingKey(request.tenantId, request.bookingId));
      if (!invoice) {
        return fail("Invoice not found for tenantId/bookingId");
      }

      return { ok: true, data: invoice };
    },
  };
}
