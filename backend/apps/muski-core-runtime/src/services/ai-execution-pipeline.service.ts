import { AiDecisionEngineService, AiDecisionRequest } from "./ai-decision-engine.service";
import { AiWorkflowTriggerService } from "./ai-workflow-trigger.service";
import { AiRecommendationService } from "./ai-recommendation.service";
import { AiIntegrationHubService, DomainStateChange } from "./ai-integration-hub.service";
import { ExecutionLoggerService } from "./execution-logger.service";

export interface AiPipelineResult {
  decision: ReturnType<AiDecisionEngineService["evaluate"]>;
  recommendations: ReturnType<AiRecommendationService["generate"]>;
  changes: DomainStateChange[];
  summary: {
    mode: "auto_execute" | "approval_required";
    totalActions: number;
    connectedDomains: string[];
  };
}

export class AiExecutionPipelineService {
  constructor(
    private readonly decisionEngine: AiDecisionEngineService,
    private readonly triggerService: AiWorkflowTriggerService,
    private readonly recommendationService: AiRecommendationService,
    private readonly integrationHub: AiIntegrationHubService,
    private readonly logger: ExecutionLoggerService,
  ) {}

  execute(request: AiDecisionRequest): AiPipelineResult {
    const decision = this.decisionEngine.evaluate(request);
    const recommendations = this.recommendationService.generate(request.role, request.domains);
    const triggers = this.triggerService.createTriggers({
      domains: request.domains,
      objective: request.objective,
      payload: request.payload,
    });

    const changes: DomainStateChange[] = [];

    if (decision.mode === "auto_execute") {
      for (const trigger of triggers) {
        const change = this.integrationHub.execute(trigger);
        changes.push(change);
        this.logger.log("ai_execution", `AI executed ${trigger.domain} workflow`, {
          decisionId: decision.decisionId,
          trigger,
          change,
        });
      }
    } else {
      this.logger.log("ai_execution", "AI decision requires approval before execution", {
        decisionId: decision.decisionId,
        role: request.role,
      });
    }

    this.logger.log("ai_decision", "AI decision engine completed evaluation", {
      decision,
      recommendations,
    });

    return {
      decision,
      recommendations,
      changes,
      summary: {
        mode: decision.mode,
        totalActions: changes.length,
        connectedDomains: request.domains,
      },
    };
  }
}
