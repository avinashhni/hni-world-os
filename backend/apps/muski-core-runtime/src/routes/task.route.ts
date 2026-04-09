import { TaskIntakeService } from "../services/task-intake.service";
import { ValidationService } from "../services/validation.service";

export function createTaskRoute(
  taskIntake: TaskIntakeService,
  validation: ValidationService
) {
  return (payload: {
    title: string;
    description: string;
    priority: "low" | "medium" | "high";
    requestedBy: string;
    targetAgent?: string;
  }) => {
    const validationResult = validation.validateTask(payload);

    if (!validationResult.valid) {
      return {
        success: false,
        errors: validationResult.errors,
      };
    }

    const task = taskIntake.createTask(payload);

    return {
      success: true,
      task,
    };
  };
}