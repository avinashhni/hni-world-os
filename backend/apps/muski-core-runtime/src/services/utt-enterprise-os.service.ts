import { InvoiceGstService } from "./finance/invoice-gst.service";
import { PaymentService, type PaymentRecord } from "./payment/payment.service";
import { UttPersistenceService } from "./persistence/utt-persistence.service";
import { RevenueEngineService } from "./revenue/revenue-engine.service";
import { FraudRiskMonitorService } from "./risk/fraud-risk-monitor.service";
import { SupplierAggregationWorker } from "./suppliers/supplier-aggregation.worker";
import type { SupplierAdapter, UnifiedSupplierOffer } from "./suppliers/supplier.types";

export type UttRole = "ADMIN" | "AGENT" | "CORPORATE_USER";
export type UttCustomerLayer = "B2C" | "B2B" | "CORPORATE";
export type UttBookingStage = "SEARCH" | "SELECT" | "HOLD" | "CONFIRM" | "PAYMENT_SUCCESS" | "INVOICE_GENERATED" | "VOUCHER_ISSUED";
export type UttBookingStatus = "search_completed" | "selected" | "hold_created" | "held" | "confirmed" | "voucher_issued" | "expired";
export type UttSupplierCode = "EXPEDIA" | "HOTELBEDS" | "WEBBEDS" | "MANUAL";

interface TenantScopedEntity {
  tenantId: string;
}

export interface UttUser extends TenantScopedEntity {
  userId: string;
  role: UttRole;
  customerLayer: UttCustomerLayer;
  permissionScopes: string[];
}

export interface UttSearchRequest extends TenantScopedEntity {
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

export interface UttSupplierOffer {
  supplier: UttSupplierCode;
  supplierHotelId: string;
  hotelName: string;
  location: string;
  roomType: string;
  mealPlan: string;
  baseRate: number;
  taxes: number;
  currency: string;
  cancellable: boolean;
  availableRooms: number;
}

export interface UttAggregatedOffer {
  hotelId: string;
  name: string;
  location: string;
  price: number;
  currency: string;
  availability: number;
  supplier: UttSupplierCode;
  cancellationPolicy?: string;
  refundable?: boolean;
}

export interface UttPricingRequest extends TenantScopedEntity {
  pricingId: string;
  offer: UttAggregatedOffer;
  sellCurrency: string;
  marginPct: number;
  exchangeRates: Record<string, number>;
  taxProfile?: {
    gstPct?: number;
    taxCode?: string;
  };
}

export interface UttPriceQuote {
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

interface SupplierContract extends TenantScopedEntity {
  supplierId: string;
  supplierCode: UttSupplierCode;
  supplierName: string;
  onboardingStatus: "pending" | "active";
  commissionPct: number;
  apiEnabled: boolean;
  manualInventoryEnabled: boolean;
  performanceScore: number;
}

interface HoldRecord extends TenantScopedEntity {
  holdId: string;
  bookingId: string;
  expiresAt: string;
  reminderAt: string;
  status: "active" | "expired";
}

interface UttBooking extends TenantScopedEntity {
  bookingId: string;
  searchId: string;
  selectedHotelId: string;
  customerId: string;
  customerName: string;
  customerLayer: UttCustomerLayer;
  globalIdentityId: string;
  stage: UttBookingStage;
  status: UttBookingStatus;
  price: UttPriceQuote;
  hold?: HoldRecord;
  voucherRef?: string;
  paymentGuaranteeRequired: boolean;
  paymentGuaranteed: boolean;
  paymentLocked: boolean;
  holdClosed?: boolean;
}

interface LeadRecord extends TenantScopedEntity {
  leadId: string;
  customerId: string;
  globalIdentityId: string;
  sourceLayer: UttCustomerLayer;
  status: "lead" | "converted";
  bookingId?: string;
}

interface FinanceLedger extends TenantScopedEntity {
  financeId: string;
  bookingId: string;
  invoiceId: string;
  vendorPayable: number;
  customerReceivable: number;
  marginAmount: number;
  taxReady: UttPriceQuote["taxReady"];
  paymentStatus: "pending" | "paid";
}

interface UttInvoice extends TenantScopedEntity {
  invoiceId: string;
  bookingId: string;
  customer: {
    customerId: string;
    name: string;
  };
  amount: number;
  GST: number;
  total: number;
  vendorPayable: number;
  margin: number;
  createdAt: string;
}

interface AuditEvent extends TenantScopedEntity {
  eventId: string;
  actor: string;
  action: string;
  severity: "info" | "warning" | "critical";
  at: string;
  details: Record<string, unknown>;
}

interface TelemetrySignal extends TenantScopedEntity {
  signalId: string;
  signalType: "booking_log" | "error_control" | "queue_perf" | "audit_event";
  at: string;
  payload: Record<string, unknown>;
}

function assertIsoDate(value: string, field: string): string {
  if (!/^\d{4}-\d{2}-\d{2}/.test(value)) {
    throw new Error(`Invalid ${field}. Expected ISO-like date.`);
  }
  return value;
}

function nextId(prefix: string, sequence: number): string {
  return `${prefix}-${String(sequence).padStart(5, "0")}`;
}

function roundNoDecimals(amount: number): number {
  return Math.round(amount);
}

const CANONICAL_LIFECYCLE = [
  "SEARCH",
  "SELECT",
  "HOLD",
  "CONFIRM",
  "PAYMENT_SUCCESS",
  "INVOICE_GENERATED",
  "VOUCHER_ISSUED",
] as const;

export class UttEnterpriseOsService {
  private sequence = 1;
  private readonly users = new Map<string, UttUser>();
  private readonly supplierContracts = new Map<string, SupplierContract>();
  private readonly searchStore = new Map<string, UttAggregatedOffer[]>();
  private readonly bookings = new Map<string, UttBooking>();
  private readonly leads = new Map<string, LeadRecord>();
  private readonly financeLedgers = new Map<string, FinanceLedger>();
  private readonly payments = new Map<string, PaymentRecord>();
  private readonly invoices = new Map<string, UttInvoice>();
  private readonly auditTrail: AuditEvent[] = [];
  private readonly telemetrySignals: TelemetrySignal[] = [];
  private readonly queueDepthByTenant = new Map<string, number>();
  private readonly supplierAggregationWorker: SupplierAggregationWorker;
  private readonly paymentService: PaymentService;
  private readonly revenueEngine = new RevenueEngineService(
    {
      globalMarginPercent: 12,
      supplierMarginOverride: { EXPEDIA: 10, HOTELBEDS: 11, WEBBEDS: 9.5 },
      dynamicPricingEnabled: false,
      competitorPricingHook: "ready_not_active",
      demandSurgeMultiplierHook: "ready_not_active",
    },
    (eventName, payload) => {
      if (eventName === "revenue_loss_flag") {
        this.telemetry(String(payload.tenantId ?? "unknown"), "error_control", payload);
      }
    },
  );
  private readonly invoiceService = new InvoiceGstService();
  private readonly fraudRiskService = new FraudRiskMonitorService();
  private readonly persistence = new UttPersistenceService();

