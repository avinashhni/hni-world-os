export type UttRole = "ADMIN" | "AGENT" | "CORPORATE_USER";
export type UttCustomerLayer = "B2C" | "B2B" | "CORPORATE";
export type UttBookingStage = "SEARCH" | "SELECT" | "HOLD" | "CONFIRM" | "VOUCHER";
export type UttBookingStatus = "search_completed" | "selected" | "held" | "confirmed" | "voucher_issued" | "expired";
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
  private readonly auditTrail: AuditEvent[] = [];
  private readonly telemetrySignals: TelemetrySignal[] = [];
  private readonly queueDepthByTenant = new Map<string, number>();

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
      }))
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
    const results = this.searchStore.get(input.searchId) ?? [];
    const selected = results.find((offer) => offer.hotelId === input.selectedHotelId);
    if (!selected) {
      throw new Error("Selected offer not found for searchId");
    }

    const paymentGuaranteeRequired = input.customerLayer !== "B2B";
    if (paymentGuaranteeRequired && !input.paymentGuaranteed) {
      throw new Error("B2C/CORPORATE flows require payment guarantee before confirm");
    }

    const holdExpiresAt = new Date(Date.now() + input.holdMinutes * 60_000).toISOString();
    const reminderAt = new Date(Date.now() + Math.max(input.holdMinutes - 5, 1) * 60_000).toISOString();
    const hold: HoldRecord = {
      tenantId: input.tenantId,
      holdId: nextId("HOLD", this.sequence++),
      bookingId: input.bookingId,
      expiresAt: holdExpiresAt,
      reminderAt,
      status: "active",
    };

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
      paymentGuaranteeRequired,
      paymentGuaranteed: input.paymentGuaranteed,
    };

    this.emitBookingEvent(input.tenantId, "booking_created", { bookingId: booking.bookingId, stage: booking.stage });
    booking.stage = "SELECT";
    booking.status = "selected";
    booking.hold = hold;
    booking.stage = "HOLD";
    booking.status = "held";
    this.emitBookingEvent(input.tenantId, "booking_hold", {
      bookingId: booking.bookingId,
      holdId: hold.holdId,
      expiresAt: hold.expiresAt,
      reminderAt: hold.reminderAt,
    });

    booking.stage = "CONFIRM";
    booking.status = "confirmed";
    this.emitBookingEvent(input.tenantId, "booking_confirmed", {
      bookingId: booking.bookingId,
      paymentGuaranteeRequired,
      paymentGuaranteed: booking.paymentGuaranteed,
    });

    this.emitBookingEvent(input.tenantId, "payment_status", {
      bookingId: booking.bookingId,
      status: booking.paymentGuaranteed ? "guaranteed" : "not_required",
    });

    booking.stage = "VOUCHER";
    booking.status = "voucher_issued";
    booking.voucherRef = `VCH-${booking.bookingId}`;
    this.emitBookingEvent(input.tenantId, "voucher_generated", {
      bookingId: booking.bookingId,
      voucherRef: booking.voucherRef,
    });

    this.bookings.set(booking.bookingId, booking);
    return booking;
  }

  evaluateHoldReminders(nowIso: string): HoldRecord[] {
    const now = new Date(nowIso).getTime();
    const dueReminders: HoldRecord[] = [];

    for (const booking of this.bookings.values()) {
      if (!booking.hold || booking.tenantId !== booking.hold.tenantId) {
        continue;
      }
      if (booking.hold.status !== "active") {
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

      if (expiryTs <= now) {
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
    command: "show bookings" | "check supplier status" | "view revenue" | "booking alerts";
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
    } else if (input.command === "view revenue") {
      const financeRows = [...this.financeLedgers.values()].filter((row) => row.tenantId === input.tenantId);
      data = {
        receivable: financeRows.reduce((sum, row) => sum + row.customerReceivable, 0),
        margin: financeRows.reduce((sum, row) => sum + row.marginAmount, 0),
      };
    } else {
      const activeAlerts = [...this.bookings.values()].filter(
        (booking) => booking.tenantId === input.tenantId && (booking.status === "held" || booking.status === "expired"),
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
      "POST /utt/select",
      "POST /utt/hold",
      "POST /utt/confirm",
      "POST /utt/voucher",
      "POST /utt/crm/lead-convert",
      "POST /utt/finance/invoice",
      "GET /utt/suppliers/status",
      "GET /utt/bookings",
      "GET /utt/revenue",
      "GET /utt/alerts",
    ];
  }

  getEventFlowMap(): Array<{ stage: string; emits: string[]; worker: string }> {
    return [
      { stage: "SEARCH", emits: ["supplier_selected"], worker: "Supplier Aggregator Worker" },
      { stage: "HOLD", emits: ["booking_hold"], worker: "Booking Engine Worker" },
      { stage: "CONFIRM", emits: ["booking_confirmed", "payment_status"], worker: "Booking Engine Worker" },
      { stage: "VOUCHER", emits: ["voucher_generated"], worker: "Booking Engine Worker" },
      { stage: "CRM", emits: ["crm.lead_to_customer_conversion"], worker: "CRM Sync Worker" },
      { stage: "FINANCE", emits: ["finance_record_created"], worker: "Finance Engine Worker" },
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
      commandFlow: "MUSKI -> UTT Manager AI -> Worker AI",
      workers: [
        "Booking Engine Worker",
        "Supplier Aggregator Worker",
        "Pricing Engine Worker",
        "CRM Sync Worker",
        "Finance Engine Worker",
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

  private emitBookingEvent(tenantId: string, eventName: string, payload: Record<string, unknown>): void {
    this.telemetry(tenantId, "booking_log", {
      eventName,
      ...payload,
    });
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
