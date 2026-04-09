import { ApprovalService } from "../services/approval.service";

export function createApprovalRoute(approvalService: ApprovalService) {
  return {
    request(taskId: string, requestedBy: string) {
      return approvalService.requestApproval(taskId, requestedBy);
    },

    approve(id: string, decidedBy: string) {
      return approvalService.approve(id, decidedBy);
    },

    reject(id: string, decidedBy: string) {
      return approvalService.reject(id, decidedBy);
    },

    list() {
      return approvalService.getAll();
    },
  };
}