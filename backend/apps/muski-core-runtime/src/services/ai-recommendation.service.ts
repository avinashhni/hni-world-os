import { AiDomain, MuskiRole } from "./ai-decision-engine.service";

export interface AiRecommendation {
  domain: AiDomain;
  message: string;
  recommendedByRole: MuskiRole;
  createdAt: string;
}

export class AiRecommendationService {
  generate(role: MuskiRole, domains: AiDomain[]): AiRecommendation[] {
    return domains.map((domain) => ({
      domain,
      message: this.getRecommendationMessage(domain),
      recommendedByRole: role,
      createdAt: new Date().toISOString(),
    }));
  }

  private getRecommendationMessage(domain: AiDomain): string {
    if (domain === "crm") return "Prioritize high-value lead follow-up in the next execution cycle";
    if (domain === "booking") return "Auto-confirm bookings only for verified payment and identity profiles";
    if (domain === "finance") return "Post ledger entries with GST and margin checks before close";
    if (domain === "legal") return "Block case progression when evidence checklist is incomplete";
    return "Advance student case only when compliance documents are fully validated";
  }
}
