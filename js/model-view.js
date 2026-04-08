/**
 * CelebClub – Model View
 * Loads and renders dynamic data for the model dashboard.
 */

const ModelView = (() => {

    const TYPE_ICONS = { document: '📋', template: '🎨', sheet: '🗓', audio: '🎵', link: '🔗', pdf: '📄' };
    const PRIORITY_LABELS = { urgent: 'Dringend', high: 'Hoch', medium: 'Mittel', low: 'Niedrig' };
    const PRIORITY_TAGS   = { urgent: 'tag-urgent', high: 'tag-high', medium: 'tag-medium', low: '' };

    function fmt(n) {
        if (n === null || n === undefined) return '–';
        if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
        if (n >= 1000)    return (n / 1000).toFixed(1) + 'K';
        return String(n);
    }
    function fmtMoney(n) { return n ? '$' + n.toLocaleString('en-US') : '$0'; }

    // ── KPI Grid ─────────────────────────────────────────────────────────────
    function renderKpiGrid(kpis, containerId) {
        const el = document.getElementById(containerId);
        if (!el || !kpis) return;
        el.innerHTML = `
            <div class="kpi-card">
                <div class="kpi-label">OF Umsatz · Heute</div>
                <div class="kpi-value">${fmtMoney(kpis.ofRevenueToday)}</div>
                <div class="kpi-trend trend-neutral">→ heute</div>
            </div>
            <div class="kpi-card">
                <div class="kpi-label">OF Umsatz · Monat</div>
                <div class="kpi-value">${fmtMoney(kpis.ofRevenueMonth)}</div>
                <div class="kpi-trend trend-up">↑ lfd. Monat</div>
            </div>
            <div class="kpi-card">
                <div class="kpi-label">Neue Abonnenten</div>
                <div class="kpi-value">+${kpis.ofSubscribersNew}</div>
                <div class="kpi-trend trend-neutral">→ heute</div>
            </div>
            <div class="kpi-card">
                <div class="kpi-label">Renewal Rate</div>
                <div class="kpi-value">${kpis.ofRenewalRate}%</div>
                <div class="kpi-trend ${kpis.ofRenewalRate >= 65 ? 'trend-up' : 'trend-down'}">${kpis.ofRenewalRate >= 65 ? '↑' : '↓'} Rebill</div>
            </div>
            <div class="kpi-card">
                <div class="kpi-label">IG Views · Woche</div>
                <div class="kpi-value">${fmt(kpis.igViewsWeek)}</div>
                <div class="kpi-trend trend-up">↑ diese Woche</div>
            </div>
            <div class="kpi-card">
                <div class="kpi-label">Follower-Wachstum</div>
                <div class="kpi-value">${kpis.followerGrowthWeek >= 0 ? '+' : ''}${fmt(kpis.followerGrowthWeek)}</div>
                <div class="kpi-trend ${kpis.followerGrowthWeek >= 0 ? 'trend-up' : 'trend-down'}">${kpis.followerGrowthWeek >= 0 ? '↑' : '↓'} diese Woche</div>
            </div>
        `;
    }

    // ── Goal Bar ──────────────────────────────────────────────────────────────
    function renderGoalBar(kpis, model) {
        const el = document.getElementById('goalCard');
        if (!el) return;
        const goal = model.monthlyGoal || 0;
        const current = kpis.ofRevenueMonth || 0;
        const pct = goal ? Math.min(100, Math.round((current / goal) * 100)) : 0;
        const remaining = Math.max(0, goal - current);
        el.innerHTML = `
            <div class="goal-header">
                <span class="goal-label">Monatsziel ${new Date().toLocaleString('de-DE',{month:'long'})}</span>
                <span class="goal-value">${fmtMoney(current)} / ${fmtMoney(goal)}</span>
            </div>
            <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
            <div class="goal-meta">${pct}% erreicht · noch ${fmtMoney(remaining)} bis zum Ziel</div>
        `;
    }

    // ── Task List (dashboard preview) ─────────────────────────────────────────
    function renderDashTaskList(tasks) {
        const el = document.getElementById('dashTaskList');
        if (!el) return;
        const open = tasks.filter(t => t.status !== 'done').slice(0, 5);
        const done = tasks.filter(t => t.status === 'done').slice(0, 2);
        const all  = [...open, ...done];
        if (!all.length) { el.innerHTML = '<p style="color:var(--text-muted);font-size:13px">Keine offenen Tasks.</p>'; return; }

        const today = new Date().toISOString().split('T')[0];
        const todayItems = all.filter(t => t.dueDate === today);
        const otherItems = all.filter(t => t.dueDate !== today).slice(0, 3);

        let html = '';
        if (todayItems.length) {
            html += `<div class="task-group-label">Heute</div>`;
            html += todayItems.map(t => taskItemHTML(t)).join('');
        }
        if (otherItems.length) {
            html += `<div class="task-group-label" style="margin-top:12px">Diese Woche</div>`;
            html += otherItems.map(t => taskItemHTML(t)).join('');
        }
        el.innerHTML = html;
        bindTaskCheckboxes(el);
    }

    function taskItemHTML(t) {
        const tagClass = PRIORITY_TAGS[t.priority] || '';
        const tag = (t.priority === 'urgent' || t.priority === 'high')
            ? `<span class="task-tag ${tagClass}">${PRIORITY_LABELS[t.priority]}</span>` : '';
        return `
            <label class="task-item ${t.status === 'done' ? 'task-done' : ''}">
                <input type="checkbox" class="task-check" data-id="${t.id}" ${t.status === 'done' ? 'checked' : ''}>
                <span class="task-text">${t.title}</span>
                ${tag}
            </label>`;
    }

    // ── Full Tasks Section ────────────────────────────────────────────────────
    function renderTaskColumns(tasks) {
        const el = document.getElementById('taskColumns');
        if (!el) return;

        const today = new Date().toISOString().split('T')[0];
        const urgent  = tasks.filter(t => t.priority === 'urgent' && t.status !== 'done');
        const todayT  = tasks.filter(t => t.dueDate === today && t.priority !== 'urgent');
        const week    = tasks.filter(t => t.dueDate > today);
        const doneT   = tasks.filter(t => t.status === 'done');

        el.innerHTML = [
            columnHTML('Dringend', urgent, 'urgent'),
            columnHTML('Heute',    todayT,  'today'),
            columnHTML('Diese Woche', week, 'week'),
            columnHTML('Erledigt', doneT,   'done'),
        ].join('');

        el.querySelectorAll('.task-check').forEach(cb => {
            cb.addEventListener('change', async () => {
                const id = cb.dataset.id;
                const newStatus = cb.checked ? 'done' : 'open';
                await DB.updateTask(id, { status: newStatus });
                cb.closest('.task-item').classList.toggle('task-done', cb.checked);
                await refreshTaskBadge(tasks[0]?.modelId);
            });
        });
    }

    function columnHTML(label, items, key) {
        return `
            <div class="card task-column">
                <div class="task-column-head">
                    <span class="task-column-title">${label}</span>
                    <span class="task-column-count">${items.length}</span>
                </div>
                ${items.length
                    ? items.map(t => fullTaskItemHTML(t)).join('')
                    : `<p style="color:var(--text-muted);font-size:12px;padding:6px 0">Keine Tasks.</p>`
                }
            </div>`;
    }

    function fullTaskItemHTML(t) {
        const tagClass = PRIORITY_TAGS[t.priority] || '';
        const tag = PRIORITY_LABELS[t.priority]
            ? `<span class="task-tag ${tagClass}" style="margin-top:4px">${PRIORITY_LABELS[t.priority]}</span>` : '';
        return `
            <label class="task-item task-item--full ${t.status === 'done' ? 'task-done' : ''}">
                <input type="checkbox" class="task-check" data-id="${t.id}" ${t.status === 'done' ? 'checked' : ''}>
                <div class="task-body">
                    <div class="task-text">${t.title}</div>
                    ${t.notes ? `<div class="task-meta">${t.notes}</div>` : ''}
                    ${t.dueDate ? `<div class="task-meta">Fällig: ${t.dueDate}</div>` : ''}
                    ${tag}
                </div>
            </label>`;
    }

    function bindTaskCheckboxes(container) {
        container.querySelectorAll('.task-check').forEach(cb => {
            cb.addEventListener('change', async () => {
                const id = cb.dataset.id;
                const newStatus = cb.checked ? 'done' : 'open';
                await DB.updateTask(id, { status: newStatus });
                cb.closest('.task-item').classList.toggle('task-done', cb.checked);
            });
        });
    }

    async function refreshTaskBadge(modelId) {
        const tasks = await DB.getTasks(modelId);
        const open  = tasks.filter(t => t.status !== 'done' && t.priority === 'urgent').length;
        const badge = document.getElementById('taskBadge');
        if (badge) {
            badge.textContent = open;
            badge.style.display = open > 0 ? 'inline-flex' : 'none';
        }
    }

    // ── Resources ─────────────────────────────────────────────────────────────
    async function renderResources(modelId) {
        const [resources, categories] = await Promise.all([
            DB.getResources(modelId),
            DB.getResourceCategories(),
        ]);

        const tabsEl = document.getElementById('resourceTabs');
        const gridEl = document.getElementById('resourceGrid');
        if (!tabsEl || !gridEl) return;

        // Tabs
        tabsEl.innerHTML = `<button class="rtab active" data-cat="all">Alle</button>` +
            categories.map(c => `<button class="rtab" data-cat="${c.slug}">${c.name}</button>`).join('');

        // Cards
        function renderCards(cat, query) {
            gridEl.innerHTML = resources
                .filter(r => (cat === 'all' || r.categorySlug === cat) &&
                             (!query || r.title.toLowerCase().includes(query.toLowerCase()) || r.description.toLowerCase().includes(query.toLowerCase())))
                .map(r => `
                    <div class="resource-card card" data-cat="${r.categorySlug}">
                        <div class="resource-icon">${TYPE_ICONS[r.type] || '📁'}</div>
                        <div class="resource-body">
                            <div class="resource-title">${r.title}${r.pinned ? ' <span style="color:var(--accent);font-size:10px">★</span>' : ''}</div>
                            <div class="resource-desc">${r.description}</div>
                        </div>
                        <a href="${r.url}" target="_blank" rel="noopener" class="resource-btn">Öffnen</a>
                    </div>
                `).join('') || `<p style="color:var(--text-muted);font-size:13px;grid-column:1/-1">Keine Ressourcen gefunden.</p>`;
        }

        renderCards('all', '');

        let activeCat = 'all';
        tabsEl.querySelectorAll('.rtab').forEach(tab => {
            tab.addEventListener('click', () => {
                tabsEl.querySelectorAll('.rtab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                activeCat = tab.dataset.cat;
                const q = document.getElementById('resourceSearch')?.value || '';
                renderCards(activeCat, q);
            });
        });

        document.getElementById('resourceSearch')?.addEventListener('input', e => {
            renderCards(activeCat, e.target.value);
        });
    }

    // ── Performance extended ──────────────────────────────────────────────────
    function renderPerfSection(kpis, model) {
        renderKpiGrid(kpis, 'perfKpiGrid');

        const labelEl = document.getElementById('perfModelLabel');
        if (labelEl) labelEl.textContent = model.name + ' · ' + new Date().toLocaleString('de-DE', { month: 'long', year: 'numeric' });

        const bestEl = document.getElementById('bestPostCard');
        if (bestEl) bestEl.innerHTML = `
            <div class="panel-head"><h3 class="panel-title">Bester Post dieser Woche</h3></div>
            <div class="workflow-list" style="margin-top:12px">
                <div class="workflow-item"><span class="workflow-dot dot-purple"></span><span class="workflow-label">Post</span><span class="workflow-value">${kpis.bestPost || '–'}</span></div>
                <div class="workflow-item"><span class="workflow-dot dot-pink"></span><span class="workflow-label">OF Woche</span><span class="workflow-value">${fmtMoney(kpis.ofRevenueWeek)}</span></div>
                <div class="workflow-item"><span class="workflow-dot dot-green"></span><span class="workflow-label">TikTok Views</span><span class="workflow-value">${fmt(kpis.tiktokViewsWeek)}</span></div>
            </div>`;
    }

    // ── Settings form ─────────────────────────────────────────────────────────
    const PLATFORM_LABELS = { instagram: 'Instagram', tiktok: 'TikTok', onlyfans: 'OnlyFans', youtube: 'YouTube', telegram: 'Telegram', twitter: 'Twitter/X' };
    const PLATFORM_ICONS  = { instagram: 'IG', tiktok: 'TT', onlyfans: 'OF', youtube: 'YT', telegram: 'TG', twitter: 'TW' };

    async function renderSettings(model) {
        const el = document.getElementById('settingsForm');
        if (!el) return;

        const accounts = await DB.getSocialAccounts(model.id);

        const accountsHTML = accounts.length
            ? accounts.map(a => `
                <div class="sa-readonly-row">
                    <span class="account-chip${a.isPrimary ? ' chip-primary' : ''}">${PLATFORM_ICONS[a.platform] || a.platform.toUpperCase()} ${a.username}</span>
                    ${a.url ? `<a href="${a.url}" target="_blank" rel="noopener" class="sa-link">${PLATFORM_LABELS[a.platform] || a.platform}</a>` : `<span class="sa-platform-label">${PLATFORM_LABELS[a.platform] || a.platform}</span>`}
                    ${a.isPrimary ? '<span class="sa-primary-badge">Primär</span>' : ''}
                </div>`).join('')
            : '<p class="sa-empty">Noch keine Accounts verknüpft. Bitte Management kontaktieren.</p>';

        el.innerHTML = `
            <div class="settings-row"><label class="settings-label">Name</label><input class="settings-input" id="sName" value="${model.name || ''}"></div>
            <div class="settings-row">
                <label class="settings-label">Social Accounts</label>
                <div class="sa-readonly-list">${accountsHTML}</div>
                <p class="sa-hint">Accounts werden vom Management verwaltet.</p>
            </div>
            <button class="btn-primary" style="margin-top:8px" id="saveSettingsBtn">Speichern</button>
            <span class="section-meta" id="settingsSaved" style="display:none;margin-left:10px">✓ Gespeichert</span>
        `;
        document.getElementById('saveSettingsBtn').addEventListener('click', async () => {
            await DB.updateModel(model.id, { name: document.getElementById('sName').value });
            const saved = document.getElementById('settingsSaved');
            saved.style.display = 'inline';
            setTimeout(() => saved.style.display = 'none', 2500);
        });
    }

    // ── Init ──────────────────────────────────────────────────────────────────
    async function init() {
        const user = Auth.requireAuth('model');
        if (!user) return;

        // Fill header
        document.getElementById('headerName').textContent   = user.name.split(' ')[0];
        document.getElementById('headerAvatar').textContent = user.initials;
        const mobileAvatar = document.getElementById('mobileAvatar');
        const mobileName   = document.getElementById('mobileName');
        if (mobileAvatar) mobileAvatar.textContent = user.initials;
        if (mobileName)   mobileName.textContent   = user.name;

        // Load model data
        const model = await DB.getModelByUserId(user.id);
        if (!model) {
            document.querySelector('.main-content').innerHTML =
                '<p style="padding:40px;color:var(--text-muted)">Kein Model-Profil gefunden. Bitte Management kontaktieren.</p>';
            return;
        }

        const [kpis, tasks] = await Promise.all([
            DB.getKpis(model.id),
            DB.getTasks(model.id),
        ]);

        // Dashboard
        renderKpiGrid(kpis, 'kpiGrid');
        renderGoalBar(kpis, model);
        renderDashTaskList(tasks);

        // Performance
        renderPerfSection(kpis, model);

        // Tasks
        renderTaskColumns(tasks);
        await refreshTaskBadge(model.id);

        // Resources
        await renderResources(model.id);

        // Settings
        await renderSettings(model);

        document.getElementById('kpiUpdatedAt').textContent =
            'Letzte Aktualisierung: heute, ' + new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    }

    return { init };
})();

document.addEventListener('DOMContentLoaded', () => {
    ModelView.init();
});
