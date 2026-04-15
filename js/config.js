/**
 * CelebClub Platform Config
 *
 * USE_MOCK = true  → runs entirely on local demo data, no backend needed
 * USE_MOCK = false → connects to Supabase
 */
const APP_CONFIG = {
    USE_MOCK: false,
    SUPABASE_URL:      'https://hfslagaqmfjrshfxusdd.supabase.co',
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhmc2xhZ2FxbWZqcnNoZnh1c2RkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0ODA5ODQsImV4cCI6MjA5MTA1Njk4NH0.rCW_nlq2xgFeF8WDOJQH1kn1xgryNnXr9dOoAsIjXws',
};

// Supabase client (only initialised when USE_MOCK = false)
// No var/let declaration here — that would hoist and clobber window.supabase (the SDK).
// We directly replace window.supabase with the initialised client so all other
// scripts (auth.js, data.js, snapshots.js) can access it as `supabase`.
if (!APP_CONFIG.USE_MOCK) {
    // Replace the SDK reference with the initialised client so auth.js / data.js /
    // snapshots.js all resolve `supabase` (via window.supabase) to the client.
    window.supabase = window.supabase.createClient(
        APP_CONFIG.SUPABASE_URL,
        APP_CONFIG.SUPABASE_ANON_KEY
    );
}
