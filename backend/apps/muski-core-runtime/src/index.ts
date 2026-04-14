import { AgentRegistryService } from "./services/agent-registry.service";
import { TaskIntakeService } from "./services/task-intake.service";
import { TaskDispatcherService } from "./services/task-dispatcher.service";
import { ApprovalService } from "./services/approval.service";
import { ValidationService } from "./services/validation.service";
import { ExecutionLoggerService } from "./services/execution-logger.service";
import { healthRoute } from "./routes/health.route";
import { BusinessEngineService } from "./services/business-engine.service";
import { AiDecisionEngineService } from "./services/ai-decision-engine.service";
import { AiWorkflowTriggerService } from "./services/ai-workflow-trigger.service";
import { AiRecommendationService } from "./services/ai-recommendation.service";
import { AiIntegrationHubService } from "./services/ai-integration-hub.service";
import { AiExecutionPipelineService } from "./services/ai-execution-pipeline.service";
import { AuditSystemService } from "./services/audit-system.service";
import { GovernanceControlsService } from "./services/governance-controls.service";
import { SecurityContext, SecurityLayerService } from "./services/security-layer.service";
import { PerformanceCacheService } from "./services/performance-cache.service";
import { ScalingQueueOptimizerService } from "./services/scaling-queue-optimizer.service";
import { AsyncProcessingService } from "./services/async-processing.service";
import { DbOptimizationService } from "./services/db-optimization.service";
import { LoadBalancingReadinessService } from "./services/load-balancing-readiness.service";

const agentRegistry = new AgentRegistryService();
const taskIntake = new TaskIntakeService();
const dispatcher = new TaskDispatcherService(agentRegistry);
const approvalService = new ApprovalService();
const validationService = new ValidationService();
const executionLogger = new ExecutionLoggerService();
const security = new SecurityLayerService();
const auditSystem = new AuditSystemService();
const governanceControls = new GovernanceControlsService(auditSystem);

const cache = new PerformanceCacheService<string>(100_000, 120_000);
const queueOptimizer = new ScalingQueueOptimizerService<{ taskId: string; tenantId: string }>(256, 2_000);
const asyncProcessor = new AsyncProcessingService();
const dbOptimizer = new DbOptimizationService();
const loadBalancing = new LoadBalancingReadinessService();

const businessEngine = new BusinessEngineService();
const decisionEngine = new AiDecisionEngineService();
const triggerService = new AiWorkflowTriggerService();
const recommendationService = new AiRecommendationService();
const integrationHub = new AiIntegrationHubService();
const aiPipeline = new AiExecutionPipelineService(
  decisionEngine,
  triggerService,
  recommendationService,
  integrationHub,
  executionLogger,
);

const ownerContext: SecurityContext = {
  actorId: "OWNER_PRIMARY",
  role: "OWNER",
  tenantId: "HNI_GLOBAL",
};

const workerContext: SecurityContext = {
  actorId: "WORKER_AUTOMATION_01",
  role: "WORKER_AI",
  tenantId: "TENANT_EXTERNAL",
};

const health = healthRoute();

console.log("MUSKI CORE RUNTIME BOOTED");
console.log("Health:", health);

const sampleTask = taskIntake.createTask({
  title: "Initialize HNI WORLD OS agent runtime",
  description: "Boot MUSKI runtime and prepare agent orchestration services.",
  priority: "high",
  requestedBy: "OWNER",
  targetAgent: "OPS_MANAGER_AI",
  tenantId: "HNI_GLOBAL",
});

const validation = validationService.validateTask(sampleTask);
console.log("Validation:", validation);

security.assertAuthorized(ownerContext, "task:dispatch", sampleTask.tenantId);
const dispatchResult = dispatcher.dispatch(sampleTask);
console.log("Dispatch:", dispatchResult);
auditSystem.record(ownerContext, "task:dispatch", "success", dispatchResult as unknown as Record<string, unknown>);

const approval = approvalService.requestApproval(sampleTask.id, ownerContext.actorId, ownerContext.tenantId);
const approvalFlow = governanceControls.startApprovalFlow(sampleTask.id, ownerContext, 1);
console.log("Approval:", approval);
console.log("Governance flow:", approvalFlow);

try {
  security.assertAuthorized(workerContext, "task:dispatch", sampleTask.tenantId);
} catch (error) {
  const reason = error instanceof Error ? error.message : "Unauthorized execution blocked.";
  executionLogger.log("access_denied", "Unauthorized dispatch blocked", {
    actor: workerContext.actorId,
    reason,
  });
  auditSystem.record(workerContext, "security:blocked", "denied", {
    action: "task:dispatch",
    taskId: sampleTask.id,
    reason,
  });
}

executionLogger.log("task", "Sample task initialized", {
  taskId: sampleTask.id,
  dispatchResult,
  approvalId: approval.id,
});

