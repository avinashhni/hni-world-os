import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type QueueJob = {
  id: string;
  tenant_id: string;
  queue_name: string;
  payload: Record<string, unknown>;
  attempts: number;
};

const MAX_ATTEMPTS = 5;
const RETRY_BACKOFF_SECONDS = [30, 120, 300, 900, 1800];
const CONTROL_BLOCKED_BACKOFF_SECONDS = 180;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

function json(status: number, data: Record<string, unknown>) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...corsHeaders } });
}

type IntegrationRuntime = {
  provider_key: string;
  provider_type: string;
  category: "travel" | "payment" | "whatsapp" | "email" | "ai";
  request_builder: {
    method: "POST" | "GET";
    endpoint_template: string;
    required_fields: string[];
  };
  response_normalization: {
    status_field: string;
    normalized_codes: Record<string, string>;
  };
  retry_policy: { max_attempts: number; backoff_seconds: number[]; retryable_statuses: number[] };
};

function buildIntegrationRuntime(providerType: string, providerKey: string): IntegrationRuntime {
  const typeKey = providerType.toLowerCase();
  const key = providerKey.toLowerCase();
  if (typeKey === "travel") {
    return {
      provider_key: key,
      provider_type: typeKey,
      category: "travel",
      request_builder: { method: "POST", endpoint_template: "/availability/search", required_fields: ["origin", "destination", "depart_date", "travellers"] },
      response_normalization: { status_field: "status", normalized_codes: { confirmed: "BOOKED", hold: "HELD", unavailable: "NOT_AVAILABLE" } },
      retry_policy: { max_attempts: 4, backoff_seconds: [10, 45, 120, 300], retryable_statuses: [408, 429, 500, 502, 503, 504] },
    };
  }
  if (typeKey === "payment") {
    return {
      provider_key: key,
      provider_type: typeKey,
      category: "payment",
      request_builder: { method: "POST", endpoint_template: key === "razorpay" ? "/v1/orders" : "/v1/payment_intents", required_fields: ["amount", "currency", "reference_id"] },
      response_normalization: { status_field: "payment_status", normalized_codes: { succeeded: "PAID", pending: "PENDING", failed: "FAILED" } },
      retry_policy: { max_attempts: 5, backoff_seconds: [5, 15, 45, 120, 300], retryable_statuses: [408, 409, 425, 429, 500, 502, 503, 504] },
    };
  }
  if (typeKey === "whatsapp") {
    return {
      provider_key: key,
      provider_type: typeKey,
      category: "whatsapp",
      request_builder: { method: "POST", endpoint_template: "/2010-04-01/Accounts/{account_sid}/Messages.json", required_fields: ["to", "from", "body"] },
      response_normalization: { status_field: "delivery_status", normalized_codes: { queued: "QUEUED", sent: "SENT", delivered: "DELIVERED", failed: "FAILED" } },
      retry_policy: { max_attempts: 4, backoff_seconds: [10, 30, 90, 240], retryable_statuses: [408, 429, 500, 502, 503, 504] },
    };
  }
  if (typeKey === "email") {
    return {
      provider_key: key,
      provider_type: typeKey,
      category: "email",
      request_builder: { method: "POST", endpoint_template: "/send", required_fields: ["from", "to", "subject", "body"] },
      response_normalization: { status_field: "delivery_status", normalized_codes: { accepted: "QUEUED", delivered: "DELIVERED", bounced: "FAILED" } },
      retry_policy: { max_attempts: 4, backoff_seconds: [10, 30, 120, 300], retryable_statuses: [408, 429, 500, 502, 503, 504] },
    };
  }
  return {
    provider_key: key,
    provider_type: typeKey,
    category: "ai",
    request_builder: { method: "POST", endpoint_template: key.includes("anthropic") ? "/v1/messages" : "/v1/chat/completions", required_fields: ["model", "messages"] },
    response_normalization: { status_field: "completion_status", normalized_codes: { completed: "COMPLETED", partial: "PARTIAL", failed: "FAILED" } },
    retry_policy: { max_attempts: 3, backoff_seconds: [5, 20, 60], retryable_statuses: [408, 429, 500, 502, 503, 504] },
  };
}

