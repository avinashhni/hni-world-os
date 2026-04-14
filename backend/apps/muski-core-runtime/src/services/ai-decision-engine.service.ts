export type MuskiRole = "OWNER" | "SUPER_ADMIN" | "MANAGEMENT" | "STAFF" | "INTERNAL_AI" | "EXTERNAL_AI";

export type AiDomain = "crm" | "booking" | "finance" | "legal" | "education";

export interface AiDecisionRequest {
  role: MuskiRole;
  requestedBy: string;
  objective: string;
  urgency: "low" | "medium" | "high" | "critical";
  domains: AiDomain[];
  payload: Record<string, unknown>;
}

export interface AiDecisionResult {
  decisionId: string;
  mode: "auto_execute" | "approval_required";
  priorityScore: number;
  confidenceScore: number;
  responseTone: "executive" | "managerial" | "operational" | "external";
  workflowTriggers: string[];
  recommendations: string[];
  createdAt: string;
}

const roleWeight: Record<MuskiRole, number> = {
  OWNER: 35,
  SUPER_ADMIN: 30,
  MANAGEMENT: 22,
  STAFF: 14,
  INTERNAL_AI: 18,
  EXTERNAL_AI: 8,
};

const urgencyWeight: Record<AiDecisionRequest["urgency"], number> = {
  low: 10,
  medium: 20,
  high: 30,
  critical: 40,
};

const roleTone: Record<MuskiRole, AiDecisionResult["responseTone"]> = {
  OWNER: "executive",
  SUPER_ADMIN: "executive",
  MANAGEMENT: "managerial",
  STAFF: "operational",
  INTERNAL_AI: "operational",
  EXTERNAL_AI: "external",
};

export class AiDecisionEngineService {
  evaluate(request: AiDecisionRequest): AiDecisionResult {
    const decisionId = `DEC-${crypto.randomUUID()}`;
    const priorityScore = Math.min(100, roleWeight[request.role] + urgencyWeight[request.urgency] + request.domains.length * 5);
    const confidenceScore = Math.max(55, 90 - request.domains.length * 3);
    const mode: AiDecisionResult["mode"] = request.role === "OWNER" || request.role === "SUPER_ADMIN" ? "auto_execute" : priorityScore >= 70 ? "auto_execute" : "approval_required";

    return {
      decisionId,
      mode,
      priorityScore,
      confidenceScore,
      responseTone: roleTone[request.role],
      workflowTriggers: request.domains.map((domain) => `${domain}.auto_workflow`),
      recommendations: this.buildRecommendations(request),
      createdAt: new Date().toISOString(),
    };
  }

  private buildRecommendations(request: AiDecisionRequest): string[] {
    const recommendations = [
      `Objective locked: ${request.objective}`,
      `Execution path set for ${request.domains.length} connected domains`,
    ];

    if (request.urgency === "critical") {
      recommendations.push("Escalate monitoring cadence to 5-minute status windows");
    }

    if (request.domains.includes("legal") || request.domains.includes("finance")) {
      recommendations.push("Apply compliance logging for regulated operations");
    }

    return recommendations;
  }
}
