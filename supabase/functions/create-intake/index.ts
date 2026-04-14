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
    if (!body.intake_type || !body.full_name || !body.category) {
      return response(400, {
        ok: false,
        error: { code: "validation_error", message: "intake_type, full_name, and category are required" },
      });
    }

    const { data: intake, error } = await supabase
      .from("b2c_intakes")
      .insert({
        tenant_id: userAccount.tenant_id,
        created_by: userInfo.user.id,
        intake_type: body.intake_type,
        full_name: body.full_name,
        email: body.email,
        phone: body.phone,
        category: body.category,
        urgency: body.urgency,
        preferred_language: body.preferred_language,
        summary: body.summary,
        desired_outcome: body.desired_outcome,
        city: body.city,
        state: body.state,
        country: body.country || "India",
        geo_code: body.geo_code,
        status: "new",
      })
      .select()
      .single();

    if (error) throw error;

    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .insert({
        tenant_id: userAccount.tenant_id,
        intake_id: intake.id,
        lead_type: body.intake_type,
        category: body.category,
        urgency: body.urgency,
        city: body.city,
        state: body.state,
        country: body.country || "India",
        geo_code: body.geo_code,
        budget_band: body.budget_band || "standard",
        premium: body.premium || false,
        status: "open",
      })
      .select()
      .single();

    if (leadError) throw leadError;

    await supabase.from("audit_logs").insert({
      tenant_id: userAccount.tenant_id,
      actor_user_id: userAccount.id,
      source_system: "LEGALNOMICS",
      action: "create_intake",
      entity_type: "b2c_intake",
      entity_id: intake.id,
      action_payload: { lead_id: lead.id, category: body.category },
    });

    return response(201, { ok: true, intake, lead });
  } catch (err) {
    return response(400, { ok: false, error: { code: "create_intake_failed", message: String(err) } });
  }
});
