import type { APIRoute } from 'astro';
import { getServiceClient } from '../../lib/supabase';
import { isValidEmail, anonymizeIp, checkRateLimit } from '../../lib/security';

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
  const env = (locals as any).runtime?.env || import.meta.env;
  const origin = request.headers.get('origin');

  // CORS check — block requests from other origins
  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await request.json();
    const { email, source, consent_copy, consent_timestamp } = body;

    // Email validation
    if (!email || !isValidEmail(email)) {
      return new Response(JSON.stringify({ error: 'Invalid email address' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Consent required
    if (!consent_copy || !consent_timestamp) {
      return new Response(JSON.stringify({ error: 'Consent required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Rate limit: 3 subscriptions per IP per hour
    const ipKey = `subscribe:${clientAddress}`;
    const kv = env.RATE_LIMIT_KV;
    const rateCheck = await checkRateLimit(ipKey, 3, 3600, kv);
    if (!rateCheck.allowed) {
      return new Response(JSON.stringify({ error: 'Too many requests. Please try again later.' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabase = getServiceClient(env);
    const anonIp = anonymizeIp(clientAddress || '');

    // Insert subscriber with full GDPR audit trail
    const { error } = await supabase.from('subscribers').upsert(
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

    if (error) {
      console.error('Subscribe error:', error);
      return new Response(JSON.stringify({ error: 'Subscription failed' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Log to audit table (immutable record)
    await supabase.from('audit_log').insert({
      action: 'subscribe_attempt',
      session_id: 'system',
      context: { source, ip_anon: anonIp },
      timestamp: new Date().toISOString(),
    }).select().single().then(() => {}, () => {});

    return new Response(JSON.stringify({ success: true, message: 'Confirmation email sent' }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': origin || ALLOWED_ORIGINS[0],
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Invalid request' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