  constructor(supplierAdapters: SupplierAdapter[] = []) {
    this.supplierAggregationWorker = new SupplierAggregationWorker(supplierAdapters);
    this.paymentService = new PaymentService(
      {
        createIntent: async () => ({ gatewayPaymentId: nextId("RZP", this.sequence++) }),
        capture: async () => ({ status: "captured" }),
        verify: async () => ({ valid: true }),
      },
      {
        createIntent: async () => ({ gatewayPaymentId: nextId("STP", this.sequence++) }),
        capture: async () => ({ status: "captured" }),
        verify: async () => ({ valid: true }),
      },
    );
  }

  registerUser(user: UttUser): UttUser {
    this.users.set(user.userId, user);
    this.audit(user.tenantId, user.userId, "rbac.user_registered", "info", {
      role: user.role,
      customerLayer: user.customerLayer,
      permissionScopes: user.permissionScopes,
    });
    return user;
  }

  onboardSupplier(input: Omit<SupplierContract, "onboardingStatus" | "performanceScore">): SupplierContract {
    const contract: SupplierContract = {
      ...input,
      onboardingStatus: "active",
      performanceScore: 1,
    };

    this.supplierContracts.set(contract.supplierId, contract);
    this.audit(contract.tenantId, "SUPPLIER_ENGINE", "supplier.onboard", "info", {
      supplierCode: contract.supplierCode,
      apiEnabled: contract.apiEnabled,
      manualInventoryEnabled: contract.manualInventoryEnabled,
    });
    this.persistence.upsertSupplier({
      tenantId: contract.tenantId,
      supplierCode: contract.supplierCode,
      status: contract.onboardingStatus,
      healthy: contract.apiEnabled,
      updatedAt: new Date().toISOString(),
    });
    return contract;
  }

  aggregateSupplierOffers(request: UttSearchRequest, supplierOffers: UttSupplierOffer[]): UttAggregatedOffer[] {
    assertIsoDate(request.checkIn, "checkIn");
    assertIsoDate(request.checkOut, "checkOut");

    const totalPax = request.rooms.reduce((sum, room) => sum + room.adults + room.childAges.length, 0);
    if (!request.rooms.length || totalPax <= 0) {
      throw new Error("At least one room with occupancy is required");
    }

    const normalized = supplierOffers
      .filter((offer) => offer.availableRooms >= request.rooms.length)
      .filter((offer) => (request.filters.maxBudget ? offer.baseRate + offer.taxes <= request.filters.maxBudget : true))
      .map((offer) => ({
        hotelId: `${offer.supplier}-${offer.supplierHotelId}`,
        name: offer.hotelName,
        location: offer.location,
        price: roundNoDecimals(offer.baseRate + offer.taxes),
        currency: offer.currency,
        availability: offer.availableRooms,
        supplier: offer.supplier,
        cancellationPolicy: offer.cancellable ? "standard_refund_policy" : "non_refundable",
        refundable: offer.cancellable,
      }))
      .filter(
        (offer, index, arr) =>
          arr.findIndex(
            (item) =>
              item.hotelId === offer.hotelId ||
              (item.name.toLowerCase() === offer.name.toLowerCase() && item.location.toLowerCase() === offer.location.toLowerCase()),
          ) === index,
      )
      .sort((a, b) => a.price - b.price);

    this.searchStore.set(request.searchId, normalized);
    this.emitOnce(request.tenantId, request.searchId, "SEARCH_COMPLETED", {
      searchId: request.searchId,
      suppliersCompared: supplierOffers.length,
      results: normalized.length,
    });
    return normalized;
  }

  async aggregateSupplierOffersFromApi(
    request: UttSearchRequest,
  ): Promise<{ offers: UttAggregatedOffer[]; failures: Array<{ supplier: string; error: string }> }> {
    const aggregated = await this.supplierAggregationWorker.aggregate({
      tenantId: request.tenantId,
      destination: request.destination,
      checkIn: request.checkIn,
      checkOut: request.checkOut,
      rooms: request.rooms.length,
      currency: request.currency,
    });

    const offers = aggregated.offers.map((offer) => this.mapUnifiedSupplierOffer(offer));
    this.searchStore.set(request.searchId, offers);

    if (aggregated.failures.length > 0) {
      this.telemetry(request.tenantId, "error_control", {
        type: "supplier_api_failover",
        searchId: request.searchId,
        failures: aggregated.failures,
      });
    }

    return { offers, failures: aggregated.failures };
  }

  priceOffer(input: UttPricingRequest): UttPriceQuote {
    const rate = input.exchangeRates[input.offer.currency];
    const targetRate = input.exchangeRates[input.sellCurrency];
    if (!rate || !targetRate) {
      throw new Error("Missing exchange rate for pricing conversion");
    }

    const normalizedBase = input.offer.price / rate;
    const convertedCost = normalizedBase * targetRate;
    const marginAmount = (convertedCost * input.marginPct) / 100;
    const sellAmount = convertedCost + marginAmount;

    const roundedCost = roundNoDecimals(convertedCost);
    const roundedSell = roundNoDecimals(sellAmount);
    const roundedMargin = roundNoDecimals(roundedSell - roundedCost);
    const gstPct = input.taxProfile?.gstPct ?? 0;

    const quote: UttPriceQuote = {
      pricingId: input.pricingId,
      costCurrency: input.sellCurrency,
      sellCurrency: input.sellCurrency,
      costAmount: roundedCost,
      sellAmount: roundedSell,
      marginAmount: roundedMargin,
      marginPct: input.marginPct,
      roundedRule: "NO_DECIMALS",
      taxReady: {
        taxCode: input.taxProfile?.taxCode ?? "GST_READY",
        gstPct,
        estimatedTax: roundNoDecimals((roundedSell * gstPct) / 100),
      },
    };

    this.telemetry(input.tenantId, "booking_log", {
      type: "pricing_computed",
      pricingId: input.pricingId,
      sellAmount: quote.sellAmount,
      marginAmount: quote.marginAmount,
    });

    return quote;
  }

