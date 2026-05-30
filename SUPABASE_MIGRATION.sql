-- ============================================================================
-- SendCrypto.io — Supabase SQL Migration
-- Run this in your Supabase SQL editor
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. AUDIT LOG TABLE (immutable record of all sensitive actions)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,
  session_id TEXT NOT NULL,
  context JSONB,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- No one can SELECT or UPDATE or DELETE — only service role can INSERT
DROP POLICY IF EXISTS "service_only_insert" ON audit_log;
CREATE POLICY "service_only_insert" ON audit_log FOR INSERT TO service_role WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- 2. PARTNER KEYS TABLE (for ethical AI agent / agency API access)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS partner_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  key_hash TEXT UNIQUE NOT NULL,
  scopes TEXT[] NOT NULL DEFAULT ARRAY['rates-summary', 'corridor-data', 'blog-feed'],
  daily_limit INTEGER NOT NULL DEFAULT 1000,
  request_count_today INTEGER NOT NULL DEFAULT 0,
  last_reset TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  contact_email TEXT,
  notes TEXT
);

ALTER TABLE partner_keys ENABLE ROW LEVEL SECURITY;

-- Only service role can read/write
DROP POLICY IF EXISTS "service_only_all" ON partner_keys;
CREATE POLICY "service_only_all" ON partner_keys FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- 3. SUBSCRIBERS TABLE — GDPR-compliant consent tracking
-- ----------------------------------------------------------------------------
-- Add columns if they don't exist
ALTER TABLE subscribers
  ADD COLUMN IF NOT EXISTS consent_copy TEXT,
  ADD COLUMN IF NOT EXISTS consent_timestamp TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS consent_ip TEXT,
  ADD COLUMN IF NOT EXISTS double_opt_in_confirmed BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS confirmation_token UUID DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS unsubscribed_at TIMESTAMPTZ;

-- Enable RLS
ALTER TABLE subscribers ENABLE ROW LEVEL SECURITY;

-- Drop old permissive policies
DROP POLICY IF EXISTS "Enable insert for all" ON subscribers;
DROP POLICY IF EXISTS "Anyone can subscribe" ON subscribers;

-- New strict policy: only service role can insert (via our API)
CREATE POLICY "service_only_insert" ON subscribers
  FOR INSERT TO service_role WITH CHECK (true);

-- Service role can update for unsubscribe / double opt-in confirmation
CREATE POLICY "service_only_update" ON subscribers
  FOR UPDATE TO service_role USING (true);

-- Service role can read (for admin / unsubscribe flows)
CREATE POLICY "service_only_select" ON subscribers
  FOR SELECT TO service_role USING (true);

-- Anon users CANNOT directly read or insert — all goes through our API
-- This is the critical security fix

-- ----------------------------------------------------------------------------
-- 4. AFFILIATE_CLICKS TABLE — anonymous tracking
-- ----------------------------------------------------------------------------
ALTER TABLE affiliate_clicks
  ADD COLUMN IF NOT EXISTS session_id TEXT,
  ADD COLUMN IF NOT EXISTS ip_anon TEXT,
  ADD COLUMN IF NOT EXISTS corridor TEXT,
  ADD COLUMN IF NOT EXISTS asset TEXT;

ALTER TABLE affiliate_clicks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can insert" ON affiliate_clicks;
CREATE POLICY "service_only_insert" ON affiliate_clicks
  FOR INSERT TO service_role WITH CHECK (true);

CREATE POLICY "service_only_select" ON affiliate_clicks
  FOR SELECT TO service_role USING (true);

-- ----------------------------------------------------------------------------
-- 5. BLOG_POSTS — anon role can SELECT only published posts
-- ----------------------------------------------------------------------------
ALTER TABLE blog_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read published" ON blog_posts;
CREATE POLICY "anon_select_published" ON blog_posts
  FOR SELECT TO anon, authenticated
  USING (published = true);

CREATE POLICY "service_full_access" ON blog_posts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- 6. RATES + PROVIDERS + COINGECKO_PRICES — public read
-- ----------------------------------------------------------------------------
ALTER TABLE rates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read rates" ON rates;
CREATE POLICY "anon_select" ON rates FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "service_full" ON rates FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE providers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read providers" ON providers;
CREATE POLICY "anon_select" ON providers FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "service_full" ON providers FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE coingecko_prices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read prices" ON coingecko_prices;
CREATE POLICY "anon_select" ON coingecko_prices FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "service_full" ON coingecko_prices FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- 7. Ensure providers table has affiliate_url column
-- ----------------------------------------------------------------------------
ALTER TABLE providers
  ADD COLUMN IF NOT EXISTS affiliate_url TEXT;

-- ----------------------------------------------------------------------------
-- 8. Index optimizations for query performance
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_blog_posts_published_at ON blog_posts(published, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_blog_posts_slug ON blog_posts(slug);
CREATE INDEX IF NOT EXISTS idx_blog_posts_category ON blog_posts(category, published);
CREATE INDEX IF NOT EXISTS idx_rates_corridor ON rates(corridor, from_asset, to_currency);
CREATE INDEX IF NOT EXISTS idx_subscribers_email ON subscribers(email);
CREATE INDEX IF NOT EXISTS idx_subscribers_confirmation ON subscribers(confirmation_token) WHERE double_opt_in_confirmed = false;

-- ----------------------------------------------------------------------------
-- 9. VERIFY ALL POLICIES (run this to check)
-- ----------------------------------------------------------------------------
-- SELECT schemaname, tablename, rowsecurity
-- FROM pg_tables
-- WHERE schemaname = 'public'
-- ORDER BY tablename;
--
-- SELECT * FROM pg_policies WHERE schemaname = 'public';

-- ============================================================================
-- DONE. Your database is now bulletproof.
-- ============================================================================
