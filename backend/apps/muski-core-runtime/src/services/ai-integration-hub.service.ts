import { AiDomain } from "./ai-decision-engine.service";
import { WorkflowTrigger } from "./ai-workflow-trigger.service";

export interface DomainStateChange {
  domain: AiDomain;
  recordId: string;
  status: "updated";
  updatedAt: string;
  snapshot: Record<string, unknown>;
}

export class AiIntegrationHubService {
  private readonly crmStore = new Map<string, Record<string, unknown>>();
  private readonly bookingStore = new Map<string, Record<string, unknown>>();
  private readonly financeStore = new Map<string, Record<string, unknown>>();
  private readonly legalStore = new Map<string, Record<string, unknown>>();
  private readonly educationStore = new Map<string, Record<string, unknown>>();

  execute(trigger: WorkflowTrigger): DomainStateChange {
    const recordId = this.resolveRecordId(trigger.domain, trigger.payload);
    const payload = {
      ...trigger.payload,
      workflow: trigger.workflow,
      action: trigger.action,
      lastExecutionAt: new Date().toISOString(),
    };

    this.resolveStore(trigger.domain).set(recordId, payload);

    return {
      domain: trigger.domain,
      recordId,
      status: "updated",
      updatedAt: new Date().toISOString(),
      snapshot: payload,
    };
  }

  getDomainCount(domain: AiDomain): number {
    return this.resolveStore(domain).size;
  }

  private resolveRecordId(domain: AiDomain, payload: Record<string, unknown>): string {
    const keyMap: Record<AiDomain, string[]> = {
      crm: ["crmRecordId", "leadId", "customerId"],
      booking: ["bookingId", "tripId", "reservationId"],
      finance: ["invoiceId", "ledgerId", "transactionId"],
      legal: ["caseId", "matterId"],
      education: ["studentId", "applicationId"],
    };

    for (const key of keyMap[domain]) {
      const value = payload[key];
      if (typeof value === "string" && value.trim().length > 0) {
        return value;
      }
    }

    return `${domain.toUpperCase()}-${crypto.randomUUID()}`;
  }

  private resolveStore(domain: AiDomain): Map<string, Record<string, unknown>> {
    if (domain === "crm") return this.crmStore;
    if (domain === "booking") return this.bookingStore;
    if (domain === "finance") return this.financeStore;
    if (domain === "legal") return this.legalStore;
    return this.educationStore;
  }
}
