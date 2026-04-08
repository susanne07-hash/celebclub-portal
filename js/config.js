/**
 * CelebClub Platform Config
 *
 * USE_MOCK = true  → runs entirely on local demo data, no backend needed
 * USE_MOCK = false → connects to Supabase (fill in URL + KEY first)
 */
const APP_CONFIG = {
    USE_MOCK: true,
    SUPABASE_URL:      'YOUR_SUPABASE_URL',
    SUPABASE_ANON_KEY: 'YOUR_SUPABASE_ANON_KEY',
};

// Supabase client (only initialised when USE_MOCK = false)
let supabase = null;
if (!APP_CONFIG.USE_MOCK && window.supabase) {
    supabase = window.supabase.createClient(
        APP_CONFIG.SUPABASE_URL,
        APP_CONFIG.SUPABASE_ANON_KEY
    );
}
