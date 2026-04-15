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
  private readonly identitiesByTenant = new Map<string, Map<string, GlobalIdentity>>();
  private readonly interactions: CrmInteraction[] = [];

  private getOrCreateTenantIdentityStore(tenantId: string): Map<string, GlobalIdentity> {
    let tenantIdentities = this.identitiesByTenant.get(tenantId);
    if (!tenantIdentities) {
      tenantIdentities = new Map<string, GlobalIdentity>();
      this.identitiesByTenant.set(tenantId, tenantIdentities);
    }

    return tenantIdentities;
  }

  private getTenantIdentityStore(tenantId: string): Map<string, GlobalIdentity> | undefined {
    return this.identitiesByTenant.get(tenantId);
  }

  upsertIdentity(input: Omit<GlobalIdentity, "createdAt" | "updatedAt">): GlobalIdentity {
    const now = new Date().toISOString();
    const tenantIdentities = this.getOrCreateTenantIdentityStore(input.tenantId);
    const existing = tenantIdentities.get(input.globalIdentityId);

    const next: GlobalIdentity = {
      ...input,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    tenantIdentities.set(input.globalIdentityId, next);
    return next;
  }

  recordInteraction(event: CrmInteraction): void {
    this.interactions.push(event);
  }

  getProfile(tenantId: string, globalIdentityId: string): { identity: GlobalIdentity | null; interactions: CrmInteraction[] } {
    const tenantIdentities = this.getTenantIdentityStore(tenantId);
    return {
      identity: tenantIdentities?.get(globalIdentityId) ?? null,
      interactions: this.interactions.filter(
        (item) => item.tenantId === tenantId && item.globalIdentityId === globalIdentityId,
      ),
    };
  }

  getIdentityCount(): number {
    let total = 0;
    for (const tenantIdentities of this.identitiesByTenant.values()) {
      total += tenantIdentities.size;
    }

    return total;
  }
}