  executeBookingLifecycle(input: {
    tenantId: string;
    bookingId: string;
    searchId: string;
    selectedHotelId: string;
    customerId: string;
    customerName: string;
    globalIdentityId: string;
    customerLayer: UttCustomerLayer;
    holdMinutes: number;
    paymentGuaranteed: boolean;
    price: UttPriceQuote;
  }): UttBooking {
    this.requireSelectedOffer(input.searchId, input.selectedHotelId);
    const booking = this.ensureBooking(input, input.customerLayer !== "B2B");

    this.progressSearchSelectHoldConfirm(booking, input.holdMinutes, {
      requireVerifiedPayment: booking.paymentGuaranteeRequired,
      paymentReady: input.paymentGuaranteed,
    });

    booking.paymentGuaranteed = input.paymentGuaranteed;
    this.persistBookingSnapshot(booking);
    return booking;
  }

  async executeBookingPaymentInvoiceLifecycle(input: {
    tenantId: string;
    bookingId: string;
    searchId: string;
    selectedHotelId: string;
    customerId: string;
    customerName: string;
    globalIdentityId: string;
    customerLayer: UttCustomerLayer;
    holdMinutes: number;
    countryCode?: string;
    signature: string;
    gstPercent: number;
  }): Promise<{ booking: UttBooking; payment: PaymentRecord; invoice: UttInvoice }> {
    const stage = "BOOKING_PAYMENT_INVOICE";
    const cached = this.readIdempotentReplay(input, stage);
    if (cached) {
      return cached;
    }

    const selected = this.requireSelectedOffer(input.searchId, input.selectedHotelId);
    const quote = this.resolvePriceQuote(input, selected);
    const booking = this.ensureBooking({ ...input, paymentGuaranteed: false, price: quote }, input.customerLayer !== "B2B");

    this.progressSearchSelectHoldConfirm(booking, input.holdMinutes, {
      requireVerifiedPayment: false,
      paymentReady: booking.paymentGuaranteed,
    });

    const payment = await this.resolvePaymentIdempotent({
      tenantId: input.tenantId,
      booking,
      customerId: input.customerId,
      customerLayer: input.customerLayer,
      countryCode: input.countryCode,
      signature: input.signature,
      quote,
    });

    booking.paymentGuaranteed = payment.paymentStatus === "verified";
    booking.paymentLocked = booking.paymentGuaranteed;
    if (booking.paymentGuaranteed) {
      booking.stage = "PAYMENT_SUCCESS";
    }
    if (booking.paymentGuaranteeRequired && !booking.paymentGuaranteed) {
      throw new Error("B2C/CORPORATE payment verification failed. Retry allowed with same booking/payment identity.");
    }

    const invoice = this.resolveInvoiceIdempotent(
      {
        tenantId: input.tenantId,
        bookingId: input.bookingId,
        gstPercent: input.gstPercent,
      },
      booking,
    );

    booking.stage = "INVOICE_GENERATED";
    this.emitOnce(input.tenantId, input.bookingId, "INVOICE_GENERATED", {
      bookingId: input.bookingId,
      invoiceId: invoice.invoiceId,
      total: invoice.total,
    });

    this.issueVoucher(booking, true);
    this.assertInternalValidation(booking, payment, invoice);
    this.assertFinalLifecycleState(input.tenantId, booking, payment, invoice);
    this.persistBookingSnapshot(booking, payment);
    const response = { booking, payment, invoice };
    this.writeIdempotentSnapshot(input.tenantId, input.bookingId, stage, response);
    return response;
  }

  evaluateHoldReminders(nowIso: string): HoldRecord[] {
    const nowTs = new Date(nowIso).getTime();
    const dueReminders: HoldRecord[] = [];

    for (const booking of this.bookings.values()) {
      const hold = booking.hold;
      if (!hold || hold.tenantId !== booking.tenantId) {
        continue;
      }

      const reminderTs = new Date(hold.reminderAt).getTime();
      const expiryTs = new Date(hold.expiresAt).getTime();

      if (hold.status === "active" && reminderTs <= nowTs && expiryTs > nowTs) {
        dueReminders.push(hold);
        this.telemetry(booking.tenantId, "booking_log", {
          type: "booking_hold_reminder",
          bookingId: booking.bookingId,
          holdId: hold.holdId,
          expiresAt: hold.expiresAt,
        });
      }

      const statusAllowsExpiry = booking.status !== "confirmed" && booking.status !== "voucher_issued";
      const shouldExpire = !!booking.hold && hold.status === "active" && booking.holdClosed !== true && expiryTs <= nowTs;
      if (shouldExpire && statusAllowsExpiry) {
        hold.status = "expired";
        booking.status = "expired";
        this.emitOnce(booking.tenantId, booking.bookingId, "HOLD_EXPIRED", {
          bookingId: booking.bookingId,
          holdId: hold.holdId,
        });
      }
    }

    return dueReminders;
  }

  createLeadAndConvertToBooking(input: {
    tenantId: string;
    leadId: string;
    customerId: string;
    globalIdentityId: string;
    sourceLayer: UttCustomerLayer;
    bookingId: string;
  }): LeadRecord {
    const booking = this.bookings.get(input.bookingId);
    if (!booking || booking.tenantId !== input.tenantId) {
      throw new Error("Booking not found for CRM conversion in tenant scope");
    }

    const record: LeadRecord = {
      tenantId: input.tenantId,
      leadId: input.leadId,
      customerId: input.customerId,
      globalIdentityId: input.globalIdentityId,
      sourceLayer: input.sourceLayer,
      status: "converted",
      bookingId: input.bookingId,
    };
    this.leads.set(record.leadId, record);

    this.audit(input.tenantId, "CRM_SYNC_WORKER", "crm.lead_to_customer_conversion", "info", {
      leadId: input.leadId,
      sourceLayer: input.sourceLayer,
      globalIdentityId: input.globalIdentityId,
      bookingId: input.bookingId,
    });

    return record;
  }

  generateFinanceRecord(input: {
    tenantId: string;
    financeId: string;
    invoiceId: string;
    bookingId: string;
  }): FinanceLedger {
    const booking = this.bookings.get(input.bookingId);
    if (!booking || booking.tenantId !== input.tenantId) {
      throw new Error("Booking not found for finance generation");
    }

    const finance: FinanceLedger = {
      tenantId: input.tenantId,
      financeId: input.financeId,
      invoiceId: input.invoiceId,
      bookingId: input.bookingId,
      vendorPayable: booking.price.costAmount,
      customerReceivable: booking.price.sellAmount,
      marginAmount: booking.price.marginAmount,
      taxReady: booking.price.taxReady,
      paymentStatus: "pending",
    };

    this.financeLedgers.set(finance.financeId, finance);
    this.telemetry(input.tenantId, "queue_perf", {
      type: "finance_record_created",
      financeId: input.financeId,
      invoiceId: input.invoiceId,
      bookingId: input.bookingId,
      vendorPayable: finance.vendorPayable,
      customerReceivable: finance.customerReceivable,
      marginAmount: finance.marginAmount,
    });

    return finance;
  }

