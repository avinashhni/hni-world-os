export type AgentStatus = "active" | "inactive" | "paused";

export interface AgentDefinition {
  id: string;
  code: string;
  name: string;
  role: string;
  manager?: string;
  status: AgentStatus;
  capabilities: string[];
}

export class AgentRegistryService {
  private agents: AgentDefinition[] = [
    {
      id: "muski-master",
      code: "MUSKI_MASTER",
      name: "MUSKI Master Brain",
      role: "Master orchestration AI",
      status: "active",
      capabilities: [
        "task-routing",
        "approval-routing",
        "agent-supervision",
        "workflow-control",
      ],
    },
    {
      id: "ops-manager-ai",
      code: "OPS_MANAGER_AI",
      name: "Operations Manager AI",
      role: "Operations execution manager",
      manager: "muski-master",
      status: "active",
      capabilities: ["task-execution", "ops-routing", "status-reporting"],
    },
    {
      id: "data-manager-ai",
      code: "DATA_MANAGER_AI",
      name: "Data Manager AI",
      role: "Data build and registry manager",
      manager: "muski-master",
      status: "active",
      capabilities: ["data-processing", "schema-support", "registry-control"],
    },
  ];

  getAllAgents(): AgentDefinition[] {
    return this.agents;
  }

  getActiveAgents(): AgentDefinition[] {
    return this.agents.filter((agent) => agent.status === "active");
  }

  getAgentByCode(code: string): AgentDefinition | undefined {
    return this.agents.find((agent) => agent.code === code);
  }

  registerAgent(agent: AgentDefinition): AgentDefinition {
    this.agents.push(agent);
    return agent;
  }
}