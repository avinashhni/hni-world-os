export type UttRole = "ADMIN" | "AGENT" | "CORPORATE_USER";
export type UttCustomerLayer = "B2C" | "B2B" | "CORPORATE";
export type UttBookingStage = "SEARCH" | "SELECT" | "HOLD" | "CONFIRM" | "PAYMENT" | "VOUCHER";
export type UttBookingStatus = "initiated" | "held" | "confirmed" | "payment_pending" | "paid" | "voucher_issued" | "expired";
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
  checkIn: string;
  checkOut: string;
  rooms: number;
  adults: number;
  childrenAges: number[];
  cityCode: string;
  filters: {
    minStars?: number;
    maxBudget?: number;
    amenities?: string[];
  };
  targetMarginPct: number;
}

export interface UttSupplierOffer {
  supplier: UttSupplierCode;
  supplierHotelId: string;
  hotelName: string;
  roomType: string;
  mealPlan: string;
  baseRate: number;
  taxes: number;
  currency: string;
  cancellable: boolean;
  availableRooms: number;
}

export interface UttAggregatedOffer {
  offerId: string;
  canonicalHotelId: string;
  hotelName: string;
  bestSupplier: UttSupplierCode;
  comparedSuppliers: UttSupplierCode[];
  totalCost: number;
  sellRate: number;
  marginAmount: number;
  marginPct: number;
  roomsAvailable: number;
  tags: string[];
}

export interface UttItineraryRequest extends TenantScopedEntity {
  itineraryId: string;
  customerId: string;
  nights: number;
  rooms: Array<{
    roomId: string;
    adults: number;
    childAges: number[];
    selectedOfferId: string;
  }>;
  addOns: Array<{ code: string; label: string; amount: number }>;
  childPolicy: {
    cwbDiscountPct: number;
    cnbDiscountPct: number;
    cwbAgeRange: [number, number];
    cnbAgeRange: [number, number];
  };
}

export interface UttItineraryQuote {
  itineraryId: string;
  customerId: string;
  nightCount: number;
  roomBreakdown: Array<{
    roomId: string;
    adultAmount: number;
    childCwbAmount: number;
    childCnbAmount: number;
    total: number;
  }>;
  addOnTotal: number;
  grossTotal: number;
  perPersonAmount: number;
  perFamilyAmount: number;
  pdfReadyPayload: Record<string, unknown>;
}

interface UttBooking extends TenantScopedEntity {
  bookingId: string;
  itineraryId: string;
  customerId: string;
  status: UttBookingStatus;
  stage: UttBookingStage;
  holdExpiresAt?: string;
  paymentRef?: string;
  voucherRef?: string;
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

interface LeadRecord extends TenantScopedEntity {
  leadId: string;
  customerId: string;
  sourceLayer: UttCustomerLayer;
  status: "lead" | "inquiry" | "converted";
  bookingId?: string;
}

interface InvoiceRecord extends TenantScopedEntity {
  invoiceId: string;
  bookingId: string;
  subtotal: number;
  gstAmount: number;
  costAmount: number;
  sellAmount: number;
  marginAmount: number;
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

export class UttEnterpriseOsService {
  private sequence = 1;
  private readonly users = new Map<string, UttUser>();
  private readonly supplierContracts = new Map<string, SupplierContract>();
  private readonly aggregatedOffers = new Map<string, UttAggregatedOffer>();
  private readonly itineraries = new Map<string, UttItineraryQuote>();
  private readonly bookings = new Map<string, UttBooking>();
  private readonly leads = new Map<string, LeadRecord>();
  private readonly invoices = new Map<string, InvoiceRecord>();
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
    this.audit(contract.tenantId, "SYSTEM", "supplier.onboard", "info", {
      supplierCode: contract.supplierCode,
      apiEnabled: contract.apiEnabled,
      manualInventoryEnabled: contract.manualInventoryEnabled,
    });
    return contract;
  }

