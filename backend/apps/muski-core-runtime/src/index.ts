import { AgentRegistryService } from "./services/agent-registry.service";
import { TaskIntakeService } from "./services/task-intake.service";
import { TaskDispatcherService } from "./services/task-dispatcher.service";
import { ApprovalService } from "./services/approval.service";
import { ValidationService } from "./services/validation.service";
import { ExecutionLoggerService } from "./services/execution-logger.service";
import { healthRoute } from "./routes/health.route";

const agentRegistry = new AgentRegistryService();
const taskIntake = new TaskIntakeService();
const dispatcher = new TaskDispatcherService(agentRegistry);
const approvalService = new ApprovalService();
const validationService = new ValidationService();
const executionLogger = new ExecutionLoggerService();

const health = healthRoute();

console.log("MUSKI CORE RUNTIME BOOTED");
console.log("Health:", health);

const sampleTask = taskIntake.createTask({
  title: "Initialize HNI WORLD OS agent runtime",
  description: "Boot MUSKI runtime and prepare agent orchestration services.",
  priority: "high",
  requestedBy: "OWNER",
  targetAgent: "OPS_MANAGER_AI",
});

const validation = validationService.validateTask(sampleTask);
console.log("Validation:", validation);

const dispatchResult = dispatcher.dispatch(sampleTask);
console.log("Dispatch:", dispatchResult);

const approval = approvalService.requestApproval(sampleTask.id, "OWNER");
console.log("Approval:", approval);

executionLogger.log("task", "Sample task initialized", {
  taskId: sampleTask.id,
  dispatchResult,
  approvalId: approval.id,
});

console.log("Logs:", executionLogger.getAll());
console.log("Agents:", agentRegistry.getAllAgents());
console.log("Tasks:", taskIntake.getAllTasks());