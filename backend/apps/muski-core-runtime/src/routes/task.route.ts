import { TaskIntakeService } from "../services/task-intake.service";
import { ValidationService } from "../services/validation.service";
import { AuditSystemService } from "../services/audit-system.service";
import { SecurityContext, SecurityLayerService } from "../services/security-layer.service";

export function createTaskRoute(
  taskIntake: TaskIntakeService,
  validation: ValidationService,
  security: SecurityLayerService,
  audit: AuditSystemService,
) {
  return (payload: {
    title: string;
    description: string;
    priority: "low" | "medium" | "high" | "critical";
    requestedBy: string;
    targetAgent?: string;
    tenantId: string;
    context: SecurityContext;
  }) => {
    const validationResult = validation.validateTask(payload);

    if (!validationResult.valid) {
      audit.record(payload.context, "task:create", "failure", { errors: validationResult.errors });
      return {
        success: false,
        errors: validationResult.errors,
      };
    }

    try {
      security.assertAuthorized(payload.context, "task:create", payload.tenantId);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unauthorized execution blocked.";
      audit.record(payload.context, "security:blocked", "denied", { action: "task:create", reason });
      return {
        success: false,
        errors: [reason],
      };
    }

    const task = taskIntake.createTask({
      title: payload.title,
      description: payload.description,
      priority: payload.priority,
      requestedBy: payload.requestedBy,
      targetAgent: payload.targetAgent,
      tenantId: payload.tenantId,
    });
    audit.record(payload.context, "task:create", "success", { taskId: task.id, targetAgent: task.targetAgent });

    return {
      success: true,
      task,
    };
  };
}
