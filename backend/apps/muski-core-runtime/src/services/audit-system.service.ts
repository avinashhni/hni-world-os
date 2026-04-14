import { SecurityAction, SecurityContext } from "./security-layer.service";

export interface AuditEvent {
  id: string;
  tenantId: string;
  actorId: string;
  actorRole: string;
  action: SecurityAction | "approval:escalated" | "security:blocked";
  outcome: "allowed" | "denied" | "success" | "failure";
  createdAt: string;
  details?: Record<string, unknown>;
  checksum: string;
  previousChecksum: string;
}

function createChecksum(payload: string): string {
  let hash = 0;
  for (let index = 0; index < payload.length; index += 1) {
    hash = (hash * 31 + payload.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export class AuditSystemService {
  private events: AuditEvent[] = [];

  record(
    context: SecurityContext,
    action: AuditEvent["action"],
    outcome: AuditEvent["outcome"],
    details?: Record<string, unknown>,
  ): AuditEvent {
    const previousChecksum = this.events.at(-1)?.checksum ?? "00000000";
    const createdAt = new Date().toISOString();
    const id = crypto.randomUUID();

    const checksum = createChecksum(
      [id, context.tenantId, context.actorId, context.role, action, outcome, createdAt, previousChecksum].join("|"),
    );

    const event: AuditEvent = {
      id,
      tenantId: context.tenantId,
      actorId: context.actorId,
      actorRole: context.role,
      action,
      outcome,
      createdAt,
      details,
      checksum,
      previousChecksum,
    };

    this.events.push(event);
    return event;
  }

  getAllEvents(): AuditEvent[] {
    return this.events;
  }

  getEventsByTenant(tenantId: string): AuditEvent[] {
    return this.events.filter((event) => event.tenantId === tenantId);
  }
}
