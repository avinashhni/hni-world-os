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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

function json(status: number, data: Record<string, unknown>) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...corsHeaders } });
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
  const bookingId = String(job.payload.booking_id ?? "");
  const toState = String(job.payload.to_state ?? "");
  const eventName = String(job.payload.event_name ?? "workflow.transition");
  if (!bookingId || !toState) throw new Error("workflow_transition payload requires booking_id and to_state");

  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select("id,current_state")
    .eq("id", bookingId)
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

async function handleAiExecution(supabase: ReturnType<typeof createClient>, job: QueueJob) {
  const executionId = String(job.payload.execution_id ?? "");
  if (!executionId) throw new Error("ai_execution payload requires execution_id");

  const { data: execution, error } = await supabase
    .from("ai_executions")
    .select("id,input_payload,module_type,prompt_id")
    .eq("id", executionId)
    .eq("tenant_id", job.tenant_id)
    .single();
  if (error || !execution) throw new Error("AI execution not found");

  const confidence = Number(job.payload.confidence ?? 0.82);
  const decision = {
    summary: `Processed ${execution.module_type} execution in worker runtime`,
    actions: ["queue_next_action", "update_workflow_state"],
    confidence,
    fallback_used: false,
  };

  const { error: updateError } = await supabase
    .from("ai_executions")
    .update({
      status: "completed",
      decision,
      output_payload: { result: "success", worker: "job-worker", processed_at: new Date().toISOString() },
      completed_at: new Date().toISOString(),
    })
    .eq("id", execution.id)
    .eq("tenant_id", job.tenant_id);

  if (updateError) throw updateError;
}

async function handleIntegrationJob(supabase: ReturnType<typeof createClient>, job: QueueJob) {
  const providerKey = String(job.payload.provider_key ?? "");
  const providerType = String(job.payload.provider_type ?? "");
  if (!providerKey || !providerType) throw new Error("integration payload requires provider_key and provider_type");

  const normalizedResponse = {
    provider_key: providerKey,
    provider_type: providerType,
    mode: "sandbox",
    status: "processed",
    received_at: new Date().toISOString(),
  };

  await supabase.from("integration_webhooks").insert({
    tenant_id: job.tenant_id,
    provider_id: job.payload.provider_id,
    event_name: String(job.payload.event_name ?? "runtime.dispatch"),
    payload: normalizedResponse,
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
    case "ai_execution":
      await handleAiExecution(supabase, job);
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
  const claimed: QueueJob[] = [];

  for (const job of jobs ?? []) {
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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { ok: false, error: { code: "method_not_allowed" } });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const claimedJobs = await claimJobs(supabase, Number(Deno.env.get("JOB_WORKER_BATCH") ?? "10"));
  const result = { processed: 0, failed: 0, dead_lettered: 0 };

  for (const job of claimedJobs) {
    try {
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
      }

      await writeAudit(supabase, job.tenant_id, "job.failed", "job_queue", job.id, { queue: job.queue_name, error: message });
      result.failed += 1;
    }
  }

  return json(200, { ok: true, jobs_claimed: claimedJobs.length, ...result });
});
