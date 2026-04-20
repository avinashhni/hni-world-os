import { UttCorePlatformService, type BookingInputPipeline } from "../services/utt-core-platform.service";
import { UttEnterpriseOsService, type UttSearchRequest } from "../services/utt-enterprise-os.service";
import { UttPriceEngineService, type UttPriceInput } from "../services/revenue/utt-price-engine.service";

interface ApiResponse<T> {
  status: number;
  body: T;
}

interface ApiErrorResponse {
  error: string;
}

type ApiHandler<TRequest, TResponse> = (payload: TRequest) => Promise<ApiResponse<TResponse | ApiErrorResponse>>;

export interface UttApiRouteDefinition<TRequest = unknown, TResponse = unknown> {
  method: "GET" | "POST";
  path: string;
  handler: ApiHandler<TRequest, TResponse>;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function invalid(message: string): ApiResponse<ApiErrorResponse> {
  return {
    status: 400,
    body: { error: message },
  };
}

function asServerError(error: unknown): ApiResponse<ApiErrorResponse> {
  return {
    status: 500,
    body: { error: error instanceof Error ? error.message : "Unknown route execution error" },
  };
}

export function createUttApiRoutes(
  coreService: UttCorePlatformService,
  enterpriseService: UttEnterpriseOsService,
  priceEngineService: UttPriceEngineService,
): UttApiRouteDefinition[] {
  return [
    {
      method: "POST",
      path: "/utt/search",
      handler: async (payload: UttSearchRequest) => {
        if (!isNonEmptyString(payload?.tenantId) || !isNonEmptyString(payload?.searchId)) {
          return invalid("tenantId and searchId are required");
        }

        try {
          const search = await enterpriseService.aggregateSupplierOffersFromApi(payload);
          return {
            status: 200,
            body: search,
          };
        } catch (error) {
          return asServerError(error);
        }
      },
    },
    {
      method: "POST",
      path: "/utt/core/price/quote",
      handler: async (payload: UttPriceInput) => {
        if (!isNonEmptyString(payload?.tenantId) || !isNonEmptyString(payload?.supplier)) {
          return invalid("tenantId and supplier are required");
        }

        try {
          const quote = priceEngineService.calculateSellPrice(payload);
          return {
            status: 200,
            body: quote,
          };
        } catch (error) {
          return asServerError(error);
        }
      },
    },
    {
      method: "POST",
      path: "/utt/core/booking-input",
      handler: async (payload: BookingInputPipeline) => {
        if (!isNonEmptyString(payload?.tenantId) || !isNonEmptyString(payload?.bookingId) || !isNonEmptyString(payload?.searchId)) {
          return invalid("tenantId, bookingId, and searchId are required");
        }

        try {
          const lifecycleResult = await coreService.routeBookingInputToPhase2(payload);
          return {
            status: 200,
            body: lifecycleResult,
          };
        } catch (error) {
          return asServerError(error);
        }
      },
    },
    {
      method: "GET",
      path: "/utt/bookings",
      handler: async (payload: { tenantId: string }) => {
        if (!isNonEmptyString(payload?.tenantId)) {
          return invalid("tenantId is required");
        }

        try {
          const routed = enterpriseService.muskiRouteCommand({
            tenantId: payload.tenantId,
            commandId: "API_ROUTE_BOOKINGS",
            userId: "ADMIN_UTT_01",
            role: "ADMIN",
            command: "show bookings",
          });

          return {
            status: 200,
            body: routed,
          };
        } catch (error) {
          return asServerError(error);
        }
      },
    },
  ];
}
