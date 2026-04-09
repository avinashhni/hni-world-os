import { AgentRegistryService } from "./agent-registry.service";
import { TaskInput } from "./task-intake.service";

export interface TaskDispatchResult {
  taskId: string;
  assignedAgent: string | null;
  dispatchedAt: string;
  status: "assigned" | "unassigned";
}

export class TaskDispatcherService {
  constructor(private readonly agentRegistry: AgentRegistryService) {}

  dispatch(task: TaskInput): TaskDispatchResult {
    const activeAgents = this.agentRegistry.getActiveAgents();

    const selectedAgent =
      task.targetAgent
        ? this.agentRegistry.getAgentByCode(task.targetAgent)
        : activeAgents[0];

    return {
      taskId: task.id,
      assignedAgent: selectedAgent?.code ?? null,
      dispatchedAt: new Date().toISOString(),
      status: selectedAgent ? "assigned" : "unassigned",
    };
  }
}