const businessExecutionSamples = [
  businessEngine.execute({
    module: "core_intelligence",
    workflow: "unified_crm_profile",
    action: "upsert_customer_identity",
    payload: {
      sourceSystem: "LEGALNOMICS",
      sourceCustomerId: "LGL-CUST-100",
      globalCustomerId: "HNI-CUST-9001",
      email: "customer9001@hni.world",
      phone: "+91-9000009001",
    },
  }),
  businessEngine.execute({
    module: "core_intelligence",
    workflow: "cross_os_connections",
    action: "sync_cross_os_connections",
    payload: {
      crmRecordId: "CRM-9001",
      connectors: ["LEGALNOMICS", "EDUNOMICS", "AIRNOMICS", "DOCTORNOMICS", "SOBBO"],
    },
  }),
  businessEngine.execute({
    module: "core_intelligence",
    workflow: "cross_os_activity",
    action: "track_activity_event",
    payload: {
      globalCustomerId: "HNI-CUST-9001",
      sourceSystem: "EDUNOMICS",
      eventType: "application_submitted",
      eventAt: "2026-04-14T10:00:00Z",
      metadata: { applicationId: "APP-221" },
    },
  }),
  businessEngine.execute({
    module: "core_intelligence",
    workflow: "analytics_notifications_tasks",
    action: "run_intelligence_pipeline",
    payload: {
      globalCustomerId: "HNI-CUST-9001",
      priority: "high",
      targetSystems: ["LEGALNOMICS", "EDUNOMICS", "AIRNOMICS", "DOCTORNOMICS", "SOBBO"],
    },
  }),
];

for (const result of businessExecutionSamples) {
  executionLogger.log("business_engine", result.outcome, result);
}

const aiExecutionResult = aiPipeline.execute({
  role: "OWNER",
  requestedBy: "MUSKI_MASTER",
  objective: "Execute coordinated customer lifecycle updates across core connected systems",
  urgency: "critical",
  domains: ["crm", "booking", "finance", "legal", "education"],
  payload: {
    crmRecordId: "CRM-9001",
    bookingId: "BKG-4021",
    invoiceId: "INV-552",
    caseId: "CASE-8842",
    applicationId: "APP-221",
    globalCustomerId: "HNI-CUST-9001",
  },
});

console.log("AI pipeline execution:", aiExecutionResult.summary);
console.log("AI recommendation count:", aiExecutionResult.recommendations.length);
console.log("AI execution history:", executionLogger.getHistoryByType("ai_execution").length);

console.log("Security Layer:", security.getPermissionMatrix());
console.log("Governance Controls:", governanceControls.getApprovalFlowsByTenant("HNI_GLOBAL"));
console.log("Audit System:", auditSystem.getEventsByTenant("HNI_GLOBAL").length);
console.log("Business workflows:", businessEngine.getRegisteredWorkflows());
console.log("Unified identities:", businessEngine.getUnifiedIdentityCount());
console.log("Cross-OS activities:", businessEngine.getCrossOsActivityCount());
console.log("Logs:", executionLogger.getAll());
console.log("Agents:", agentRegistry.getAllAgents());
console.log("Tasks:", taskIntake.getAllTasks());

void (async () => {
  cache.set("tenant:HNI_GLOBAL:dashboard", "warm");
  cache.get("tenant:HNI_GLOBAL:dashboard");

  for (const task of taskIntake.getAllTasks()) {
    queueOptimizer.enqueue({
      id: task.id,
      queue: task.priority === "critical" ? "critical" : task.priority === "high" ? "high" : "default",
      payload: { taskId: task.id, tenantId: task.tenantId },
    });
  }

  const reservedBatch = queueOptimizer.reserveBatch();
  const asyncBatchResult = await asyncProcessor.runWithConcurrency(
    reservedBatch,
    async (job) => ({
      jobId: job.id,
      status: "completed",
      completedAt: new Date().toISOString(),
    }),
    64,
  );
  queueOptimizer.ack(asyncBatchResult.completed.length);

  const dbPlan = dbOptimizer.createPhase20Plan();
  const lbReadiness = loadBalancing.evaluate([
    { nodeId: "muski-us-east-1a", region: "us-east", cpuLoad: 0.52, memoryLoad: 0.48, healthy: true },
    { nodeId: "muski-us-east-1b", region: "us-east", cpuLoad: 0.63, memoryLoad: 0.55, healthy: true },
    { nodeId: "muski-us-west-2a", region: "us-west", cpuLoad: 0.41, memoryLoad: 0.46, healthy: true },
    { nodeId: "muski-eu-west-1a", region: "eu-west", cpuLoad: 0.77, memoryLoad: 0.71, healthy: true },
  ]);

  console.log("Phase 20 cache stats:", cache.getStats());
  console.log("Phase 20 queue metrics:", queueOptimizer.getMetrics());
  console.log("Phase 20 async summary:", {
    completed: asyncBatchResult.completed.length,
    failed: asyncBatchResult.failed.length,
    durationMs: asyncBatchResult.durationMs,
  });
  console.log("Phase 20 DB optimization plan:", dbPlan);
  console.log("Phase 20 load balancing readiness:", lbReadiness);
})();
