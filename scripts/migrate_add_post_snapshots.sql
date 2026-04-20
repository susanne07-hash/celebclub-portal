-- ============================================================
-- Migration: multi-handle follower snapshots + post_snapshots
-- Run once in Supabase SQL Editor.
-- ============================================================

-- 0. Copy existing instagram/tiktok handles from models table → social_accounts
--    (only inserts rows that don't already exist)
INSERT INTO public.social_accounts (model_id, platform, username, is_primary)
SELECT id, 'instagram', instagram, true
FROM   public.models
WHERE  instagram IS NOT NULL
  AND  instagram <> ''
  AND  NOT EXISTS (
      SELECT 1 FROM public.social_accounts sa
      WHERE sa.model_id = models.id AND sa.platform = 'instagram' AND sa.username = models.instagram
  )
ON CONFLICT DO NOTHING;

INSERT INTO public.social_accounts (model_id, platform, username, is_primary)
SELECT id, 'tiktok', tiktok, true
FROM   public.models
WHERE  tiktok IS NOT NULL
  AND  tiktok <> ''
  AND  NOT EXISTS (
      SELECT 1 FROM public.social_accounts sa
      WHERE sa.model_id = models.id AND sa.platform = 'tiktok' AND sa.username = models.tiktok
  )
ON CONFLICT DO NOTHING;

-- Verify what was inserted:
SELECT m.name, sa.platform, sa.username, sa.is_primary
FROM   public.social_accounts sa
JOIN   public.models m ON m.id = sa.model_id
ORDER  BY m.name, sa.platform;

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
