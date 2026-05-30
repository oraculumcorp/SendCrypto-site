import type { APIRoute } from 'astro';
import { getServiceClient } from '../../lib/supabase';
import { anonymizeIp, generateSessionId } from '../../lib/security';

export const prerender = false;

const ALLOWED_ORIGINS = ['https://sendcrypto.io', 'https://www.sendcrypto.io'];

export const POST: APIRoute = async ({ request, locals, clientAddress }) => {
  const env = (locals as any).runtime?.env || import.meta.env;
  const origin = request.headers.get('origin');

  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    return new Response(JSON.stringify({ error: 'Origin not allowed' }), { status: 403 });
  }

  try {
    const body = await request.json();
    const { provider_slug, corridor, asset } = body;

    if (!provider_slug || typeof provider_slug !== 'string') {
      return new Response(JSON.stringify({ error: 'Invalid request' }), { status: 400 });
    }

    const supabase = getServiceClient(env);
    const sessionId = generateSessionId();
    const anonIp = anonymizeIp(clientAddress || '');

    // Insert click — no PII, just analytics
    await supabase.from('affiliate_clicks').insert({
      session_id: sessionId,
      provider_slug,
      corridor: corridor || null,
      asset: asset || null,
      ip_anon: anonIp,
      created_at: new Date().toISOString(),
    });

    return new Response(JSON.stringify({ success: true, session_id: sessionId }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': origin || ALLOWED_ORIGINS[0],
      },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Tracking failed' }), { status: 400 });
  }
};
