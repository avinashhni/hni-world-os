export interface TaskInput {
  id: string;
  title: string;
  description: string;
  priority: "low" | "medium" | "high" | "critical";
  requestedBy: string;
  tenantId: string;
  createdAt: string;
  targetAgent?: string;
}

export class TaskIntakeService {
  private tasks: TaskInput[] = [];

  createTask(input: Omit<TaskInput, "id" | "createdAt">): TaskInput {
    const task: TaskInput = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      ...input,
    };

    this.tasks.push(task);
    return task;
  }

  getAllTasks(): TaskInput[] {
    return this.tasks;
  }

  getAllTasksByTenant(tenantId: string): TaskInput[] {
    return this.tasks.filter((task) => task.tenantId === tenantId);
  }

  getTaskById(id: string): TaskInput | undefined {
    return this.tasks.find((task) => task.id === id);
  }
}