  markFinancePaid(tenantId: string, financeId: string): FinanceLedger {
    const finance = this.financeLedgers.get(financeId);
    if (!finance || finance.tenantId !== tenantId) {
      throw new Error("Finance record not found for tenant");
    }

    finance.paymentStatus = "paid";
    this.audit(tenantId, "FINANCE_ENGINE_WORKER", "finance.payment_status_updated", "info", {
      financeId,
      paymentStatus: finance.paymentStatus,
    });

    return finance;
  }

  muskiRouteCommand(input: {
    tenantId: string;
    commandId: string;
    userId: string;
    role: UttRole;
    command:
      | "show bookings"
      | "check supplier status"
      | "view revenue"
      | "booking alerts"
      | "show revenue"
      | "payment status"
      | "failed transactions"
      | "supplier API health";
  }): { route: string; allowed: boolean; data: Record<string, unknown> } {
    const user = this.users.get(input.userId);
    const allowed = !!user && user.tenantId === input.tenantId && user.role === input.role;
    if (!allowed) {
      return {
        route: "MUSKI -> THE_UTT -> ACCESS_DENIED",
        allowed: false,
        data: { reason: "tenant_or_role_mismatch" },
      };
    }

    let data: Record<string, unknown> = {};
    if (input.command === "show bookings") {
      data = {
        bookings: [...this.bookings.values()]
          .filter((booking) => booking.tenantId === input.tenantId)
          .map((booking) => ({ bookingId: booking.bookingId, status: booking.status, stage: booking.stage })),
      };
    } else if (input.command === "check supplier status") {
      data = {
        suppliers: [...this.supplierContracts.values()]
          .filter((supplier) => supplier.tenantId === input.tenantId)
          .map((supplier) => ({ supplierCode: supplier.supplierCode, status: supplier.onboardingStatus })),
      };
    } else if (input.command === "view revenue" || input.command === "show revenue") {
      const financeRows = [...this.financeLedgers.values()].filter((row) => row.tenantId === input.tenantId);
      data = {
        receivable: financeRows.reduce((sum, row) => sum + row.customerReceivable, 0),
        margin: financeRows.reduce((sum, row) => sum + row.marginAmount, 0),
      };
    } else if (input.command === "payment status") {
      data = {
        payments: [...this.payments.values()]
          .filter((payment) => payment.tenantId === input.tenantId)
          .map((payment) => ({
            paymentId: payment.paymentId,
            bookingId: payment.bookingId,
            status: payment.paymentStatus,
            gateway: payment.paymentGateway,
          })),
      };
    } else if (input.command === "failed transactions") {
      data = {
        failedTransactions: this.paymentService.listFailedPayments(input.tenantId).map((payment) => ({
          paymentId: payment.paymentId,
          bookingId: payment.bookingId,
          status: payment.paymentStatus,
        })),
      };
    } else if (input.command === "supplier API health") {
      const persisted = this.persistence.getState().suppliers.filter((supplier) => supplier.tenantId === input.tenantId);
      data = {
        suppliers: persisted.map((supplier) => ({
          supplierCode: supplier.supplierCode,
          healthy: supplier.healthy,
          status: supplier.status,
          updatedAt: supplier.updatedAt,
        })),
      };
    } else {
      const activeAlerts = [...this.bookings.values()].filter(
        (booking) =>
          booking.tenantId === input.tenantId &&
          ((booking.hold && booking.hold.status === "active") || booking.hold?.status === "expired" || booking.status === "expired"),
      );
      data = { alerts: activeAlerts.map((booking) => ({ bookingId: booking.bookingId, status: booking.status })) };
    }

    this.audit(input.tenantId, "MUSKI", "muski.command_route", "info", {
      commandId: input.commandId,
      command: input.command,
      userId: input.userId,
      allowed,
    });

    return {
      route: `MUSKI -> UTT_MANAGER_AI -> ${input.command}`,
      allowed,
      data,
    };
  }

  getApiRoutes(): string[] {
    return [
      "POST /utt/core/search/unified",
      "POST /utt/core/search/dedupe",
      "POST /utt/core/search/sort",
      "POST /utt/core/price/quote",
      "POST /utt/core/booking-input",
      "POST /utt/search",
      "POST /utt/search/suppliers/live",
      "POST /utt/select",
      "POST /utt/hold",
      "POST /utt/confirm",
      "POST /utt/voucher",
      "POST /utt/payment/intent",
      "POST /utt/payment/capture",
      "POST /utt/payment/verify",
      "POST /utt/crm/lead-convert",
      "POST /utt/finance/invoice",
      "GET /utt/suppliers/status",
      "GET /utt/suppliers/health",
      "GET /utt/bookings",
      "GET /utt/revenue",
      "GET /utt/payments/status",
      "GET /utt/payments/failed",
      "GET /utt/alerts",
    ];
  }

  getEventFlowMap(): Array<{ stage: string; emits: string[]; worker: string }> {
    return [
      { stage: "SEARCH", emits: ["SEARCH", "SELECT", "HOLD", "CONFIRM"], worker: "Booking Engine Worker" },
      { stage: "PAYMENT", emits: ["PAYMENT_SUCCESS", "payment_failed"], worker: "Payment Worker" },
      { stage: "INVOICE", emits: ["INVOICE_GENERATED"], worker: "Invoice + GST Worker" },
      { stage: "VOUCHER", emits: ["VOUCHER_ISSUED"], worker: "Booking Engine Worker" },
      { stage: "CRM", emits: ["crm.lead_to_customer_conversion"], worker: "CRM Sync Worker" },
      { stage: "FINANCE", emits: ["finance_record_created"], worker: "Finance Worker" },
      { stage: "RISK", emits: ["risk_assessed"], worker: "Fraud / Risk Monitor Worker" },
    ];
  }

  getReadinessSnapshot(tenantId: string): Record<string, unknown> {
    return {
      tenantIsolation: "active",
      suppliers: [...this.supplierContracts.values()].filter((item) => item.tenantId === tenantId).length,
      bookings: [...this.bookings.values()].filter((item) => item.tenantId === tenantId).length,
      financeRecords: [...this.financeLedgers.values()].filter((item) => item.tenantId === tenantId).length,
      telemetrySignals: this.telemetrySignals.filter((item) => item.tenantId === tenantId).length,
      auditEvents: this.auditTrail.filter((item) => item.tenantId === tenantId).length,
      queueDepth: this.queueDepthByTenant.get(tenantId) ?? 0,
      canonicalLifecycle: [...CANONICAL_LIFECYCLE],
    };
  }

