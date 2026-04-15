export type MuskiHierarchyLevel = "WORKER_AI" | "MANAGER_AI" | "OS_MANAGER_AI" | "MUSKI";

export type ManagerAiDomain =
  | "THE_UTT"
  | "TOURNOMICS"
  | "DOCTORNOMICS"
  | "WORLDNOMICS"
  | "SOBBO"
  | "LEGALNOMICS"
  | "EDUNOMICS"
  | "AIRNOMICS"
  | "HR_WAAI_MARKETING";

export interface ManagerAiAssignment {
  domain: ManagerAiDomain;
  managerAgentId: string;
  osCode: string;
}

export interface MuskiCommandRoute {
  commandId: string;
  sourceLevel: MuskiHierarchyLevel;
  targetOs: string;
  targetModule: string;
  workerAgentId: string;
  intent: string;
  escalationRequired: boolean;
  rolePermissionScope: string[];
  routedAt: string;
}

export interface MuskiDecision {
  commandId: string;
  recommendation: string;
  escalate: boolean;
  overrideAllowed: boolean;
  decidedAt: string;
}

export class MuskiOrchestrationService {
  private readonly assignments: ManagerAiAssignment[] = [
    { domain: "THE_UTT", managerAgentId: "MGR_UTT_01", osCode: "THE_UTT" },
    { domain: "TOURNOMICS", managerAgentId: "MGR_TOUR_01", osCode: "TOURNOMICS" },
    { domain: "DOCTORNOMICS", managerAgentId: "MGR_DOC_01", osCode: "DOCTORNOMICS" },
    { domain: "WORLDNOMICS", managerAgentId: "MGR_WORLD_01", osCode: "WORLDNOMICS" },
    { domain: "SOBBO", managerAgentId: "MGR_SOBBO_01", osCode: "SOBBO" },
    { domain: "LEGALNOMICS", managerAgentId: "MGR_LEGAL_01", osCode: "LEGALNOMICS" },
    { domain: "EDUNOMICS", managerAgentId: "MGR_EDU_01", osCode: "EDUNOMICS" },
    { domain: "AIRNOMICS", managerAgentId: "MGR_AIR_01", osCode: "AIRNOMICS" },
    { domain: "HR_WAAI_MARKETING", managerAgentId: "MGR_HWM_01", osCode: "HR_WAAI_MARKETING" },
  ];

  private readonly routedCommands: MuskiCommandRoute[] = [];

  routeCommand(input: {
    commandId: string;
    targetOs: string;
    targetModule: string;
    workerAgentId: string;
    intent: string;
    sourceLevel?: MuskiHierarchyLevel;
    rolePermissionScope: string[];
  }): MuskiCommandRoute {
    const route: MuskiCommandRoute = {
      commandId: input.commandId,
      sourceLevel: input.sourceLevel ?? "MUSKI",
      targetOs: input.targetOs,
      targetModule: input.targetModule,
      workerAgentId: input.workerAgentId,
      intent: input.intent,
      escalationRequired: /critical|override|risk/i.test(input.intent),
      rolePermissionScope: input.rolePermissionScope,
      routedAt: new Date().toISOString(),
    };

    this.routedCommands.push(route);
    return route;
  }

  decide(commandId: string, context: { confidence: number; riskScore: number; overrideRequested: boolean }): MuskiDecision {
    const escalate = context.riskScore >= 0.7 || context.confidence < 0.5;
    const recommendation = escalate
      ? "Escalate to Governance Admin or Owner before execution."
      : "Proceed with Manager AI and Worker AI execution path.";

    return {
      commandId,
      recommendation,
      escalate,
      overrideAllowed: context.overrideRequested,
      decidedAt: new Date().toISOString(),
    };
  }

  getHierarchy(): MuskiHierarchyLevel[] {
    return ["WORKER_AI", "MANAGER_AI", "OS_MANAGER_AI", "MUSKI"];
  }

  getAssignments(): ManagerAiAssignment[] {
    return [...this.assignments];
  }

  getRoutedCommands(): MuskiCommandRoute[] {
    return [...this.routedCommands];
  }
}
