-- ============================================================
-- CelebClub Platform – Supabase Schema
-- Run this in your Supabase SQL editor to set up the database.
-- After running: set APP_CONFIG.USE_MOCK = false in js/config.js
-- ============================================================


-- ── Extensions ───────────────────────────────────────────────
create extension if not exists "uuid-ossp";


-- ── Profiles (extends Supabase auth.users) ───────────────────
create table profiles (
    id          uuid primary key references auth.users(id) on delete cascade,
    email       text not null,
    role        text not null check (role in ('model', 'manager')) default 'model',
    name        text,
    initials    text,
    created_at  timestamptz default now()
);

-- Auto-create profile on signup
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
    insert into profiles (id, email, role, name)
    values (new.id, new.email, 'model', split_part(new.email, '@', 1));
    return new;
end;
$$;

create trigger on_auth_user_created
    after insert on auth.users
    for each row execute procedure handle_new_user();


-- ── Models ───────────────────────────────────────────────────
create table models (
    id            uuid primary key default uuid_generate_v4(),
    user_id       uuid references profiles(id) on delete set null,
    name          text not null,
    initials      text,
    status        text not null check (status in ('active','paused','onboarding','inactive')) default 'active',
    instagram     text,
    tiktok        text,
    onlyfans      text,
    monthly_goal  numeric default 0,
    notes         text,
    created_by    uuid references profiles(id),
    created_at    timestamptz default now(),
    updated_at    timestamptz default now()
);

create index on models(status);
create index on models(user_id);


-- ── KPI Snapshots ─────────────────────────────────────────────
create table kpi_snapshots (
    id                    uuid primary key default uuid_generate_v4(),
    model_id              uuid not null references models(id) on delete cascade,
    date                  date not null default current_date,
    of_revenue_today      numeric default 0,
    of_revenue_week       numeric default 0,
    of_revenue_month      numeric default 0,
    of_subscribers_new    int    default 0,
    of_renewal_rate       numeric default 0,
    ig_views_week         numeric default 0,
    tiktok_views_week     numeric default 0,
    follower_growth_week  int    default 0,
    best_post             text,
    created_at            timestamptz default now(),
    unique (model_id, date)
);

create index on kpi_snapshots(model_id, date desc);


-- ── Tasks ────────────────────────────────────────────────────
create table tasks (
    id          uuid primary key default uuid_generate_v4(),
    model_id    uuid not null references models(id) on delete cascade,
    title       text not null,
    notes       text,
    priority    text not null check (priority in ('low','medium','high','urgent')) default 'medium',
    status      text not null check (status in ('open','in_progress','done','overdue'))  default 'open',
    due_date    date,
    created_by  uuid references profiles(id),
    created_at  timestamptz default now(),
    updated_at  timestamptz default now()
);

create index on tasks(model_id);
create index on tasks(status);
create index on tasks(priority);


-- ── Resource Categories ───────────────────────────────────────
create table resource_categories (
    id          uuid primary key default uuid_generate_v4(),
    slug        text not null unique,
    name        text not null,
    sort_order  int default 0
);

insert into resource_categories (slug, name, sort_order) values
    ('guidelines', 'Guidelines',         1),
    ('kit',        'Creator Kit',         2),
    ('scripts',    'Scripts & Templates', 3),
    ('branding',   'Branding',            4),
    ('social',     'Social Media',        5),
    ('of',         'OnlyFans',            6),
    ('safety',     'Safety',              7);


-- ── Resources ────────────────────────────────────────────────
create table resources (
    id               uuid primary key default uuid_generate_v4(),
    category_slug    text not null references resource_categories(slug),
    title            text not null,
    description      text,
    type             text check (type in ('document','template','sheet','audio','link','pdf')) default 'document',
    url              text,
    pinned           boolean default false,
    visible_to_all   boolean default true,
    created_by       uuid references profiles(id),
    created_at       timestamptz default now(),
    updated_at       timestamptz default now()
);

create index on resources(category_slug);
create index on resources(pinned);


-- ── Social Accounts ──────────────────────────────────────────
create table social_accounts (
    id          uuid primary key default uuid_generate_v4(),
    model_id    uuid not null references models(id) on delete cascade,
    platform    text not null check (platform in ('instagram','tiktok','onlyfans','youtube','telegram','twitter')),
    username    text not null,
    url         text,
    is_primary  boolean default false,
    created_at  timestamptz default now()
);

create index on social_accounts(model_id);
create index on social_accounts(platform);

-- Enforce one primary per model+platform
create unique index on social_accounts(model_id, platform) where is_primary = true;


-- ── Follower Snapshots (replaces data/snapshots.json) ────────
create table if not exists follower_snapshots (
    id         serial      primary key,
    model_id   uuid        not null references models(id) on delete cascade,
    platform   text        not null check (platform in ('instagram','tiktok')),
    handle     text        not null,
    date       date        not null default current_date,
    followers  integer     not null,
    created_at timestamptz not null default now(),
    unique (model_id, platform, date)
);

create index on follower_snapshots(model_id, platform, date desc);

alter table follower_snapshots enable row level security;

-- Authenticated users (models/managers) can read snapshots
create policy "snapshots: read" on follower_snapshots
    for select using (auth.role() = 'authenticated');

