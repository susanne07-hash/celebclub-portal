-- ============================================================
-- CelebClub Platform – Supabase Schema
-- Idempotent: safe to run multiple times on an existing DB.
-- Run this in your Supabase SQL editor.
-- ============================================================


-- ── Extensions ───────────────────────────────────────────────
create extension if not exists "uuid-ossp";


-- ── Profiles (extends Supabase auth.users) ───────────────────
create table if not exists public.profiles (
    id          uuid primary key references auth.users(id) on delete cascade,
    email       text,
    role        text not null check (role in ('model', 'manager')) default 'model',
    name        text,
    initials    text,
    created_at  timestamptz default now()
);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
    insert into public.profiles (id, email, role, name, initials)
    values (
        new.id,
        new.email,
        coalesce(new.raw_user_meta_data->>'role', 'model'),
        coalesce(new.raw_user_meta_data->>'name', split_part(coalesce(new.email, ''), '@', 1)),
        upper(left(coalesce(new.raw_user_meta_data->>'name', split_part(coalesce(new.email, ''), '@', 1)), 2))
    );
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();


-- ── Models ───────────────────────────────────────────────────
create table if not exists public.models (
    id            uuid primary key default uuid_generate_v4(),
    user_id       uuid references public.profiles(id) on delete set null,
    name          text not null,
    initials      text,
    status        text not null check (status in ('active','paused','onboarding','inactive')) default 'active',
    instagram     text,
    tiktok        text,
    onlyfans      text,
    monthly_goal  numeric default 0,
    notes         text,
    created_by    uuid references public.profiles(id),
    created_at    timestamptz default now(),
    updated_at    timestamptz default now()
);

create index if not exists models_status_idx   on public.models(status);
create index if not exists models_user_id_idx  on public.models(user_id);


