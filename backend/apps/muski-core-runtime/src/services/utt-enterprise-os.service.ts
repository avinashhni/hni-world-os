import { InvoiceGstService } from "./finance/invoice-gst.service";
import { PaymentService, type PaymentRecord } from "./payment/payment.service";
import { UttPersistenceService } from "./persistence/utt-persistence.service";
import { RevenueEngineService } from "./revenue/revenue-engine.service";
import { FraudRiskMonitorService } from "./risk/fraud-risk-monitor.service";
import { SupplierAggregationWorker } from "./suppliers/supplier-aggregation.worker";
import type { SupplierAdapter, UnifiedSupplierOffer } from "./suppliers/supplier.types";

export type UttRole = "ADMIN" | "AGENT" | "CORPORATE_USER";
export type UttCustomerLayer = "B2C" | "B2B" | "CORPORATE";
export type UttBookingStage = "SEARCH" | "SELECT" | "HOLD" | "CONFIRM" | "VOUCHER";
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
  customerLayer: UttCustomerLayer;
  globalIdentityId: string;
  stage: UttBookingStage;
  status: UttBookingStatus;
  price: UttPriceQuote;
  hold?: HoldRecord;
  voucherRef?: string;
  paymentGuaranteeRequired: boolean;
  paymentGuaranteed: boolean;
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
    this.telemetry(request.tenantId, "booking_log", {
      type: "supplier_selected",
      searchId: request.searchId,
      suppliersCompared: supplierOffers.length,
      results: normalized.length,
      sorting: "lowest_price_first",
      marginControlEngine: "prepared_not_active",
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
      roundedRule: quote.roundedRule,
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
    globalIdentityId: string;
    customerLayer: UttCustomerLayer;
    holdMinutes: number;
    paymentGuaranteed: boolean;
    price: UttPriceQuote;
  }): UttBooking {
    this.requireSelectedOffer(input.searchId, input.selectedHotelId);
    const booking = this.ensureBookingIntegrity({
      ...input,
      paymentGuaranteeRequired: input.customerLayer !== "B2B",
    });

    if (booking.paymentGuaranteeRequired && !input.paymentGuaranteed) {
      throw new Error("B2C/CORPORATE flows require payment guarantee before confirm");
    }

    this.progressBookingLifecycle(booking, input.holdMinutes, {
      issueVoucher: false,
      requireVerifiedPayment: false,
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
    const selected = this.getSelectedOffer(input.searchId, input.selectedHotelId);
    const quote = this.resolvePriceQuote(input, selected);

    const booking = this.ensureBookingIntegrity({
      tenantId: input.tenantId,
      bookingId: input.bookingId,
      searchId: input.searchId,
      selectedHotelId: input.selectedHotelId,
      customerId: input.customerId,
      globalIdentityId: input.globalIdentityId,
      customerLayer: input.customerLayer,
      holdMinutes: input.holdMinutes,
      paymentGuaranteed: false,
      price: quote,
      paymentGuaranteeRequired: input.customerLayer !== "B2B",
    });

    this.progressBookingLifecycle(booking, input.holdMinutes, {
      issueVoucher: false,
      requireVerifiedPayment: false,
    });

    const payment = await this.resolveIdempotentPayment(input, booking, quote);
    booking.paymentGuaranteed = payment.paymentStatus === "verified";
    if (booking.paymentGuaranteeRequired && !booking.paymentGuaranteed) {
      throw new Error("B2C payment verification failed");
    }

    const invoice = this.resolveImmutableInvoice({
      tenantId: input.tenantId,
      bookingId: input.bookingId,
      customerId: input.customerId,
      customerName: input.customerName,
      gstPercent: input.gstPercent,
    }, booking);

    this.progressBookingLifecycle(booking, input.holdMinutes, {
      issueVoucher: true,
      requireVerifiedPayment: booking.paymentGuaranteeRequired,
    });

    this.persistBookingSnapshot(booking, payment);
    return { booking, payment, invoice };
  }

  evaluateHoldReminders(nowIso: string): HoldRecord[] {
    const now = new Date(nowIso).getTime();
    const dueReminders: HoldRecord[] = [];

    for (const booking of this.bookings.values()) {
      if (!booking.hold || booking.tenantId !== booking.hold.tenantId || booking.hold.status !== "active") {
        continue;
      }
      const reminderTs = new Date(booking.hold.reminderAt).getTime();
      const expiryTs = new Date(booking.hold.expiresAt).getTime();

      if (reminderTs <= now && expiryTs > now) {
        dueReminders.push(booking.hold);
        this.telemetry(booking.tenantId, "booking_log", {
          type: "booking_hold_reminder",
          bookingId: booking.bookingId,
          holdId: booking.hold.holdId,
          expiresAt: booking.hold.expiresAt,
        });
      }

      if (expiryTs <= now && booking.hold.status === "active" && booking.holdClosed !== true && booking.status !== "voucher_issued") {
        booking.hold.status = "expired";
        booking.status = "expired";
        this.telemetry(booking.tenantId, "booking_log", {
          type: "booking_hold_expired",
          bookingId: booking.bookingId,
          holdId: booking.hold.holdId,
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
      { stage: "SEARCH", emits: ["supplier_selected"], worker: "Supplier Aggregator Worker" },
      { stage: "HOLD", emits: ["booking_hold"], worker: "Booking Engine Worker" },
      { stage: "PAYMENT", emits: ["payment_initiated", "payment_success", "payment_failed"], worker: "Payment Worker" },
      { stage: "CONFIRM", emits: ["booking_confirmed"], worker: "Booking Engine Worker" },
      { stage: "VOUCHER", emits: ["voucher_generated"], worker: "Booking Engine Worker" },
      { stage: "CRM", emits: ["crm.lead_to_customer_conversion"], worker: "CRM Sync Worker" },
      { stage: "FINANCE", emits: ["finance_record_created", "invoice_generated"], worker: "Invoice + GST Worker" },
      { stage: "RISK", emits: ["risk_assessed"], worker: "Fraud / Risk Monitor Worker" },
    ];
  }

  getReadinessSnapshot(tenantId: string): Record<string, unknown> {
    const supplierCount = [...this.supplierContracts.values()].filter((item) => item.tenantId === tenantId).length;
    const bookingCount = [...this.bookings.values()].filter((item) => item.tenantId === tenantId).length;
    const financeCount = [...this.financeLedgers.values()].filter((item) => item.tenantId === tenantId).length;

    return {
      tenantIsolation: "active",
      roleValidation: "active",
      suppliers: supplierCount,
      bookings: bookingCount,
      financeRecords: financeCount,
      telemetrySignals: this.telemetrySignals.filter((item) => item.tenantId === tenantId).length,
      auditEvents: this.auditTrail.filter((item) => item.tenantId === tenantId).length,
      queueDepth: this.queueDepthByTenant.get(tenantId) ?? 0,
      persistedTables: ["bookings", "payments", "suppliers", "invoices"],
      persistedRows: {
        bookings: this.persistence.getState().bookings.filter((item) => item.tenantId === tenantId).length,
        payments: this.persistence.getState().payments.filter((item) => item.tenantId === tenantId).length,
        suppliers: this.persistence.getState().suppliers.filter((item) => item.tenantId === tenantId).length,
        invoices: this.persistence.getState().invoices.filter((item) => item.tenantId === tenantId).length,
      },
      revenueConfig: this.revenueEngine.getConfig(),
      commandFlow: "MUSKI -> UTT Manager AI -> Worker AI",
      workers: [
        "Booking Engine Worker",
        "Supplier Aggregator Worker",
        "Rate Normalization Worker",
        "Payment Worker",
        "Revenue Engine Worker",
        "CRM Sync Worker",
        "Invoice + GST Worker",
        "Fraud / Risk Monitor Worker",
        "Telemetry Worker",
      ],
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

  private ensureBookingIntegrity(input: {
    tenantId: string;
    bookingId: string;
    searchId: string;
    selectedHotelId: string;
    customerId: string;
    globalIdentityId: string;
    customerLayer: UttCustomerLayer;
    paymentGuaranteed: boolean;
    holdMinutes: number;
    price: UttPriceQuote;
    paymentGuaranteeRequired: boolean;
  }): UttBooking {
    const existing = this.bookings.get(input.bookingId) ?? this.restorePersistedBooking(input);
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
      globalIdentityId: input.globalIdentityId,
      customerLayer: input.customerLayer,
      stage: "SEARCH",
      status: "search_completed",
      price: input.price,
      paymentGuaranteeRequired: input.paymentGuaranteeRequired,
      paymentGuaranteed: input.paymentGuaranteed,
      holdClosed: false,
    };

    this.bookings.set(booking.bookingId, booking);
    this.emitBookingEventOnce(booking.tenantId, booking.bookingId, "booking_created", {
      bookingId: booking.bookingId,
      stage: booking.stage,
    });
    return booking;
  }

  private progressBookingLifecycle(
    booking: UttBooking,
    holdMinutes: number,
    options: { issueVoucher: boolean; requireVerifiedPayment: boolean },
  ): void {
    this.ensureHoldActive(booking, holdMinutes);

    this.transitionBooking(booking, {
      fromStatuses: ["search_completed"],
      toStage: "SELECT",
      toStatus: "selected",
    });

    this.transitionBooking(booking, {
      fromStatuses: ["selected", "held"],
      toStage: "HOLD",
      toStatus: "hold_created",
      eventName: "booking_hold",
      eventPayload: {
        bookingId: booking.bookingId,
        holdId: booking.hold?.holdId,
        expiresAt: booking.hold?.expiresAt,
        reminderAt: booking.hold?.reminderAt,
      },
    });

    if (booking.status === "hold_created") {
      if (options.requireVerifiedPayment && !booking.paymentGuaranteed) {
        return;
      }

      booking.stage = "CONFIRM";
      booking.status = "confirmed";
      booking.holdClosed = true;
      this.emitBookingEventOnce(booking.tenantId, booking.bookingId, "booking_confirmed", {
        bookingId: booking.bookingId,
        paymentGuaranteeRequired: booking.paymentGuaranteeRequired,
        paymentGuaranteed: booking.paymentGuaranteed,
      });
    }

    if (options.issueVoucher) {
      this.issueVoucherIfEligible(booking, options.requireVerifiedPayment);
    }
  }

  private transitionBooking(
    booking: UttBooking,
    input: {
      fromStatuses: UttBookingStatus[];
      toStage: UttBookingStage;
      toStatus: UttBookingStatus;
      eventName?: string;
      eventPayload?: Record<string, unknown>;
    },
  ): void {
    if (!input.fromStatuses.includes(booking.status)) {
      return;
    }
    booking.stage = input.toStage;
    booking.status = input.toStatus;
    if (input.eventName) {
      this.emitBookingEventOnce(booking.tenantId, booking.bookingId, input.eventName, input.eventPayload ?? { bookingId: booking.bookingId });
    }
  }

  private ensureHoldActive(booking: UttBooking, holdMinutes: number): void {
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

  private issueVoucherIfEligible(booking: UttBooking, requireVerifiedPayment: boolean): void {
    if (booking.status === "voucher_issued") {
      return;
    }
    if (booking.status !== "confirmed") {
      return;
    }
    if (requireVerifiedPayment && !booking.paymentGuaranteed) {
      return;
    }

    booking.stage = "VOUCHER";
    booking.status = "voucher_issued";
    booking.holdClosed = true;
    booking.voucherRef = booking.voucherRef ?? `VCH-${booking.bookingId}`;
    this.emitBookingEventOnce(booking.tenantId, booking.bookingId, "voucher_generated", {
      bookingId: booking.bookingId,
      voucherRef: booking.voucherRef,
    });
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

  private async resolveIdempotentPayment(
    input: {
      tenantId: string;
      bookingId: string;
      customerId: string;
      customerLayer: UttCustomerLayer;
      countryCode?: string;
      signature: string;
    },
    booking: UttBooking,
    quote: UttPriceQuote,
  ): Promise<PaymentRecord> {
    const retries = this.countBookingEvents(input.tenantId, input.bookingId, "payment_failed");
    const risk = this.fraudRiskService.evaluate({
      tenantId: input.tenantId,
      bookingId: input.bookingId,
      bookingTenantId: booking.tenantId,
      customerId: input.customerId,
      retriesIn5Minutes: retries,
      quotedPrice: quote.sellAmount,
      baselinePrice: quote.costAmount,
    });

    if (risk.blocked) {
      this.emitBookingEventOnce(input.tenantId, input.bookingId, "payment_failed", {
        bookingId: input.bookingId,
        reason: risk.flags.join(","),
      });
      throw new Error(`Fraud/Risk blocked booking: ${risk.flags.join(",")}`);
    }

    let payment = this.loadPaymentForBooking(input.tenantId, input.bookingId);
    if (!payment) {
      payment = await this.paymentService.createPaymentIntent({
        tenantId: input.tenantId,
        bookingId: input.bookingId,
        bookingStatus: "confirmed",
        amount: quote.sellAmount,
        currency: quote.sellCurrency,
        customerLayer: input.customerLayer,
        countryCode: input.countryCode,
      });
      this.emitBookingEventOnce(input.tenantId, input.bookingId, "payment_initiated", {
        tenantId: input.tenantId,
        bookingId: input.bookingId,
        paymentId: payment.paymentId,
      });
    }

    if (payment.paymentStatus === "initiated" || payment.paymentStatus === "authorized") {
      payment = await this.paymentService.capturePayment(payment.paymentId);
    }

    if (payment.paymentStatus === "captured" || payment.paymentStatus === "failed") {
      payment = await this.paymentService.verifyPayment(payment.paymentId, input.signature);
    }

    if (payment.paymentStatus === "verified") {
      this.emitBookingEventOnce(input.tenantId, input.bookingId, "payment_success", {
        tenantId: input.tenantId,
        bookingId: input.bookingId,
        paymentId: payment.paymentId,
        gateway: payment.paymentGateway,
        status: payment.paymentStatus,
      });
    } else {
      this.emitBookingEvent(input.tenantId, "payment_failed", {
        tenantId: input.tenantId,
        bookingId: input.bookingId,
        paymentId: payment.paymentId,
        gateway: payment.paymentGateway,
        status: payment.paymentStatus,
      });
    }

    this.payments.set(payment.paymentId, payment);
    this.persistence.upsertPayment({
      tenantId: input.tenantId,
      paymentId: payment.paymentId,
      bookingId: input.bookingId,
      paymentGateway: payment.paymentGateway,
      paymentStatus: payment.paymentStatus,
      amount: payment.amount,
      currency: payment.currency,
      updatedAt: payment.updatedAt,
    });

    return payment;
  }

  private resolveImmutableInvoice(
    input: { tenantId: string; bookingId: string; customerId: string; customerName: string; gstPercent: number },
    booking: UttBooking,
  ): UttInvoice {
    const localInvoice = this.invoicesByBooking(input.tenantId, input.bookingId);
    if (localInvoice) {
      this.assertInvoiceIdentityImmutable(localInvoice, input.customerId, input.customerName);
      return localInvoice;
    }

    const persistedInvoice = this.persistence.getInvoiceByBooking(input.tenantId, input.bookingId);
    if (persistedInvoice) {
      if (persistedInvoice.customerId !== input.customerId || persistedInvoice.customerName !== input.customerName) {
        throw new Error("Invoice customer identity is immutable and does not match persisted record");
      }
      const restored = this.restorePersistedInvoice(persistedInvoice);
      this.invoices.set(restored.invoiceId, restored);
      return restored;
    }

    const serviceInvoice = this.invoiceService.getInvoiceByBooking(input.tenantId, input.bookingId);
    if (serviceInvoice) {
      this.assertInvoiceIdentityImmutable(serviceInvoice, input.customerId, input.customerName);
      const restored: UttInvoice = { ...serviceInvoice };
      this.invoices.set(restored.invoiceId, restored);
      this.persistInvoice(restored);
      return restored;
    }

    const generated = this.invoiceService.generateInvoice({
      tenantId: input.tenantId,
      bookingId: booking.bookingId,
      customer: { customerId: input.customerId, name: input.customerName },
      amount: booking.price.sellAmount,
      gstPercent: input.gstPercent,
      supplierCost: booking.price.costAmount,
    });

    const invoice: UttInvoice = { ...generated };
    this.invoices.set(invoice.invoiceId, invoice);
    this.emitBookingEventOnce(input.tenantId, input.bookingId, "invoice_generated", {
      tenantId: input.tenantId,
      bookingId: booking.bookingId,
      invoiceId: invoice.invoiceId,
      total: invoice.total,
      margin: invoice.margin,
    });
    this.persistInvoice(invoice);
    return invoice;
  }

  private persistBookingSnapshot(booking: UttBooking, payment?: PaymentRecord): void {
    const selected = this.getSelectedOffer(booking.searchId, booking.selectedHotelId);
    this.persistence.upsertBooking({
      tenantId: booking.tenantId,
      bookingId: booking.bookingId,
      status: booking.status,
      stage: booking.stage,
      paymentId: payment?.paymentId,
      paymentStatus: payment?.paymentStatus,
      paymentGateway: payment?.paymentGateway,
      supplier: selected?.supplier ?? "MANUAL",
      sellAmount: booking.price.sellAmount,
      costAmount: booking.price.costAmount,
      marginAmount: booking.price.marginAmount,
      createdAt: new Date().toISOString(),
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

    this.payments.set(restored.paymentId, restored);
    return restored;
  }

  private restorePersistedBooking(input: {
    tenantId: string;
    bookingId: string;
    searchId: string;
    selectedHotelId: string;
    customerId: string;
    globalIdentityId: string;
    customerLayer: UttCustomerLayer;
    paymentGuaranteed: boolean;
    holdMinutes: number;
    price: UttPriceQuote;
    paymentGuaranteeRequired: boolean;
  }): UttBooking | undefined {
    const persisted = this.persistence
      .getState()
      .bookings.find((row) => row.tenantId === input.tenantId && row.bookingId === input.bookingId);

    if (!persisted) {
      return undefined;
    }

    const restored: UttBooking = {
      tenantId: input.tenantId,
      bookingId: input.bookingId,
      searchId: input.searchId,
      selectedHotelId: input.selectedHotelId,
      customerId: input.customerId,
      globalIdentityId: input.globalIdentityId,
      customerLayer: input.customerLayer,
      stage: persisted.stage as UttBookingStage,
      status: persisted.status as UttBookingStatus,
      price: {
        ...input.price,
        costAmount: persisted.costAmount,
        sellAmount: persisted.sellAmount,
        marginAmount: persisted.marginAmount,
      },
      paymentGuaranteeRequired: input.paymentGuaranteeRequired,
      paymentGuaranteed: persisted.paymentStatus === "verified",
      holdClosed: persisted.status === "confirmed" || persisted.status === "voucher_issued",
      voucherRef: persisted.status === "voucher_issued" ? `VCH-${input.bookingId}` : undefined,
    };

    this.bookings.set(restored.bookingId, restored);
    return restored;
  }

  private validateBookingImmutableFields(
    booking: UttBooking,
    input: {
      tenantId: string;
      bookingId: string;
      searchId: string;
      selectedHotelId: string;
      customerId: string;
      globalIdentityId: string;
      customerLayer: UttCustomerLayer;
    },
  ): void {
    if (booking.tenantId !== input.tenantId) {
      throw new Error("Booking exists outside tenant scope");
    }
    if (booking.customerId !== input.customerId || booking.globalIdentityId !== input.globalIdentityId) {
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

  private restorePersistedInvoice(persistedInvoice: ReturnType<UttPersistenceService["getInvoiceByBooking"]>): UttInvoice {
    if (!persistedInvoice) {
      throw new Error("Persisted invoice is required for restoration");
    }

    return {
      tenantId: persistedInvoice.tenantId,
      invoiceId: persistedInvoice.invoiceId,
      bookingId: persistedInvoice.bookingId,
      customer: {
        customerId: persistedInvoice.customerId,
        name: persistedInvoice.customerName,
      },
      amount: persistedInvoice.amount,
      GST: persistedInvoice.gst,
      total: persistedInvoice.total,
      vendorPayable: roundNoDecimals(persistedInvoice.amount - persistedInvoice.margin),
      margin: persistedInvoice.margin,
      createdAt: persistedInvoice.createdAt,
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

  private emitBookingEventOnce(tenantId: string, bookingId: string, eventName: string, payload: Record<string, unknown>): void {
    if (this.hasBookingEvent(tenantId, bookingId, eventName)) {
      return;
    }
    this.emitBookingEvent(tenantId, eventName, payload);
  }

  private emitBookingEvent(tenantId: string, eventName: string, payload: Record<string, unknown>): void {
    this.telemetry(tenantId, "booking_log", {
      tenantId,
      eventName,
      ...payload,
    });
  }

  private hasBookingEvent(tenantId: string, bookingId: string, eventName: string): boolean {
    return this.telemetrySignals.some(
      (signal) =>
        signal.tenantId === tenantId &&
        signal.signalType === "booking_log" &&
        signal.payload.eventName === eventName &&
        signal.payload.bookingId === bookingId,
    );
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
