import { AgentRegistryService } from "./services/agent-registry.service";
import { TaskIntakeService } from "./services/task-intake.service";
import { TaskDispatcherService } from "./services/task-dispatcher.service";
import { ApprovalService } from "./services/approval.service";
import { ValidationService } from "./services/validation.service";
import { ExecutionLoggerService } from "./services/execution-logger.service";
import { healthRoute } from "./routes/health.route";
import { BusinessEngineService } from "./services/business-engine.service";

const agentRegistry = new AgentRegistryService();
const taskIntake = new TaskIntakeService();
const dispatcher = new TaskDispatcherService(agentRegistry);
const approvalService = new ApprovalService();
const validationService = new ValidationService();
const executionLogger = new ExecutionLoggerService();
const businessEngine = new BusinessEngineService();

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

const businessExecutionSamples = [
  businessEngine.execute({
    module: "travel",
    workflow: "fare_selection",
    action: "select_fare",
    payload: { tripId: "TRIP-1001", fareClass: "economy_flex", supplier: "AIRNOMICS_GDS" },
  }),
  businessEngine.execute({
    module: "legalnomics",
    workflow: "case_execution",
    action: "execute_case_stage",
    payload: { caseId: "CASE-8842", stage: "evidence_review" },
  }),
  businessEngine.execute({
    module: "edunomics",
    workflow: "application_visa_counselor",
    action: "advance_application",
    payload: { applicationId: "APP-221", visaStatus: "interview_scheduled", counselorId: "COUN-09" },
  }),
  businessEngine.execute({
    module: "doctornomics",
    workflow: "treatment_hospital_pricing",
    action: "book_treatment",
    payload: { patientId: "PAT-41", hospitalId: "HOSP-AX1", treatmentCode: "CARD-02", price: 84000 },
  }),
  businessEngine.execute({
    module: "sobbo",
    workflow: "product_order_delivery",
    action: "execute_order_flow",
    payload: { merchantId: "MER-77", orderId: "ORD-200", deliveryStatus: "out_for_delivery" },
  }),
  businessEngine.execute({
    module: "crm",
    workflow: "lead_followup_journey",
    action: "route_lead",
    payload: { leadId: "LEAD-845", ownerId: "CRM-31", nextActionAt: "2026-04-15T10:30:00Z" },
  }),
  businessEngine.execute({
    module: "finance_waai",
    workflow: "invoice_ledger_profit_gst",
    action: "post_invoice",
    payload: { invoiceId: "INV-552", ledgerId: "LED-301", gstStatus: "filed", profit: 12000 },
  }),
];

for (const result of businessExecutionSamples) {
  executionLogger.log("business_engine", result.outcome, result);
}

console.log("Business workflows:", businessEngine.getRegisteredWorkflows());
console.log("Logs:", executionLogger.getAll());
console.log("Agents:", agentRegistry.getAllAgents());
console.log("Tasks:", taskIntake.getAllTasks());
