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
  tenantId: string;
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

  private identityKey(tenantId: string, globalIdentityId: string): string {
    return `${tenantId}:${globalIdentityId}`;
  }

  upsertIdentity(input: Omit<GlobalIdentity, "createdAt" | "updatedAt">): GlobalIdentity {
    const now = new Date().toISOString();
    const key = this.identityKey(input.tenantId, input.globalIdentityId);
    const existing = this.identities.get(key);

    const next: GlobalIdentity = {
      ...input,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    this.identities.set(key, next);
    return next;
  }

  recordInteraction(event: CrmInteraction): void {
    this.interactions.push(event);
  }

  getProfile(tenantId: string, globalIdentityId: string): { identity: GlobalIdentity | null; interactions: CrmInteraction[] } {
    const key = this.identityKey(tenantId, globalIdentityId);
    return {
      identity: this.identities.get(key) ?? null,
      interactions: this.interactions.filter(
        (item) => item.tenantId === tenantId && item.globalIdentityId === globalIdentityId,
      ),
    };
  }

  getIdentityCount(): number {
    return this.identities.size;
  }
}
