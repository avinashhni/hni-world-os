import { SecurityContext } from "./security-layer.service";
import { AuditSystemService } from "./audit-system.service";

export type GovernanceStatus = "pending" | "approved" | "rejected" | "escalated";

export interface GovernanceApprovalFlow {
  id: string;
  taskId: string;
  tenantId: string;
  requestedBy: string;
  requiredApprovals: number;
  approvedBy: string[];
  status: GovernanceStatus;
  escalationLevel: number;
  createdAt: string;
  updatedAt: string;
}

const ESCALATION_SLA_MINUTES = 30;

export class GovernanceControlsService {
  private approvalFlows: GovernanceApprovalFlow[] = [];

  constructor(private readonly audit: AuditSystemService) {}

  startApprovalFlow(taskId: string, context: SecurityContext, requiredApprovals = 1): GovernanceApprovalFlow {
    const now = new Date().toISOString();

    const flow: GovernanceApprovalFlow = {
      id: crypto.randomUUID(),
      taskId,
      tenantId: context.tenantId,
      requestedBy: context.actorId,
      requiredApprovals,
      approvedBy: [],
      status: "pending",
      escalationLevel: 0,
      createdAt: now,
      updatedAt: now,
    };

    this.approvalFlows.push(flow);
    this.audit.record(context, "approval:request", "success", {
      flowId: flow.id,
      taskId,
      requiredApprovals,
    });

    return flow;
  }

  approve(flowId: string, context: SecurityContext): GovernanceApprovalFlow | undefined {
    const flow = this.approvalFlows.find((item) => item.id === flowId && item.tenantId === context.tenantId);
    if (!flow || flow.status === "rejected") {
      return;
    }

    if (!flow.approvedBy.includes(context.actorId)) {
      flow.approvedBy.push(context.actorId);
    }

    flow.updatedAt = new Date().toISOString();
    flow.status = flow.approvedBy.length >= flow.requiredApprovals ? "approved" : "pending";

    this.audit.record(context, "governance:approve", "success", {
      flowId,
      approvals: flow.approvedBy.length,
      requiredApprovals: flow.requiredApprovals,
      status: flow.status,
    });

    return flow;
  }

  reject(flowId: string, context: SecurityContext, reason: string): GovernanceApprovalFlow | undefined {
    const flow = this.approvalFlows.find((item) => item.id === flowId && item.tenantId === context.tenantId);
    if (!flow) {
      return;
    }

    flow.status = "rejected";
    flow.updatedAt = new Date().toISOString();

    this.audit.record(context, "approval:decide", "failure", { flowId, reason });
    return flow;
  }

  escalatePending(referenceDate = new Date()): GovernanceApprovalFlow[] {
    const escalated: GovernanceApprovalFlow[] = [];

    for (const flow of this.approvalFlows) {
      if (flow.status !== "pending") {
        continue;
      }

      const elapsedMinutes =
        (referenceDate.getTime() - new Date(flow.updatedAt).getTime()) /
        (1000 * 60);

      if (elapsedMinutes >= ESCALATION_SLA_MINUTES) {
        flow.status = "escalated";
        flow.escalationLevel += 1;
        flow.updatedAt = new Date().toISOString();
        escalated.push(flow);

        this.audit.record(
          {
            actorId: "SYSTEM_ESCALATION",
            role: "MUSKI_MASTER",
            tenantId: flow.tenantId,
          },
          "approval:escalated",
          "success",
          {
            flowId: flow.id,
            escalationLevel: flow.escalationLevel,
            elapsedMinutes,
          },
        );
      }
    }

    return escalated;
  }

  getApprovalFlowsByTenant(tenantId: string): GovernanceApprovalFlow[] {
    return this.approvalFlows.filter((flow) => flow.tenantId === tenantId);
  }
}