  getBookingById(tenantId: string, bookingId: string): UttBooking {
    const booking = this.bookings.get(bookingId);
    if (!booking || booking.tenantId !== tenantId) {
      throw new Error("Booking not found for tenant");
    }
    return booking;
  }

  pushQueueMetric(tenantId: string, queueDepth: number): void {
    this.queueDepthByTenant.set(tenantId, queueDepth);
    this.telemetry(tenantId, "queue_perf", {
      queueDepth,
      healthy: queueDepth < 1000,
    });
  }

  getAuditTrail(tenantId: string): AuditEvent[] {
    return this.auditTrail.filter((item) => item.tenantId === tenantId);
  }

  getTelemetrySignals(tenantId: string): TelemetrySignal[] {
    return this.telemetrySignals.filter((item) => item.tenantId === tenantId);
  }

  private getSelectedOffer(searchId: string, selectedHotelId: string): UttAggregatedOffer | undefined {
    return (this.searchStore.get(searchId) ?? []).find((offer) => offer.hotelId === selectedHotelId);
  }

  private requireSelectedOffer(searchId: string, selectedHotelId: string): UttAggregatedOffer {
    const selected = this.getSelectedOffer(searchId, selectedHotelId);
    if (!selected) {
      throw new Error("Selected offer not found for searchId");
    }
    return selected;
  }

  private ensureBooking(
    input: {
      tenantId: string;
      bookingId: string;
      searchId: string;
      selectedHotelId: string;
      customerId: string;
      customerName: string;
      globalIdentityId: string;
      customerLayer: UttCustomerLayer;
      paymentGuaranteed: boolean;
      holdMinutes: number;
      price: UttPriceQuote;
    },
    paymentGuaranteeRequired: boolean,
  ): UttBooking {
    const existing = this.bookings.get(input.bookingId) ?? this.restorePersistedBooking(input, paymentGuaranteeRequired);
    if (existing) {
      this.validateBookingImmutableFields(existing, input);
      return existing;
    }

    const booking: UttBooking = {
      tenantId: input.tenantId,
      bookingId: input.bookingId,
      searchId: input.searchId,
      selectedHotelId: input.selectedHotelId,
      customerId: input.customerId,
      customerName: input.customerName,
      customerLayer: input.customerLayer,
      globalIdentityId: input.globalIdentityId,
      stage: "SEARCH",
      status: "search_completed",
      price: input.price,
      paymentGuaranteeRequired,
      paymentGuaranteed: input.paymentGuaranteed,
      paymentLocked: input.paymentGuaranteed,
      holdClosed: false,
    };

    this.bookings.set(booking.bookingId, booking);
    this.emitOnce(booking.tenantId, booking.bookingId, "SEARCH", { bookingId: booking.bookingId });
    return booking;
  }

  private progressSearchSelectHoldConfirm(
    booking: UttBooking,
    holdMinutes: number,
    options: { requireVerifiedPayment: boolean; paymentReady: boolean },
  ): void {
    this.ensureHold(booking, holdMinutes);

    if (booking.status === "search_completed") {
      booking.stage = "SELECT";
      booking.status = "selected";
      this.emitOnce(booking.tenantId, booking.bookingId, "SELECT", { bookingId: booking.bookingId });
    }

    if (booking.status === "selected" || booking.status === "held") {
      booking.stage = "HOLD";
      booking.status = "hold_created";
      this.emitOnce(booking.tenantId, booking.bookingId, "HOLD", {
        bookingId: booking.bookingId,
        holdId: booking.hold?.holdId,
        expiresAt: booking.hold?.expiresAt,
      });
    }

    if (booking.status === "hold_created") {
      if (options.requireVerifiedPayment && !options.paymentReady) {
        return;
      }

      booking.stage = "CONFIRM";
      booking.status = "confirmed";
      this.emitOnce(booking.tenantId, booking.bookingId, "CONFIRM", { bookingId: booking.bookingId });
    }
  }

  private ensureHold(booking: UttBooking, holdMinutes: number): void {
    if (booking.status === "voucher_issued" || booking.holdClosed === true) {
      return;
    }

    if (booking.hold && booking.hold.status === "active") {
      return;
    }

    const now = Date.now();
    booking.hold = {
      tenantId: booking.tenantId,
      holdId: booking.hold?.holdId ?? nextId("HOLD", this.sequence++),
      bookingId: booking.bookingId,
      expiresAt: new Date(now + holdMinutes * 60_000).toISOString(),
      reminderAt: new Date(now + Math.max(holdMinutes - 5, 1) * 60_000).toISOString(),
      status: "active",
    };
  }

