import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Json = Record<string, unknown>;

type RuntimeContext = {
  tenantId: string;
  userId: string;
  roleKeys: string[];
};

type TransitionDef = {
  from: string;
  to: string;
  event: string;
  guard?: string;
  retry?: { max_attempts?: number; backoff_seconds?: number };
  escalate_to?: string;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

const ROLE_ACCESS: Record<string, string[]> = {
  "crm.upsert": ["OWNER", "SUPER_ADMIN", "MANAGEMENT", "CRM_MANAGER"],
  "crm.claim-lead": ["OWNER", "SUPER_ADMIN", "MANAGEMENT", "CRM_MANAGER", "STAFF"],
  "bookings.create": ["OWNER", "SUPER_ADMIN", "MANAGEMENT", "BOOKING_MANAGER"],
  "bookings.transition": ["OWNER", "SUPER_ADMIN", "MANAGEMENT", "BOOKING_MANAGER", "OPS_MANAGER"],
  "finance.invoice": ["OWNER", "SUPER_ADMIN", "MANAGEMENT", "FINANCE_MANAGER"],
  "workflows.transition": ["OWNER", "SUPER_ADMIN", "MANAGEMENT", "OPS_MANAGER"],
  "legal.execute": ["OWNER", "SUPER_ADMIN", "MANAGEMENT", "LEGAL_MANAGER"],
  "education.execute": ["OWNER", "SUPER_ADMIN", "MANAGEMENT", "EDU_MANAGER"],
  "integrations.providers": ["OWNER", "SUPER_ADMIN", "MANAGEMENT", "OPS_MANAGER"],
  "analytics.track": ["OWNER", "SUPER_ADMIN", "MANAGEMENT", "OPS_MANAGER", "STAFF"],
  "ai.execute": ["OWNER", "SUPER_ADMIN", "MANAGEMENT", "INTERNAL_AI"],
};

function badRequest(message: string, status = 400, code = "bad_request") {
  return new Response(JSON.stringify({ ok: false, error: { code, message } }), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function ok(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify({ ok: true, ...data }), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function hasRole(roles: string[], required: string[]) {
  return roles.some((item) => required.includes(item));
}

function parseTransitions(raw: unknown): TransitionDef[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is TransitionDef => Boolean(item && typeof item === "object"))
    .map((item) => ({
      from: String(item.from),
      to: String(item.to),
      event: String(item.event),
      guard: item.guard ? String(item.guard) : undefined,
      retry: typeof item.retry === "object" && item.retry
        ? {
            max_attempts: Number((item.retry as Record<string, unknown>).max_attempts ?? 1),
            backoff_seconds: Number((item.retry as Record<string, unknown>).backoff_seconds ?? 0),
          }
        : undefined,
      escalate_to: item.escalate_to ? String(item.escalate_to) : undefined,
    }));
}

async function writeAudit(
  supabase: ReturnType<typeof createClient>,
  tenantId: string,
  actorUserId: string,
  action: string,
  entityType: string,
  entityId: string | null,
  payload: Json,
) {
  await supabase.from("audit_logs").insert({
    tenant_id: tenantId,
    actor_user_id: actorUserId,
    source_system: "COPSPOWER",
    action,
    entity_type: entityType,
    entity_id: entityId,
    action_payload: payload,
  });
}

function buildProviderRuntime(providerType: string, providerKey: string) {
  const keyPresent = Boolean(Deno.env.get(`PROVIDER_${providerKey.toUpperCase()}_KEY`));
  return {
    provider_key: providerKey,
    provider_type: providerType,
    mode: keyPresent ? "live" : "sandbox",
    status: keyPresent ? "active" : "sandbox_stub",
    retry_policy: { max_attempts: 3, backoff_seconds: [30, 120, 300] },
    error_mapping: {
      timeout: "provider_timeout",
      unauthorized: "provider_auth_failed",
      unknown: "provider_unknown_error",
    },
  };
}

async function authenticateRequest(supabase: ReturnType<typeof createClient>, req: Request): Promise<RuntimeContext | Response> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) return badRequest("Missing bearer token", 401, "missing_bearer_token");

  const { data: userInfo, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userInfo.user) return badRequest("Unauthorized", 401, "unauthorized");

  const { data: userAccount, error: accountError } = await supabase
    .from("user_accounts")
    .select("id, tenant_id")
    .eq("auth_user_id", userInfo.user.id)
    .single();

  if (accountError || !userAccount) return badRequest("User account not provisioned", 403, "user_not_provisioned");

  const { data: assignedRoles } = await supabase
    .from("user_role_assignments")
    .select("roles(role_key)")
    .eq("user_id", userAccount.id)
    .eq("tenant_id", userAccount.tenant_id);

  const roleKeys = (assignedRoles ?? [])
    .map((row: { roles?: { role_key?: string } }) => row.roles?.role_key)
    .filter((item: unknown): item is string => Boolean(item));

  return {
    tenantId: String(userAccount.tenant_id),
    userId: String(userAccount.id),
    roleKeys,
  };
}

async function executeWorkflowTransition(
  supabase: ReturnType<typeof createClient>,
  context: RuntimeContext,
  workflowKey: string,
  entityType: string,
  entityId: string,
  eventName: string,
  toState: string,
  meta: Json,
) {
  const { data: definition, error: definitionError } = await supabase
    .from("workflow_definitions")
    .select("id,workflow_key,workflow_name,module_type,states,transitions")
    .eq("tenant_id", context.tenantId)
    .eq("workflow_key", workflowKey)
    .eq("is_active", true)
    .single();

  if (definitionError || !definition) {
    throw new Error(`workflow_definition_not_found:${workflowKey}`);
  }

  const states = Array.isArray(definition.states) ? definition.states.map(String) : [];
  if (!states.includes(toState)) throw new Error(`invalid_to_state:${toState}`);

  const { data: existingInstance } = await supabase
    .from("workflow_instances")
    .select("id,current_state,retry_count")
    .eq("tenant_id", context.tenantId)
    .eq("workflow_definition_id", definition.id)
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .single();

  let instance = existingInstance;
  if (!instance) {
    const initialState = states[0] ?? toState;
    const created = await supabase
      .from("workflow_instances")
      .insert({
        tenant_id: context.tenantId,
        workflow_definition_id: definition.id,
        entity_type: entityType,
        entity_id: entityId,
        current_state: initialState,
      })
      .select("id,current_state,retry_count")
      .single();

    if (created.error || !created.data) throw created.error ?? new Error("workflow_instance_create_failed");
    instance = created.data;
  }

  const transitions = parseTransitions(definition.transitions);
  const transition = transitions.find((item) => item.from === instance.current_state && item.to === toState && item.event === eventName);
  if (!transition) {
    await supabase.from("workflow_state_history").insert({
      tenant_id: context.tenantId,
      workflow_instance_id: instance.id,
      from_state: instance.current_state,
      to_state: toState,
      event_name: eventName,
      actor_user_id: context.userId,
      guard_status: "failed",
      transition_status: "failed",
      failure_reason: "invalid_transition",
      escalation_target: "MUSKI_MANAGER_AI",
    });
    throw new Error(`invalid_transition:${instance.current_state}->${toState}`);
  }

  const eventInsert = await supabase
    .from("workflow_events")
    .insert({
      tenant_id: context.tenantId,
      workflow_instance_id: instance.id,
      event_name: eventName,
      payload: { to_state: toState, ...meta },
      event_status: "queued",
    })
    .select("id")
    .single();

  if (eventInsert.error || !eventInsert.data) throw eventInsert.error ?? new Error("workflow_event_create_failed");

  await supabase.from("workflow_state_history").insert({
    tenant_id: context.tenantId,
    workflow_instance_id: instance.id,
    from_state: instance.current_state,
    to_state: toState,
    event_name: eventName,
    actor_user_id: context.userId,
    guard_status: "passed",
    retry_attempt: Number(instance.retry_count ?? 0),
    escalation_target: transition.escalate_to,
    transition_status: "success",
  });

  const { data: updatedInstance, error: updateError } = await supabase
    .from("workflow_instances")
    .update({
      current_state: toState,
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", instance.id)
    .eq("tenant_id", context.tenantId)
    .select("id,current_state,updated_at")
    .single();

  if (updateError || !updatedInstance) throw updateError ?? new Error("workflow_instance_update_failed");

  await supabase
    .from("workflow_events")
    .update({ event_status: "completed", processed_at: new Date().toISOString() })
    .eq("id", eventInsert.data.id)
    .eq("tenant_id", context.tenantId);

  const { data: queueJob } = await supabase
    .from("job_queue")
    .insert({
      tenant_id: context.tenantId,
      queue_name: "workflow_transition",
      payload: {
        workflow_instance_id: updatedInstance.id,
        workflow_event_id: eventInsert.data.id,
        entity_type: entityType,
        entity_id: entityId,
        from_state: instance.current_state,
        to_state: toState,
        event_name: eventName,
      },
      status: "queued",
      available_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  return {
    workflow_definition: definition,
    workflow_instance: updatedInstance,
    workflow_event_id: eventInsert.data.id,
    queue_job_id: queueJob?.id,
    transition,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const segments = url.pathname.split("/").filter(Boolean);
    const moduleName = segments.at(-2);
    const actionName = segments.at(-1);

    if (!moduleName || !actionName) {
      return badRequest("Invalid route. Use /core-api/{module}/{action}", 404, "route_not_found");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const authResult = await authenticateRequest(supabase, req);
    if (authResult instanceof Response) return authResult;

    const context = authResult;
    const routeKey = `${moduleName}.${actionName}`;
    const requiredRoles = ROLE_ACCESS[routeKey];
    if (requiredRoles && !hasRole(context.roleKeys, requiredRoles)) {
      return badRequest("Forbidden for current role", 403, "forbidden");
    }

    const body = req.method === "POST" ? await req.json() : {};

    if (moduleName === "crm" && actionName === "upsert") {
      const payload = body as Json;
      if (!payload.customer_code || !payload.full_name || !payload.source || !payload.module_type) {
        return badRequest("customer_code, full_name, source, module_type are required", 422, "validation_error");
      }

      const { data: customer, error: customerError } = await supabase
        .from("crm_customers")
        .upsert({
          tenant_id: context.tenantId,
          customer_code: payload.customer_code,
          customer_type: payload.customer_type ?? "individual",
          full_name: payload.full_name,
          email: payload.email,
          phone: payload.phone,
          city: payload.city,
          country: payload.country,
          lifecycle_stage: payload.lifecycle_stage ?? "new",
        }, { onConflict: "tenant_id,customer_code" })
        .select()
        .single();
      if (customerError) throw customerError;

      const { data: lead, error: leadError } = await supabase
        .from("crm_leads")
        .insert({
          tenant_id: context.tenantId,
          customer_id: customer.id,
          source: payload.source,
          module_type: payload.module_type,
          pipeline_stage: payload.pipeline_stage ?? "new",
          score: payload.score ?? 0,
          owner_user_id: context.userId,
          expected_value: payload.expected_value ?? 0,
        })
        .select()
        .single();
      if (leadError) throw leadError;

      await writeAudit(supabase, context.tenantId, context.userId, "crm.upsert", "crm_lead", lead.id, { customer_id: customer.id });
      return ok({ customer, lead });
    }

    if (moduleName === "crm" && actionName === "claim-lead") {
      const payload = body as Json;
      if (!payload.lead_id) return badRequest("lead_id is required", 422, "validation_error");

      const { data, error } = await supabase
        .from("crm_leads")
        .update({ owner_user_id: context.userId, pipeline_stage: "routed" })
        .eq("id", payload.lead_id)
        .eq("tenant_id", context.tenantId)
        .select()
        .single();

      if (error) throw error;
      await writeAudit(supabase, context.tenantId, context.userId, "crm.claim_lead", "crm_lead", data.id, { previous_owner: null });
      return ok({ lead: data });
    }

    if (moduleName === "bookings" && actionName === "create") {
      const payload = body as Json;
      if (!payload.booking_number || !payload.customer_id || !payload.module_type) {
        return badRequest("booking_number, customer_id, module_type are required", 422, "validation_error");
      }

      const { data: booking, error: bookingError } = await supabase
        .from("bookings")
        .insert({
          tenant_id: context.tenantId,
          booking_number: payload.booking_number,
          customer_id: payload.customer_id,
          lead_id: payload.lead_id,
          module_type: payload.module_type,
          current_state: "SEARCH",
          status: "open",
          gross_amount: payload.gross_amount ?? 0,
          cost_amount: payload.cost_amount ?? 0,
          currency: payload.currency ?? "INR",
        })
        .select()
        .single();
      if (bookingError) throw bookingError;

      await supabase.from("booking_state_history").insert({
        tenant_id: context.tenantId,
        booking_id: booking.id,
        to_state: "SEARCH",
        event_name: "booking.created",
        actor_user_id: context.userId,
      });

      await writeAudit(supabase, context.tenantId, context.userId, "booking.create", "booking", booking.id, { state: "SEARCH" });
      return ok({ booking }, 201);
    }

    if (moduleName === "workflows" && actionName === "transition") {
      const payload = body as Json;
      if (!payload.booking_id || !payload.to_state || !payload.event_name) {
        return badRequest("booking_id, to_state, event_name are required", 422, "validation_error");
      }

      const execution = await executeWorkflowTransition(
        supabase,
        context,
        String(payload.workflow_key ?? "booking.lifecycle"),
        "booking",
        String(payload.booking_id),
        String(payload.event_name),
        String(payload.to_state),
        { requested_from: "core-api.workflows.transition" },
      );

      const { data: booking } = await supabase
        .from("bookings")
        .update({ current_state: String(payload.to_state) })
        .eq("id", payload.booking_id)
        .eq("tenant_id", context.tenantId)
        .select()
        .single();

      await supabase.from("booking_state_history").insert({
        tenant_id: context.tenantId,
        booking_id: String(payload.booking_id),
        from_state: execution.transition.from,
        to_state: String(payload.to_state),
        event_name: String(payload.event_name),
        actor_user_id: context.userId,
        transition_status: "success",
      });

      await writeAudit(supabase, context.tenantId, context.userId, "workflow.transition", "booking", String(payload.booking_id), {
        from_state: execution.transition.from,
        to_state: payload.to_state,
        workflow_instance_id: execution.workflow_instance.id,
      });

      return ok({ booking, workflow: execution });
    }

    if (moduleName === "finance" && actionName === "invoice") {
      const payload = body as Json;
      if (!payload.invoice_number || !payload.customer_id || payload.subtotal === undefined) {
        return badRequest("invoice_number, customer_id, subtotal are required", 422, "validation_error");
      }

      const gstRate = Number(payload.gst_rate ?? 18);
      const subtotal = Number(payload.subtotal);
      const gstAmount = Number(((subtotal * gstRate) / 100).toFixed(2));
      const totalAmount = Number((subtotal + gstAmount).toFixed(2));

      const { data: invoice, error: invoiceError } = await supabase
        .from("finance_invoices")
        .insert({
          tenant_id: context.tenantId,
          booking_id: payload.booking_id,
          customer_id: payload.customer_id,
          invoice_number: payload.invoice_number,
          subtotal: subtotal,
          gst_rate: gstRate,
          gst_amount: gstAmount,
          total_amount: totalAmount,
          status: payload.status ?? "issued",
        })
        .select()
        .single();
      if (invoiceError) throw invoiceError;

      await writeAudit(supabase, context.tenantId, context.userId, "finance.invoice", "finance_invoice", invoice.id, {
        subtotal,
        gst_rate: gstRate,
      });

      return ok({ invoice }, 201);
    }

    if (moduleName === "legal" && actionName === "execute") {
      const payload = body as Json;
      if (!payload.case_id || !payload.to_state || !payload.event_name) {
        return badRequest("case_id, to_state, event_name are required", 422, "validation_error");
      }

      const workflow = await executeWorkflowTransition(
        supabase,
        context,
        String(payload.workflow_key ?? "legal.lifecycle"),
        "legal_case",
        String(payload.case_id),
        String(payload.event_name),
        String(payload.to_state),
        payload.meta && typeof payload.meta === "object" ? payload.meta as Json : {},
      );

      const { data: analyticsEvent, error: analyticsError } = await supabase
        .from("analytics_events")
        .insert({
          tenant_id: context.tenantId,
          actor_user_id: context.userId,
          module_type: "legal",
          event_name: String(payload.event_name),
          entity_type: "legal_case",
          entity_id: String(payload.case_id),
          event_payload: { to_state: payload.to_state, workflow_instance_id: workflow.workflow_instance.id },
        })
        .select()
        .single();
      if (analyticsError) throw analyticsError;

      await writeAudit(supabase, context.tenantId, context.userId, "legal.execute", "legal_case", String(payload.case_id), {
        to_state: payload.to_state,
        workflow_instance_id: workflow.workflow_instance.id,
      });
      return ok({ execution: analyticsEvent, workflow });
    }

    if (moduleName === "education" && actionName === "execute") {
      const payload = body as Json;
      if (!payload.profile_id || !payload.to_state || !payload.event_name) {
        return badRequest("profile_id, to_state, event_name are required", 422, "validation_error");
      }

      const workflow = await executeWorkflowTransition(
        supabase,
        context,
        String(payload.workflow_key ?? "education.lifecycle"),
        "education_profile",
        String(payload.profile_id),
        String(payload.event_name),
        String(payload.to_state),
        payload.meta && typeof payload.meta === "object" ? payload.meta as Json : {},
      );

      const { data: analyticsEvent, error: analyticsError } = await supabase
        .from("analytics_events")
        .insert({
          tenant_id: context.tenantId,
          actor_user_id: context.userId,
          module_type: "education",
          event_name: String(payload.event_name),
          entity_type: "education_profile",
          entity_id: String(payload.profile_id),
          event_payload: { to_state: payload.to_state, workflow_instance_id: workflow.workflow_instance.id },
        })
        .select()
        .single();
      if (analyticsError) throw analyticsError;

      await writeAudit(supabase, context.tenantId, context.userId, "education.execute", "education_profile", String(payload.profile_id), {
        to_state: payload.to_state,
        workflow_instance_id: workflow.workflow_instance.id,
      });
      return ok({ execution: analyticsEvent, workflow });
    }

    if (moduleName === "integrations" && actionName === "providers") {
      const payload = body as Json;
      if (!payload.provider_key || !payload.provider_type) {
        return badRequest("provider_key and provider_type are required", 422, "validation_error");
      }

      const runtime = buildProviderRuntime(String(payload.provider_type), String(payload.provider_key));
      const { data, error } = await supabase
        .from("integration_providers")
        .upsert({
          tenant_id: context.tenantId,
          provider_key: payload.provider_key,
          provider_type: payload.provider_type,
          base_url: payload.base_url,
          auth_type: payload.auth_type,
          status_note: JSON.stringify(runtime),
        }, { onConflict: "tenant_id,provider_key" })
        .select()
        .single();
      if (error) throw error;

      await writeAudit(supabase, context.tenantId, context.userId, "integration.configure", "integration_provider", data.id, runtime);
      return ok({ provider: data, runtime });
    }

    if (moduleName === "analytics" && actionName === "track") {
      const payload = body as Json;
      if (!payload.module_type || !payload.event_name) {
        return badRequest("module_type and event_name are required", 422, "validation_error");
      }
      const { data, error } = await supabase
        .from("analytics_events")
        .insert({
          tenant_id: context.tenantId,
          actor_user_id: context.userId,
          module_type: payload.module_type,
          event_name: payload.event_name,
          entity_type: payload.entity_type,
          entity_id: payload.entity_id,
          event_payload: payload.event_payload ?? {},
        })
        .select()
        .single();
      if (error) throw error;
      return ok({ event: data });
    }

    if (moduleName === "ai" && actionName === "execute") {
      const payload = body as Json;
      if (!payload.module_type || !payload.input_payload) {
        return badRequest("module_type and input_payload are required", 422, "validation_error");
      }

      const { data: execution, error } = await supabase
        .from("ai_executions")
        .insert({
          tenant_id: context.tenantId,
          actor_user_id: context.userId,
          prompt_id: payload.prompt_id,
          module_type: payload.module_type,
          input_payload: payload.input_payload,
          status: "queued",
        })
        .select()
        .single();
      if (error) throw error;

      const { data: command, error: commandError } = await supabase
        .from("muski_commands")
        .insert({
          tenant_id: context.tenantId,
          command_key: String(payload.command_key ?? `ai.execute.${String(payload.module_type)}`),
          command_payload: {
            execution_id: execution.id,
            module_type: payload.module_type,
            input_payload: payload.input_payload,
            requested_approval_scope: payload.requested_approval_scope,
          },
          requested_by: context.userId,
          status: payload.requires_approval ? "requires_approval" : "queued",
        })
        .select("id,status")
        .single();
      if (commandError) throw commandError;

      await supabase.from("muski_execution_history").insert({
        tenant_id: context.tenantId,
        command_id: command.id,
        execution_stage: "dispatch",
        state_payload: { source: "core-api.ai.execute", execution_id: execution.id },
        status: "running",
      });

      if (payload.requires_approval) {
        await supabase.from("muski_approvals").insert({
          tenant_id: context.tenantId,
          command_id: command.id,
          approval_scope: String(payload.requested_approval_scope ?? "OPERATIONS"),
          requested_by: context.userId,
          status: "pending",
        });
      }

      const { data: queueJob } = await supabase
        .from("job_queue")
        .insert({
          tenant_id: context.tenantId,
          queue_name: "muski_command",
          payload: { command_id: command.id, execution_id: execution.id, module_type: payload.module_type },
          status: "queued",
          available_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      await writeAudit(supabase, context.tenantId, context.userId, "ai.execute", "ai_execution", execution.id, {
        queue_job_id: queueJob?.id,
        command_id: command.id,
      });
      return ok({ execution, command, queue_job_id: queueJob?.id }, 202);
    }

    return badRequest(`Unsupported route for module=${moduleName} action=${actionName}`, 404, "route_not_supported");
  } catch (error) {
    return badRequest(String(error), 500, "internal_error");
  }
});
