/**
 * CelebClub – Manager View
 * Handles overview, task board, model CRUD, resource CRUD.
 */

const ManagerView = (() => {

    const STATUS_LABELS   = { active: 'Aktiv', paused: 'Pausiert', onboarding: 'Onboarding', inactive: 'Inaktiv' };
    const STATUS_CLASSES  = { active: 'status-active', paused: 'status-paused', onboarding: 'status-onboarding', inactive: 'status-inactive' };
    const PRIORITY_LABELS = { urgent: 'Dringend', high: 'Hoch', medium: 'Mittel', low: 'Niedrig' };
    const PRIORITY_TAGS   = { urgent: 'tag-urgent', high: 'tag-high', medium: 'tag-medium', low: 'tag-low' };
    const TYPE_ICONS      = { document: '📋', template: '🎨', sheet: '🗓', audio: '🎵', link: '🔗', pdf: '📄' };

    const PLATFORM_LABELS = { instagram: 'Instagram', tiktok: 'TikTok', onlyfans: 'OnlyFans', youtube: 'YouTube', telegram: 'Telegram', twitter: 'X/Twitter' };
    const PLATFORM_SHORT  = { instagram: 'IG', tiktok: 'TT', onlyfans: 'OF', youtube: 'YT', telegram: 'TG', twitter: 'X' };
    const PLATFORMS       = ['instagram', 'tiktok', 'onlyfans', 'youtube', 'telegram', 'twitter'];
    const EDIT_PLATFORMS  = ['instagram', 'tiktok', 'onlyfans', 'youtube', 'telegram'];
    const PLATFORM_TAG_CLS = { instagram:'platform-ig', tiktok:'platform-tt', onlyfans:'platform-of', youtube:'platform-yt', telegram:'platform-tg' };
    const PLATFORM_URL_FN  = {
        instagram: u => `https://instagram.com/${u.replace(/^@/,'')}`,
        tiktok:    u => `https://tiktok.com/@${u.replace(/^@/,'')}`,
        onlyfans:  u => `https://onlyfans.com/${u.replace(/^@/,'')}`,
        youtube:   u => `https://youtube.com/@${u.replace(/^@/,'')}`,
        telegram:  u => `https://t.me/${u.replace(/^@/,'')}`,
        twitter:   u => `https://x.com/${u.replace(/^@/,'')}`,
    };
    function platformUrl(plat, user) {
        const fn = PLATFORM_URL_FN[plat];
        return (fn && user) ? fn(user) : '#';
    }

    // ── localStorage social profiles ─────────────────────────────────────────
    const _LS_KEY = 'cc_social_profiles';
    function _lsLoad()          { try { return JSON.parse(localStorage.getItem(_LS_KEY) || '{}'); } catch { return {}; } }
    function _lsSave(d)         { localStorage.setItem(_LS_KEY, JSON.stringify(d)); }
    function _lsGet(modelId)    { return _lsLoad()[modelId] || {}; }
    function _lsSet(modelId, d) { const all = _lsLoad(); all[modelId] = d; _lsSave(all); }
    function _profilesToAccounts(modelId, profiles) {
        const result = [];
        Object.entries(profiles).forEach(([platform, d]) => {
            if (!d.active) return;
            // Support both new { accounts:[] } and legacy { username:'' } format
            const list = d.accounts?.length ? d.accounts : (d.username ? [d.username] : []);
            list.forEach((username, i) => {
                if (!username) return;
                result.push({
                    id: `ls_${modelId}_${platform}_${i}`,
                    modelId, platform, username,
                    url: platformUrl(platform, username),
                    isPrimary: i === 0,
                });
            });
        });
        return result;
    }

    let _models     = [];
    let _tasks      = [];
    let _resources  = [];
    let _categories = [];
    let _socialAccounts = {}; // keyed by modelId

    function fmtMoney(n) { return n ? '$' + Number(n).toLocaleString('en-US') : '$0'; }
    function fmt(n) {
        if (!n) return '0';
        if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
        if (n >= 1000)    return (n / 1000).toFixed(1) + 'K';
        return String(n);
    }

    // ── Follower KPI with delta ───────────────────────────────────────────────
    function followerKpiHTML(modelId, platform, fallbackVal, label) {
        if (typeof Snapshots === 'undefined') {
            return `<div class="model-kpi"><div class="model-kpi-val">${fmt(fallbackVal)}</div><div class="model-kpi-lbl">${label}</div></div>`;
        }
        const stats = Snapshots.followerStats(modelId, platform);
        if (!stats) {
            return `<div class="model-kpi"><div class="model-kpi-val">${fmt(fallbackVal)}</div><div class="model-kpi-lbl">${label}</div></div>`;
        }
        const { followers, delta } = stats;
        let deltaHTML = '';
        if (delta !== null) {
            const sign  = delta >= 0 ? '+' : '';
            const cls   = delta > 0 ? 'follower-delta--up' : delta < 0 ? 'follower-delta--down' : 'follower-delta--flat';
            const arrow = delta > 0 ? '↑' : delta < 0 ? '↓' : '→';
            deltaHTML = `<div class="follower-delta ${cls}">${arrow} ${sign}${fmt(Math.abs(delta))}</div>`;
        }
        return `<div class="model-kpi">
            <div class="model-kpi-val">${fmt(followers)}</div>
            ${deltaHTML}
            <div class="model-kpi-lbl">${label} Follower</div>
        </div>`;
    }

    // ── Modal helpers ────────────────────────────────────────────────────────
    function openModal(title, bodyHTML, onSave) {
        document.getElementById('modalTitle').textContent = title;
        document.getElementById('modalBody').innerHTML    = bodyHTML;
        document.getElementById('modalOverlay').classList.add('open');
        document.getElementById('modalSave').onclick   = onSave;
        const delBtn = document.getElementById('modalDelete');
        delBtn.style.display = 'none';
        delBtn.onclick = null;
    }

    function closeModal() {
        document.getElementById('modalOverlay').classList.remove('open');
    }

    function val(id) {
        const el = document.getElementById(id);
        return el ? el.value.trim() : '';
    }

    // ── Summary strip ────────────────────────────────────────────────────────
    async function renderSummaryStrip() {
        const el = document.getElementById('summaryStrip');
        if (!el) return;
        const active   = _models.filter(m => m.status === 'active').length;
        const onboard  = _models.filter(m => m.status === 'onboarding').length;
        const urgent   = _tasks.filter(t => t.priority === 'urgent' && t.status !== 'done').length;
        const openT    = _tasks.filter(t => t.status === 'open' || t.status === 'in_progress').length;

        el.innerHTML = `
            <div class="summary-stat"><div class="summary-num">${_models.length}</div><div class="summary-label">Models gesamt</div></div>
            <div class="summary-stat"><div class="summary-num" style="color:var(--green)">${active}</div><div class="summary-label">Aktiv</div></div>
            <div class="summary-stat"><div class="summary-num" style="color:var(--warn)">${onboard}</div><div class="summary-label">Onboarding</div></div>
            <div class="summary-stat"><div class="summary-num" style="color:var(--danger)">${urgent}</div><div class="summary-label">Dringende Tasks</div></div>
            <div class="summary-stat"><div class="summary-num">${openT}</div><div class="summary-label">Offene Tasks</div></div>
        `;
    }

    // ── Model Cards (overview) ────────────────────────────────────────────────
    async function renderModelCards() {
        const el = document.getElementById('modelCardsGrid');
        if (!el) return;

        const cards = await Promise.all(_models.map(async m => {
            const kpis      = await DB.getKpis(m.id);
            const modelTasks = _tasks.filter(t => t.modelId === m.id);
            const openCount  = modelTasks.filter(t => t.status !== 'done').length;
            const urgentCount = modelTasks.filter(t => t.priority === 'urgent' && t.status !== 'done').length;

            return `
                <div class="model-card card">
                    <div class="model-card-head">
                        <div class="model-avatar">${m.initials}</div>
                        <div class="model-card-info">
                            <div class="model-card-name">${m.name}</div>
                            <span class="model-status-badge ${STATUS_CLASSES[m.status]}">${STATUS_LABELS[m.status]}</span>
                        </div>
                        <div class="model-card-actions">
                            <button class="icon-text-btn" onclick="ManagerView.openEditModel('${m.id}')">Bearbeiten</button>
                            <button class="icon-text-btn analytics-btn" onclick="ManagerView.openAnalytics('${m.id}')">Analytics</button>
                            <button class="icon-text-btn" onclick="ManagerView.openAddTask('${m.id}')">+ Task</button>
                        </div>
                    </div>

                    <div class="model-card-accounts">
                        ${accountChips(_socialAccounts[m.id] || [])}
                    </div>

                    <div class="model-card-kpis">
                        <div class="model-kpi"><div class="model-kpi-val">${fmtMoney(kpis?.ofRevenueMonth)}</div><div class="model-kpi-lbl">Umsatz Monat</div></div>
                        <div class="model-kpi"><div class="model-kpi-val">${kpis?.ofRenewalRate ?? '–'}%</div><div class="model-kpi-lbl">Renewal</div></div>
                        ${followerKpiHTML(m.id, 'instagram', kpis?.igViewsWeek, 'IG')}
                        ${followerKpiHTML(m.id, 'tiktok',    kpis?.tiktokViewsWeek, 'TT')}
                    </div>

                    <div class="model-card-footer">
                        <span class="model-task-info ${urgentCount > 0 ? 'has-urgent' : ''}">
                            ${urgentCount > 0 ? `⚡ ${urgentCount} dringend` : ''} ${openCount} Tasks offen
                        </span>
                        <div style="display:flex;gap:6px">
                            ${m.monthlyGoal ? goalMiniBar(kpis?.ofRevenueMonth || 0, m.monthlyGoal) : ''}
                        </div>
                    </div>
                    ${m.notes ? `<div class="model-notes">${m.notes}</div>` : ''}
                </div>`;
        }));
        el.innerHTML = cards.join('');
    }

    function goalMiniBar(current, goal) {
        const pct = Math.min(100, Math.round((current / goal) * 100));
        return `<div style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text-muted)">
            <div style="width:60px;height:4px;background:rgba(255,255,255,0.07);border-radius:4px;overflow:hidden">
                <div style="width:${pct}%;height:100%;background:linear-gradient(90deg,var(--accent),var(--accent-2));border-radius:4px"></div>
            </div>
            <span>${pct}%</span>
        </div>`;
    }

    // ── Task list ─────────────────────────────────────────────────────────────
    function renderTaskList(filterModel = 'all', filterStatus = 'all', filterPriority = 'all') {
        const el = document.getElementById('mgrTaskList');
        if (!el) return;

        const filtered = _tasks.filter(t =>
            (filterModel    === 'all' || t.modelId    === filterModel)    &&
            (filterStatus   === 'all' || t.status     === filterStatus)   &&
            (filterPriority === 'all' || t.priority   === filterPriority)
        );

        if (!filtered.length) {
            el.innerHTML = '<p style="color:var(--text-muted);padding:20px 0;font-size:13px">Keine Tasks gefunden.</p>';
            return;
        }

        el.innerHTML = `
            <div class="mgr-task-table">
                <div class="mgr-task-header">
                    <span>Task</span><span>Model</span><span>Priorität</span><span>Status</span><span>Fällig</span><span></span>
                </div>
                ${filtered.map(t => {
                    const model = _models.find(m => m.id === t.modelId);
                    return `
                    <div class="mgr-task-row" data-id="${t.id}">
                        <span class="mgr-task-title">${t.title}${t.notes ? `<span class="task-meta">${t.notes}</span>` : ''}</span>
                        <span><div class="mini-avatar">${model?.initials || '?'}</div> ${model?.name || '–'}</span>
                        <span><span class="task-tag ${PRIORITY_TAGS[t.priority]}">${PRIORITY_LABELS[t.priority]}</span></span>
                        <span>
                            <select class="status-select" data-id="${t.id}">
                                <option value="open"        ${t.status === 'open'        ? 'selected' : ''}>Offen</option>
                                <option value="in_progress" ${t.status === 'in_progress' ? 'selected' : ''}>In Arbeit</option>
                                <option value="done"        ${t.status === 'done'        ? 'selected' : ''}>Erledigt</option>
                                <option value="overdue"     ${t.status === 'overdue'     ? 'selected' : ''}>Überfällig</option>
                            </select>
                        </span>
                        <span class="mgr-task-due ${isOverdue(t) ? 'overdue' : ''}">${t.dueDate || '–'}</span>
                        <span style="display:flex;gap:6px">
                            <button class="icon-text-btn edit-task-btn" data-id="${t.id}">Bearbeiten</button>
                            <button class="icon-text-btn danger delete-task-btn" data-id="${t.id}">Löschen</button>
                        </span>
                    </div>`;
                }).join('')}
            </div>`;

        // Status change
        el.querySelectorAll('.status-select').forEach(sel => {
            sel.addEventListener('change', async () => {
                await DB.updateTask(sel.dataset.id, { status: sel.value });
                const idx = _tasks.findIndex(t => t.id === sel.dataset.id);
                if (idx >= 0) _tasks[idx].status = sel.value;
                updateTaskBadge();
            });
        });

        // Edit
        el.querySelectorAll('.edit-task-btn').forEach(btn => {
            btn.addEventListener('click', () => openEditTask(btn.dataset.id));
        });

        // Delete
        el.querySelectorAll('.delete-task-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!confirm('Task wirklich löschen?')) return;
                await DB.deleteTask(btn.dataset.id);
                _tasks = _tasks.filter(t => t.id !== btn.dataset.id);
                renderTaskList(filterModel, filterStatus, filterPriority);
                updateTaskBadge();
                renderSummaryStrip();
            });
        });
    }

    function isOverdue(task) {
        if (!task.dueDate || task.status === 'done') return false;
        return task.dueDate < new Date().toISOString().split('T')[0];
    }

    function updateTaskBadge() {
        const urgent = _tasks.filter(t => t.priority === 'urgent' && t.status !== 'done').length;
        const badge  = document.getElementById('mgr-taskBadge');
        if (badge) {
            badge.textContent = urgent;
            badge.style.display = urgent > 0 ? 'inline-flex' : 'none';
        }
    }

    // ── Add / Edit Task modal ─────────────────────────────────────────────────
    function openAddTask(preselectedModelId = '') {
        const modelOptions = _models.map(m =>
            `<option value="${m.id}" ${m.id === preselectedModelId ? 'selected' : ''}>${m.name}</option>`
        ).join('');

        openModal('Task hinzufügen', `
            <div class="modal-form">
                <div class="form-row"><label>Model</label>
                    <select id="f-modelId" class="settings-input">${modelOptions}</select>
                </div>
                <div class="form-row"><label>Task-Titel</label>
                    <input id="f-title" class="settings-input" placeholder="z.B. 3 Reels aufnehmen">
                </div>
                <div class="form-row two-col">
                    <div><label>Priorität</label>
                        <select id="f-priority" class="settings-input">
                            <option value="urgent">Dringend</option>
                            <option value="high">Hoch</option>
                            <option value="medium" selected>Mittel</option>
                            <option value="low">Niedrig</option>
                        </select>
                    </div>
                    <div><label>Fällig am</label>
                        <input id="f-dueDate" class="settings-input" type="date" value="${new Date().toISOString().split('T')[0]}">
                    </div>
                </div>
                <div class="form-row"><label>Notiz (optional)</label>
                    <input id="f-notes" class="settings-input" placeholder="Weitere Details …">
                </div>
            </div>
        `, async () => {
            const task = await DB.createTask({
                modelId:  val('f-modelId'),
                title:    val('f-title'),
                priority: val('f-priority'),
                dueDate:  val('f-dueDate'),
                notes:    val('f-notes'),
                status:   'open',
                createdBy: Auth.getSession()?.id,
            });
            if (task) {
                _tasks.push(task);
                renderTaskList();
                renderModelCards();
                renderSummaryStrip();
                updateTaskBadge();
            }
            closeModal();
        });
    }

    function openEditTask(taskId) {
        const t = _tasks.find(t => t.id === taskId);
        if (!t) return;
        const modelOptions = _models.map(m =>
            `<option value="${m.id}" ${m.id === t.modelId ? 'selected' : ''}>${m.name}</option>`
        ).join('');

        openModal('Task bearbeiten', `
            <div class="modal-form">
                <div class="form-row"><label>Model</label>
                    <select id="f-modelId" class="settings-input">${modelOptions}</select>
                </div>
                <div class="form-row"><label>Task-Titel</label>
                    <input id="f-title" class="settings-input" value="${t.title}">
                </div>
                <div class="form-row two-col">
                    <div><label>Priorität</label>
                        <select id="f-priority" class="settings-input">
                            ${['urgent','high','medium','low'].map(p =>
                                `<option value="${p}" ${t.priority === p ? 'selected' : ''}>${PRIORITY_LABELS[p]}</option>`
                            ).join('')}
                        </select>
                    </div>
                    <div><label>Status</label>
                        <select id="f-status" class="settings-input">
                            ${['open','in_progress','done','overdue'].map(s =>
                                `<option value="${s}" ${t.status === s ? 'selected' : ''}>${s}</option>`
                            ).join('')}
                        </select>
                    </div>
                </div>
                <div class="form-row"><label>Fällig am</label>
                    <input id="f-dueDate" class="settings-input" type="date" value="${t.dueDate || ''}">
                </div>
                <div class="form-row"><label>Notiz</label>
                    <input id="f-notes" class="settings-input" value="${t.notes || ''}">
                </div>
            </div>
        `, async () => {
            const updated = await DB.updateTask(taskId, {
                modelId:  val('f-modelId'),
                title:    val('f-title'),
                priority: val('f-priority'),
                status:   val('f-status'),
                dueDate:  val('f-dueDate'),
                notes:    val('f-notes'),
            });
            if (updated) {
                const idx = _tasks.findIndex(t => t.id === taskId);
                if (idx >= 0) _tasks[idx] = updated;
                renderTaskList();
                updateTaskBadge();
            }
            closeModal();
        });
    }

    // ── Model management ──────────────────────────────────────────────────────
    function renderModelList() {
        const el = document.getElementById('mgrModelList');
        if (!el) return;

        el.innerHTML = _models.map(m => `
            <div class="card mgr-model-row">
                <div class="model-avatar">${m.initials}</div>
                <div class="mgr-model-details">
                    <div class="mgr-model-name">${m.name}</div>
                    <div class="mgr-model-accounts">
                        ${accountChips(_socialAccounts[m.id] || [], true)}
                    </div>
                    ${m.notes ? `<div class="mgr-model-notes">${m.notes}</div>` : ''}
                </div>
                <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;flex-shrink:0">
                    <span class="model-status-badge ${STATUS_CLASSES[m.status]}">${STATUS_LABELS[m.status]}</span>
                    <div style="display:flex;gap:6px">
                        <button class="icon-text-btn edit-model-btn" data-id="${m.id}">Bearbeiten</button>
                        <button class="icon-text-btn danger delete-model-btn" data-id="${m.id}">Löschen</button>
                    </div>
                </div>
            </div>
        `).join('');

        el.querySelectorAll('.edit-model-btn').forEach(btn => {
            btn.addEventListener('click', () => openEditModel(btn.dataset.id));
        });
        el.querySelectorAll('.delete-model-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!confirm(`Model "${_models.find(m => m.id === btn.dataset.id)?.name}" wirklich löschen?`)) return;
                await DB.deleteModel(btn.dataset.id);
                _models = _models.filter(m => m.id !== btn.dataset.id);
                renderModelList();
                renderModelCards();
                renderSummaryStrip();
            });
        });
    }

    // ── Social account chip helpers ───────────────────────────────────────────
    function accountChips(accounts, showEmpty = false) {
        if (!accounts.length) {
            return showEmpty ? '<span class="account-chip chip-empty">Keine Accounts</span>' : '';
        }
        return accounts.map(a => {
            const primary = a.isPrimary ? ' chip-primary' : '';
            const short   = PLATFORM_SHORT[a.platform] || a.platform.toUpperCase();
            const url     = platformUrl(a.platform, a.username);
            return `<a href="${url}" target="_blank" rel="noopener" class="account-chip${primary}" title="${PLATFORM_LABELS[a.platform]}: ${a.username}">${short} ${a.username}</a>`;
        }).join('');
    }

    // ── Social profile editor (multi-account per platform) ───────────────────
    function renderSocialProfileEditor(modelId, containerId) {
        const el = document.getElementById(containerId);
        if (!el) return;

        // Build state: localStorage → fall back to _socialAccounts mock
        const stored   = _lsGet(modelId);
        const fallback = _socialAccounts[modelId] || [];
        const state    = {};
        EDIT_PLATFORMS.forEach(p => {
            if (stored[p] !== undefined) {
                const d = stored[p];
                state[p] = { active: d.active || false, accounts: d.accounts?.length ? [...d.accounts] : (d.username ? [d.username] : []) };
            } else {
                const ex = fallback.filter(a => a.platform === p);
                state[p] = { active: ex.length > 0, accounts: ex.map(a => a.username) };
            }
        });

        function render() {
            el.innerHTML = EDIT_PLATFORMS.map(p => {
                const d  = state[p];
                const tc = PLATFORM_TAG_CLS[p] || '';
                const chips = d.accounts.map((acc, i) => `
                    <span class="sp-chip">
                        ${acc}
                        <button class="sp-chip-x" type="button" data-platform="${p}" data-idx="${i}">✕</button>
                    </span>`).join('');
                return `
                    <div class="sp-section${d.active ? '' : ' sp-section--off'}" data-platform="${p}">
                        <div class="sp-head">
                            <div class="sp-left">
                                <span class="platform-tag ${tc}">${PLATFORM_SHORT[p] || p.toUpperCase()}</span>
                                <span class="sp-label">${PLATFORM_LABELS[p]}</span>
                            </div>
                            <label class="sp-switch">
                                <input type="checkbox" class="sp-cb" data-platform="${p}" ${d.active ? 'checked' : ''}>
                                <span class="sp-track"><span class="sp-thumb"></span></span>
                            </label>
                        </div>
                        <div class="sp-body">
                            <div class="sp-chips">${chips}</div>
                            <div class="sp-add-row" style="display:none">
                                <input class="settings-input sp-add-input" placeholder="@username" data-platform="${p}">
                                <button class="sp-add-ok"     type="button" data-platform="${p}" title="Hinzufügen">✓</button>
                                <button class="sp-add-cancel" type="button" data-platform="${p}" title="Abbrechen">✕</button>
                            </div>
                            <button class="sp-add-btn" type="button" data-platform="${p}" ${d.active ? '' : 'disabled'}>
                                + Account hinzufügen
                            </button>
                        </div>
                    </div>`;
            }).join('');

            // Toggle
            el.querySelectorAll('.sp-cb').forEach(cb => {
                cb.addEventListener('change', () => {
                    state[cb.dataset.platform].active = cb.checked;
                    render();
                });
            });

            // Remove chip
            el.querySelectorAll('.sp-chip-x').forEach(btn => {
                btn.addEventListener('click', () => {
                    state[btn.dataset.platform].accounts.splice(Number(btn.dataset.idx), 1);
                    render();
                });
            });

            // Show add-row
            el.querySelectorAll('.sp-add-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    btn.style.display = 'none';
                    const row = btn.closest('.sp-body').querySelector('.sp-add-row');
                    row.style.display = 'flex';
                    row.querySelector('.sp-add-input').focus();
                });
            });

            // Confirm add
            function confirmAdd(platform, input) {
                const v = input.value.trim();
                if (v) state[platform].accounts.push(v.startsWith('@') ? v : '@' + v);
                render();
            }
            el.querySelectorAll('.sp-add-ok').forEach(btn => {
                btn.addEventListener('click', () => confirmAdd(btn.dataset.platform, btn.closest('.sp-add-row').querySelector('.sp-add-input')));
            });
            el.querySelectorAll('.sp-add-cancel').forEach(btn => {
                btn.addEventListener('click', () => render());
            });
            el.querySelectorAll('.sp-add-input').forEach(input => {
                input.addEventListener('keydown', e => {
                    if (e.key === 'Enter')  { e.preventDefault(); confirmAdd(input.dataset.platform, input); }
                    if (e.key === 'Escape') render();
                });
            });
        }

        render();
        el._getState = () => {
            const profiles = {};
            EDIT_PLATFORMS.forEach(p => { profiles[p] = { active: state[p].active, accounts: [...state[p].accounts] }; });
            return profiles;
        };
    }

    function _readSocialEditor(containerId) {
        const el = document.getElementById(containerId);
        return el?._getState ? el._getState() : {};
    }

    function modelFormHTML(m = {}, accounts = []) {
        const statusOptions = ['active','paused','onboarding','inactive'].map(s =>
            `<option value="${s}" ${(m.status || 'active') === s ? 'selected' : ''}>${STATUS_LABELS[s]}</option>`
        ).join('');
        return `
            <div class="modal-form">
                <div class="form-row two-col">
                    <div><label>Name</label><input id="f-name" class="settings-input" value="${m.name || ''}" placeholder="Vollständiger Name"></div>
                    <div><label>Status</label><select id="f-status" class="settings-input">${statusOptions}</select></div>
                </div>
                <div class="form-row">
                    <label>Monatsziel ($)</label>
                    <input id="f-goal" class="settings-input" type="number" value="${m.monthlyGoal || ''}" placeholder="z.B. 5000">
                </div>
                <div class="form-row">
                    <label>Social Media Profile</label>
                    <div id="socialEditor" class="social-profile-editor"></div>
                </div>
                <div class="form-row"><label>Interne Notizen</label>
                    <textarea id="f-notes" class="settings-input" rows="3" style="resize:vertical">${m.notes || ''}</textarea>
                </div>
            </div>`;
    }

    function openAddModel() {
        openModal('Model hinzufügen', modelFormHTML(), async () => {
            const name     = val('f-name');
            const profiles = _readSocialEditor('socialEditor');
            const igHandle = profiles.instagram?.active ? (profiles.instagram.accounts?.[0] || null) : null;
            const ttHandle = profiles.tiktok?.active    ? (profiles.tiktok.accounts?.[0]    || null) : null;
            const ofHandle = profiles.onlyfans?.active  ? (profiles.onlyfans.accounts?.[0]  || null) : null;

            const model = await DB.createModel({
                name, status: val('f-status'),
                monthlyGoal: Number(val('f-goal')) || 0,
                notes: val('f-notes'),
                instagram: igHandle, tiktok: ttHandle, onlyfans: ofHandle,
                initials: name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2),
            });
            if (model) {
                _lsSet(model.id, profiles);
                _socialAccounts[model.id] = _profilesToAccounts(model.id, profiles);
                _models.push(model);
                await renderModelCards();
                renderModelList();
                renderSummaryStrip();
                populateTaskModelFilter();
            }
            closeModal();
        });
        setTimeout(() => renderSocialProfileEditor('_new_', 'socialEditor'), 0);
    }

    function openEditModel(modelId) {
        const m = _models.find(m => m.id === modelId);
        if (!m) return;

        openModal('Model bearbeiten', modelFormHTML(m), async () => {
            const name     = val('f-name');
            const profiles = _readSocialEditor('socialEditor');

            // Persist social profiles to localStorage
            _lsSet(modelId, profiles);
            _socialAccounts[modelId] = _profilesToAccounts(modelId, profiles);

            // Update model record (keep legacy fields in sync)
            const igHandle = profiles.instagram?.active ? (profiles.instagram.accounts?.[0] || null) : null;
            const ttHandle = profiles.tiktok?.active    ? (profiles.tiktok.accounts?.[0]    || null) : null;
            const ofHandle = profiles.onlyfans?.active  ? (profiles.onlyfans.accounts?.[0]  || null) : null;

            const updated = await DB.updateModel(modelId, {
                name, status: val('f-status'),
                monthlyGoal: Number(val('f-goal')) || 0,
                notes: val('f-notes'),
                instagram: igHandle, tiktok: ttHandle, onlyfans: ofHandle,
                initials: name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2),
            });
            if (updated) {
                const idx = _models.findIndex(m => m.id === modelId);
                if (idx >= 0) _models[idx] = updated;
            }

            await renderModelCards();
            renderModelList();
            renderSummaryStrip();
            closeModal();
        });

        // Show delete button
        const delBtn = document.getElementById('modalDelete');
        delBtn.style.display = '';
        delBtn.onclick = async () => {
            if (!confirm(`Model "${m.name}" wirklich löschen?\n\nDiese Aktion kann nicht rückgängig gemacht werden.`)) return;
            await DB.deleteModel(modelId);
            _models = _models.filter(mod => mod.id !== modelId);
            _tasks  = _tasks.filter(t => t.modelId !== modelId);
            delete _socialAccounts[modelId];
            closeModal();
            await renderModelCards();
            renderModelList();
            renderSummaryStrip();
            populateTaskModelFilter();
        };

        setTimeout(() => renderSocialProfileEditor(modelId, 'socialEditor'), 0);
    }

    // ── Resource management ───────────────────────────────────────────────────
    async function renderResourceList(filterCat = 'all') {
        const el = document.getElementById('mgrResourceList');
        if (!el) return;

        const items = filterCat === 'all' ? _resources : _resources.filter(r => r.categorySlug === filterCat);

        // Tabs
        const tabsEl = document.getElementById('mgr-resourceTabs');
        if (tabsEl && !tabsEl.dataset.bound) {
            tabsEl.innerHTML = `<button class="rtab active" data-cat="all">Alle</button>` +
                _categories.map(c => `<button class="rtab" data-cat="${c.slug}">${c.name}</button>`).join('');
            tabsEl.querySelectorAll('.rtab').forEach(tab => {
                tab.addEventListener('click', () => {
                    tabsEl.querySelectorAll('.rtab').forEach(t => t.classList.remove('active'));
                    tab.classList.add('active');
                    renderResourceList(tab.dataset.cat);
                });
            });
            tabsEl.dataset.bound = '1';
        }

        if (!items.length) {
            el.innerHTML = '<p style="color:var(--text-muted);font-size:13px;padding:12px 0">Keine Ressourcen in dieser Kategorie.</p>';
            return;
        }

        el.innerHTML = `
            <div class="mgr-resource-table">
                ${items.map(r => `
                    <div class="card mgr-resource-row">
                        <div class="resource-icon">${TYPE_ICONS[r.type] || '📁'}</div>
                        <div class="resource-body" style="flex:1">
                            <div class="resource-title">${r.title} ${r.pinned ? '<span style="color:var(--accent)">★</span>' : ''}</div>
                            <div class="resource-desc">${r.description}</div>
                            <div style="margin-top:4px;display:flex;gap:8px">
                                <span class="account-chip">${_categories.find(c => c.slug === r.categorySlug)?.name || r.categorySlug}</span>
                                <span class="account-chip">${r.type}</span>
                                ${r.visibleToAll ? '<span class="account-chip" style="color:var(--green)">Alle Models</span>' : '<span class="account-chip" style="color:var(--warn)">Ausgewählte Models</span>'}
                            </div>
                        </div>
                        <div style="display:flex;gap:6px;flex-shrink:0">
                            <button class="icon-text-btn edit-res-btn" data-id="${r.id}">Bearbeiten</button>
                            <button class="icon-text-btn danger delete-res-btn" data-id="${r.id}">Löschen</button>
                        </div>
                    </div>
                `).join('')}
            </div>`;

        el.querySelectorAll('.edit-res-btn').forEach(btn => {
            btn.addEventListener('click', () => openEditResource(btn.dataset.id));
        });
        el.querySelectorAll('.delete-res-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!confirm('Resource wirklich löschen?')) return;
                await DB.deleteResource(btn.dataset.id);
                _resources = _resources.filter(r => r.id !== btn.dataset.id);
                renderResourceList(filterCat);
            });
        });
    }

    function resourceFormHTML(r = {}) {
        const catOptions = _categories.map(c =>
            `<option value="${c.slug}" ${r.categorySlug === c.slug ? 'selected' : ''}>${c.name}</option>`
        ).join('');
        const typeOptions = ['document','template','sheet','audio','link','pdf'].map(t =>
            `<option value="${t}" ${(r.type || 'document') === t ? 'selected' : ''}>${t}</option>`
        ).join('');
        return `
            <div class="modal-form">
                <div class="form-row"><label>Titel</label><input id="f-title" class="settings-input" value="${r.title || ''}"></div>
                <div class="form-row"><label>Beschreibung</label><input id="f-desc" class="settings-input" value="${r.description || ''}"></div>
                <div class="form-row"><label>URL / Link</label><input id="f-url" class="settings-input" value="${r.url || ''}" placeholder="https://…"></div>
                <div class="form-row two-col">
                    <div><label>Kategorie</label><select id="f-cat" class="settings-input">${catOptions}</select></div>
                    <div><label>Typ</label><select id="f-type" class="settings-input">${typeOptions}</select></div>
                </div>
                <div class="form-row two-col">
                    <div><label>Sichtbarkeit</label>
                        <select id="f-visible" class="settings-input">
                            <option value="1" ${r.visibleToAll !== false ? 'selected' : ''}>Alle Models</option>
                            <option value="0" ${r.visibleToAll === false ? 'selected' : ''}>Ausgewählte Models</option>
                        </select>
                    </div>
                    <div><label>Gepinnt</label>
                        <select id="f-pinned" class="settings-input">
                            <option value="0" ${!r.pinned ? 'selected' : ''}>Nein</option>
                            <option value="1" ${r.pinned ? 'selected' : ''}>Ja</option>
                        </select>
                    </div>
                </div>
            </div>`;
    }

    function openAddResource() {
        openModal('Resource hinzufügen', resourceFormHTML(), async () => {
            const res = await DB.createResource({
                title: val('f-title'), description: val('f-desc'), url: val('f-url'),
                categorySlug: val('f-cat'), type: val('f-type'),
                visibleToAll: val('f-visible') === '1',
                pinned: val('f-pinned') === '1',
                modelIds: [],
            });
            if (res) { _resources.push(res); renderResourceList(); }
            closeModal();
        });
    }

    function openEditResource(resId) {
        const r = _resources.find(r => r.id === resId);
        if (!r) return;
        openModal('Resource bearbeiten', resourceFormHTML(r), async () => {
            const updated = await DB.updateResource(resId, {
                title: val('f-title'), description: val('f-desc'), url: val('f-url'),
                categorySlug: val('f-cat'), type: val('f-type'),
                visibleToAll: val('f-visible') === '1',
                pinned: val('f-pinned') === '1',
            });
            if (updated) {
                const idx = _resources.findIndex(r => r.id === resId);
                if (idx >= 0) _resources[idx] = updated;
                renderResourceList();
            }
            closeModal();
        });
    }

    // ── Analytics ────────────────────────────────────────────────────────────
    const ANALYTICS_TAGS = {
        instagram: '<span class="platform-tag platform-ig">IG</span>',
        tiktok:    '<span class="platform-tag platform-tt">TT</span>',
        onlyfans:  '<span class="platform-tag platform-of">OF</span>',
    };

    function openAnalytics(modelId) {
        const model = _models.find(m => m.id === modelId);
        if (!model) return;

        const allPosts = [];
        const overlay  = document.getElementById('analyticsOverlay');
        const dpPanel  = document.getElementById('dpPanel');
        document.getElementById('analyticsModelName').textContent = model.name;

        // ── State ────────────────────────────────────────────
        let filterPlatform = 'all';
        let dpStart = null, dpEnd = null, dpSelecting = 'start';
        const now = new Date();
        let dpYear = now.getFullYear(), dpMonth = now.getMonth();

        const MN = ['January','February','March','April','May','June',
                    'July','August','September','October','November','December'];

        function fmtD(iso) {
            if (!iso) return '';
            const [y, m, d] = iso.split('-');
            return `${d}. ${['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'][+m-1]} ${y}`;
        }

        function updateLabel() {
            let txt;
            if (!dpStart && !dpEnd) txt = 'Gesamter Zeitraum';
            else if (dpStart && !dpEnd) txt = `Ab ${fmtD(dpStart)}`;
            else txt = `${fmtD(dpStart)} – ${fmtD(dpEnd)}`;
            const span = document.getElementById('dpToggleText');
            const sub  = document.getElementById('analyticsPeriodLabel');
            if (span) span.textContent = txt;
            if (sub)  sub.textContent  = txt;
        }

        function applyFilters() {
            const filtered = allPosts.filter(p =>
                (filterPlatform === 'all' || p.platform === filterPlatform) &&
                (!dpStart || p.date >= dpStart) &&
                (!dpEnd   || p.date <= dpEnd)
            );
            renderAnalyticsSummary(filtered);
            renderAnalyticsTable(filtered);
            updateLabel();
        }

        // ── Platform buttons ─────────────────────────────────
        overlay.querySelectorAll('[data-platform]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.platform === 'all');
            btn.onclick = () => {
                overlay.querySelectorAll('[data-platform]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                filterPlatform = btn.dataset.platform;
                applyFilters();
            };
        });

        // ── Date picker toggle ───────────────────────────────
        const dpToggle = document.getElementById('dpToggleBtn');
        dpToggle.onclick = e => {
            e.stopPropagation();
            const opening = !dpPanel.classList.contains('open');
            dpPanel.classList.toggle('open');
            if (opening) renderCal();
        };
        overlay.onclick = e => {
            if (!dpPanel.contains(e.target) && !dpToggle.contains(e.target))
                dpPanel.classList.remove('open');
        };

        // ── Presets ──────────────────────────────────────────
        function calcPreset(key) {
            const t  = new Date();
            const td = t.toISOString().split('T')[0];
            const shift = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x.toISOString().split('T')[0]; };
            if (key === 'all')       return { s: null,                                   e: null };
            if (key === 'yesterday') return { s: shift(t, -1),                           e: shift(t, -1) };
            if (key === 'thisweek')  { const m = shift(t, -((t.getDay()+6)%7));           return { s: m,  e: td }; }
            if (key === 'lastweek')  { const m = shift(t, -((t.getDay()+6)%7)-7);         return { s: m,  e: shift(m, 6) }; }
            if (key === 'thismonth') return { s: `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-01`, e: td };
            if (key === 'lastmonth') { const lm = new Date(t.getFullYear(), t.getMonth()-1, 1);
                                       const le = new Date(t.getFullYear(), t.getMonth(), 0);
                                       return { s: lm.toISOString().split('T')[0], e: le.toISOString().split('T')[0] }; }
            if (key === 'thisyear')  return { s: `${t.getFullYear()}-01-01`, e: td };
            if (key === 'lastyear')  return { s: `${t.getFullYear()-1}-01-01`, e: `${t.getFullYear()-1}-12-31` };
            return { s: null, e: null };
        }

        overlay.querySelectorAll('[data-preset]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.preset === 'all');
            btn.onclick = ev => {
                ev.stopPropagation();
                overlay.querySelectorAll('[data-preset]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const { s, e } = calcPreset(btn.dataset.preset);
                dpStart = s; dpEnd = e; dpSelecting = 'start';
                renderCal();
                applyFilters();
            };
        });

        // ── Calendar ─────────────────────────────────────────
        function renderCal() {
            const grid  = document.getElementById('dpDaysGrid');
            const title = document.getElementById('dpCalMonth');
            if (!grid || !title) return;
            title.textContent = `${MN[dpMonth]} ${dpYear}`;

            const firstDow = new Date(dpYear, dpMonth, 1).getDay();
            const offset   = (firstDow + 6) % 7;
            const days     = new Date(dpYear, dpMonth + 1, 0).getDate();
            const prevDays = new Date(dpYear, dpMonth, 0).getDate();
            const today    = new Date().toISOString().split('T')[0];

            let html = '';
            for (let i = 0; i < offset; i++)
                html += `<div class="dp-day dp-other">${prevDays - offset + i + 1}</div>`;

            for (let d = 1; d <= days; d++) {
                const ds = `${dpYear}-${String(dpMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
                let cls = 'dp-day';
                if (ds === today) cls += ' dp-today';
                if (dpStart && dpEnd && ds > dpStart && ds < dpEnd) cls += ' dp-in-range';
                if (dpStart && ds === dpStart) cls += ' dp-sel-start';
                if (dpEnd   && ds === dpEnd)   cls += ' dp-sel-end';
                html += `<div class="${cls}" data-date="${ds}">${d}</div>`;
            }
            const trail = Math.ceil((offset + days) / 7) * 7 - offset - days;
            for (let i = 1; i <= trail; i++) html += `<div class="dp-day dp-other">${i}</div>`;
            grid.innerHTML = html;

            grid.querySelectorAll('.dp-day:not(.dp-other)').forEach(cell => {
                cell.onclick = e => {
                    e.stopPropagation();
                    const date = cell.dataset.date;
                    if (dpSelecting === 'start' || (dpStart && dpEnd)) {
                        dpStart = date; dpEnd = null; dpSelecting = 'end';
                        overlay.querySelectorAll('[data-preset]').forEach(b => b.classList.remove('active'));
                    } else {
                        if (date < dpStart) { dpEnd = dpStart; dpStart = date; }
                        else dpEnd = date;
                        dpSelecting = 'start';
                    }
                    renderCal();
                    updateLabel();
                };
            });
        }

        document.getElementById('dpPrev').onclick = e => {
            e.stopPropagation();
            if (--dpMonth < 0) { dpMonth = 11; dpYear--; }
            renderCal();
        };
        document.getElementById('dpNext').onclick = e => {
            e.stopPropagation();
            if (++dpMonth > 11) { dpMonth = 0; dpYear++; }
            renderCal();
        };
        document.getElementById('dpApply').onclick = e => {
            e.stopPropagation();
            dpPanel.classList.remove('open');
            applyFilters();
        };

        // ── Open ─────────────────────────────────────────────
        dpPanel.classList.remove('open');
        overlay.classList.add('open');
        applyFilters();
    }

    function renderAnalyticsSummary(posts) {
        const el = document.getElementById('analyticsSummary');
        if (!el) return;
        const totViews    = posts.reduce((s, p) => s + p.views, 0);
        const totLikes    = posts.reduce((s, p) => s + p.likes, 0);
        const totComments = posts.reduce((s, p) => s + p.comments, 0);
        const totShares   = posts.reduce((s, p) => s + p.shares, 0);
        const engRate     = totViews ? ((totLikes + totComments) / totViews * 100).toFixed(1) : '0.0';
        el.innerHTML = `
            <div class="analytics-kpi"><div class="analytics-kpi-val">${posts.length}</div><div class="analytics-kpi-lbl">Posts</div></div>
            <div class="analytics-kpi"><div class="analytics-kpi-val">${fmt(totViews)}</div><div class="analytics-kpi-lbl">Views</div></div>
            <div class="analytics-kpi"><div class="analytics-kpi-val">${fmt(totLikes)}</div><div class="analytics-kpi-lbl">Likes</div></div>
            <div class="analytics-kpi"><div class="analytics-kpi-val">${fmt(totComments)}</div><div class="analytics-kpi-lbl">Kommentare</div></div>
            <div class="analytics-kpi"><div class="analytics-kpi-val">${fmt(totShares)}</div><div class="analytics-kpi-lbl">Shares</div></div>
            <div class="analytics-kpi"><div class="analytics-kpi-val">${engRate}%</div><div class="analytics-kpi-lbl">Engagement</div></div>
        `;
    }

    function renderAnalyticsTable(posts) {
        const el = document.getElementById('analyticsTableBody');
        if (!el) return;
        if (!posts.length) {
            el.innerHTML = '<tr><td colspan="7" class="analytics-empty">Keine Posts für diesen Zeitraum.</td></tr>';
            return;
        }
        el.innerHTML = posts.map(p => `
            <tr>
                <td>${ANALYTICS_TAGS[p.platform] || p.platform}</td>
                <td>${p.date}</td>
                <td class="analytics-post-title">${p.title}</td>
                <td>${fmt(p.views)}</td>
                <td>${fmt(p.likes)}</td>
                <td>${fmt(p.comments)}</td>
                <td>${p.shares ? fmt(p.shares) : '–'}</td>
            </tr>
        `).join('');
    }

    // ── Filters ───────────────────────────────────────────────────────────────
    function populateTaskModelFilter() {
        const sel = document.getElementById('taskFilterModel');
        if (!sel) return;
        const current = sel.value;
        sel.innerHTML = '<option value="all">Alle Models</option>' +
            _models.map(m => `<option value="${m.id}" ${current === m.id ? 'selected' : ''}>${m.name}</option>`).join('');
    }

    // ── Init ──────────────────────────────────────────────────────────────────
    async function init() {
        const user = Auth.requireAuth('manager');
        if (!user) return;

        document.getElementById('headerName').textContent   = user.name;
        document.getElementById('headerAvatar').textContent = user.initials;

        // Load all data in parallel
        [_models, _tasks, _resources, _categories] = await Promise.all([
            DB.getModels(),
            DB.getTasks(),
            DB.getResources(),
            DB.getResourceCategories(),
        ]);

        // Load daily snapshots (non-blocking — fails gracefully)
        if (typeof Snapshots !== 'undefined') await Snapshots.load();

        // Load social accounts — localStorage overrides mock DB if present
        await Promise.all(_models.map(async m => {
            const dbAccounts = await DB.getSocialAccounts(m.id);
            const stored     = _lsGet(m.id);
            _socialAccounts[m.id] = Object.keys(stored).length
                ? _profilesToAccounts(m.id, stored)
                : dbAccounts;
        }));

        await renderSummaryStrip();
        await renderModelCards();
        renderModelList();
        renderTaskList();
        renderResourceList();
        populateTaskModelFilter();
        updateTaskBadge();

        // Button: Add Model
        ['addModelBtn','addModelBtn2'].forEach(id => {
            document.getElementById(id)?.addEventListener('click', openAddModel);
        });

        // Button: Add Task
        document.getElementById('addTaskBtn')?.addEventListener('click', () => openAddTask());

        // Button: Add Resource
        document.getElementById('addResourceBtn')?.addEventListener('click', openAddResource);

        // Modal close
        document.getElementById('modalClose')?.addEventListener('click',  closeModal);
        document.getElementById('modalCancel')?.addEventListener('click', closeModal);
        document.getElementById('modalOverlay')?.addEventListener('click', e => {
            if (e.target === document.getElementById('modalOverlay')) closeModal();
        });

        // Analytics close
        document.getElementById('analyticsClose')?.addEventListener('click', () => {
            document.getElementById('analyticsOverlay').classList.remove('open');
        });

        // Task filters
        ['taskFilterModel','taskFilterStatus','taskFilterPriority'].forEach(id => {
            document.getElementById(id)?.addEventListener('change', () => {
                renderTaskList(
                    document.getElementById('taskFilterModel').value,
                    document.getElementById('taskFilterStatus').value,
                    document.getElementById('taskFilterPriority').value,
                );
            });
        });
    }

    return { init, openEditModel, openAddTask, openAnalytics };
})();

document.addEventListener('DOMContentLoaded', () => {
    ManagerView.init();
});
