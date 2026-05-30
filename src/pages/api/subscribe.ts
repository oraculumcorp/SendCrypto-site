import type { APIRoute } from 'astro';
import { getServiceClient } from '../../lib/supabase';
import { isValidEmail, anonymizeIp } from '../../lib/security';

export const prerender = false;

const ALLOWED_ORIGINS = ['https://sendcrypto.io', 'https://www.sendcrypto.io'];

export const OPTIONS: APIRoute = async ({ request }) => {
  const origin = request.headers.get('origin');
  const headers = new Headers();
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type');
  }
  return new Response(null, { status: 204, headers });
};

export const POST: APIRoute = async ({ request, locals, clientAddress }) => {
  const origin = request.headers.get('origin');

  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Get env from Cloudflare runtime
  const runtime = (locals as any).runtime;
  const env = runtime?.env ?? {};

  // Pull keys explicitly — Cloudflare secrets are on env directly
  const supabaseUrl = env.PUBLIC_SUPABASE_URL || import.meta.env.PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({
      error: 'Server configuration error',
      debug: {
        hasUrl: !!supabaseUrl,
        hasKey: !!serviceKey,
        envKeys: Object.keys(env),
      }
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { email, source, consent_copy, consent_timestamp } = body;

  if (!email || !isValidEmail(email)) {
    return new Response(JSON.stringify({ error: 'Invalid email address' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!consent_copy || !consent_timestamp) {
    return new Response(JSON.stringify({ error: 'Consent required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabase = getServiceClient(env);
    const anonIp = anonymizeIp(clientAddress || '');

    const { error: dbError } = await supabase.from('subscribers').upsert(
      {
        email: email.toLowerCase().trim(),
        source: source || 'unknown',
        consent_copy,
        consent_timestamp,
        consent_ip: anonIp,
        double_opt_in_confirmed: false,
        created_at: new Date().toISOString(),
      },
      { onConflict: 'email' }
    );

    if (dbError) {
      return new Response(JSON.stringify({
        error: 'Database error',
        detail: dbError.message,
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Fire and forget audit log
    supabase.from('audit_log').insert({
      action: 'subscribe',
      session_id: 'system',
      context: { source, ip_anon: anonIp },
      timestamp: new Date().toISOString(),
    }).then(() => {}, () => {});

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': origin || ALLOWED_ORIGINS[0],
      },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({
      error: 'Unexpected error',
      detail: err?.message || String(err),
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};