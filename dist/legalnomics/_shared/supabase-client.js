(function () {
  const cfg = window.LEGALNOMICS_CONFIG || {};
  if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) {
    console.warn("Supabase runtime config is missing.");
    return;
  }
  if (!window.supabase || !window.supabase.createClient) {
    console.error("Supabase library not loaded.");
    return;
  }
  window.legalnomicsSupabase = window.supabase.createClient(
    cfg.SUPABASE_URL,
    cfg.SUPABASE_ANON_KEY,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    }
  );
})();
