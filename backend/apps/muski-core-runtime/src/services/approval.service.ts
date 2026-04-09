export type ApprovalStatus = "pending" | "approved" | "rejected";

export interface ApprovalRequest {
  id: string;
  taskId: string;
  requestedBy: string;
  status: ApprovalStatus;
  createdAt: string;
  decidedAt?: string;
  decidedBy?: string;
}

export class ApprovalService {
  private approvals: ApprovalRequest[] = [];

  requestApproval(taskId: string, requestedBy: string): ApprovalRequest {
    const approval: ApprovalRequest = {
      id: crypto.randomUUID(),
      taskId,
      requestedBy,
      status: "pending",
      createdAt: new Date().toISOString(),
    };

    this.approvals.push(approval);
    return approval;
  }

  approve(id: string, decidedBy: string): ApprovalRequest | undefined {
    const approval = this.approvals.find((a) => a.id === id);
    if (!approval) return;

    approval.status = "approved";
    approval.decidedAt = new Date().toISOString();
    approval.decidedBy = decidedBy;

    return approval;
  }

  reject(id: string, decidedBy: string): ApprovalRequest | undefined {
    const approval = this.approvals.find((a) => a.id === id);
    if (!approval) return;

    approval.status = "rejected";
    approval.decidedAt = new Date().toISOString();
    approval.decidedBy = decidedBy;

    return approval;
  }

  getAll(): ApprovalRequest[] {
    return this.approvals;
  }
}