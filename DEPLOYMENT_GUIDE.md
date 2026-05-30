# SendCrypto.io — Deployment Guide

Complete migration from static HTML site to secure Astro + Cloudflare Pages + Supabase architecture.

---

## Step 1: Backup Current Site

```bash
# In your existing SendCrypto-site repo
git checkout -b legacy-static-site-backup
git push origin legacy-static-site-backup
git checkout main
```

This preserves your current static site as a recoverable branch.

## Step 2: Replace Repo Contents

Delete everything in the current repo (except `.git/`) and copy these new files in:

```
sendcrypto-site/
├── .github/workflows/deploy.yml
├── public/
│   ├── _headers
│   ├── _redirects
│   ├── robots.txt
│   ├── favicon.svg          (KEEP your existing one)
│   └── og-image.png         (KEEP your existing one)
├── src/
│   ├── components/
│   ├── layouts/
│   ├── lib/
│   ├── pages/
│   └── styles/
├── .env.example
├── .gitignore
├── astro.config.mjs
├── package.json
├── SUPABASE_MIGRATION.sql
├── DEPLOYMENT_GUIDE.md
└── wrangler.toml
```

## Step 3: Run Supabase Migration

1. Open Supabase Dashboard → SQL Editor
2. Open `SUPABASE_MIGRATION.sql`
3. Copy the entire file contents into the SQL Editor
4. Click **Run**
5. Verify all policies created: 
   ```sql
   SELECT * FROM pg_policies WHERE schemaname = 'public';
   ```

This creates the `audit_log` and `partner_keys` tables, locks down RLS on all sensitive tables, and adds GDPR consent columns to `subscribers`.

## Step 4: Set Up GitHub Repository Secrets

GitHub repo → Settings → Secrets and variables → Actions → **New repository secret**

Add these:
- `PUBLIC_SUPABASE_URL` = `https://kbilecibimkkouenojpj.supabase.co`
- `PUBLIC_SUPABASE_ANON_KEY` = (your anon key — public, safe)
- `CLOUDFLARE_API_TOKEN` = (create at Cloudflare → My Profile → API Tokens → Edit Cloudflare Pages permissions)
- `CLOUDFLARE_ACCOUNT_ID` = (Cloudflare dashboard → Workers & Pages → right sidebar)

## Step 5: Set Up Cloudflare Pages Environment Variables

Cloudflare Dashboard → Pages → sendcrypto → Settings → Environment variables

**Production:**
- `PUBLIC_SUPABASE_URL` = `https://kbilecibimkkouenojpj.supabase.co`
- `PUBLIC_SUPABASE_ANON_KEY` = (your anon key)

**Encrypted (set via wrangler secrets):**
```bash
wrangler pages secret put SUPABASE_SERVICE_ROLE_KEY --project-name sendcrypto
wrangler pages secret put HMAC_SECRET --project-name sendcrypto
wrangler pages secret put PARTNER_API_SALT --project-name sendcrypto
```

For HMAC_SECRET and PARTNER_API_SALT, generate random 64-character strings:
```bash
openssl rand -hex 32
```

## Step 6: Update Cloudflare Pages Build Settings

Cloudflare → Pages → sendcrypto → Settings → Builds & deployments

- **Build command:** `npm run build`
- **Build output directory:** `dist`
- **Root directory:** `/`
- **Framework preset:** Astro

## Step 7: Local Development Setup

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env.local
# Edit .env.local with your actual Supabase keys

# Run dev server
npm run dev
```

Visit `http://localhost:4321` to test locally.

## Step 8: Deploy

```bash
git add .
git commit -m "feat: migrate to Astro with secure SSR architecture"
git push origin main
```

GitHub Actions will automatically:
1. Install dependencies
2. Type-check the code
3. Build the site
4. Scan for leaked secrets
5. Deploy to Cloudflare Pages
6. Ping Google and Bing sitemaps

## Step 9: Post-Deploy Verification

