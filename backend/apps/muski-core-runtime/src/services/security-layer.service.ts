export type SecurityAction =
  | "task:create"
  | "task:dispatch"
  | "approval:request"
  | "approval:decide"
  | "governance:approve"
  | "governance:escalate"
  | "audit:read"
  | "tenant:admin";

export type SecurityRole =
  | "OWNER"
  | "MUSKI_MASTER"
  | "MANAGER_AI"
  | "WORKER_AI"
  | "TENANT_ADMIN"
  | "AUDITOR";

export interface SecurityContext {
  actorId: string;
  role: SecurityRole;
  tenantId: string;
}

export interface AuthorizationDecision {
  allowed: boolean;
  reason?: string;
}

const ROLE_PERMISSION_MATRIX: Record<SecurityRole, SecurityAction[]> = {
  OWNER: [
    "task:create",
    "task:dispatch",
    "approval:request",
    "approval:decide",
    "governance:approve",
    "governance:escalate",
    "audit:read",
    "tenant:admin",
  ],
  MUSKI_MASTER: [
    "task:create",
    "task:dispatch",
    "approval:request",
    "approval:decide",
    "governance:approve",
    "governance:escalate",
    "audit:read",
  ],
  MANAGER_AI: ["task:create", "task:dispatch", "approval:request", "governance:approve"],
  WORKER_AI: ["task:create", "approval:request"],
  TENANT_ADMIN: ["task:create", "task:dispatch", "approval:request", "approval:decide", "audit:read"],
  AUDITOR: ["audit:read"],
};

export class SecurityLayerService {
  getPermissionMatrix(): Record<SecurityRole, SecurityAction[]> {
    return ROLE_PERMISSION_MATRIX;
  }

  authorize(
    context: SecurityContext,
    action: SecurityAction,
    resourceTenantId?: string,
  ): AuthorizationDecision {
    const rolePermissions = ROLE_PERMISSION_MATRIX[context.role] ?? [];

    if (!rolePermissions.includes(action)) {
      return {
        allowed: false,
        reason: `Role ${context.role} does not have permission for ${action}.`,
      };
    }

    if (resourceTenantId && context.tenantId !== resourceTenantId && context.role !== "OWNER") {
      return {
        allowed: false,
        reason: `Tenant isolation violation. Actor tenant ${context.tenantId} cannot access tenant ${resourceTenantId}.`,
      };
    }

    return { allowed: true };
  }

  assertAuthorized(
    context: SecurityContext,
    action: SecurityAction,
    resourceTenantId?: string,
  ): void {
    const decision = this.authorize(context, action, resourceTenantId);

    if (!decision.allowed) {
      throw new Error(decision.reason ?? "Unauthorized execution blocked.");
    }
  }
}
