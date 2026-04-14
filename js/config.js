/**
 * CelebClub Platform Config
 *
 * USE_MOCK = true  → runs entirely on local demo data, no backend needed
 * USE_MOCK = false → connects to Supabase
 */
const APP_CONFIG = {
    USE_MOCK: false,
    SUPABASE_URL:      'https://hfslagaqmfjrshfxusdd.supabase.co',
    SUPABASE_ANON_KEY: 'sb_publishable_WyWaidmOQXilt1n3edSl0Q_rzK_V2hs',
};

// Supabase client (only initialised when USE_MOCK = false)
let supabase = null;
if (!APP_CONFIG.USE_MOCK) {
    supabase = window.supabase.createClient(
        APP_CONFIG.SUPABASE_URL,
        APP_CONFIG.SUPABASE_ANON_KEY
    );
}
