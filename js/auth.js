/**
 * CelebClub Auth
 * Handles login / logout / role detection.
 * In Supabase mode: uses supabase.auth.signInWithPassword + profiles table.
 */

const Auth = (() => {

    const SESSION_KEY = 'cc_session';

    function saveSession(user) {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
    }

    function clearSession() {
        sessionStorage.removeItem(SESSION_KEY);
    }

    // ── Public API ────────────────────────────────────────────────────────────

    function getSession() {
        const raw = sessionStorage.getItem(SESSION_KEY);
        return raw ? JSON.parse(raw) : null;
    }

    async function login(email, password) {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw new Error(error.message);

        const userId = data.user.id;
        const userEmail = data.user.email;

        let { data: profile, error: profileErr } = await supabase
            .from('profiles')
            .select('id, email, name, initials, role')
            .eq('id', userId)
            .single();

        // Profile missing (e.g. account created before trigger was fixed) — create it now
        if (profileErr || !profile) {
            const meta = data.user.user_metadata || {};
            const name = meta.name || (userEmail ? userEmail.split('@')[0] : 'User');
            const initials = name.slice(0, 2).toUpperCase();
            const role = meta.role || 'model';

            const { data: inserted, error: insertErr } = await supabase
                .from('profiles')
                .insert({ id: userId, email: userEmail, name, initials, role })
                .select('id, email, name, initials, role')
                .single();

            if (insertErr || !inserted) {
                throw new Error('Profil konnte nicht erstellt werden: ' + (insertErr?.message || 'Unbekannter Fehler'));
            }
            profile = inserted;
        }

        saveSession(profile);
        return profile;
    }

    async function logout() {
        clearSession();
        if (supabase) await supabase.auth.signOut();
        window.location.href = 'login.html';
    }

    function redirectAfterLogin(user) {
        if (user.role === 'manager') {
            window.location.href = 'manager.html';
        } else {
            window.location.href = 'index.html';
        }
    }

    /**
     * Call at the top of every protected page.
     * allowedRole: 'model' | 'manager' | null (any)
     */
    function requireAuth(allowedRole = null) {
        const user = getSession();
        if (!user) {
            window.location.href = 'login.html';
            return null;
        }
        if (allowedRole && user.role !== allowedRole) {
            redirectAfterLogin(user);
            return null;
        }
        return user;
    }

    return { getSession, login, logout, requireAuth, redirectAfterLogin };
})();
