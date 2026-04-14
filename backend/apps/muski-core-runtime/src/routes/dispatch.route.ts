import { TaskDispatcherService } from "../services/task-dispatcher.service";
import { TaskInput } from "../services/task-intake.service";
import { AuditSystemService } from "../services/audit-system.service";
import { SecurityContext, SecurityLayerService } from "../services/security-layer.service";

export function createDispatchRoute(
  dispatcher: TaskDispatcherService,
  security: SecurityLayerService,
  audit: AuditSystemService,
) {
  return (task: TaskInput, context: SecurityContext) => {
    try {
      security.assertAuthorized(context, "task:dispatch", task.tenantId);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unauthorized execution blocked.";
      audit.record(context, "security:blocked", "denied", { action: "task:dispatch", reason });

      return {
        success: false,
        dispatch: null,
        error: reason,
      };
    }

    const result = dispatcher.dispatch(task);
    audit.record(context, "task:dispatch", "success", {
      taskId: task.id,
      assignedAgent: result.assignedAgent,
      status: result.status,
    });

    return {
      success: true,
      dispatch: result,
    };
  };
}
