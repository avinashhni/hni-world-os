export type ApprovalStatus = "pending" | "approved" | "rejected";

export interface ApprovalRequest {
  id: string;
  taskId: string;
  tenantId: string;
  requestedBy: string;
  status: ApprovalStatus;
  createdAt: string;
  decidedAt?: string;
  decidedBy?: string;
}

export class ApprovalService {
  private approvals: ApprovalRequest[] = [];

  requestApproval(taskId: string, requestedBy: string, tenantId: string): ApprovalRequest {
    const approval: ApprovalRequest = {
      id: crypto.randomUUID(),
      taskId,
      tenantId,
      requestedBy,
      status: "pending",
      createdAt: new Date().toISOString(),
    };

    this.approvals.push(approval);
    return approval;
  }

  approve(id: string, decidedBy: string, tenantId: string): ApprovalRequest | undefined {
    const approval = this.approvals.find((a) => a.id === id && a.tenantId === tenantId);
    if (!approval) return;

    approval.status = "approved";
    approval.decidedAt = new Date().toISOString();
    approval.decidedBy = decidedBy;

    return approval;
  }

  reject(id: string, decidedBy: string, tenantId: string): ApprovalRequest | undefined {
    const approval = this.approvals.find((a) => a.id === id && a.tenantId === tenantId);
    if (!approval) return;

    approval.status = "rejected";
    approval.decidedAt = new Date().toISOString();
    approval.decidedBy = decidedBy;

    return approval;
  }

  getAll(): ApprovalRequest[] {
    return this.approvals;
  }

  getAllByTenant(tenantId: string): ApprovalRequest[] {
    return this.approvals.filter((approval) => approval.tenantId === tenantId);
  }
}