-- Only service_role (GitHub Actions) can write
create policy "snapshots: service write" on follower_snapshots
    for all to service_role using (true) with check (true);


-- ── Resource Assignments (model-specific) ────────────────────
create table resource_assignments (
    resource_id  uuid not null references resources(id) on delete cascade,
    model_id     uuid not null references models(id)    on delete cascade,
    primary key (resource_id, model_id)
);


-- ── Row Level Security ────────────────────────────────────────

alter table profiles             enable row level security;
alter table models               enable row level security;
alter table kpi_snapshots        enable row level security;
alter table tasks                enable row level security;
alter table social_accounts      enable row level security;
alter table resources            enable row level security;
alter table resource_assignments enable row level security;

-- Helper: is current user a manager?
create or replace function is_manager()
returns boolean language sql security definer as $$
    select exists (
        select 1 from profiles
        where id = auth.uid() and role = 'manager'
    );
$$;

-- Helper: model_id linked to current user
create or replace function my_model_id()
returns uuid language sql security definer as $$
    select id from models where user_id = auth.uid() limit 1;
$$;

-- profiles: users see their own row; managers see all
create policy "profiles: own row"    on profiles for select using (id = auth.uid());
create policy "profiles: managers"   on profiles for all    using (is_manager());

-- models: managers full access; models see own row
create policy "models: manager"      on models for all    using (is_manager());
create policy "models: own"          on models for select using (user_id = auth.uid());

-- kpi_snapshots: managers full; models see own
create policy "kpi: manager"         on kpi_snapshots for all    using (is_manager());
create policy "kpi: own"             on kpi_snapshots for select using (model_id = my_model_id());

-- tasks: managers full; models see own
create policy "tasks: manager"       on tasks for all    using (is_manager());
create policy "tasks: own read"      on tasks for select using (model_id = my_model_id());
create policy "tasks: own update"    on tasks for update using (model_id = my_model_id());

-- resources: managers full; models see visible_to_all or assigned
create policy "resources: manager"   on resources for all    using (is_manager());
create policy "resources: model"     on resources for select using (
    is_manager() or visible_to_all = true or
    id in (select resource_id from resource_assignments where model_id = my_model_id())
);

-- social_accounts: managers full; models see/update own
create policy "social: manager"  on social_accounts for all    using (is_manager());
create policy "social: own read" on social_accounts for select using (model_id = my_model_id());
create policy "social: own edit" on social_accounts for all    using (model_id = my_model_id());

-- resource_assignments: managers only
create policy "assignments: manager" on resource_assignments for all using (is_manager());


-- ── Updated_at trigger ────────────────────────────────────────
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger models_updated_at    before update on models    for each row execute procedure set_updated_at();
create trigger tasks_updated_at     before update on tasks     for each row execute procedure set_updated_at();
create trigger resources_updated_at before update on resources for each row execute procedure set_updated_at();


-- ============================================================
-- MIGRATION: add social_accounts to an existing database
-- Run this block if you already have the schema above deployed
-- and only need to add the social_accounts table.
-- ============================================================

-- Step 1: create the table (safe to run on existing DB)
create table if not exists social_accounts (
    id          uuid primary key default uuid_generate_v4(),
    model_id    uuid not null references models(id) on delete cascade,
    platform    text not null check (platform in ('instagram','tiktok','onlyfans','youtube','telegram','twitter')),
    username    text not null,
    url         text,
    is_primary  boolean default false,
    created_at  timestamptz default now()
);

create index if not exists social_accounts_model_id_idx    on social_accounts(model_id);
create index if not exists social_accounts_platform_idx    on social_accounts(platform);
create unique index if not exists social_accounts_primary_idx
    on social_accounts(model_id, platform) where is_primary = true;

alter table social_accounts enable row level security;

-- Step 2: RLS policies (drop first to avoid duplicate errors)
drop policy if exists "social: manager"  on social_accounts;
drop policy if exists "social: own read" on social_accounts;
drop policy if exists "social: own edit" on social_accounts;

create policy "social: manager"  on social_accounts for all    using (is_manager());
create policy "social: own read" on social_accounts for select using (model_id = my_model_id());
create policy "social: own edit" on social_accounts for all    using (model_id = my_model_id());

-- Step 3: Seed from existing columns (run once, then ignore)
-- Inserts primary accounts from models.instagram / .tiktok / .onlyfans
-- if they don't already exist in social_accounts.
insert into social_accounts (model_id, platform, username, is_primary)
select id, 'instagram', instagram, true
from models
where instagram is not null
  and not exists (
    select 1 from social_accounts sa
    where sa.model_id = models.id and sa.platform = 'instagram'
  );

insert into social_accounts (model_id, platform, username, is_primary)
select id, 'tiktok', tiktok, true
from models
where tiktok is not null
  and not exists (
    select 1 from social_accounts sa
    where sa.model_id = models.id and sa.platform = 'tiktok'
  );

insert into social_accounts (model_id, platform, username, is_primary)
select id, 'onlyfans', onlyfans, true
from models
where onlyfans is not null
  and not exists (
    select 1 from social_accounts sa
    where sa.model_id = models.id and sa.platform = 'onlyfans'
  );
