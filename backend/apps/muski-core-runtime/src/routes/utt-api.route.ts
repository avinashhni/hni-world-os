type ApiMethod = "GET" | "POST";
type SupplierCode = "EXPEDIA" | "HOTELBEDS" | "WEBBEDS" | "MANUAL";
type CustomerLayer = "B2C" | "B2B" | "CORPORATE";

interface UttSearchRequest {
  tenantId: string;
  searchId: string;
  destination: string;
  checkIn: string;
  checkOut: string;
  rooms: Array<{
    roomId: string;
    adults: number;
    childAges: number[];
  }>;
  currency: string;
  filters: {
    minStars?: number;
    maxBudget?: number;
    amenities?: string[];
  };
}

interface UttPriceInput {
  tenantId: string;
  bookingId?: string;
  supplier: SupplierCode;
  costPrice: number;
  amount?: number;
}

interface BookingInputPipeline {
  tenantId: string;
  bookingId: string;
  searchId: string;
  selectedHotelId: string;
  customerId: string;
  customerName: string;
  globalIdentityId: string;
  customerLayer: CustomerLayer;
  paymentGuaranteeRequired: boolean;
  paymentGuaranteed: boolean;
  holdMinutes: number;
  countryCode?: string;
  signature?: string;
  gstPercent?: number;
}

export interface UttApiRequest {
  method: ApiMethod;
  path: "/utt/search" | "/utt/price-quote" | "/utt/booking" | "/utt/booking-status" | "/utt/payment-status" | "/utt/invoice";
  body?: unknown;
  query?: Record<string, string | undefined>;
}

export interface UttApiResponse {
  ok: boolean;
  status: number;
  data?: unknown;
  error?: {
    code: string;
    message: string;
  };
}

interface UttApiServices {
  enterpriseService: {
    aggregateSupplierOffersFromApi: (payload: UttSearchRequest) => Promise<unknown>;
    getBookingById: (tenantId: string, bookingId: string) => unknown;
  };
  coreService: {
    routeBookingInputToPhase2: (payload: BookingInputPipeline) => Promise<unknown>;
  };
  priceEngine: {
    calculateSellPrice: (payload: UttPriceInput) => unknown;
  };
  persistenceStore: {
    getPaymentByBooking: (tenantId: string, bookingId: string) => unknown;
    getInvoiceByBooking: (tenantId: string, bookingId: string) => unknown;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} is required`);
  }
  return value;
}

function asNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${field} must be a finite number`);
  }
  return value;
}

function ok(data: unknown, status = 200): UttApiResponse {
  return { ok: true, status, data };
}

function fail(status: number, code: string, message: string): UttApiResponse {
  return { ok: false, status, error: { code, message } };
}

function validateSearchPayload(payload: unknown): UttSearchRequest {
  if (!isRecord(payload)) {
    throw new Error("Request body must be an object");
  }
  const rooms = payload.rooms;
  if (!Array.isArray(rooms) || rooms.length === 0) {
    throw new Error("rooms must be a non-empty array");
  }

  return {
    tenantId: requiredString(payload.tenantId, "tenantId"),
    searchId: requiredString(payload.searchId, "searchId"),
    destination: requiredString(payload.destination, "destination"),
    checkIn: requiredString(payload.checkIn, "checkIn"),
    checkOut: requiredString(payload.checkOut, "checkOut"),
    rooms: rooms.map((room, index) => {
      if (!isRecord(room)) {
        throw new Error(`rooms[${index}] must be an object`);
      }
      return {
        roomId: requiredString(room.roomId, `rooms[${index}].roomId`),
        adults: asNumber(room.adults, `rooms[${index}].adults`),
        childAges: Array.isArray(room.childAges) ? room.childAges.map((age) => asNumber(age, `rooms[${index}].childAges[]`)) : [],
      };
    }),
    currency: requiredString(payload.currency, "currency"),
    filters: isRecord(payload.filters) ? payload.filters : {},
  };
}