  private async resolvePaymentIdempotent(input: {
    tenantId: string;
    booking: UttBooking;
    customerId: string;
    customerLayer: UttCustomerLayer;
    countryCode?: string;
    signature: string;
    quote: UttPriceQuote;
  }): Promise<PaymentRecord> {
    if (input.booking.paymentLocked) {
      const existingLocked = this.loadPaymentForBooking(input.tenantId, input.booking.bookingId);
      if (!existingLocked) {
        throw new Error("Booking payment lock corruption: locked booking has no persisted payment.");
      }
      if (existingLocked.paymentStatus !== "verified") {
        throw new Error(`Booking payment lock corruption: expected verified payment, got ${existingLocked.paymentStatus}`);
      }
      return existingLocked;
    }

    const risk = this.fraudRiskService.evaluate({
      tenantId: input.tenantId,
      bookingId: input.booking.bookingId,
      bookingTenantId: input.booking.tenantId,
      customerId: input.customerId,
      retriesIn5Minutes: this.countBookingEvents(input.tenantId, input.booking.bookingId, "payment_failed"),
      quotedPrice: input.quote.sellAmount,
      baselinePrice: input.quote.costAmount,
    });

    if (risk.blocked) {
      this.emitOnce(input.tenantId, input.booking.bookingId, "payment_failed", {
        bookingId: input.booking.bookingId,
        reason: risk.flags.join(","),
      });
      throw new Error(`Fraud/Risk blocked booking: ${risk.flags.join(",")}`);
    }

    let payment = this.loadPaymentForBooking(input.tenantId, input.booking.bookingId);
    if (!payment) {
      payment = await this.paymentService.createPaymentIntent({
        tenantId: input.tenantId,
        bookingId: input.booking.bookingId,
        bookingStatus: "confirmed",
        amount: input.quote.sellAmount,
        currency: input.quote.sellCurrency,
        customerLayer: input.customerLayer,
        countryCode: input.countryCode,
      });
      this.emitOnce(input.tenantId, input.booking.bookingId, "payment_initiated", {
        bookingId: input.booking.bookingId,
        paymentId: payment.paymentId,
      });
    }

    if (payment.paymentStatus === "verified") {
      input.booking.paymentLocked = true;
      this.persistPayment(payment);
      this.emitOnce(input.tenantId, input.booking.bookingId, "PAYMENT_SUCCESS", {
        bookingId: input.booking.bookingId,
        paymentId: payment.paymentId,
      });
      return payment;
    }

    if (payment.paymentStatus === "initiated" || payment.paymentStatus === "authorized") {
      payment = await this.paymentService.capturePayment(payment.paymentId);
    }

    if (payment.paymentStatus === "captured" || payment.paymentStatus === "failed") {
      payment = await this.paymentService.verifyPayment(payment.paymentId, input.signature);
    }

    if (payment.paymentStatus === "failed") {
      const failureBeforeCapture = payment.createdAt === payment.updatedAt;
      if (failureBeforeCapture) {
        payment = await this.paymentService.capturePayment(payment.paymentId, { allowFailedRetry: true });
        if (payment.paymentStatus === "captured") {
          payment = await this.paymentService.verifyPayment(payment.paymentId, input.signature);
        }
      }
    }

    this.persistPayment(payment);

    if (payment.paymentStatus === "verified") {
      input.booking.paymentLocked = true;
      this.emitOnce(input.tenantId, input.booking.bookingId, "PAYMENT_SUCCESS", {
        bookingId: input.booking.bookingId,
        paymentId: payment.paymentId,
      });
      return payment;
    }

    this.emitOnce(input.tenantId, input.booking.bookingId, "payment_failed", {
      bookingId: input.booking.bookingId,
      paymentId: payment.paymentId,
      status: payment.paymentStatus,
    });

    return payment;
  }

  private resolveInvoiceIdempotent(
    input: { tenantId: string; bookingId: string; gstPercent: number },
    booking: UttBooking,
  ): UttInvoice {
    const existing = this.invoicesByBooking(input.tenantId, input.bookingId);
    if (existing) {
      this.assertInvoiceIdentityImmutable(existing, booking.customerId, booking.customerName);
      return existing;
    }

    const persisted = this.persistence.getInvoiceByBooking(input.tenantId, input.bookingId);
    if (persisted) {
      const restored = this.restorePersistedInvoice(persisted);
      this.assertInvoiceIdentityImmutable(restored, booking.customerId, booking.customerName);
      this.invoices.set(restored.invoiceId, restored);
      return restored;
    }

    const generated = this.invoiceService.generateInvoice({
      tenantId: input.tenantId,
      bookingId: input.bookingId,
      customer: {
        customerId: booking.customerId,
        name: booking.customerName,
      },
      amount: booking.price.sellAmount,
      gstPercent: input.gstPercent,
      supplierCost: booking.price.costAmount,
    });

    const invoice: UttInvoice = { ...generated };
    this.invoices.set(invoice.invoiceId, invoice);
    this.persistInvoice(invoice);
    return invoice;
  }

  private issueVoucher(booking: UttBooking, requireVerifiedPayment: boolean): void {
    if (booking.status === "voucher_issued") {
      return;
    }

    if (booking.status !== "confirmed") {
      return;
    }

    if (requireVerifiedPayment && !booking.paymentGuaranteed) {
      return;
    }

    booking.stage = "VOUCHER_ISSUED";
    booking.status = "voucher_issued";
    booking.voucherRef = booking.voucherRef ?? `VCH-${booking.bookingId}`;
    booking.holdClosed = true;

    this.emitOnce(booking.tenantId, booking.bookingId, "VOUCHER_ISSUED", {
      bookingId: booking.bookingId,
      voucherRef: booking.voucherRef,
    });
  }

  private assertInternalValidation(booking: UttBooking, payment: PaymentRecord, invoice: UttInvoice): void {
    if (booking.tenantId !== payment.tenantId || booking.tenantId !== invoice.tenantId) {
      throw new Error("no tenant leakage");
    }

    if (invoice.customer.customerId !== booking.customerId) {
      throw new Error("invoice customerId immutable check failed");
    }

    if (!invoice.customer.name.trim()) {
      throw new Error("invoice customerName immutable check failed");
    }
  }

  private persistBookingSnapshot(booking: UttBooking, payment?: PaymentRecord): void {
    const selected = this.getSelectedOffer(booking.searchId, booking.selectedHotelId);
    this.persistence.upsertBooking({
      tenantId: booking.tenantId,
      bookingId: booking.bookingId,
      customerId: booking.customerId,
      customerName: booking.customerName,
      globalIdentityId: booking.globalIdentityId,
      customerLayer: booking.customerLayer,
      searchId: booking.searchId,
      selectedHotelId: booking.selectedHotelId,
      status: booking.status,
      stage: booking.stage,
      paymentId: payment?.paymentId,
      paymentStatus: payment?.paymentStatus,
      paymentGateway: payment?.paymentGateway,
      paymentLocked: booking.paymentLocked,
      supplier: selected?.supplier ?? "MANUAL",
      sellAmount: booking.price.sellAmount,
      costAmount: booking.price.costAmount,
      marginAmount: booking.price.marginAmount,
      createdAt: new Date().toISOString(),
    });
  }

  private persistPayment(payment: PaymentRecord): void {
    this.payments.set(payment.paymentId, payment);
    this.persistence.upsertPayment({
      tenantId: payment.tenantId,
      paymentId: payment.paymentId,
      bookingId: payment.bookingId,
      paymentGateway: payment.paymentGateway,
      paymentStatus: payment.paymentStatus,
      amount: payment.amount,
      currency: payment.currency,
      updatedAt: payment.updatedAt,
    });
  }

  private persistInvoice(invoice: UttInvoice): void {
    this.persistence.upsertInvoice({
      tenantId: invoice.tenantId,
      invoiceId: invoice.invoiceId,
      bookingId: invoice.bookingId,
      customerId: invoice.customer.customerId,
      customerName: invoice.customer.name,
      amount: invoice.amount,
      gst: invoice.GST,
      total: invoice.total,
      margin: invoice.margin,
      createdAt: invoice.createdAt,
    });
  }

