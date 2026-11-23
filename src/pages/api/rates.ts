import type { APIRoute } from 'astro';
import { getPublicClient } from '../../lib/supabase';

export const prerender = false;

// Lightweight, cacheable JSON feed for the /app PWA.
// GET /api/rates                       -> all pairs + rates (grouped)
// GET /api/rates?pair=US-MX:USDT:MXN   -> rates for one pair
const PAIR_RE = /^[A-Z]{2}-[A-Z]{2}:[A-Z0-9]{2,10}:[A-Z]{3}$/;

export const GET: APIRoute = async ({ url, locals }) => {
  const env = (locals as any).runtime?.env || import.meta.env;
  const pairParam = (url.searchParams.get('pair') || '').toUpperCase();
  const pair = PAIR_RE.test(pairParam) ? pairParam : null;

  try {
    const supabase = getPublicClient(env);
    let q = supabase
      .from('rates')
      .select('corridor, from_asset, to_currency, rate, fee_pct, speed_minutes, providers(name, slug)')
      .order('rate', { ascending: false })
      .limit(pair ? 20 : 500);

    if (pair) {
      const [corridor, asset, currency] = pair.split(':');
      q = q.eq('corridor', corridor).eq('from_asset', asset).eq('to_currency', currency);
    }

    const { data, error } = await q;
    if (error) throw error;

    const pairs: Record<string, { p: string; n: string; s: string; r: number; f: number; m: number }[]> = {};
    for (const r of (data || []) as any[]) {
      const key = `${r.corridor}:${r.from_asset}:${r.to_currency}`;
      const slug = r.providers?.slug || '';
      if (!/^[a-z0-9-]*$/.test(slug)) continue;
      (pairs[key] ||= []).push({
        p: key,
        n: String(r.providers?.name || 'Provider').slice(0, 60),
        s: slug,
        r: Number(r.rate) || 0,
        f: Number(r.fee_pct) || 0,
        m: Number(r.speed_minutes) || 0,
      });
    }

    return new Response(JSON.stringify({ t: Date.now(), pairs }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        // Rates refresh every 15 min upstream; 5 min edge cache keeps Supabase load ~flat.
        'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Rates unavailable' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }
};
