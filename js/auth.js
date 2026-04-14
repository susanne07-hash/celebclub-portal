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

        const { data: profile, error: profileErr } = await supabase
            .from('profiles')
            .select('id, email, name, initials, role')
            .eq('id', data.user.id)
            .single();

        if (profileErr || !profile) {
            throw new Error('Profil nicht gefunden. Bitte kontaktiere den Administrator.');
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