  private loadPaymentForBooking(tenantId: string, bookingId: string): PaymentRecord | undefined {
    const inMemory = this.paymentService.getPaymentByBooking(tenantId, bookingId);
    if (inMemory) {
      this.payments.set(inMemory.paymentId, inMemory);
      return inMemory;
    }

    const persisted = this.persistence.getPaymentByBooking(tenantId, bookingId);
    if (!persisted) {
      return undefined;
    }

    const restored: PaymentRecord = {
      paymentId: persisted.paymentId,
      tenantId: persisted.tenantId,
      bookingId: persisted.bookingId,
      amount: persisted.amount,
      currency: persisted.currency,
      paymentGateway: persisted.paymentGateway as PaymentRecord["paymentGateway"],
      paymentStatus: persisted.paymentStatus as PaymentRecord["paymentStatus"],
      createdAt: persisted.updatedAt,
      updatedAt: persisted.updatedAt,
    };

    this.paymentService.restorePayment(restored);
    this.payments.set(restored.paymentId, restored);
    return restored;
  }

  private restorePersistedBooking(
    input: {
      tenantId: string;
      bookingId: string;
      searchId: string;
      selectedHotelId: string;
      customerId: string;
      customerName: string;
      globalIdentityId: string;
      customerLayer: UttCustomerLayer;
      paymentGuaranteed: boolean;
      holdMinutes: number;
      price: UttPriceQuote;
    },
    paymentGuaranteeRequired: boolean,
  ): UttBooking | undefined {
    const persisted = this.persistence.getBookingById(input.tenantId, input.bookingId);

    if (!persisted) {
      return undefined;
    }

    const restored: UttBooking = {
      tenantId: input.tenantId,
      bookingId: input.bookingId,
      searchId: persisted.searchId,
      selectedHotelId: persisted.selectedHotelId,
      customerId: persisted.customerId,
      customerName: persisted.customerName,
      globalIdentityId: persisted.globalIdentityId,
      customerLayer: persisted.customerLayer as UttCustomerLayer,
      stage: persisted.stage as UttBookingStage,
      status: persisted.status as UttBookingStatus,
      price: {
        ...input.price,
        costAmount: persisted.costAmount,
        sellAmount: persisted.sellAmount,
        marginAmount: persisted.marginAmount,
      },
      paymentGuaranteeRequired,
      paymentGuaranteed: persisted.paymentStatus === "verified",
      paymentLocked: persisted.paymentStatus === "verified",
      holdClosed: persisted.status === "voucher_issued",
      voucherRef: persisted.status === "voucher_issued" ? `VCH-${input.bookingId}` : undefined,
    };

    this.bookings.set(restored.bookingId, restored);
    return restored;
  }

  private resolvePriceQuote(
    input: {
      tenantId: string;
      bookingId: string;
      selectedHotelId: string;
      customerLayer: UttCustomerLayer;
      gstPercent: number;
    },
    selected?: UttAggregatedOffer,
  ): UttPriceQuote {
    const existing = this.bookings.get(input.bookingId);
    if (existing?.price) {
      return existing.price;
    }

    const revenue = selected
      ? this.revenueEngine.calculateSellPrice({
          tenantId: input.tenantId,
          bookingId: input.bookingId,
          supplier: selected.supplier as "EXPEDIA" | "HOTELBEDS" | "WEBBEDS",
          costPrice: selected.price,
        })
      : undefined;

    return {
      pricingId: nextId("PRC", this.sequence++),
      costCurrency: selected?.currency ?? "USD",
      sellCurrency: selected?.currency ?? "USD",
      costAmount: roundNoDecimals(revenue?.costPrice ?? 0),
      sellAmount: roundNoDecimals(revenue?.sellPrice ?? 0),
      marginAmount: roundNoDecimals(revenue?.marginAmount ?? 0),
      marginPct: revenue?.marginPercent ?? 0,
      roundedRule: "NO_DECIMALS",
      taxReady: {
        taxCode: "GST_READY",
        gstPct: input.gstPercent,
        estimatedTax: roundNoDecimals(((revenue?.sellPrice ?? 0) * input.gstPercent) / 100),
      },
    };
  }

  private validateBookingImmutableFields(
    booking: UttBooking,
    input: {
      tenantId: string;
      bookingId: string;
      searchId: string;
      selectedHotelId: string;
      customerId: string;
      customerName: string;
      globalIdentityId: string;
      customerLayer: UttCustomerLayer;
    },
  ): void {
    if (booking.tenantId !== input.tenantId) {
      throw new Error("Booking exists outside tenant scope");
    }

    if (
      booking.customerId !== input.customerId ||
      booking.customerName !== input.customerName ||
      booking.globalIdentityId !== input.globalIdentityId
    ) {
      throw new Error("Booking identity is immutable once created");
    }

    if (booking.searchId !== input.searchId || booking.selectedHotelId !== input.selectedHotelId) {
      throw new Error("Booking selection is immutable once created");
    }

    if (booking.customerLayer !== input.customerLayer) {
      throw new Error("Booking customer layer cannot be changed");
    }
  }

  private assertInvoiceIdentityImmutable(
    invoice: { customer: { customerId: string; name: string } },
    customerId: string,
    customerName: string,
  ): void {
    if (invoice.customer.customerId !== customerId || invoice.customer.name !== customerName) {
      throw new Error("Invoice customer identity is immutable and cannot be overwritten");
    }
  }

  private invoicesByBooking(tenantId: string, bookingId: string): UttInvoice | undefined {
    return [...this.invoices.values()].find((invoice) => invoice.tenantId === tenantId && invoice.bookingId === bookingId);
  }

  private restorePersistedInvoice(persisted: ReturnType<UttPersistenceService["getInvoiceByBooking"]>): UttInvoice {
    if (!persisted) {
      throw new Error("Persisted invoice is required for restoration");
    }
    if (!persisted.invoiceId || !persisted.customerId || !persisted.customerName) {
      throw new Error("Persisted invoice is corrupted. Immutable identity fields are missing.");
    }
    if (persisted.amount < 0 || persisted.total < 0 || persisted.gst < 0 || persisted.margin < 0) {
      throw new Error("Persisted invoice is corrupted. Monetary values cannot be negative.");
    }

    return {
      tenantId: persisted.tenantId,
      invoiceId: persisted.invoiceId,
      bookingId: persisted.bookingId,
      customer: {
        customerId: persisted.customerId,
        name: persisted.customerName,
      },
      amount: persisted.amount,
      GST: persisted.gst,
      total: persisted.total,
      vendorPayable: roundNoDecimals(persisted.amount - persisted.margin),
      margin: persisted.margin,
      createdAt: persisted.createdAt,
    };
  }