Test these URLs:
```
https://sendcrypto.io/                          → homepage with live rates
https://sendcrypto.io/blog/                     → blog list from Supabase
https://sendcrypto.io/blog/moonpay-vs-transak-fees-2026/  → individual article
https://sendcrypto.io/company/                  → company page
https://sendcrypto.io/privacy/                  → privacy policy
https://sendcrypto.io/cookies/                  → cookie policy
https://sendcrypto.io/terms/                    → terms
https://sendcrypto.io/partners/                 → partner API page
https://sendcrypto.io/sitemap.xml               → dynamic sitemap
https://sendcrypto.io/robots.txt                → robots
```

All should return 200 OK with full content.

## Step 10: Issue First Partner API Key

When a partner agency or AI agent requests access, manually insert a key:

```sql
INSERT INTO partner_keys (name, key_hash, scopes, daily_limit, contact_email, notes)
VALUES (
  'Example Partner Name',
  'random_64_char_secret_key_you_generate_with_openssl_rand',
  ARRAY['rates-summary', 'corridor-data'],
  1000,
  'partner@example.com',
  'Approved for non-commercial research use'
);
```

Send them the key via secure channel (1Password, Signal, etc.) — never email.

## Step 11: Google Search Console

1. Submit the new `sitemap.xml` URL
2. Request reindexing of homepage
3. Request reindexing of all blog article URLs
4. Validate fix on previous errors (Page with redirect, 404s, etc.)

## Step 12: Cloudflare SSL Settings (final check)

- SSL/TLS → Edge Certificates → **Always Use HTTPS: ON**
- SSL/TLS → mode: **Full (strict)**
- SSL/TLS → HSTS: Enable with max-age 12 months, includeSubDomains, preload

---

## Security Architecture Summary

**Layer 1 — Edge (Cloudflare)**
- WAF blocking SQL injection, XSS, known bad IPs
- DDoS protection
- Always HTTPS with HSTS preload
- Strict CSP, X-Frame-Options DENY, Referrer-Policy

**Layer 2 — Application (Astro SSR)**
- Service role key never exposed to browser
- All form inputs validated and sanitized
- DOMPurify on all rendered HTML content
- Honeypot fields for bot detection
- HMAC-signed server-to-server requests

**Layer 3 — Database (Supabase)**
- RLS enforced on every table
- Anon key has SELECT-only access to public data
- Service role key only used in server-side API routes
- Audit log captures all sensitive actions
- IP addresses anonymized to /24 subnet

**Layer 4 — Compliance**
- GDPR-compliant cookie consent banner
- Explicit opt-in for email subscription
- Consent copy and timestamp stored permanently
- Privacy Policy v2.0 with all GDPR/CCPA rights
- Affiliate disclosure on every article and in footer
- Cookie Policy with detailed cookie inventory
- Partner API terms for ethical AI agent access

---

## What Changes for You

**Publishing new blog articles:**
Use the Supabase Table Editor or your existing admin panel. Set `published = true` and the article appears instantly. No redeploy needed.

**Updating rates:**
Your existing rate update job continues working. The new site reads from the same tables.

**Adding new providers:**
Insert into `providers` table with `affiliate_url`. The site picks them up automatically.

**Issuing partner API keys:**
SQL insert into `partner_keys` table. Revoke by setting `active = false`.

---

## Troubleshooting

**Build fails with "Missing Supabase credentials":**
Set `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY` in GitHub Actions secrets and Cloudflare Pages env vars.

**Blog articles 404:**
Check Supabase RLS policy on `blog_posts` allows anon SELECT where `published = true`.

**Subscribe form fails:**
Check Cloudflare Pages has `SUPABASE_SERVICE_ROLE_KEY` set as encrypted secret.

**Sitemap 404:**
Hard refresh (`Ctrl+Shift+R`). Sitemap is SSR so it requires server response, not static file.

---

Done. You now have a bulletproof, GDPR-compliant, secure, fast, easy-to-maintain Astro site that publishes from Supabase in real time.
