-- ============================================================
-- Migration: multi-handle follower snapshots + post_snapshots
-- Run once in Supabase SQL Editor.
-- ============================================================

-- 1. Fix follower_snapshots unique constraint to include handle
--    (needed so each IG account per model gets its own row)
ALTER TABLE public.follower_snapshots
    DROP CONSTRAINT IF EXISTS follower_snapshots_model_id_platform_date_key;

ALTER TABLE public.follower_snapshots
    ADD CONSTRAINT IF NOT EXISTS follower_snapshots_model_id_platform_handle_date_key
    UNIQUE (model_id, platform, handle, date);


-- 2. Create post_snapshots table
CREATE TABLE IF NOT EXISTS public.post_snapshots (
    id          uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
    model_id    uuid        NOT NULL REFERENCES public.models(id) ON DELETE CASCADE,
    handle      text        NOT NULL,
    post_id     text        NOT NULL,
    shortcode   text,
    post_url    text,
    caption     text,
    posted_at   timestamptz,
    likes       int         NOT NULL DEFAULT 0,
    comments    int         NOT NULL DEFAULT 0,
    views       int         NOT NULL DEFAULT 0,
    fetched_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (post_id)
);

CREATE INDEX IF NOT EXISTS post_snapshots_model_idx  ON public.post_snapshots(model_id);
CREATE INDEX IF NOT EXISTS post_snapshots_handle_idx ON public.post_snapshots(handle);
CREATE INDEX IF NOT EXISTS post_snapshots_posted_idx ON public.post_snapshots(posted_at DESC);

-- 3. RLS
ALTER TABLE public.post_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "posts: read"          ON public.post_snapshots;
DROP POLICY IF EXISTS "posts: service write" ON public.post_snapshots;

CREATE POLICY "posts: read"          ON public.post_snapshots
    FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "posts: service write" ON public.post_snapshots
    FOR ALL TO service_role USING (true) WITH CHECK (true);
