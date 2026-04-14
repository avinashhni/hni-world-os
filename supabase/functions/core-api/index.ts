import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Json = Record<string, unknown>;

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
      .map((row: any) => row.roles?.role_key)
      .filter((item: unknown): item is string => Boolean(item));

    const routeKey = `${moduleName}.${actionName}`;
    const requiredRoles = ROLE_ACCESS[routeKey];
    if (requiredRoles && !hasRole(roleKeys, requiredRoles)) {
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
          tenant_id: userAccount.tenant_id,
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
          tenant_id: userAccount.tenant_id,
          customer_id: customer.id,
          source: payload.source,
          module_type: payload.module_type,
          pipeline_stage: payload.pipeline_stage ?? "new",
          score: payload.score ?? 0,
          owner_user_id: userAccount.id,
          expected_value: payload.expected_value ?? 0,
        })
        .select()
        .single();
      if (leadError) throw leadError;

      await writeAudit(supabase, userAccount.tenant_id, userAccount.id, "crm.upsert", "crm_lead", lead.id, { customer_id: customer.id });
      return ok({ customer, lead });
    }

    if (moduleName === "crm" && actionName === "claim-lead") {
      const payload = body as Json;
      if (!payload.lead_id) return badRequest("lead_id is required", 422, "validation_error");

      const { data, error } = await supabase
        .from("crm_leads")
        .update({ owner_user_id: userAccount.id, pipeline_stage: "routed" })
        .eq("id", payload.lead_id)
        .eq("tenant_id", userAccount.tenant_id)
        .select()
        .single();

      if (error) throw error;
      await writeAudit(supabase, userAccount.tenant_id, userAccount.id, "crm.claim_lead", "crm_lead", data.id, { previous_owner: null });
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
          tenant_id: userAccount.tenant_id,
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
        tenant_id: userAccount.tenant_id,
        booking_id: booking.id,
        to_state: "SEARCH",
        event_name: "booking.created",
        actor_user_id: userAccount.id,
      });

      await writeAudit(supabase, userAccount.tenant_id, userAccount.id, "booking.create", "booking", booking.id, { state: "SEARCH" });
      return ok({ booking }, 201);
    }

    if (moduleName === "workflows" && actionName === "transition") {
      const payload = body as Json;
      if (!payload.booking_id || !payload.to_state || !payload.event_name) {
        return badRequest("booking_id, to_state, event_name are required", 422, "validation_error");
      }

      const { data: booking, error: bookingError } = await supabase
        .from("bookings")
        .select("id,current_state")
        .eq("id", payload.booking_id)
        .eq("tenant_id", userAccount.tenant_id)
        .single();
      if (bookingError || !booking) return badRequest("Booking not found", 404, "not_found");

      const validFlow: Record<string, string[]> = {
        SEARCH: ["HOLD"],
        HOLD: ["CONFIRM"],
        CONFIRM: ["TICKET"],
        TICKET: ["COMPLETE"],
      };

      const toState = String(payload.to_state);
      const allowedNext = validFlow[booking.current_state as keyof typeof validFlow] ?? [];
      if (!allowedNext.includes(toState)) {
        await supabase.from("booking_state_history").insert({
          tenant_id: userAccount.tenant_id,
          booking_id: booking.id,
          from_state: booking.current_state,
          to_state: toState,
          event_name: String(payload.event_name),
          actor_user_id: userAccount.id,
          transition_status: "failed",
          failure_reason: "invalid_transition",
        });
        return badRequest(`Invalid transition from ${booking.current_state} to ${toState}`, 422, "invalid_transition");
      }

      const { data: updated, error: updateError } = await supabase
        .from("bookings")
        .update({ current_state: toState })
        .eq("id", booking.id)
        .select()
        .single();
      if (updateError) throw updateError;

      await supabase.from("booking_state_history").insert({
        tenant_id: userAccount.tenant_id,
        booking_id: booking.id,
        from_state: booking.current_state,
        to_state: toState,
        event_name: String(payload.event_name),
        actor_user_id: userAccount.id,
        transition_status: "success",
      });

      await writeAudit(supabase, userAccount.tenant_id, userAccount.id, "workflow.transition", "booking", booking.id, {
        from_state: booking.current_state,
        to_state: toState,
      });

      return ok({ booking: updated });
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
          tenant_id: userAccount.tenant_id,
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

      await writeAudit(supabase, userAccount.tenant_id, userAccount.id, "finance.invoice", "finance_invoice", invoice.id, {
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

      const event = {
        tenant_id: userAccount.tenant_id,
        module_type: "legal",
        event_name: String(payload.event_name),
        entity_type: "legal_case",
        entity_id: String(payload.case_id),
        event_payload: { to_state: payload.to_state },
      };
      const { data, error } = await supabase.from("analytics_events").insert(event).select().single();
      if (error) throw error;
      await writeAudit(supabase, userAccount.tenant_id, userAccount.id, "legal.execute", "legal_case", String(payload.case_id), { to_state: payload.to_state });
      return ok({ execution: data });
    }

    if (moduleName === "education" && actionName === "execute") {
      const payload = body as Json;
      if (!payload.profile_id || !payload.to_state || !payload.event_name) {
        return badRequest("profile_id, to_state, event_name are required", 422, "validation_error");
      }

      const event = {
        tenant_id: userAccount.tenant_id,
        module_type: "education",
        event_name: String(payload.event_name),
        entity_type: "education_profile",
        entity_id: String(payload.profile_id),
        event_payload: { to_state: payload.to_state },
      };
      const { data, error } = await supabase.from("analytics_events").insert(event).select().single();
      if (error) throw error;
      await writeAudit(supabase, userAccount.tenant_id, userAccount.id, "education.execute", "education_profile", String(payload.profile_id), { to_state: payload.to_state });
      return ok({ execution: data });
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
          tenant_id: userAccount.tenant_id,
          provider_key: payload.provider_key,
          provider_type: payload.provider_type,
          base_url: payload.base_url,
          auth_type: payload.auth_type,
          status_note: JSON.stringify(runtime),
        }, { onConflict: "tenant_id,provider_key" })
        .select()
        .single();
      if (error) throw error;

      await writeAudit(supabase, userAccount.tenant_id, userAccount.id, "integration.configure", "integration_provider", data.id, runtime);
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
          tenant_id: userAccount.tenant_id,
          actor_user_id: userAccount.id,
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
          tenant_id: userAccount.tenant_id,
          actor_user_id: userAccount.id,
          prompt_id: payload.prompt_id,
          module_type: payload.module_type,
          input_payload: payload.input_payload,
          status: "queued",
        })
        .select()
        .single();
      if (error) throw error;

      const { data: queueJob } = await supabase
        .from("job_queue")
        .insert({
          tenant_id: userAccount.tenant_id,
          queue_name: "ai_execution",
          payload: { execution_id: execution.id, module_type: payload.module_type },
          status: "queued",
          available_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      await writeAudit(supabase, userAccount.tenant_id, userAccount.id, "ai.execute", "ai_execution", execution.id, { queue_job_id: queueJob?.id });
      return ok({ execution, queue_job_id: queueJob?.id }, 202);
    }

    return badRequest(`Unsupported route for module=${moduleName} action=${actionName}`, 404, "route_not_supported");
  } catch (error) {
    return badRequest(String(error), 500, "internal_error");
  }
});
