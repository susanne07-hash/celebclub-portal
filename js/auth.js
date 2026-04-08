/**
 * CelebClub Auth
 * Handles login / logout / role detection for both mock and Supabase modes.
 */

const Auth = (() => {

    const SESSION_KEY = 'cc_session';

    // ── Mock users ────────────────────────────────────────────────────────────
    const MOCK_USERS = [
        { id: 'u1', email: 'manager@celebclub.com', password: 'demo1234', role: 'manager', name: 'Admin Manager',  initials: 'AM', modelId: null },
        { id: 'u2', email: 'sarah@celebclub.com',   password: 'demo1234', role: 'model',   name: 'Sarah Mitchell', initials: 'SM', modelId: 'm1' },
        { id: 'u3', email: 'lena@celebclub.com',    password: 'demo1234', role: 'model',   name: 'Lena Weber',     initials: 'LW', modelId: 'm2' },
        { id: 'u4', email: 'mia@celebclub.com',     password: 'demo1234', role: 'model',   name: 'Mia Torres',     initials: 'MT', modelId: 'm3' },
    ];

    // ── Internal helpers ──────────────────────────────────────────────────────
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
        if (APP_CONFIG.USE_MOCK) {
            const user = MOCK_USERS.find(
                u => u.email === email && u.password === password
            );
            if (!user) throw new Error('E-Mail oder Passwort falsch.');
            const { password: _pw, ...safe } = user;
            saveSession(safe);
            return safe;
        }

        // Supabase mode
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw new Error(error.message);
        const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', data.user.id)
            .single();
        saveSession(profile);
        return profile;
    }

    function loginAsDemo(userId) {
        const user = MOCK_USERS.find(u => u.id === userId);
        if (!user) return;
        const { password: _pw, ...safe } = user;
        saveSession(safe);
        redirectAfterLogin(safe);
    }

    function logout() {
        clearSession();
        if (!APP_CONFIG.USE_MOCK && supabase) supabase.auth.signOut();
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

    return { getSession, login, loginAsDemo, logout, requireAuth, redirectAfterLogin };
})();
