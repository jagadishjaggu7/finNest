/* FinNest Supabase client
   Uses the public publishable key. Never put a service-role/secret key here.
*/
window.FinNestSupabaseConfig = {
    url: "https://kfusphlyrwsjddqjnlwe.supabase.co",
    publishableKey: "sb_publishable_ZyFKsmVfX6yShJkRgGKuSA_MavEQ6PU"
};

window.finnestSupabase = window.supabase.createClient(
    window.FinNestSupabaseConfig.url,
    window.FinNestSupabaseConfig.publishableKey
);