function buildRequestPayload(runtime: IntegrationRuntime, payload: Record<string, unknown>, attempt: number) {
  return {
    provider: { key: runtime.provider_key, type: runtime.provider_type, category: runtime.category },
    request: {
      endpoint: runtime.request_builder.endpoint_template,
      method: runtime.request_builder.method,
      required_fields: runtime.request_builder.required_fields,
      attempt,
      body: payload,
    },
    execution_flow: "build_request",
  };
}

function normalizeProviderResponse(runtime: IntegrationRuntime, responsePayload: Record<string, unknown>) {
  const rawStatus = String(responsePayload.status ?? responsePayload[runtime.response_normalization.status_field] ?? "processed").toLowerCase();
  const normalizedStatus = runtime.response_normalization.normalized_codes[rawStatus] ?? rawStatus.toUpperCase();
  return {
    provider_key: runtime.provider_key,
    provider_type: runtime.provider_type,
    category: runtime.category,
    raw_status: rawStatus,
    normalized_status: normalizedStatus,
    response: responsePayload,
    execution_flow: "normalize_response",
  };
}

async function sleep(ms: number) {
  return await new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetry(status: number, runtime: IntegrationRuntime) {
  return runtime.retry_policy.retryable_statuses.includes(status);
}

async function executeProviderCall(
  runtime: IntegrationRuntime,
  providerBaseUrl: string,
  apiKey: string,
  payload: Record<string, unknown>,
) {
  let lastError = "";
  for (let attempt = 1; attempt <= runtime.retry_policy.max_attempts; attempt += 1) {
    const builtPayload = buildRequestPayload(runtime, payload, attempt);
    try {
      const response = await fetch(`${providerBaseUrl}${runtime.request_builder.endpoint_template}`, {
        method: runtime.request_builder.method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "X-Retry-Attempt": String(attempt),
        },
        body: runtime.request_builder.method === "POST" ? JSON.stringify(builtPayload.request.body) : undefined,
      });

      if (!response.ok && shouldRetry(response.status, runtime)) {
        lastError = `http_${response.status}`;
        const backoff = runtime.retry_policy.backoff_seconds[Math.min(attempt - 1, runtime.retry_policy.backoff_seconds.length - 1)] ?? 30;
        await sleep(backoff * 1000);
        continue;
      }

      const responsePayload = await response.json().catch(() => ({ status: response.ok ? "completed" : "failed" }));
      if (!response.ok) throw new Error(`provider_http_error:${response.status}`);

      return {
        mode: "live",
        attempt,
        request: builtPayload,
        normalized: normalizeProviderResponse(runtime, responsePayload),
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (attempt >= runtime.retry_policy.max_attempts) break;
      const backoff = runtime.retry_policy.backoff_seconds[Math.min(attempt - 1, runtime.retry_policy.backoff_seconds.length - 1)] ?? 30;
      await sleep(backoff * 1000);
    }
  }

  throw new Error(`provider_execution_failed:${lastError}`);
}

async function writeAudit(supabase: ReturnType<typeof createClient>, tenantId: string, action: string, entityType: string, entityId: string, payload: Record<string, unknown>) {
  await supabase.from("audit_logs").insert({
    tenant_id: tenantId,
    source_system: "MUSKI_WORKER",
    action,
    entity_type: entityType,
    entity_id: entityId,
    action_payload: payload,
  });
}

async function handleWorkflowTransition(supabase: ReturnType<typeof createClient>, job: QueueJob) {
  const workflowInstanceId = String(job.payload.workflow_instance_id ?? "");
  const entityType = String(job.payload.entity_type ?? "");
  const entityId = String(job.payload.entity_id ?? "");
  const toState = String(job.payload.to_state ?? "");
  const eventName = String(job.payload.event_name ?? "workflow.transition");

  if (!workflowInstanceId || !entityType || !entityId || !toState) {
    throw new Error("workflow_transition payload requires workflow_instance_id, entity_type, entity_id and to_state");
  }

  await supabase
    .from("workflow_instances")
    .update({ current_state: toState, updated_at: new Date().toISOString(), last_error: null })
    .eq("id", workflowInstanceId)
    .eq("tenant_id", job.tenant_id);

  if (entityType === "booking") {
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("id,current_state")
      .eq("id", entityId)
      .eq("tenant_id", job.tenant_id)
      .single();

    if (bookingError || !booking) throw new Error("Booking not found for workflow transition");

    const { error: updateError } = await supabase
      .from("bookings")
      .update({ current_state: toState })
      .eq("id", booking.id)
      .eq("tenant_id", job.tenant_id);
    if (updateError) throw updateError;

    await supabase.from("booking_state_history").insert({
      tenant_id: job.tenant_id,
      booking_id: booking.id,
      from_state: booking.current_state,
      to_state: toState,
      event_name: eventName,
      transition_status: "success",
    });
  }

  await supabase
    .from("workflow_events")
    .update({ event_status: "completed", processed_at: new Date().toISOString(), error_message: null })
    .eq("id", String(job.payload.workflow_event_id ?? ""))
    .eq("tenant_id", job.tenant_id);
}

async function handleMuskiCommand(supabase: ReturnType<typeof createClient>, job: QueueJob) {
  const commandId = String(job.payload.command_id ?? "");
  const executionId = String(job.payload.execution_id ?? "");

  if (!commandId || !executionId) throw new Error("muski_command payload requires command_id and execution_id");

  const { data: command, error: commandError } = await supabase
    .from("muski_commands")
    .select("id,command_key,command_payload,status")
    .eq("id", commandId)
    .eq("tenant_id", job.tenant_id)
    .single();

  if (commandError || !command) throw new Error("MUSKI command not found");
  if (command.status === "requires_approval") throw new Error("Command requires approval before execution");

  await supabase
    .from("muski_commands")
    .update({ status: "running", updated_at: new Date().toISOString() })
    .eq("id", command.id)
    .eq("tenant_id", job.tenant_id);

  const decision = {
    command_key: command.command_key,
    actions: ["persist_decision", "update_execution", "close_command"],
    confidence: Number(job.payload.confidence ?? 0.88),
    approved: true,
  };

  await supabase.from("muski_execution_history").insert({
    tenant_id: job.tenant_id,
    command_id: command.id,
    execution_stage: "decision",
    state_payload: { decision },
    status: "running",
  });

  const { error: executionUpdateError } = await supabase
    .from("ai_executions")
    .update({
      status: "completed",
      decision,
      output_payload: {
        result: "success",
        runtime: "muski_persistent_worker",
        processed_at: new Date().toISOString(),
      },
      completed_at: new Date().toISOString(),
    })
    .eq("id", executionId)
    .eq("tenant_id", job.tenant_id);

  if (executionUpdateError) throw executionUpdateError;

  await supabase.from("muski_execution_history").insert({
    tenant_id: job.tenant_id,
    command_id: command.id,
    execution_stage: "complete",
    state_payload: { execution_id: executionId },
    status: "completed",
  });

  await supabase
    .from("muski_commands")
    .update({ status: "completed", updated_at: new Date().toISOString() })
    .eq("id", command.id)
    .eq("tenant_id", job.tenant_id);
}

async function handleIntegrationJob(supabase: ReturnType<typeof createClient>, job: QueueJob) {
  const providerKey = String(job.payload.provider_key ?? "");
  const providerType = String(job.payload.provider_type ?? "");
  if (!providerKey || !providerType) throw new Error("integration payload requires provider_key and provider_type");
  const runtime = buildIntegrationRuntime(providerType, providerKey);
  const providerEnvKey = Deno.env.get(`PROVIDER_${providerKey.toUpperCase()}_KEY`) ?? "";
  const providerBaseUrl = String(job.payload.base_url ?? Deno.env.get(`PROVIDER_${providerKey.toUpperCase()}_BASE_URL`) ?? "");
  let executionResult: Record<string, unknown>;

  if (!providerEnvKey || !providerBaseUrl) {
    executionResult = {
      mode: "ready_pending_live_key",
      status: "READY FOR LIVE API KEY",
      request: buildRequestPayload(runtime, job.payload, 1),
      normalized: normalizeProviderResponse(runtime, { status: "pending_live_key" }),
      retry_policy: runtime.retry_policy,
      execution_flow: "skipped_live_call",
    };
  } else {
    const liveResult = await executeProviderCall(runtime, providerBaseUrl, providerEnvKey, job.payload);
    executionResult = {
      mode: "live",
      status: "executed",
      ...liveResult,
      retry_policy: runtime.retry_policy,
      execution_flow: "execute_complete",
    };
  }

  await supabase.from("integration_webhooks").insert({
    tenant_id: job.tenant_id,
    provider_id: job.payload.provider_id,
    event_name: String(job.payload.event_name ?? "runtime.dispatch"),
    payload: executionResult,
    processed: true,
  });
}

async function handleNotificationJob(supabase: ReturnType<typeof createClient>, job: QueueJob) {
  const notificationId = String(job.payload.notification_id ?? "");
  if (!notificationId) throw new Error("notification payload requires notification_id");

  const { error } = await supabase
    .from("notifications")
    .update({ delivery_status: "delivered" })
    .eq("id", notificationId)
    .eq("tenant_id", job.tenant_id);
  if (error) throw error;
}

async function processJob(supabase: ReturnType<typeof createClient>, job: QueueJob) {
  switch (job.queue_name) {
    case "workflow_transition":
      await handleWorkflowTransition(supabase, job);
      break;
    case "muski_command":
      await handleMuskiCommand(supabase, job);
      break;
    case "integration":
      await handleIntegrationJob(supabase, job);
      break;
    case "notification":
      await handleNotificationJob(supabase, job);
      break;
    default:
      throw new Error(`Unsupported queue: ${job.queue_name}`);
  }
}

type TenantKillSwitchState = {
  tenantBlocked: boolean;
  globalBlocked: boolean;
};

async function getTenantKillSwitchState(
  supabase: ReturnType<typeof createClient>,
  tenantId: string,
  cache: Map<string, TenantKillSwitchState>,
) {
  const cached = cache.get(tenantId);
  if (cached) return cached;

  const tenantControl = await supabase
    .from("emergency_controls")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("control_key", "global_execution_kill_switch")
    .eq("is_active", true)
    .limit(1);

  const globalKillSwitchEnabled = Deno.env.get("ENABLE_GLOBAL_WORKER_KILL_SWITCH") === "true";
  const globalControlTenantId = Deno.env.get("GLOBAL_CONTROL_TENANT_ID") ?? "";

  let globalBlocked = false;
  if (globalKillSwitchEnabled && globalControlTenantId) {
    const globalControl = await supabase
      .from("emergency_controls")
      .select("id")
      .eq("tenant_id", globalControlTenantId)
      .eq("control_key", "worker_global_execution_kill_switch")
      .eq("is_active", true)
      .limit(1);

    globalBlocked = !globalControl.error && (globalControl.data ?? []).length > 0;
  }

  const state = {
    tenantBlocked: !tenantControl.error && (tenantControl.data ?? []).length > 0,
    globalBlocked,
  };
  cache.set(tenantId, state);
  return state;
}

async function claimJobs(supabase: ReturnType<typeof createClient>, limit = 10) {
  const nowIso = new Date().toISOString();
  const { data: jobs, error } = await supabase
    .from("job_queue")
    .select("id,tenant_id,queue_name,payload,attempts")
    .eq("status", "queued")
    .lte("available_at", nowIso)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw error;
  const eligibleJobs = jobs ?? [];
  const byTenant = new Map<string, QueueJob[]>();
  for (const rawJob of eligibleJobs) {
    const queue = byTenant.get(rawJob.tenant_id) ?? [];
    queue.push(rawJob as QueueJob);
    byTenant.set(rawJob.tenant_id, queue);
  }

  const fairOrdered: QueueJob[] = [];
  while (fairOrdered.length < limit) {
    let added = 0;
    for (const [tenantId, queue] of byTenant.entries()) {
      const next = queue.shift();
      if (next) {
        fairOrdered.push(next);
        added += 1;
      }
      if (queue.length === 0) byTenant.delete(tenantId);
      if (fairOrdered.length >= limit) break;
    }
    if (added === 0) break;
  }

  const claimed: QueueJob[] = [];

  for (const job of fairOrdered) {
    const { data: updated, error: claimError } = await supabase
      .from("job_queue")
      .update({ status: "running", locked_at: nowIso })
      .eq("id", job.id)
      .eq("status", "queued")
      .select("id,tenant_id,queue_name,payload,attempts")
      .single();

    if (!claimError && updated) claimed.push(updated as QueueJob);
  }

  return claimed;
}

async function processClaimedJob(
  supabase: ReturnType<typeof createClient>,
  job: QueueJob,
  result: { processed: number; failed_by_error: number; retried: number; dead_lettered: number; paused_by_control: number },
  killSwitchCache: Map<string, TenantKillSwitchState>,
) {
  try {
    const killSwitchState = await getTenantKillSwitchState(supabase, job.tenant_id, killSwitchCache);
    if (killSwitchState.globalBlocked) {
      const availableAt = new Date(Date.now() + CONTROL_BLOCKED_BACKOFF_SECONDS * 1000).toISOString();
      await supabase.from("job_queue").update({
        status: "queued",
        available_at: availableAt,
        last_error: "control_blocked:worker_global_execution_kill_switch_active",
        locked_at: null,
      }).eq("id", job.id);
      await writeAudit(supabase, job.tenant_id, "job.paused_by_control", "job_queue", job.id, {
        queue: job.queue_name,
        control_reason: "worker_global_execution_kill_switch_active",
        control_scope: "global",
      });
      result.paused_by_control += 1;
      return;
    }
    if (killSwitchState.tenantBlocked) {
      const availableAt = new Date(Date.now() + CONTROL_BLOCKED_BACKOFF_SECONDS * 1000).toISOString();
      await supabase.from("job_queue").update({
        status: "queued",
        available_at: availableAt,
        last_error: "control_blocked:tenant_execution_kill_switch_active",
        locked_at: null,
      }).eq("id", job.id);
      await writeAudit(supabase, job.tenant_id, "job.paused_by_control", "job_queue", job.id, {
        queue: job.queue_name,
        control_reason: "tenant_execution_kill_switch_active",
        control_scope: "tenant",
      });
      result.paused_by_control += 1;
      return;
    }

    await processJob(supabase, job);
    await supabase.from("job_queue").update({ status: "completed", locked_at: null, last_error: null }).eq("id", job.id);
    await writeAudit(supabase, job.tenant_id, "job.completed", "job_queue", job.id, { queue: job.queue_name });
    result.processed += 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const nextAttempts = job.attempts + 1;

    if (nextAttempts >= MAX_ATTEMPTS) {
      await supabase.from("job_queue").update({ status: "failed", attempts: nextAttempts, last_error: message, locked_at: null }).eq("id", job.id);
      await supabase.from("job_dead_letters").insert({
        tenant_id: job.tenant_id,
        queue_job_id: job.id,
        queue_name: job.queue_name,
        payload: job.payload,
        attempts: nextAttempts,
        last_error: message,
      });
      await writeAudit(supabase, job.tenant_id, "job.dead_lettered", "job_queue", job.id, {
        queue: job.queue_name,
        error: message,
        attempts: nextAttempts,
      });
      result.dead_lettered += 1;
    } else {
      const backoff = RETRY_BACKOFF_SECONDS[Math.min(nextAttempts - 1, RETRY_BACKOFF_SECONDS.length - 1)];
      const availableAt = new Date(Date.now() + backoff * 1000).toISOString();
      await supabase.from("job_queue").update({
        status: "queued",
        attempts: nextAttempts,
        last_error: message,
        available_at: availableAt,
        locked_at: null,
      }).eq("id", job.id);
      await writeAudit(supabase, job.tenant_id, "job.retried", "job_queue", job.id, {
        queue: job.queue_name,
        error: message,
        attempts: nextAttempts,
        next_available_at: availableAt,
      });
      result.retried += 1;
    }

    await writeAudit(supabase, job.tenant_id, "job.failed_by_error", "job_queue", job.id, { queue: job.queue_name, error: message });
    await supabase.from("error_logs").insert({
      tenant_id: job.tenant_id,
      source_system: "MUSKI_WORKER",
      source_entity: "job_queue",
      source_entity_id: job.id,
      severity: nextAttempts >= MAX_ATTEMPTS ? "critical" : "error",
      error_code: "job_execution_failure",
      error_message: message,
      error_payload: {
        queue_name: job.queue_name,
        attempts: nextAttempts,
        max_attempts: MAX_ATTEMPTS,
      },
    });
    result.failed_by_error += 1;
  }
}

async function writeWorkerMonitoring(
  supabase: ReturnType<typeof createClient>,
  claimedJobs: QueueJob[],
  result: { processed: number; failed_by_error: number; retried: number; dead_lettered: number; paused_by_control: number },
) {
  const tenantIds = Array.from(new Set(claimedJobs.map((job) => job.tenant_id)));
  await supabase.from("worker_health_metrics").insert({
    worker_name: "supabase_job_worker",
    jobs_claimed: claimedJobs.length,
    jobs_processed: result.processed,
    jobs_failed: result.failed_by_error,
    jobs_dead_lettered: result.dead_lettered,
    meta: {
      tenant_count: tenantIds.length,
      queues: Array.from(new Set(claimedJobs.map((job) => job.queue_name))),
      jobs_retried: result.retried,
      jobs_paused_by_control: result.paused_by_control,
    },
  });

  for (const tenantId of tenantIds) {
    const queueCounts = await supabase
      .from("job_queue")
      .select("queue_name,status")
      .eq("tenant_id", tenantId);

    if (queueCounts.error || !queueCounts.data) continue;

    const grouped = new Map<string, { queued: number; running: number; failed: number; completed: number; paused: number }>();
    for (const row of queueCounts.data) {
      const queueName = String(row.queue_name);
      const status = String(row.status);
      const current = grouped.get(queueName) ?? { queued: 0, running: 0, failed: 0, completed: 0, paused: 0 };
      if (status === "queued") current.queued += 1;
      if (status === "running") current.running += 1;
      if (status === "failed") current.failed += 1;
      if (status === "completed") current.completed += 1;
      if (status === "paused") current.paused += 1;
      grouped.set(queueName, current);
    }

    const snapshots = Array.from(grouped.entries()).map(([queueName, counts]) => ({
      tenant_id: tenantId,
      queue_name: queueName,
      queued_count: counts.queued,
      running_count: counts.running,
      failed_count: counts.failed,
      completed_count: counts.completed,
    }));

    if (snapshots.length > 0) {
      await supabase.from("queue_depth_snapshots").insert(snapshots);
    }
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { ok: false, error: { code: "method_not_allowed" } });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const claimedJobs = await claimJobs(supabase, Number(Deno.env.get("JOB_WORKER_BATCH") ?? "10"));
  const result = { processed: 0, failed_by_error: 0, retried: 0, dead_lettered: 0, paused_by_control: 0 };
  const killSwitchCache = new Map<string, TenantKillSwitchState>();

  await Promise.allSettled(claimedJobs.map((job) => processClaimedJob(supabase, job, result, killSwitchCache)));
  await writeWorkerMonitoring(supabase, claimedJobs, result);

  return json(200, { ok: true, jobs_claimed: claimedJobs.length, ...result });
});