  searchHotels(request: UttSearchRequest, supplierOffers: UttSupplierOffer[]): UttAggregatedOffer[] {
    assertIsoDate(request.checkIn, "checkIn");
    assertIsoDate(request.checkOut, "checkOut");

    const filtered = supplierOffers.filter((offer) => {
      const withinBudget = request.filters.maxBudget ? offer.baseRate + offer.taxes <= request.filters.maxBudget : true;
      return offer.availableRooms >= request.rooms && withinBudget;
    });

    const grouped = new Map<string, UttSupplierOffer[]>();
    for (const offer of filtered) {
      const key = `${offer.hotelName}:${offer.roomType}`;
      const existing = grouped.get(key) ?? [];
      existing.push(offer);
      grouped.set(key, existing);
    }

    const results: UttAggregatedOffer[] = [];
    for (const [key, offers] of grouped.entries()) {
      const sorted = [...offers].sort((a, b) => a.baseRate + a.taxes - (b.baseRate + b.taxes));
      const cheapest = sorted[0];
      const totalCost = cheapest.baseRate + cheapest.taxes;
      const marginAmount = (totalCost * request.targetMarginPct) / 100;
      const sellRate = Number((totalCost + marginAmount).toFixed(2));

      const aggregated: UttAggregatedOffer = {
        offerId: nextId("UTT-OFFER", this.sequence++),
        canonicalHotelId: key,
        hotelName: cheapest.hotelName,
        bestSupplier: cheapest.supplier,
        comparedSuppliers: sorted.map((offer) => offer.supplier),
        totalCost,
        sellRate,
        marginAmount: Number(marginAmount.toFixed(2)),
        marginPct: request.targetMarginPct,
        roomsAvailable: Math.min(...sorted.map((offer) => offer.availableRooms)),
        tags: [cheapest.cancellable ? "cancellable" : "non_cancellable", request.cityCode],
      };

      this.aggregatedOffers.set(aggregated.offerId, aggregated);
      results.push(aggregated);
    }

    this.telemetry(request.tenantId, "booking_log", {
      type: "search_completed",
      searchId: request.searchId,
      comparedOffers: supplierOffers.length,
      aggregatedHotels: results.length,
    });

    return results;
  }

  createDynamicItinerary(input: UttItineraryRequest): UttItineraryQuote {
    const roomBreakdown = input.rooms.map((room) => {
      const offer = this.aggregatedOffers.get(room.selectedOfferId);
      if (!offer) {
        throw new Error(`Offer not found for room ${room.roomId}`);
      }

      const adultAmount = offer.sellRate * room.adults * input.nights;
      const cwbChildren = room.childAges.filter(
        (age) => age >= input.childPolicy.cwbAgeRange[0] && age <= input.childPolicy.cwbAgeRange[1],
      ).length;
      const cnbChildren = room.childAges.filter(
        (age) => age >= input.childPolicy.cnbAgeRange[0] && age <= input.childPolicy.cnbAgeRange[1],
      ).length;

      const childCwbAmount = offer.sellRate * cwbChildren * input.nights * ((100 - input.childPolicy.cwbDiscountPct) / 100);
      const childCnbAmount = offer.sellRate * cnbChildren * input.nights * ((100 - input.childPolicy.cnbDiscountPct) / 100);
      const total = Number((adultAmount + childCwbAmount + childCnbAmount).toFixed(2));

      return {
        roomId: room.roomId,
        adultAmount: Number(adultAmount.toFixed(2)),
        childCwbAmount: Number(childCwbAmount.toFixed(2)),
        childCnbAmount: Number(childCnbAmount.toFixed(2)),
        total,
      };
    });

    const addOnTotal = Number(input.addOns.reduce((sum, addOn) => sum + addOn.amount, 0).toFixed(2));
    const grossTotal = Number((roomBreakdown.reduce((sum, room) => sum + room.total, 0) + addOnTotal).toFixed(2));
    const totalPax = input.rooms.reduce((sum, room) => sum + room.adults + room.childAges.length, 0);

    const quote: UttItineraryQuote = {
      itineraryId: input.itineraryId,
      customerId: input.customerId,
      nightCount: input.nights,
      roomBreakdown,
      addOnTotal,
      grossTotal,
      perPersonAmount: Number((grossTotal / Math.max(totalPax, 1)).toFixed(2)),
      perFamilyAmount: grossTotal,
      pdfReadyPayload: {
        itineraryId: input.itineraryId,
        customerId: input.customerId,
        rooms: roomBreakdown,
        addOns: input.addOns,
        totals: {
          grossTotal,
          perPersonAmount: Number((grossTotal / Math.max(totalPax, 1)).toFixed(2)),
        },
      },
    };

    this.itineraries.set(input.itineraryId, quote);
    this.telemetry(input.tenantId, "booking_log", {
      type: "itinerary_generated",
      itineraryId: input.itineraryId,
      grossTotal,
      roomCount: input.rooms.length,
    });

    return quote;
  }