-- ── KPI Snapshots ─────────────────────────────────────────────
create table if not exists public.kpi_snapshots (
    id                    uuid primary key default uuid_generate_v4(),
    model_id              uuid not null references public.models(id) on delete cascade,
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

create index if not exists kpi_model_date_idx on public.kpi_snapshots(model_id, date desc);


-- ── Tasks ────────────────────────────────────────────────────
create table if not exists public.tasks (
    id          uuid primary key default uuid_generate_v4(),
    model_id    uuid not null references public.models(id) on delete cascade,
    title       text not null,
    notes       text,
    priority    text not null check (priority in ('low','medium','high','urgent')) default 'medium',
    status      text not null check (status in ('open','in_progress','done','overdue')) default 'open',
    due_date    date,
    created_by  uuid references public.profiles(id),
    created_at  timestamptz default now(),
    updated_at  timestamptz default now()
);

create index if not exists tasks_model_id_idx on public.tasks(model_id);
create index if not exists tasks_status_idx   on public.tasks(status);
create index if not exists tasks_priority_idx on public.tasks(priority);


-- ── Resource Categories ───────────────────────────────────────
create table if not exists public.resource_categories (
    id          uuid primary key default uuid_generate_v4(),
    slug        text not null unique,
    name        text not null,
    sort_order  int default 0
);

insert into public.resource_categories (slug, name, sort_order) values
    ('guidelines', 'Guidelines',         1),
    ('kit',        'Creator Kit',         2),
    ('scripts',    'Scripts & Templates', 3),
    ('branding',   'Branding',            4),
    ('social',     'Social Media',        5),
    ('of',         'OnlyFans',            6),
    ('safety',     'Safety',              7)
on conflict (slug) do nothing;


-- ── Resources ────────────────────────────────────────────────
create table if not exists public.resources (
    id               uuid primary key default uuid_generate_v4(),
    category_slug    text not null references public.resource_categories(slug),
    title            text not null,
    description      text,
    type             text check (type in ('document','template','sheet','audio','link','pdf')) default 'document',
    url              text,
    pinned           boolean default false,
    visible_to_all   boolean default true,
    created_by       uuid references public.profiles(id),
    created_at       timestamptz default now(),
    updated_at       timestamptz default now()
);

create index if not exists resources_category_idx on public.resources(category_slug);
create index if not exists resources_pinned_idx   on public.resources(pinned);


-- ── Social Accounts ──────────────────────────────────────────
create table if not exists public.social_accounts (
    id          uuid primary key default uuid_generate_v4(),
    model_id    uuid not null references public.models(id) on delete cascade,
    platform    text not null check (platform in ('instagram','tiktok','onlyfans','youtube','telegram','twitter')),
    username    text not null,
    url         text,
    is_primary  boolean default false,
    created_at  timestamptz default now()
);

create index if not exists social_model_idx    on public.social_accounts(model_id);
create index if not exists social_platform_idx on public.social_accounts(platform);
create unique index if not exists social_primary_idx
    on public.social_accounts(model_id, platform) where is_primary = true;


-- ── Follower Snapshots ────────────────────────────────────────
create table if not exists public.follower_snapshots (
    id         serial      primary key,
    model_id   uuid        not null references public.models(id) on delete cascade,
    platform   text        not null check (platform in ('instagram','tiktok')),
    handle     text        not null,
    date       date        not null default current_date,
    followers  integer     not null,
    created_at timestamptz not null default now(),
    -- handle included so multiple IG accounts per model each get their own row
    unique (model_id, platform, handle, date)
);

create index if not exists snapshots_model_platform_date_idx
    on public.follower_snapshots(model_id, platform, date desc);


-- ── Post Snapshots ────────────────────────────────────────────
-- One row per Instagram post; upserted on each daily run so metrics stay current.
create table if not exists public.post_snapshots (
    id          uuid        primary key default uuid_generate_v4(),
    model_id    uuid        not null references public.models(id) on delete cascade,
    handle      text        not null,
    post_id     text        not null,
    shortcode   text,
    post_url    text,
    caption     text,
    posted_at   timestamptz,
    likes       int         not null default 0,
    comments    int         not null default 0,
    views       int         not null default 0,   -- video view count, 0 for photos
    fetched_at  timestamptz not null default now(),
    unique (post_id)
);

create index if not exists post_snapshots_model_idx  on public.post_snapshots(model_id);
create index if not exists post_snapshots_handle_idx on public.post_snapshots(handle);
create index if not exists post_snapshots_posted_idx on public.post_snapshots(posted_at desc);


-- ── Resource Assignments ─────────────────────────────────────
create table if not exists public.resource_assignments (
    resource_id  uuid not null references public.resources(id) on delete cascade,
    model_id     uuid not null references public.models(id)    on delete cascade,
    primary key (resource_id, model_id)
);


-- ── Row Level Security ────────────────────────────────────────
alter table public.profiles             enable row level security;
alter table public.models               enable row level security;
alter table public.kpi_snapshots        enable row level security;
alter table public.tasks                enable row level security;
alter table public.social_accounts      enable row level security;
alter table public.resources            enable row level security;
alter table public.resource_assignments enable row level security;
alter table public.follower_snapshots   enable row level security;
alter table public.post_snapshots       enable row level security;


-- ── Helper functions ─────────────────────────────────────────
create or replace function public.is_manager()
returns boolean language sql security definer set search_path = public as $$
    select exists (
        select 1 from public.profiles
        where id = auth.uid() and role = 'manager'
    );
$$;

create or replace function public.my_model_id()
returns uuid language sql security definer set search_path = public as $$
    select id from public.models where user_id = auth.uid() limit 1;
$$;


-- ── RLS Policies ─────────────────────────────────────────────

-- profiles
drop policy if exists "profiles: own row"  on public.profiles;
drop policy if exists "profiles: managers" on public.profiles;
create policy "profiles: own row"  on public.profiles for select using (id = auth.uid());
create policy "profiles: managers" on public.profiles for all    using (public.is_manager());

-- models
drop policy if exists "models: manager" on public.models;
drop policy if exists "models: own"     on public.models;
create policy "models: manager" on public.models for all    using (public.is_manager());
create policy "models: own"     on public.models for select using (user_id = auth.uid());

-- kpi_snapshots
drop policy if exists "kpi: manager" on public.kpi_snapshots;
drop policy if exists "kpi: own"     on public.kpi_snapshots;
create policy "kpi: manager" on public.kpi_snapshots for all    using (public.is_manager());
create policy "kpi: own"     on public.kpi_snapshots for select using (model_id = public.my_model_id());

-- tasks
drop policy if exists "tasks: manager"    on public.tasks;
drop policy if exists "tasks: own read"   on public.tasks;
drop policy if exists "tasks: own update" on public.tasks;
create policy "tasks: manager"    on public.tasks for all    using (public.is_manager());
create policy "tasks: own read"   on public.tasks for select using (model_id = public.my_model_id());
create policy "tasks: own update" on public.tasks for update using (model_id = public.my_model_id());

-- resources
drop policy if exists "resources: manager" on public.resources;
drop policy if exists "resources: model"   on public.resources;
create policy "resources: manager" on public.resources for all    using (public.is_manager());
create policy "resources: model"   on public.resources for select using (
    public.is_manager() or visible_to_all = true or
    id in (select resource_id from public.resource_assignments where model_id = public.my_model_id())
);

-- social_accounts
drop policy if exists "social: manager"  on public.social_accounts;
drop policy if exists "social: own read" on public.social_accounts;
drop policy if exists "social: own edit" on public.social_accounts;
create policy "social: manager"  on public.social_accounts for all    using (public.is_manager());
create policy "social: own read" on public.social_accounts for select using (model_id = public.my_model_id());
create policy "social: own edit" on public.social_accounts for all    using (model_id = public.my_model_id());

-- resource_assignments
drop policy if exists "assignments: manager" on public.resource_assignments;
create policy "assignments: manager" on public.resource_assignments for all using (public.is_manager());

-- follower_snapshots
drop policy if exists "snapshots: read"          on public.follower_snapshots;
drop policy if exists "snapshots: service write" on public.follower_snapshots;
create policy "snapshots: read"          on public.follower_snapshots
    for select using (auth.role() = 'authenticated');
create policy "snapshots: service write" on public.follower_snapshots
    for all to service_role using (true) with check (true);

-- post_snapshots
drop policy if exists "posts: read"          on public.post_snapshots;
drop policy if exists "posts: service write" on public.post_snapshots;
create policy "posts: read"          on public.post_snapshots
    for select using (auth.role() = 'authenticated');
create policy "posts: service write" on public.post_snapshots
    for all to service_role using (true) with check (true);


-- ── updated_at trigger ────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists models_updated_at    on public.models;
drop trigger if exists tasks_updated_at     on public.tasks;
drop trigger if exists resources_updated_at on public.resources;

create trigger models_updated_at    before update on public.models    for each row execute function public.set_updated_at();
create trigger tasks_updated_at     before update on public.tasks     for each row execute function public.set_updated_at();
create trigger resources_updated_at before update on public.resources for each row execute function public.set_updated_at();
