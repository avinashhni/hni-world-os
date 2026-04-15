export type GlobalIdentityType = "user" | "customer" | "corporate" | "partner";

export interface GlobalIdentity {
  globalIdentityId: string;
  tenantId: string;
  type: GlobalIdentityType;
  displayName: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CrmInteraction {
  globalIdentityId: string;
  osCode: string;
  interactionType: string;
  transactionRef: string;
  at: string;
  metadata: Record<string, unknown>;
}

export class UnifiedCrmIdentityService {
  private readonly identities = new Map<string, GlobalIdentity>();
  private readonly interactions: CrmInteraction[] = [];

  upsertIdentity(input: Omit<GlobalIdentity, "createdAt" | "updatedAt">): GlobalIdentity {
    const now = new Date().toISOString();
    const existing = this.identities.get(input.globalIdentityId);

    const next: GlobalIdentity = {
      ...input,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    this.identities.set(input.globalIdentityId, next);
    return next;
  }

  recordInteraction(event: CrmInteraction): void {
    this.interactions.push(event);
  }

  getProfile(globalIdentityId: string): { identity: GlobalIdentity | null; interactions: CrmInteraction[] } {
    return {
      identity: this.identities.get(globalIdentityId) ?? null,
      interactions: this.interactions.filter((item) => item.globalIdentityId === globalIdentityId),
    };
  }

  getIdentityCount(): number {
    return this.identities.size;
  }
}
