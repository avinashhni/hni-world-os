import { TaskInput } from "./task-intake.service";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export class ValidationService {
  validateTask(task: Partial<TaskInput>): ValidationResult {
    const errors: string[] = [];

    if (!task.title || task.title.trim().length < 3) {
      errors.push("Task title is too short.");
    }

    if (!task.description || task.description.trim().length < 10) {
      errors.push("Task description is too short.");
    }

    if (!task.requestedBy || task.requestedBy.trim().length < 2) {
      errors.push("RequestedBy is required.");
    }

    if (!task.priority) {
      errors.push("Priority is required.");
    }

    if (!task.tenantId || task.tenantId.trim().length < 2) {
      errors.push("TenantId is required.");
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
