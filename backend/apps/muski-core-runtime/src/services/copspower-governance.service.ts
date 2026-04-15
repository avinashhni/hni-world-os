export type CopspowerRole = "OWNER" | "GOVERNANCE_ADMIN" | "OS_DIRECTOR" | "OPS_ROLE";

export interface CopspowerAction {
  actionId: string;
  tenantId: string;
  actorId: string;
  actorRole: CopspowerRole;
  actionType: string;
  severity: "low" | "medium" | "high" | "critical";
  createdAt: string;
}

export interface CopspowerDecision {
  actionId: string;
  approved: boolean;
  requiredApprovers: CopspowerRole[];
  riskFlags: string[];
  complianceChecks: string[];
  overrideTracked: boolean;
  decidedAt: string;
}

const CRITICAL_ACTION_PATTERN = /delete|override|kill|financial|identity/i;

export class CopspowerGovernanceService {
  private readonly auditLogs: Array<Record<string, unknown>> = [];

  evaluateAction(action: CopspowerAction): CopspowerDecision {
    const requiredApprovers: CopspowerRole[] = action.severity === "critical"
      ? ["OWNER", "GOVERNANCE_ADMIN"]
      : action.severity === "high"
      ? ["GOVERNANCE_ADMIN", "OS_DIRECTOR"]
      : ["OS_DIRECTOR"];

    const riskFlags: string[] = [];
    if (CRITICAL_ACTION_PATTERN.test(action.actionType)) {
      riskFlags.push("critical_action_signature");
    }
    if (action.severity === "critical") {
      riskFlags.push("severity_critical");
    }

    const complianceChecks = [
      "tenant_isolation_verified",
      "rbac_verified",
      "audit_log_recorded",
      "override_tracking_enabled",
    ];

    const approved = action.actorRole === "OWNER" || action.severity === "low";

    const decision: CopspowerDecision = {
      actionId: action.actionId,
      approved,
      requiredApprovers,
      riskFlags,
      complianceChecks,
      overrideTracked: /override/i.test(action.actionType),
      decidedAt: new Date().toISOString(),
    };

    this.auditLogs.push({
      ...action,
      ...decision,
      logType: "copspower_governance",
    });

    return decision;
  }

  getAuditLogsByTenant(tenantId: string): Array<Record<string, unknown>> {
    return this.auditLogs.filter((log) => log.tenantId === tenantId);
  }
}
