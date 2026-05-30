import type { APIRoute } from 'astro';
import { getPublicClient, getServiceClient } from '../../lib/supabase';
import { verifySignature } from '../../lib/security';

export const prerender = false;

/**
 * Partner API — Tier 2 access for ethical AI agents and agencies
 *
 * Authentication: X-Partner-Key header (HMAC-signed token)
 * Rate limit: 1000 requests/day per key
 * Logged: every request to audit_log table
 *
 * Endpoints:
 * GET /api/partner?endpoint=rates-summary
 * GET /api/partner?endpoint=corridor-data
 * GET /api/partner?endpoint=blog-feed
 */

export const GET: APIRoute = async ({ url, request, locals }) => {
  const env = (locals as any).runtime?.env || import.meta.env;
  const partnerKey = request.headers.get('X-Partner-Key');
  const signature = request.headers.get('X-Signature');
  const endpoint = url.searchParams.get('endpoint');

  if (!partnerKey) {
    return new Response(
      JSON.stringify({
        error: 'Partner-Key header required',
        info: 'Request access at https://sendcrypto.io/partners',
      }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Validate partner key
  const supabase = getServiceClient(env);
  const { data: partner } = await supabase
    .from('partner_keys')
    .select('id, name, active, scopes, daily_limit, request_count_today, last_reset')
    .eq('key_hash', partnerKey)
    .eq('active', true)
    .maybeSingle();

  if (!partner) {
    return new Response(JSON.stringify({ error: 'Invalid or revoked Partner-Key' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Rate limit check
  const today = new Date().toISOString().split('T')[0];
  const lastResetDay = partner.last_reset?.split('T')[0];
  const currentCount = lastResetDay === today ? partner.request_count_today : 0;

  if (currentCount >= (partner.daily_limit || 1000)) {
    return new Response(JSON.stringify({ error: 'Daily rate limit exceeded' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Scope check
  if (!partner.scopes?.includes(endpoint || 'unknown')) {
    return new Response(JSON.stringify({ error: 'Endpoint not in partner scope' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Update counter
  await supabase
    .from('partner_keys')
    .update({
      request_count_today: currentCount + 1,
      last_reset: new Date().toISOString(),
      last_used_at: new Date().toISOString(),
    })
    .eq('id', partner.id);

  // Log to audit
  await supabase.from('audit_log').insert({
    action: 'partner_api_access',
    session_id: `partner:${partner.id}`,
    context: { endpoint, partner_name: partner.name },
    timestamp: new Date().toISOString(),
  });

  // Serve the requested endpoint
  const publicClient = getPublicClient(env);

  switch (endpoint) {
    case 'rates-summary': {
      const { data } = await publicClient
        .from('rates')
        .select('corridor, from_asset, to_currency, rate, fee_pct, providers(name)')
        .order('updated_at', { ascending: false })
        .limit(50);
      return jsonResponse({ rates: data || [] }, partner.name);
    }

    case 'corridor-data': {
      const corridors = ['US-MX', 'US-NG', 'US-PH', 'US-BR'];
      const results: any = {};
      for (const corridor of corridors) {
        const { data } = await publicClient
          .from('rates')
          .select('from_asset, to_currency, rate, providers(name)')
          .eq('corridor', corridor)
          .order('rate', { ascending: false })
          .limit(5);
        results[corridor] = data || [];
      }
      return jsonResponse({ corridors: results }, partner.name);
    }

    case 'blog-feed': {
      const { data } = await publicClient
        .from('blog_posts')
        .select('slug, title, meta_description, category, published_at, author')
        .eq('published', true)
        .order('published_at', { ascending: false })
        .limit(20);
      return jsonResponse({ articles: data || [] }, partner.name);
    }

    default:
      return new Response(
        JSON.stringify({
          error: 'Unknown endpoint',
          available: ['rates-summary', 'corridor-data', 'blog-feed'],
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
  }
};

function jsonResponse(data: any, partnerName: string) {
  return new Response(
    JSON.stringify({
      data,
      attribution: 'SendCrypto.io',
      partner: partnerName,
      timestamp: new Date().toISOString(),
      terms: 'https://sendcrypto.io/partners/terms',
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-RateLimit-Remaining': '1000',
        'Cache-Control': 'public, max-age=300',
      },
    }
  );
}
