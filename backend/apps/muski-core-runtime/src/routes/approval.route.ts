import { ApprovalService } from "../services/approval.service";
import { AuditSystemService } from "../services/audit-system.service";
import { GovernanceControlsService } from "../services/governance-controls.service";
import { SecurityContext, SecurityLayerService } from "../services/security-layer.service";

export function createApprovalRoute(
  approvalService: ApprovalService,
  governance: GovernanceControlsService,
  security: SecurityLayerService,
  audit: AuditSystemService,
) {
  return {
    request(taskId: string, context: SecurityContext, requiredApprovals = 1) {
      security.assertAuthorized(context, "approval:request", context.tenantId);
      const approval = approvalService.requestApproval(taskId, context.actorId, context.tenantId);
      const flow = governance.startApprovalFlow(taskId, context, requiredApprovals);

      audit.record(context, "approval:request", "success", {
        taskId,
        approvalId: approval.id,
        flowId: flow.id,
      });

      return { approval, flow };
    },

    approve(id: string, context: SecurityContext, flowId: string) {
      security.assertAuthorized(context, "approval:decide", context.tenantId);
      const approval = approvalService.approve(id, context.actorId, context.tenantId);
      const flow = governance.approve(flowId, context);

      if (!approval || !flow) {
        audit.record(context, "approval:decide", "failure", {
          approvalId: id,
          flowId,
          reason: "Approval or governance flow not found",
        });

        return undefined;
      }

      audit.record(context, "approval:decide", "success", {
        approvalId: id,
        flowId,
        flowStatus: flow.status,
      });

      return { approval, flow };
    },

    reject(id: string, context: SecurityContext, flowId: string, reason: string) {
      security.assertAuthorized(context, "approval:decide", context.tenantId);
      const approval = approvalService.reject(id, context.actorId, context.tenantId);
      const flow = governance.reject(flowId, context, reason);

      if (!approval || !flow) {
        audit.record(context, "approval:decide", "failure", {
          approvalId: id,
          flowId,
          reason: "Approval or governance flow not found",
        });

        return undefined;
      }

      audit.record(context, "approval:decide", "success", {
        approvalId: id,
        flowId,
        reason,
        flowStatus: flow.status,
      });

      return { approval, flow };
    },

    escalate(context: SecurityContext) {
      security.assertAuthorized(context, "governance:escalate", context.tenantId);
      const escalatedFlows = governance.escalatePending();
      audit.record(context, "governance:escalate", "success", {
        escalatedCount: escalatedFlows.length,
      });

      return escalatedFlows;
    },

    list(tenantId: string, context: SecurityContext) {
      security.assertAuthorized(context, "audit:read", tenantId);
      return {
        approvals: approvalService.getAllByTenant(tenantId),
        governanceFlows: governance.getApprovalFlowsByTenant(tenantId),
      };
    },
  };
}
