export type BusinessModuleCode =
  | "core_intelligence"
  | "travel"
  | "legalnomics"
  | "edunomics"
  | "doctornomics"
  | "sobbo"
  | "crm"
  | "finance_waai";

export type BusinessActionStatus = "completed" | "blocked";

export interface BusinessActionRequest {
  module: BusinessModuleCode;
  workflow: string;
  action: string;
  payload: Record<string, unknown>;
}

export interface BusinessActionResult {
  module: BusinessModuleCode;
  workflow: string;
  action: string;
  status: BusinessActionStatus;
  executedAt: string;
  outcome: string;
  stateChanges: Record<string, unknown>;
}

interface IdentityRecord {
  globalCustomerId: string;
  sourceSystem: string;
  sourceCustomerId: string;
  email: string;
  phone: string;
}

interface ActivityEvent {
  globalCustomerId: string;
  sourceSystem: string;
  eventType: string;
  eventAt: string;
  metadata: Record<string, unknown>;
}

type ActionHandler = (payload: Record<string, unknown>) => BusinessActionResult;

function ensureString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Missing ${field}`);
  }
  return value;
}

function success(
  module: BusinessModuleCode,
  workflow: string,
  action: string,
  outcome: string,
  stateChanges: Record<string, unknown>,
): BusinessActionResult {
  return {
    module,
    workflow,
    action,
    status: "completed",
    executedAt: new Date().toISOString(),
    outcome,
    stateChanges,
  };
}

export class BusinessEngineService {
  private readonly unifiedIdentityBySource = new Map<string, IdentityRecord>();
  private readonly unifiedIdentityByGlobalId = new Map<string, IdentityRecord>();
  private readonly crossOsActivityStream: ActivityEvent[] = [];

  private readonly handlers: Record<string, ActionHandler> = {
    "core_intelligence.unified_crm_profile": (payload) => {
      const sourceSystem = ensureString(payload.sourceSystem, "sourceSystem");
      const sourceCustomerId = ensureString(payload.sourceCustomerId, "sourceCustomerId");
      const globalCustomerId = ensureString(payload.globalCustomerId, "globalCustomerId");
      const email = ensureString(payload.email, "email");
      const phone = ensureString(payload.phone, "phone");

      const sourceKey = `${sourceSystem}:${sourceCustomerId}`;
      const existingByGlobalId = this.unifiedIdentityByGlobalId.get(globalCustomerId);
      if (
        existingByGlobalId &&
        (existingByGlobalId.email !== email || existingByGlobalId.phone !== phone)
      ) {
        throw new Error("Identity conflict detected for globalCustomerId");
      }

      const record: IdentityRecord = {
        globalCustomerId,
        sourceSystem,
        sourceCustomerId,
        email,
        phone,
      };

      this.unifiedIdentityBySource.set(sourceKey, record);
      this.unifiedIdentityByGlobalId.set(globalCustomerId, record);

      return success("core_intelligence", "unified_crm_profile", "upsert_customer_identity", "Unified CRM identity synchronized", {
        sourceSystem,
        sourceCustomerId,
        globalCustomerId,
        identityScope: "one_customer_one_identity",
      });
    },
    "core_intelligence.cross_os_activity": (payload) => {
      const globalCustomerId = ensureString(payload.globalCustomerId, "globalCustomerId");
      const sourceSystem = ensureString(payload.sourceSystem, "sourceSystem");
      const eventType = ensureString(payload.eventType, "eventType");
      const eventAt = ensureString(payload.eventAt, "eventAt");

      const event: ActivityEvent = {
        globalCustomerId,
        sourceSystem,
        eventType,
        eventAt,
        metadata: (payload.metadata as Record<string, unknown>) ?? {},
      };
      this.crossOsActivityStream.push(event);

      return success("core_intelligence", "cross_os_activity", "track_activity_event", "Cross-OS customer activity tracked", {
        globalCustomerId,
        sourceSystem,
        eventType,
        trackedEvents: this.crossOsActivityStream.length,
      });
    },
    "core_intelligence.analytics_notifications_tasks": (payload) => {
      const globalCustomerId = ensureString(payload.globalCustomerId, "globalCustomerId");
      const priority = ensureString(payload.priority, "priority");
      const targetSystems = Array.isArray(payload.targetSystems) ? payload.targetSystems : [];

      return success("core_intelligence", "analytics_notifications_tasks", "run_intelligence_pipeline", "Global analytics pipeline, notifications, and unified tasks executed", {
        globalCustomerId,
        priority,
        analyticsSnapshotId: `ANL-${globalCustomerId}`,
        notificationFanout: targetSystems.length,
        unifiedTaskQueue: "global_customer_task_engine",
      });
    },
    "core_intelligence.cross_os_connections": (payload) => {
      const crmRecordId = ensureString(payload.crmRecordId, "crmRecordId");
      const connectors = Array.isArray(payload.connectors) ? payload.connectors.map(String) : [];
      const requiredConnectors = ["LEGALNOMICS", "EDUNOMICS", "AIRNOMICS", "DOCTORNOMICS", "SOBBO"];
      const missing = requiredConnectors.filter((connector) => !connectors.includes(connector));
      if (missing.length > 0) {
        throw new Error(`Missing required connectors: ${missing.join(", ")}`);
      }

      return success("core_intelligence", "cross_os_connections", "sync_cross_os_connections", "Cross-OS module to CRM connections synchronized", {
        crmRecordId,
        connectors,
        connectedSystems: connectors.length,
      });
    },
    "travel.fare_selection": (payload) => {
      const tripId = ensureString(payload.tripId, "tripId");
      const fareClass = ensureString(payload.fareClass, "fareClass");
      const supplier = ensureString(payload.supplier, "supplier");
      return success("travel", "fare_selection", "select_fare", "Fare locked and priced", {
        tripId,
        fareClass,
        supplier,
        status: "fare_selected",
      });
    },
    "travel.booking_ticket_refund": (payload) => {
      const bookingId = ensureString(payload.bookingId, "bookingId");
      const stage = ensureString(payload.stage, "stage");
      return success("travel", "booking_ticket_refund", "advance_booking", `Travel flow moved to ${stage}`, {
        bookingId,
        stage,
      });
    },
    "travel.pnr_lifecycle": (payload) => {
      const pnr = ensureString(payload.pnr, "pnr");
      const event = ensureString(payload.event, "event");
      return success("travel", "pnr_lifecycle", "update_pnr", "PNR lifecycle event recorded", {
        pnr,
        event,
      });
    },
    "legalnomics.case_execution": (payload) => {
      const caseId = ensureString(payload.caseId, "caseId");
      const stage = ensureString(payload.stage, "stage");
      return success("legalnomics", "case_execution", "execute_case_stage", "Case stage executed", {
        caseId,
        stage,
      });
    },
    "legalnomics.hearing_schedule": (payload) => {
      const caseId = ensureString(payload.caseId, "caseId");
      const hearingAt = ensureString(payload.hearingAt, "hearingAt");
      return success("legalnomics", "hearing_schedule", "schedule_hearing", "Hearing scheduled", {
        caseId,
        hearingAt,
      });
    },
    "legalnomics.verdict_appeal": (payload) => {
      const caseId = ensureString(payload.caseId, "caseId");
      const verdict = ensureString(payload.verdict, "verdict");
      const appealWindowDays = Number(payload.appealWindowDays ?? 0);
      return success("legalnomics", "verdict_appeal", "publish_verdict", "Verdict published with appeal logic", {
        caseId,
        verdict,
        appealWindowDays,
      });
    },
    "edunomics.student_matching": (payload) => {
      const studentId = ensureString(payload.studentId, "studentId");
      const programId = ensureString(payload.programId, "programId");
      return success("edunomics", "student_matching", "match_student", "Student matched to program", {
        studentId,
        programId,
      });
    },
    "edunomics.application_visa_counselor": (payload) => {
      const applicationId = ensureString(payload.applicationId, "applicationId");
      const visaStatus = ensureString(payload.visaStatus, "visaStatus");
      const counselorId = ensureString(payload.counselorId, "counselorId");
      return success("edunomics", "application_visa_counselor", "advance_application", "Application, visa, and counselor flow updated", {
        applicationId,
        visaStatus,
        counselorId,
      });
    },
    "doctornomics.patient_journey": (payload) => {
      const patientId = ensureString(payload.patientId, "patientId");
      const journeyStage = ensureString(payload.journeyStage, "journeyStage");
      return success("doctornomics", "patient_journey", "update_patient_journey", "Patient journey stage executed", {
        patientId,
        journeyStage,
      });
    },
    "doctornomics.treatment_hospital_pricing": (payload) => {
      const patientId = ensureString(payload.patientId, "patientId");
      const hospitalId = ensureString(payload.hospitalId, "hospitalId");
      const treatmentCode = ensureString(payload.treatmentCode, "treatmentCode");
      const price = Number(payload.price ?? 0);
      return success("doctornomics", "treatment_hospital_pricing", "book_treatment", "Treatment booked with hospital assignment and pricing", {
        patientId,
        hospitalId,
        treatmentCode,
        price,
      });
    },
    "sobbo.merchant_onboarding": (payload) => {
      const merchantId = ensureString(payload.merchantId, "merchantId");
      const kycStatus = ensureString(payload.kycStatus, "kycStatus");
      return success("sobbo", "merchant_onboarding", "onboard_merchant", "Merchant onboarding executed", {
        merchantId,
        kycStatus,
      });
    },
    "sobbo.product_order_delivery": (payload) => {
      const merchantId = ensureString(payload.merchantId, "merchantId");
      const orderId = ensureString(payload.orderId, "orderId");
      const deliveryStatus = ensureString(payload.deliveryStatus, "deliveryStatus");
      return success("sobbo", "product_order_delivery", "execute_order_flow", "Product listing to delivery flow executed", {
        merchantId,
        orderId,
        deliveryStatus,
      });
    },
    "crm.lead_followup_journey": (payload) => {
      const leadId = ensureString(payload.leadId, "leadId");
      const ownerId = ensureString(payload.ownerId, "ownerId");
      const nextActionAt = ensureString(payload.nextActionAt, "nextActionAt");
      return success("crm", "lead_followup_journey", "route_lead", "Lead routing and follow-up automation executed", {
        leadId,
        ownerId,
        nextActionAt,
      });
    },
    "finance_waai.invoice_ledger_profit_gst": (payload) => {
      const invoiceId = ensureString(payload.invoiceId, "invoiceId");
      const ledgerId = ensureString(payload.ledgerId, "ledgerId");
      const gstStatus = ensureString(payload.gstStatus, "gstStatus");
      const profit = Number(payload.profit ?? 0);
      return success("finance_waai", "invoice_ledger_profit_gst", "post_invoice", "Invoice, ledger, GST, and profit execution complete", {
        invoiceId,
        ledgerId,
        gstStatus,
        profit,
      });
    },
  };

  execute(request: BusinessActionRequest): BusinessActionResult {
    const key = `${request.module}.${request.workflow}`;
    const handler = this.handlers[key];
    if (!handler) {
      return {
        module: request.module,
        workflow: request.workflow,
        action: request.action,
        status: "blocked",
        executedAt: new Date().toISOString(),
        outcome: `No registered execution handler for ${key}`,
        stateChanges: {},
      };
    }

    return handler(request.payload);
  }

  getRegisteredWorkflows(): string[] {
    return Object.keys(this.handlers).sort();
  }

  getUnifiedIdentityCount(): number {
    return this.unifiedIdentityByGlobalId.size;
  }

  getCrossOsActivityCount(): number {
    return this.crossOsActivityStream.length;
  }
}
