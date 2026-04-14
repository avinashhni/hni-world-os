import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

function response(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return response(405, { ok: false, error: { code: "method_not_allowed" } });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) return response(401, { ok: false, error: { code: "missing_bearer_token" } });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: userInfo, error: authError } = await supabase.auth.getUser(token);
    if (authError || !userInfo.user) {
      return response(401, { ok: false, error: { code: "unauthorized" } });
    }

    const body = await req.json();
    if (!body.lead_id || !body.partner_profile_id) {
      return response(400, { ok: false, error: { code: "validation_error", message: "lead_id and partner_profile_id are required" } });
    }

    const { data, error } = await supabase
      .from("leads")
      .update({
        assigned_partner_id: body.partner_profile_id,
        status: "claimed",
      })
      .eq("id", body.lead_id)
      .eq("status", "open")
      .select()
      .single();

    if (error) throw error;

    await supabase.from("audit_logs").insert({
      tenant_id: Deno.env.get("DEFAULT_TENANT_ID"),
      actor_user_id: null,
      source_system: "LEGALNOMICS",
      action: "claim_lead",
      entity_type: "lead",
      entity_id: body.lead_id,
      action_payload: { partner_profile_id: body.partner_profile_id },
    });

    return response(200, { ok: true, lead: data });
  } catch (err) {
    return response(400, { ok: false, error: { code: "claim_lead_failed", message: String(err) } });
  }
});