function validatePriceQuotePayload(payload: unknown): UttPriceInput {
  if (!isRecord(payload)) {
    throw new Error("Request body must be an object");
  }

  return {
    tenantId: requiredString(payload.tenantId, "tenantId"),
    bookingId: typeof payload.bookingId === "string" ? payload.bookingId : undefined,
    supplier: requiredString(payload.supplier, "supplier") as UttPriceInput["supplier"],
    costPrice: asNumber(payload.costPrice, "costPrice"),
    amount: payload.amount === undefined ? undefined : asNumber(payload.amount, "amount"),
  };
}

function validateBookingPayload(payload: unknown): BookingInputPipeline {
  if (!isRecord(payload)) {
    throw new Error("Request body must be an object");
  }

  return {
    tenantId: requiredString(payload.tenantId, "tenantId"),
    bookingId: requiredString(payload.bookingId, "bookingId"),
    searchId: requiredString(payload.searchId, "searchId"),
    selectedHotelId: requiredString(payload.selectedHotelId, "selectedHotelId"),
    customerId: requiredString(payload.customerId, "customerId"),
    customerName: requiredString(payload.customerName, "customerName"),
    globalIdentityId: requiredString(payload.globalIdentityId, "globalIdentityId"),
    customerLayer: requiredString(payload.customerLayer, "customerLayer") as BookingInputPipeline["customerLayer"],
    paymentGuaranteeRequired: Boolean(payload.paymentGuaranteeRequired),
    paymentGuaranteed: Boolean(payload.paymentGuaranteed),
    holdMinutes: asNumber(payload.holdMinutes, "holdMinutes"),
    countryCode: typeof payload.countryCode === "string" ? payload.countryCode : undefined,
    signature: typeof payload.signature === "string" ? payload.signature : undefined,
    gstPercent: payload.gstPercent === undefined ? undefined : asNumber(payload.gstPercent, "gstPercent"),
  };
}

function getTenantAndBookingId(query: Record<string, string | undefined> | undefined): { tenantId: string; bookingId: string } {
  return {
    tenantId: requiredString(query?.tenantId, "tenantId"),
    bookingId: requiredString(query?.bookingId, "bookingId"),
  };
}

export function createUttApiLayer(services: UttApiServices) {
  return async (request: UttApiRequest): Promise<UttApiResponse> => {
    try {
      if (request.method === "POST" && request.path === "/utt/search") {
        const payload = validateSearchPayload(request.body);
        const result = await services.enterpriseService.aggregateSupplierOffersFromApi(payload);
        return ok(result);
      }

      if (request.method === "POST" && request.path === "/utt/price-quote") {
        const payload = validatePriceQuotePayload(request.body);
        const result = services.priceEngine.calculateSellPrice(payload);
        return ok(result);
      }

      if (request.method === "POST" && request.path === "/utt/booking") {
        const payload = validateBookingPayload(request.body);
        const result = await services.coreService.routeBookingInputToPhase2(payload);
        return ok(result, 201);
      }

      if (request.method === "GET" && request.path === "/utt/booking-status") {
        const { tenantId, bookingId } = getTenantAndBookingId(request.query);
        const result = services.enterpriseService.getBookingById(tenantId, bookingId);
        return ok(result);
      }

      if (request.method === "GET" && request.path === "/utt/payment-status") {
        const { tenantId, bookingId } = getTenantAndBookingId(request.query);
        const result = services.persistenceStore.getPaymentByBooking(tenantId, bookingId);
        if (!result) {
          return fail(404, "not_found", "Payment not found");
        }
        return ok(result);
      }

      if (request.method === "GET" && request.path === "/utt/invoice") {
        const { tenantId, bookingId } = getTenantAndBookingId(request.query);
        const result = services.persistenceStore.getInvoiceByBooking(tenantId, bookingId);
        if (!result) {
          return fail(404, "not_found", "Invoice not found");
        }
        return ok(result);
      }

      return fail(404, "route_not_found", `Unsupported route: ${request.method} ${request.path}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected error";
      return fail(400, "validation_or_execution_error", message);
    }
  };
}
