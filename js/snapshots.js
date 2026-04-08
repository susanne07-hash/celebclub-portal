/**
 * CelebClub · Snapshots
 * Loads data/snapshots.json and exposes helpers for the UI.
 */

const Snapshots = (() => {

    let _data = null;

    async function load() {
        try {
            const r = await fetch('./data/snapshots.json');
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            _data = await r.json();
        } catch (e) {
            console.warn('[Snapshots] Could not load snapshots.json:', e.message);
            _data = { updated: null, snapshots: {} };
        }
        return _data;
    }

    /** Returns the most recent snapshot entry for a model+platform, or null. */
    function latest(modelId, platform) {
        const history = _data?.snapshots?.[modelId]?.[platform]?.history;
        if (!history?.length) return null;
        return history[history.length - 1];
    }

    /** Returns the previous day's snapshot entry, or null. */
    function previous(modelId, platform) {
        const history = _data?.snapshots?.[modelId]?.[platform]?.history;
        if (!history || history.length < 2) return null;
        return history[history.length - 2];
    }

    /** Returns { followers, delta, pct } or null if no data. */
    function followerStats(modelId, platform) {
        const cur  = latest(modelId, platform);
        if (!cur) return null;
        const prev = previous(modelId, platform);
        const delta = prev ? cur.followers - prev.followers : null;
        const pct   = (delta !== null && prev?.followers)
            ? ((delta / prev.followers) * 100).toFixed(1)
            : null;
        return { followers: cur.followers, delta, pct, date: cur.date };
    }

    /** Returns last N days of history for a model+platform. */
    function history(modelId, platform, days = 30) {
        const hist = _data?.snapshots?.[modelId]?.[platform]?.history || [];
        return hist.slice(-days);
    }

    /** The date of the last successful fetch. */
    function lastUpdated() {
        return _data?.updated || null;
    }

    return { load, latest, previous, followerStats, history, lastUpdated };
})();
