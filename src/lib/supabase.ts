import { createClient } from '@supabase/supabase-js';

// PUBLIC client — anon key, read-only via RLS, safe to use in any context
export function getPublicClient(env: any) {
  const url = env.PUBLIC_SUPABASE_URL || import.meta.env.PUBLIC_SUPABASE_URL;
  const key = env.PUBLIC_SUPABASE_ANON_KEY || import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error('Missing Supabase public credentials');
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: {
        'x-application-name': 'sendcrypto-web',
      },
    },
  });
}

// SERVICE client — service role key, full access, ONLY use in Workers/API routes
// NEVER import this in components or pages that render to the browser
export function getServiceClient(env: any) {
  const url = env.PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Missing Supabase service credentials');
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Type definitions for blog_posts table
export interface BlogPost {
  id: string;
  slug: string;
  title: string;
  meta_description: string;
  content: string;
  category: string;
  corridor_tag: string | null;
  author: string;
  featured: boolean;
  published: boolean;
  published_at: string;
  created_at: string;
  updated_at: string;
}

export interface Rate {
  rate: number;
  fee_pct: number;
  speed_minutes: number;
  providers: { name: string; slug: string };
}

export interface CoingeckoPrice {
  symbol: string;
  price: number;
  price_change_24h: number;
  fetched_at: string;
}
