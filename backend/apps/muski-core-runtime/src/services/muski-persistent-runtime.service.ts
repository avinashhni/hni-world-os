export interface MuskiCommandRecord {
  tenantId: string;
  commandKey: string;
  commandPayload: Record<string, unknown>;
  requestedBy?: string;
}

export interface MuskiDatabaseClient {
  from: (table: string) => {
    insert: (payload: Record<string, unknown> | Record<string, unknown>[]) => any;
    update: (payload: Record<string, unknown>) => any;
    select: (columns?: string) => any;
    eq: (column: string, value: unknown) => any;
    single: () => any;
  };
}

export class MuskiPersistentRuntimeService {
  constructor(private readonly db: MuskiDatabaseClient) {}

  async dispatchCommand(input: MuskiCommandRecord) {
    const { data: command, error } = await this.db
      .from("muski_commands")
      .insert({
        tenant_id: input.tenantId,
        command_key: input.commandKey,
        command_payload: input.commandPayload,
        requested_by: input.requestedBy,
        status: "queued",
      })
      .select("id,tenant_id,command_key,status,created_at")
      .single();

    if (error) throw error;

    await this.db.from("muski_execution_history").insert({
      tenant_id: input.tenantId,
      command_id: command.id,
      execution_stage: "dispatch",
      state_payload: { queue: "job_queue" },
      status: "running",
    });

    return command;
  }

  async requestApproval(tenantId: string, commandId: string, requestedBy: string, scope: string) {
    const { data, error } = await this.db
      .from("muski_approvals")
      .insert({
        tenant_id: tenantId,
        command_id: commandId,
        approval_scope: scope,
        requested_by: requestedBy,
        status: "pending",
      })
      .select("id,status,created_at")
      .single();

    if (error) throw error;

    await this.db
      .from("muski_commands")
      .update({ status: "requires_approval", updated_at: new Date().toISOString() })
      .eq("id", commandId);

    return data;
  }

  async escalateCommand(tenantId: string, commandId: string, sourceScope: string, escalationTarget: string, reason: string) {
    const { data, error } = await this.db
      .from("muski_escalations")
      .insert({
        tenant_id: tenantId,
        command_id: commandId,
        source_scope: sourceScope,
        escalation_target: escalationTarget,
        reason,
        status: "open",
      })
      .select("id,status,escalation_target")
      .single();

    if (error) throw error;

    return data;
  }
}