  executeBookingLifecycle(input: {
    tenantId: string;
    bookingId: string;
    itineraryId: string;
    customerId: string;
    holdMinutes: number;
    paymentRef: string;
  }): UttBooking {
    const quote = this.itineraries.get(input.itineraryId);
    if (!quote) {
      throw new Error(`Itinerary ${input.itineraryId} not found`);
    }

    const holdExpiresAt = new Date(Date.now() + input.holdMinutes * 60_000).toISOString();
    const booking: UttBooking = {
      tenantId: input.tenantId,
      bookingId: input.bookingId,
      itineraryId: input.itineraryId,
      customerId: input.customerId,
      status: "held",
      stage: "HOLD",
      holdExpiresAt,
    };

    booking.stage = "CONFIRM";
    booking.status = "confirmed";
    booking.stage = "PAYMENT";
    booking.status = "paid";
    booking.paymentRef = input.paymentRef;
    booking.stage = "VOUCHER";
    booking.status = "voucher_issued";
    booking.voucherRef = `VCH-${input.bookingId}`;

    this.bookings.set(booking.bookingId, booking);
    this.telemetry(input.tenantId, "booking_log", {
      type: "booking_lifecycle_completed",
      bookingId: booking.bookingId,
      stages: ["SEARCH", "SELECT", "HOLD", "CONFIRM", "PAYMENT", "VOUCHER"],
      holdExpiresAt,
    });

    return booking;
  }

  checkAndExpireHoldBookings(nowIso: string): UttBooking[] {
    const now = new Date(nowIso).getTime();
    const expired: UttBooking[] = [];

    for (const booking of this.bookings.values()) {
      if (booking.status !== "held" || !booking.holdExpiresAt) {
        continue;
      }

      if (new Date(booking.holdExpiresAt).getTime() <= now) {
        booking.status = "expired";
        expired.push(booking);
        this.telemetry(booking.tenantId, "booking_log", {
          type: "booking_expired",
          bookingId: booking.bookingId,
          holdExpiresAt: booking.holdExpiresAt,
        });
      }
    }

    return expired;
  }

  createLeadAndConvertToBooking(input: {
    tenantId: string;
    leadId: string;
    customerId: string;
    sourceLayer: UttCustomerLayer;
    bookingId: string;
  }): LeadRecord {
    const record: LeadRecord = {
      tenantId: input.tenantId,
      leadId: input.leadId,
      customerId: input.customerId,
      sourceLayer: input.sourceLayer,
      status: "converted",
      bookingId: input.bookingId,
    };
    this.leads.set(record.leadId, record);

    this.audit(input.tenantId, "CRM_ENGINE", "crm.lead_to_booking", "info", {
      leadId: input.leadId,
      customerId: input.customerId,
      bookingId: input.bookingId,
    });

    return record;
  }

  generateInvoice(input: {
    tenantId: string;
    invoiceId: string;
    bookingId: string;
    costAmount: number;
    sellAmount: number;
    gstPct: number;
  }): InvoiceRecord {
    const gstAmount = Number(((input.sellAmount * input.gstPct) / 100).toFixed(2));
    const subtotal = Number((input.sellAmount + gstAmount).toFixed(2));
    const marginAmount = Number((input.sellAmount - input.costAmount).toFixed(2));

    const invoice: InvoiceRecord = {
      tenantId: input.tenantId,
      invoiceId: input.invoiceId,
      bookingId: input.bookingId,
      subtotal,
      gstAmount,
      costAmount: input.costAmount,
      sellAmount: input.sellAmount,
      marginAmount,
      paymentStatus: "pending",
    };

    this.invoices.set(invoice.invoiceId, invoice);
    this.telemetry(input.tenantId, "queue_perf", {
      type: "finance_invoice_generated",
      invoiceId: input.invoiceId,
      marginAmount,
      gstAmount,
    });

    return invoice;
  }

