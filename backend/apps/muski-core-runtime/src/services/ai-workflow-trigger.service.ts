import { AiDomain } from "./ai-decision-engine.service";

export interface WorkflowTrigger {
  domain: AiDomain;
  workflow: string;
  action: string;
  payload: Record<string, unknown>;
}

export class AiWorkflowTriggerService {
  createTriggers(input: { domains: AiDomain[]; objective: string; payload: Record<string, unknown> }): WorkflowTrigger[] {
    return input.domains.map((domain) => ({
      domain,
      workflow: `${domain}.execution`,
      action: this.resolveAction(domain),
      payload: {
        objective: input.objective,
        ...input.payload,
      },
    }));
  }

  private resolveAction(domain: AiDomain): string {
    switch (domain) {
      case "crm":
        return "sync_crm_state";
      case "booking":
        return "confirm_booking";
      case "finance":
        return "post_finance_entry";
      case "legal":
        return "advance_legal_stage";
      case "education":
        return "advance_student_pipeline";
      default:
        return "run_generic_action";
    }
  }
}
