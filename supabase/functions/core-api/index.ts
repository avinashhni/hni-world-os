import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Json = Record<string, unknown>;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

function badRequest(message: string, status = 400) {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function hasRole(roles: string[], required: string[]) {
  return roles.some((item) => required.includes(item));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const segments = url.pathname.split("/").filter(Boolean);
    const moduleName = segments.at(-2);
    const actionName = segments.at(-1);

    if (!moduleName || !actionName) {
      return badRequest("Invalid route. Use /core-api/{module}/{action}", 404);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) return badRequest("Missing bearer token", 401);

    const { data: userInfo, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userInfo.user) return badRequest("Unauthorized", 401);

    const { data: userAccount, error: accountError } = await supabase
      .from("user_accounts")
      .select("id, tenant_id")
      .eq("auth_user_id", userInfo.user.id)
      .single();
    if (accountError || !userAccount) return badRequest("User account not provisioned", 403);

    const { data: assignedRoles } = await supabase
      .from("user_role_assignments")
      .select("roles(role_key)")
      .eq("user_id", userAccount.id)
      .eq("tenant_id", userAccount.tenant_id);

    const roleKeys = (assignedRoles ?? [])
      .map((row: any) => row.roles?.role_key)
      .filter((item: unknown): item is string => Boolean(item));

    const body = req.method === "POST" ? await req.json() : {};

    if (moduleName === "crm" && actionName === "upsert") {
      if (!hasRole(roleKeys, ["OWNER", "SUPER_ADMIN", "MANAGEMENT", "CRM_MANAGER"])) {
        return badRequest("Forbidden for current role", 403);
      }

      const payload = body as Json;
      if (!payload.customer_code || !payload.full_name || !payload.source || !payload.module_type) {
        return badRequest("customer_code, full_name, source, module_type are required");
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

      return new Response(JSON.stringify({ ok: true, customer, lead }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    if (moduleName === "bookings" && actionName === "create") {
      if (!hasRole(roleKeys, ["OWNER", "SUPER_ADMIN", "MANAGEMENT", "BOOKING_MANAGER"])) {
        return badRequest("Forbidden for current role", 403);
      }
      const payload = body as Json;
      if (!payload.booking_number || !payload.customer_id || !payload.module_type) {
        return badRequest("booking_number, customer_id, module_type are required");
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
        from_state: null,
        to_state: "SEARCH",
        event_name: "created",
        actor_user_id: userAccount.id,
      });

      return new Response(JSON.stringify({ ok: true, booking }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    if (moduleName === "finance" && actionName === "invoice") {
      if (!hasRole(roleKeys, ["OWNER", "SUPER_ADMIN", "MANAGEMENT", "FINANCE_MANAGER"])) {
        return badRequest("Forbidden for current role", 403);
      }
      const payload = body as Json;
      if (!payload.invoice_number || !payload.customer_id || payload.subtotal === undefined) {
        return badRequest("invoice_number, customer_id, subtotal are required");
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

      return new Response(JSON.stringify({ ok: true, invoice }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    if (moduleName === "workflows" && actionName === "transition") {
      if (!hasRole(roleKeys, ["OWNER", "SUPER_ADMIN", "MANAGEMENT", "OPS_MANAGER"])) {
        return badRequest("Forbidden for current role", 403);
      }
      const payload = body as Json;
      if (!payload.booking_id || !payload.to_state || !payload.event_name) {
        return badRequest("booking_id, to_state, event_name are required");
      }

      const { data: booking, error: bookingError } = await supabase
        .from("bookings")
        .select("id,current_state")
        .eq("id", payload.booking_id)
        .eq("tenant_id", userAccount.tenant_id)
        .single();
      if (bookingError || !booking) return badRequest("Booking not found", 404);

      const validFlow: Record<string, string[]> = {
        SEARCH: ["HOLD"],
        HOLD: ["CONFIRM"],
        CONFIRM: ["TICKET"],
        TICKET: ["COMPLETE"],
      };

      const allowedNext = validFlow[booking.current_state as keyof typeof validFlow] ?? [];
      if (!allowedNext.includes(String(payload.to_state))) {
        await supabase.from("booking_state_history").insert({
          tenant_id: userAccount.tenant_id,
          booking_id: booking.id,
          from_state: booking.current_state,
          to_state: String(payload.to_state),
          event_name: String(payload.event_name),
          actor_user_id: userAccount.id,
          transition_status: "failed",
          failure_reason: "invalid_transition",
        });
        return badRequest(`Invalid transition from ${booking.current_state} to ${String(payload.to_state)}`, 422);
      }

      const { data: updated, error: updateError } = await supabase
        .from("bookings")
        .update({ current_state: payload.to_state })
        .eq("id", booking.id)
        .select()
        .single();
      if (updateError) throw updateError;

      await supabase.from("booking_state_history").insert({
        tenant_id: userAccount.tenant_id,
        booking_id: booking.id,
        from_state: booking.current_state,
        to_state: String(payload.to_state),
        event_name: String(payload.event_name),
        actor_user_id: userAccount.id,
        transition_status: "success",
      });

      return new Response(JSON.stringify({ ok: true, booking: updated }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    if (moduleName === "integrations" && actionName === "providers") {
      const payload = body as Json;
      if (!payload.provider_key || !payload.provider_type) {
        return badRequest("provider_key and provider_type are required");
      }
      const { data, error } = await supabase
        .from("integration_providers")
        .upsert({
          tenant_id: userAccount.tenant_id,
          provider_key: payload.provider_key,
          provider_type: payload.provider_type,
          base_url: payload.base_url,
          auth_type: payload.auth_type,
          status_note: "READY FOR LIVE API KEY",
        }, { onConflict: "tenant_id,provider_key" })
        .select()
        .single();
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true, provider: data }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    if (moduleName === "analytics" && actionName === "track") {
      const payload = body as Json;
      if (!payload.module_type || !payload.event_name) {
        return badRequest("module_type and event_name are required");
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
      return new Response(JSON.stringify({ ok: true, event: data }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    if (moduleName === "ai" && actionName === "execute") {
      const payload = body as Json;
      if (!payload.module_type || !payload.input_payload) {
        return badRequest("module_type and input_payload are required");
      }
      const { data, error } = await supabase
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
      return new Response(JSON.stringify({ ok: true, execution: data, live_status: "READY FOR LIVE API KEY" }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    return badRequest(`Unsupported route for module=${moduleName} action=${actionName}`, 404);
  } catch (error) {
    return badRequest(String(error), 500);
  }
});
