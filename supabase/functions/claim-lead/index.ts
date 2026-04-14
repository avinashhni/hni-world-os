import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

const ALLOWED_ROLES = ["OWNER", "SUPER_ADMIN", "MANAGEMENT", "LEGAL_MANAGER", "STAFF"];

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

    const { data: userAccount, error: accountError } = await supabase
      .from("user_accounts")
      .select("id,tenant_id")
      .eq("auth_user_id", userInfo.user.id)
      .single();

    if (accountError || !userAccount) {
      return response(403, { ok: false, error: { code: "user_not_provisioned" } });
    }

    const { data: assignedRoles } = await supabase
      .from("user_role_assignments")
      .select("roles(role_key)")
      .eq("user_id", userAccount.id)
      .eq("tenant_id", userAccount.tenant_id);

    const roleKeys = (assignedRoles ?? []).map((row: { roles?: { role_key?: string } }) => row.roles?.role_key).filter(Boolean);
    if (!roleKeys.some((role: string) => ALLOWED_ROLES.includes(role))) {
      return response(403, { ok: false, error: { code: "forbidden" } });
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
      .eq("tenant_id", userAccount.tenant_id)
      .select()
      .single();

    if (error) throw error;

    await supabase.from("audit_logs").insert({
      tenant_id: userAccount.tenant_id,
      actor_user_id: userAccount.id,
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
