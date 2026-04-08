/**
 * CelebClub Data Layer
 * All reads/writes go through these functions.
 * Set APP_CONFIG.USE_MOCK = false to switch to Supabase.
 */

const DB = (() => {

    // ════════════════════════════════════════════════════════════════
    // MOCK DATA STORE
    // ════════════════════════════════════════════════════════════════

    const store = {
        models: [
            {
                id: 'm1', userId: 'u2', name: 'Sarah Mitchell', initials: 'SM',
                status: 'active',
                instagram: '@sarahmitchell', tiktok: '@sarah_mitchell_', onlyfans: '@sarahmitchell',
                monthlyGoal: 7000,
                notes: 'Top performer. Spring campaign active. Focus on Renewal Rate.',
                createdAt: '2025-01-15',
            },
            {
                id: 'm2', userId: 'u3', name: 'Lena Weber', initials: 'LW',
                status: 'active',
                instagram: '@lenaweber', tiktok: '@lena_weber_official', onlyfans: '@lenaweber',
                monthlyGoal: 5000,
                notes: 'Growing fast on TikTok. Push cross-promo with OF this month.',
                createdAt: '2025-02-20',
            },
            {
                id: 'm3', userId: 'u4', name: 'Mia Torres', initials: 'MT',
                status: 'onboarding',
                instagram: '@miatorres', tiktok: '@mia_torres_', onlyfans: null,
                monthlyGoal: 3000,
                notes: 'Onboarding in progress. OF account pending setup.',
                createdAt: '2026-03-01',
            },
            {
                id: 'm4', userId: null, name: 'Nina Becker', initials: 'NB',
                status: 'paused',
                instagram: '@ninabecker', tiktok: null, onlyfans: '@ninabecker',
                monthlyGoal: 4000,
                notes: 'On break until end of April. Resume campaigns 01 May.',
                createdAt: '2025-05-10',
            },
        ],

        kpis: {
            'm1': { ofRevenueToday: 247, ofRevenueWeek: 1340, ofRevenueMonth: 4820, ofSubscribersNew: 12, ofRenewalRate: 68, igViewsWeek: 48200, tiktokViewsWeek: 112000, followerGrowthWeek: 234, bestPost: 'Instagram Reel · 28.4K Views', },
            'm2': { ofRevenueToday: 183, ofRevenueWeek: 890,  ofRevenueMonth: 3240, ofSubscribersNew: 8,  ofRenewalRate: 72, igViewsWeek: 31500, tiktokViewsWeek: 89000,  followerGrowthWeek: 312, bestPost: 'TikTok · 89K Views', },
            'm3': { ofRevenueToday: 0,   ofRevenueWeek: 0,    ofRevenueMonth: 0,    ofSubscribersNew: 0,  ofRenewalRate: 0,  igViewsWeek: 12400, tiktokViewsWeek: 28000,  followerGrowthWeek: 89,  bestPost: 'TikTok · 28K Views', },
            'm4': { ofRevenueToday: 0,   ofRevenueWeek: 210,  ofRevenueMonth: 890,  ofSubscribersNew: 2,  ofRenewalRate: 45, igViewsWeek: 8200,  tiktokViewsWeek: 0,      followerGrowthWeek: -12, bestPost: 'Instagram · 8.2K Views', },
        },

        tasks: [
            { id: 't1',  modelId: 'm1', title: 'OF Content aufnehmen',           priority: 'urgent', status: 'open',        dueDate: '2026-04-06', notes: 'Min. 3 Reels für diese Woche',    createdBy: 'u1' },
            { id: 't2',  modelId: 'm1', title: 'DM-Rückstand beantworten',        priority: 'high',   status: 'open',        dueDate: '2026-04-06', notes: '',                               createdBy: 'u1' },
            { id: 't3',  modelId: 'm1', title: 'Story posten',                    priority: 'medium', status: 'done',        dueDate: '2026-04-06', notes: '',                               createdBy: 'u1' },
            { id: 't4',  modelId: 'm1', title: 'Profil-Update durchführen',       priority: 'medium', status: 'open',        dueDate: '2026-04-10', notes: 'Bio + Titelbild aktualisieren',  createdBy: 'u1' },
            { id: 't5',  modelId: 'm1', title: 'Feedback an Management senden',   priority: 'low',    status: 'open',        dueDate: '2026-04-11', notes: '',                               createdBy: 'u1' },
            { id: 't6',  modelId: 'm1', title: 'Content-Plan Mai überprüfen',     priority: 'medium', status: 'open',        dueDate: '2026-04-11', notes: '',                               createdBy: 'u1' },
            { id: 't7',  modelId: 'm2', title: 'TikTok Trend-Video aufnehmen',    priority: 'high',   status: 'in_progress', dueDate: '2026-04-07', notes: 'Hook in ersten 2 Sekunden',      createdBy: 'u1' },
            { id: 't8',  modelId: 'm2', title: 'OF Bio aktualisieren',            priority: 'medium', status: 'open',        dueDate: '2026-04-09', notes: '',                               createdBy: 'u1' },
            { id: 't9',  modelId: 'm3', title: 'OF Account einrichten',           priority: 'urgent', status: 'open',        dueDate: '2026-04-08', notes: 'Verifizierung abwarten',         createdBy: 'u1' },
            { id: 't10', modelId: 'm3', title: 'Onboarding-Dokument ausfüllen',   priority: 'high',   status: 'open',        dueDate: '2026-04-07', notes: '',                               createdBy: 'u1' },
        ],

        resources: [
            { id: 'r1',  categorySlug: 'guidelines', title: 'Creator Guidelines',        description: 'Regeln, Standards & Do\'s / Don\'ts',   type: 'document', url: '#', pinned: true,  visibleToAll: true,  modelIds: [] },
            { id: 'r2',  categorySlug: 'kit',         title: 'Creator Kit',               description: 'Premium Templates & Assets',            type: 'template', url: '#', pinned: false, visibleToAll: true,  modelIds: [] },
            { id: 'r3',  categorySlug: 'scripts',     title: 'Caption Scripts',           description: 'Fertige Texte für Posts & DMs',         type: 'document', url: '#', pinned: false, visibleToAll: true,  modelIds: [] },
            { id: 'r4',  categorySlug: 'branding',    title: 'Branding Guide',            description: 'Farben, Fonts, visuelle Identität',     type: 'document', url: '#', pinned: false, visibleToAll: true,  modelIds: [] },
            { id: 'r5',  categorySlug: 'social',      title: 'Instagram Guide',           description: 'Best Practices: Reels, Stories, Feed',  type: 'document', url: '#', pinned: false, visibleToAll: true,  modelIds: [] },
            { id: 'r6',  categorySlug: 'social',      title: 'TikTok Guide',              description: 'Trends, Hooks & Content-Strategie',     type: 'document', url: '#', pinned: false, visibleToAll: true,  modelIds: [] },
            { id: 'r7',  categorySlug: 'of',          title: 'OF Profil-Optimierung',     description: 'Conversion, Pricing & Strategie',       type: 'document', url: '#', pinned: true,  visibleToAll: true,  modelIds: [] },
            { id: 'r8',  categorySlug: 'of',          title: 'OF Monetarisierung',        description: 'PPV, DMs, Subscriptions optimieren',    type: 'document', url: '#', pinned: false, visibleToAll: true,  modelIds: [] },
            { id: 'r9',  categorySlug: 'safety',      title: 'Safety & Compliance',       description: 'Datenschutz, Plattform-Regeln, Schutz', type: 'document', url: '#', pinned: false, visibleToAll: true,  modelIds: [] },
            { id: 'r10', categorySlug: 'kit',         title: 'Content Calendar Template', description: '30-Tage Planungsvorlage',               type: 'sheet',    url: '#', pinned: false, visibleToAll: true,  modelIds: [] },
        ],

        socialAccounts: [
            // Sarah Mitchell
            { id: 'sa1', modelId: 'm1', platform: 'instagram', username: '@sarahmitchell',   url: 'https://instagram.com/sarahmitchell',    isPrimary: true  },
            { id: 'sa2', modelId: 'm1', platform: 'tiktok',    username: '@sarah_mitchell_',  url: 'https://tiktok.com/@sarah_mitchell_',    isPrimary: true  },
            { id: 'sa3', modelId: 'm1', platform: 'onlyfans',  username: '@sarahmitchell',    url: 'https://onlyfans.com/sarahmitchell',     isPrimary: true  },
            { id: 'sa4', modelId: 'm1', platform: 'telegram',  username: '@sarah_vip',        url: 'https://t.me/sarah_vip',                 isPrimary: true  },
            // Lena Weber
            { id: 'sa5', modelId: 'm2', platform: 'instagram', username: '@lenaweber',        url: 'https://instagram.com/lenaweber',        isPrimary: true  },
            { id: 'sa6', modelId: 'm2', platform: 'tiktok',    username: '@lena_weber_official', url: 'https://tiktok.com/@lena_weber_official', isPrimary: true },
            { id: 'sa7', modelId: 'm2', platform: 'onlyfans',  username: '@lenaweber',        url: 'https://onlyfans.com/lenaweber',         isPrimary: true  },
            { id: 'sa8', modelId: 'm2', platform: 'youtube',   username: '@LenaWeberOfficial',url: 'https://youtube.com/@LenaWeberOfficial', isPrimary: true  },
            // Mia Torres
            { id: 'sa9',  modelId: 'm3', platform: 'instagram', username: '@miatorres',       url: 'https://instagram.com/miatorres',        isPrimary: true  },
            { id: 'sa10', modelId: 'm3', platform: 'tiktok',    username: '@mia_torres_',     url: 'https://tiktok.com/@mia_torres_',        isPrimary: true  },
            // Nina Becker
            { id: 'sa11', modelId: 'm4', platform: 'instagram', username: '@ninabecker',      url: 'https://instagram.com/ninabecker',       isPrimary: true  },
            { id: 'sa12', modelId: 'm4', platform: 'onlyfans',  username: '@ninabecker',      url: 'https://onlyfans.com/ninabecker',        isPrimary: true  },
        ],

        resourceCategories: [
            { slug: 'guidelines', name: 'Guidelines' },
            { slug: 'kit',        name: 'Creator Kit' },
            { slug: 'scripts',    name: 'Scripts & Templates' },
            { slug: 'branding',   name: 'Branding' },
            { slug: 'social',     name: 'Social Media' },
            { slug: 'of',         name: 'OnlyFans' },
            { slug: 'safety',     name: 'Safety' },
        ],
    };

    let _nextId = 100;
    function uid(prefix) { return `${prefix}${++_nextId}`; }

    // ════════════════════════════════════════════════════════════════
    // MODELS
    // ════════════════════════════════════════════════════════════════

    async function getModels() {
        if (APP_CONFIG.USE_MOCK) return [...store.models];
        const { data } = await supabase.from('models').select('*').order('name');
        return data;
    }

    async function getModel(id) {
        if (APP_CONFIG.USE_MOCK) return store.models.find(m => m.id === id) || null;
        const { data } = await supabase.from('models').select('*').eq('id', id).single();
        return data;
    }

    async function getModelByUserId(userId) {
        if (APP_CONFIG.USE_MOCK) return store.models.find(m => m.userId === userId) || null;
        const { data } = await supabase.from('models').select('*').eq('user_id', userId).single();
        return data;
    }

    async function createModel(fields) {
        if (APP_CONFIG.USE_MOCK) {
            const model = { id: uid('m'), createdAt: new Date().toISOString(), ...fields };
            store.models.push(model);
            store.kpis[model.id] = { ofRevenueToday: 0, ofRevenueWeek: 0, ofRevenueMonth: 0, ofSubscribersNew: 0, ofRenewalRate: 0, igViewsWeek: 0, tiktokViewsWeek: 0, followerGrowthWeek: 0, bestPost: '–' };
            return model;
        }
        const { data } = await supabase.from('models').insert(fields).select().single();
        return data;
    }

    async function updateModel(id, fields) {
        if (APP_CONFIG.USE_MOCK) {
            const idx = store.models.findIndex(m => m.id === id);
            if (idx < 0) return null;
            store.models[idx] = { ...store.models[idx], ...fields };
            return store.models[idx];
        }
        const { data } = await supabase.from('models').update(fields).eq('id', id).select().single();
        return data;
    }

    async function deleteModel(id) {
        if (APP_CONFIG.USE_MOCK) {
            store.models = store.models.filter(m => m.id !== id);
            store.tasks  = store.tasks.filter(t => t.modelId !== id);
            delete store.kpis[id];
            return;
        }
        await supabase.from('models').delete().eq('id', id);
    }

    // ════════════════════════════════════════════════════════════════
    // SOCIAL ACCOUNTS
    // ════════════════════════════════════════════════════════════════

    async function getSocialAccounts(modelId) {
        if (APP_CONFIG.USE_MOCK) {
            return store.socialAccounts.filter(a => a.modelId === modelId);
        }
        const { data } = await supabase
            .from('social_accounts')
            .select('*')
            .eq('model_id', modelId)
            .order('platform');
        return data;
    }

    async function createSocialAccount(fields) {
        if (APP_CONFIG.USE_MOCK) {
            // Enforce one primary per model+platform
            if (fields.isPrimary) {
                store.socialAccounts.forEach(a => {
                    if (a.modelId === fields.modelId && a.platform === fields.platform) a.isPrimary = false;
                });
            }
            const account = { id: uid('sa'), createdAt: new Date().toISOString(), ...fields };
            store.socialAccounts.push(account);
            // Mirror to legacy columns
            _mirrorToModel(fields.modelId);
            return account;
        }
        if (fields.isPrimary) {
            await supabase.from('social_accounts')
                .update({ is_primary: false })
                .eq('model_id', fields.model_id)
                .eq('platform', fields.platform);
        }
        const { data } = await supabase.from('social_accounts').insert(fields).select().single();
        return data;
    }

    async function updateSocialAccount(id, fields) {
        if (APP_CONFIG.USE_MOCK) {
            const idx = store.socialAccounts.findIndex(a => a.id === id);
            if (idx < 0) return null;
            if (fields.isPrimary) {
                const { modelId, platform } = store.socialAccounts[idx];
                store.socialAccounts.forEach(a => {
                    if (a.modelId === modelId && a.platform === platform && a.id !== id) a.isPrimary = false;
                });
            }
            store.socialAccounts[idx] = { ...store.socialAccounts[idx], ...fields };
            _mirrorToModel(store.socialAccounts[idx].modelId);
            return store.socialAccounts[idx];
        }
        if (fields.is_primary) {
            const current = store.socialAccounts.find(a => a.id === id);
            if (current) {
                await supabase.from('social_accounts')
                    .update({ is_primary: false })
                    .eq('model_id', current.model_id)
                    .eq('platform', current.platform);
            }
        }
        const { data } = await supabase.from('social_accounts').update(fields).eq('id', id).select().single();
        return data;
    }

    async function deleteSocialAccount(id) {
        if (APP_CONFIG.USE_MOCK) {
            const account = store.socialAccounts.find(a => a.id === id);
            store.socialAccounts = store.socialAccounts.filter(a => a.id !== id);
            if (account) _mirrorToModel(account.modelId);
            return;
        }
        await supabase.from('social_accounts').delete().eq('id', id);
    }

    // Keep legacy model columns in sync with primary social accounts
    function _mirrorToModel(modelId) {
        const idx = store.models.findIndex(m => m.id === modelId);
        if (idx < 0) return;
        const accounts = store.socialAccounts.filter(a => a.modelId === modelId && a.isPrimary);
        const byPlatform = Object.fromEntries(accounts.map(a => [a.platform, a.username]));
        store.models[idx].instagram = byPlatform.instagram || store.models[idx].instagram;
        store.models[idx].tiktok    = byPlatform.tiktok    || store.models[idx].tiktok;
        store.models[idx].onlyfans  = byPlatform.onlyfans  || store.models[idx].onlyfans;
    }

    // ════════════════════════════════════════════════════════════════
    // KPIs
    // ════════════════════════════════════════════════════════════════

    async function getKpis(modelId) {
        if (APP_CONFIG.USE_MOCK) return store.kpis[modelId] || null;
        const { data } = await supabase
            .from('kpi_snapshots')
            .select('*')
            .eq('model_id', modelId)
            .order('date', { ascending: false })
            .limit(1)
            .single();
        return data;
    }

    async function updateKpis(modelId, fields) {
        if (APP_CONFIG.USE_MOCK) {
            store.kpis[modelId] = { ...(store.kpis[modelId] || {}), ...fields };
            return store.kpis[modelId];
        }
        const { data } = await supabase.from('kpi_snapshots').upsert({ model_id: modelId, date: new Date().toISOString().split('T')[0], ...fields }).select().single();
        return data;
    }

    // ════════════════════════════════════════════════════════════════
    // TASKS
    // ════════════════════════════════════════════════════════════════

    async function getTasks(modelId = null) {
        if (APP_CONFIG.USE_MOCK) {
            return modelId
                ? store.tasks.filter(t => t.modelId === modelId)
                : [...store.tasks];
        }
        let q = supabase.from('tasks').select('*').order('due_date');
        if (modelId) q = q.eq('model_id', modelId);
        const { data } = await q;
        return data;
    }

    async function createTask(fields) {
        if (APP_CONFIG.USE_MOCK) {
            const task = { id: uid('t'), createdAt: new Date().toISOString(), ...fields };
            store.tasks.push(task);
            return task;
        }
        const { data } = await supabase.from('tasks').insert(fields).select().single();
        return data;
    }

    async function updateTask(id, fields) {
        if (APP_CONFIG.USE_MOCK) {
            const idx = store.tasks.findIndex(t => t.id === id);
            if (idx < 0) return null;
            store.tasks[idx] = { ...store.tasks[idx], ...fields };
            return store.tasks[idx];
        }
        const { data } = await supabase.from('tasks').update(fields).eq('id', id).select().single();
        return data;
    }

    async function deleteTask(id) {
        if (APP_CONFIG.USE_MOCK) {
            store.tasks = store.tasks.filter(t => t.id !== id);
            return;
        }
        await supabase.from('tasks').delete().eq('id', id);
    }

    // ════════════════════════════════════════════════════════════════
    // RESOURCES
    // ════════════════════════════════════════════════════════════════

    async function getResources(modelId = null) {
        if (APP_CONFIG.USE_MOCK) {
            if (!modelId) return [...store.resources];
            return store.resources.filter(r => r.visibleToAll || r.modelIds.includes(modelId));
        }
        let q = supabase.from('resources').select('*').order('pinned', { ascending: false }).order('title');
        const { data } = await q;
        return data;
    }

    async function getResourceCategories() {
        if (APP_CONFIG.USE_MOCK) return [...store.resourceCategories];
        const { data } = await supabase.from('resource_categories').select('*').order('sort_order');
        return data;
    }

    async function createResource(fields) {
        if (APP_CONFIG.USE_MOCK) {
            const res = { id: uid('r'), ...fields };
            store.resources.push(res);
            return res;
        }
        const { data } = await supabase.from('resources').insert(fields).select().single();
        return data;
    }

    async function updateResource(id, fields) {
        if (APP_CONFIG.USE_MOCK) {
            const idx = store.resources.findIndex(r => r.id === id);
            if (idx < 0) return null;
            store.resources[idx] = { ...store.resources[idx], ...fields };
            return store.resources[idx];
        }
        const { data } = await supabase.from('resources').update(fields).eq('id', id).select().single();
        return data;
    }

    async function deleteResource(id) {
        if (APP_CONFIG.USE_MOCK) {
            store.resources = store.resources.filter(r => r.id !== id);
            return;
        }
        await supabase.from('resources').delete().eq('id', id);
    }

    return {
        getModels, getModel, getModelByUserId, createModel, updateModel, deleteModel,
        getSocialAccounts, createSocialAccount, updateSocialAccount, deleteSocialAccount,
        getKpis, updateKpis,
        getTasks, createTask, updateTask, deleteTask,
        getResources, getResourceCategories, createResource, updateResource, deleteResource,
    };
})();
