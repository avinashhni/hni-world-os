import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    const body = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: intake, error } = await supabase
      .from("b2c_intakes")
      .insert({
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
        status: "new"
      })
      .select()
      .single();

    if (error) throw error;

    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .insert({
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
        status: "open"
      })
      .select()
      .single();

    if (leadError) throw leadError;

    return new Response(JSON.stringify({ ok: true, intake, lead }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }
});