  private mapUnifiedSupplierOffer(offer: UnifiedSupplierOffer): UttAggregatedOffer {
    return {
      hotelId: `${offer.supplier}-${offer.hotelId}`,
      name: offer.name,
      location: offer.location,
      price: roundNoDecimals(offer.price),
      currency: offer.currency,
      availability: offer.availability,
      supplier: offer.supplier,
      cancellationPolicy: offer.cancellationPolicy,
      refundable: offer.refundable,
    };
  }

  private emitBookingEvent(tenantId: string, eventName: string, payload: Record<string, unknown>): void {
    this.telemetry(tenantId, "booking_log", {
      tenantId,
      eventName,
      ...payload,
    });
  }

  private countBookingEvents(tenantId: string, bookingId: string, eventName: string): number {
    return this.telemetrySignals.filter(
      (signal) =>
        signal.tenantId === tenantId &&
        signal.signalType === "booking_log" &&
        signal.payload.eventName === eventName &&
        signal.payload.bookingId === bookingId,
    ).length;
  }

  private emitOnce(tenantId: string, bookingId: string, eventName: string, payload: Record<string, unknown>): void {
    if (this.persistence.hasEmittedEvent(tenantId, bookingId, eventName)) {
      return;
    }
    const eventKey = `${tenantId}::${bookingId}::${eventName}`;
    this.persistence.storeEmittedEvent({
      tenantId,
      bookingId,
      eventName,
      eventKey,
      emittedAt: new Date().toISOString(),
    });
    this.emitBookingEvent(tenantId, eventName, payload);
  }

  private readIdempotentReplay(
    input: {
      tenantId: string;
      bookingId: string;
      searchId: string;
      selectedHotelId: string;
      customerId: string;
      customerName: string;
      globalIdentityId: string;
    },
    lifecycleStage: string,
  ): { booking: UttBooking; payment: PaymentRecord; invoice: UttInvoice } | undefined {
    const snapshot = this.persistence.getIdempotencyRecord(input.tenantId, input.bookingId, lifecycleStage);
    if (!snapshot) {
      return undefined;
    }
    const parsed = snapshot.cachedResult as { booking?: UttBooking; payment?: PaymentRecord; invoice?: UttInvoice };
    if (!this.isValidLifecycleSnapshot(parsed, input.tenantId, input.bookingId)) {
      return undefined;
    }
    if (!this.matchesImmutableReplayIdentity(parsed.booking, input)) {
      return undefined;
    }
    return {
      booking: parsed.booking,
      payment: parsed.payment,
      invoice: parsed.invoice,
    };
  }

  private matchesImmutableReplayIdentity(
    booking: UttBooking | undefined,
    input: {
      tenantId: string;
      bookingId: string;
      searchId: string;
      selectedHotelId: string;
      customerId: string;
      customerName: string;
      globalIdentityId: string;
    },
  ): boolean {
    if (!booking) return false;

    const immutableMatches =
      booking.tenantId === input.tenantId &&
      booking.bookingId === input.bookingId &&
      booking.searchId === input.searchId &&
      booking.selectedHotelId === input.selectedHotelId &&
      booking.customerId === input.customerId &&
      booking.customerName === input.customerName &&
      booking.globalIdentityId === input.globalIdentityId;

    return immutableMatches;
  }

  private writeIdempotentSnapshot(
    tenantId: string,
    bookingId: string,
    lifecycleStage: string,
    response: { booking: UttBooking; payment: PaymentRecord; invoice: UttInvoice },
  ): void {
    this.persistence.upsertIdempotency({
      tenantId,
      bookingId,
      lifecycleStage,
      cachedResult: response as unknown as Record<string, unknown>,
      processedAt: new Date().toISOString(),
    });
  }

  private isValidLifecycleSnapshot(
    snapshot: { booking?: UttBooking; payment?: PaymentRecord; invoice?: UttInvoice },
    tenantId: string,
    bookingId: string,
  ): snapshot is { booking: UttBooking; payment: PaymentRecord; invoice: UttInvoice } {
    if (!snapshot || typeof snapshot !== "object" || !snapshot.booking || !snapshot.payment || !snapshot.invoice) {
      return false;
    }
    return (
      snapshot.booking.tenantId === tenantId &&
      snapshot.payment.tenantId === tenantId &&
      snapshot.invoice.tenantId === tenantId &&
      snapshot.booking.bookingId === bookingId &&
      snapshot.payment.bookingId === bookingId &&
      snapshot.invoice.bookingId === bookingId
    );
  }

  private assertFinalLifecycleState(tenantId: string, booking: UttBooking, payment: PaymentRecord, invoice: UttInvoice): void {
    const bookingCount = [...this.bookings.values()].filter((row) => row.tenantId === tenantId && row.bookingId === booking.bookingId).length;
    const paymentCount = [...this.payments.values()].filter((row) => row.tenantId === tenantId && row.bookingId === booking.bookingId).length;
    const invoiceCount = [...this.invoices.values()].filter((row) => row.tenantId === tenantId && row.bookingId === booking.bookingId).length;

    if (bookingCount !== 1 || paymentCount !== 1 || invoiceCount !== 1) {
      throw new Error("Lifecycle validation failed: expected one booking, one payment, and one invoice per booking.");
    }
    if (booking.status !== "voucher_issued") {
      throw new Error(`Lifecycle validation failed: expected voucher_issued, got ${booking.status}`);
    }
    if (payment.paymentStatus !== "verified") {
      throw new Error(`Lifecycle validation failed: expected verified payment, got ${payment.paymentStatus}`);
    }
    if (invoice.bookingId !== booking.bookingId || payment.bookingId !== booking.bookingId) {
      throw new Error("Lifecycle validation failed: booking/payment/invoice linkage mismatch.");
    }
  }

  private audit(
    tenantId: string,
    actor: string,
    action: string,
    severity: "info" | "warning" | "critical",
    details: Record<string, unknown>,
  ): void {
    this.auditTrail.push({
      tenantId,
      eventId: nextId("AUD", this.sequence++),
      actor,
      action,
      severity,
      at: new Date().toISOString(),
      details,
    });

    this.telemetry(tenantId, "audit_event", {
      actor,
      action,
      severity,
      details,
    });
  }

  private telemetry(
    tenantId: string,
    signalType: "booking_log" | "error_control" | "queue_perf" | "audit_event",
    payload: Record<string, unknown>,
  ): void {
    this.telemetrySignals.push({
      tenantId,
      signalId: nextId("SIG", this.sequence++),
      signalType,
      at: new Date().toISOString(),
      payload,
    });
  }
}