  markInvoicePaid(tenantId: string, invoiceId: string): InvoiceRecord {
    const invoice = this.invoices.get(invoiceId);
    if (!invoice || invoice.tenantId !== tenantId) {
      throw new Error("Invoice not found for tenant");
    }
    invoice.paymentStatus = "paid";

    this.audit(tenantId, "FINANCE_ENGINE", "finance.payment_tracked", "info", {
      invoiceId,
      paymentStatus: invoice.paymentStatus,
    });

    return invoice;
  }

  muskiRouteCommand(input: {
    tenantId: string;
    commandId: string;
    module: string;
    workerAi: string;
    intent: string;
  }): { route: string; recommendation: string; escalation: boolean } {
    const escalation = /critical|override|high_risk/i.test(input.intent);
    const recommendation = escalation
      ? "Escalate to COPSPOWER + Admin approval before worker execution"
      : "Proceed with normal UTT worker execution";

    this.audit(input.tenantId, "MUSKI", "muski.command_route", escalation ? "critical" : "info", {
      commandId: input.commandId,
      module: input.module,
      workerAi: input.workerAi,
      escalation,
    });

    return {
      route: `MUSKI -> THE_UTT -> ${input.module} -> ${input.workerAi}`,
      recommendation,
      escalation,
    };
  }

  validateTenantRoleAction(input: {
    tenantId: string;
    userId: string;
    requiredScope: string;
    action: string;
    severity: "info" | "warning" | "critical";
  }): { allowed: boolean; reason: string } {
    const user = this.users.get(input.userId);
    if (!user || user.tenantId !== input.tenantId) {
      this.audit(input.tenantId, input.userId, "governance.role_validation", "critical", {
        action: input.action,
        allowed: false,
        reason: "tenant_scope_violation",
      });
      return { allowed: false, reason: "tenant_scope_violation" };
    }

    const allowed = user.permissionScopes.includes(input.requiredScope);
    const reason = allowed ? "allowed" : "missing_permission_scope";

    this.audit(input.tenantId, input.userId, "governance.role_validation", input.severity, {
      action: input.action,
      requiredScope: input.requiredScope,
      allowed,
      reason,
    });

    return { allowed, reason };
  }

  pushQueueMetric(tenantId: string, queueDepth: number): void {
    this.queueDepthByTenant.set(tenantId, queueDepth);
    this.telemetry(tenantId, "queue_perf", {
      queueDepth,
      healthy: queueDepth < 1000,
    });
  }

  getReadinessSnapshot(tenantId: string): Record<string, unknown> {
    const supplierCount = [...this.supplierContracts.values()].filter((item) => item.tenantId === tenantId).length;
    const bookingCount = [...this.bookings.values()].filter((item) => item.tenantId === tenantId).length;
    const invoiceCount = [...this.invoices.values()].filter((item) => item.tenantId === tenantId).length;

    return {
      tenantIsolation: "active",
      roleValidation: "active",
      supplierContracts: supplierCount,
      bookings: bookingCount,
      invoices: invoiceCount,
      telemetrySignals: this.telemetrySignals.filter((item) => item.tenantId === tenantId).length,
      auditEvents: this.auditTrail.filter((item) => item.tenantId === tenantId).length,
      queueDepth: this.queueDepthByTenant.get(tenantId) ?? 0,
      commandFlow: "MUSKI -> THE_UTT -> Module -> Worker AI",
    };
  }

  getAuditTrail(tenantId: string): AuditEvent[] {
    return this.auditTrail.filter((item) => item.tenantId === tenantId);
  }

  getTelemetrySignals(tenantId: string): TelemetrySignal[] {
    return this.telemetrySignals.filter((item) => item.tenantId === tenantId);
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
