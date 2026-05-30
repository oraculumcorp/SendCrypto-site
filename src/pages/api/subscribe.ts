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

  const runtime = (locals as any).runtime;
  const env = runtime?.env ?? {};
  console.log('ENV KEYS:', Object.keys(env));

  const supabaseUrl = env.PUBLIC_SUPABASE_URL || import.meta.env.PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const resendKey = env.RESEND_API_KEY;

  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: 'Server configuration error' }), {
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

    // Get or create subscriber with confirmation token
    const { data: existing } = await supabase
      .from('subscribers')
      .select('id, confirmation_token, double_opt_in_confirmed')
      .eq('email', email.toLowerCase().trim())
      .maybeSingle();

    const confirmToken = existing?.confirmation_token || crypto.randomUUID();

    const { error: dbError } = await supabase.from('subscribers').upsert(
      {
        email: email.toLowerCase().trim(),
        source: source || 'unknown',
        consent_copy,
        consent_timestamp,
        consent_ip: anonIp,
        double_opt_in_confirmed: existing?.double_opt_in_confirmed || false,
        confirmation_token: confirmToken,
        created_at: new Date().toISOString(),
      },
      { onConflict: 'email' }
    );

    if (dbError) {
      return new Response(JSON.stringify({ error: 'Database error', detail: dbError.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Send confirmation email via Resend
    if (resendKey) {
      const confirmUrl = `https://sendcrypto.io/api/confirm?token=${confirmToken}`;

      const resendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'The Rate Bible <contact@sendcrypto.io>',
          to: [email.toLowerCase().trim()],
          subject: 'Confirm your Rate Bible subscription',
          html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0A0812;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0A0812;padding:40px 20px">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#0E0C18;border:1px solid rgba(245,200,66,.2);border-radius:16px;overflow:hidden;max-width:560px;width:100%">
        <tr><td style="padding:0;height:3px;background:linear-gradient(90deg,#F5C842,#7C5CFC)"></td></tr>
        <tr><td style="padding:40px 40px 0">
          <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#F5C842;letter-spacing:2px;text-transform:uppercase">SendCrypto.io</p>
          <h1 style="margin:0 0 16px;font-size:28px;font-weight:800;color:#F8F5FF;line-height:1.2">One click to confirm.</h1>
          <p style="margin:0 0 32px;font-size:15px;color:rgba(248,245,255,.6);line-height:1.7">You signed up for <strong style="color:#F8F5FF">The Crypto Remittance Rate Bible</strong> — weekly intel on the best crypto-to-fiat rates across 10+ corridors. Free. Always.</p>
          <p style="margin:0 0 24px;font-size:15px;color:rgba(248,245,255,.6);line-height:1.7">Click below to confirm your subscription and get your first edition.</p>
        </td></tr>
        <tr><td style="padding:0 40px 40px">
          <a href="${confirmUrl}" style="display:inline-block;background:linear-gradient(135deg,#F5C842,#FFB347);color:#0A0812;font-size:15px;font-weight:700;padding:16px 32px;border-radius:8px;text-decoration:none;margin-bottom:32px">Confirm My Subscription &rarr;</a>
          <hr style="border:none;border-top:1px solid rgba(255,255,255,.08);margin:0 0 24px">
          <p style="margin:0 0 8px;font-size:12px;color:rgba(248,245,255,.3);line-height:1.6">If you didn't sign up for this, ignore this email. No action needed.</p>
          <p style="margin:0;font-size:12px;color:rgba(248,245,255,.3);line-height:1.6">Or copy this link: ${confirmUrl}</p>
        </td></tr>
        <tr><td style="padding:20px 40px;background:rgba(0,0,0,.2);border-top:1px solid rgba(255,255,255,.06)">
          <p style="margin:0;font-size:11px;color:rgba(248,245,255,.25);line-height:1.6">SendCrypto.io &middot; Comparison platform &middot; Not a licensed money transmitter &middot; <a href="https://sendcrypto.io/privacy/" style="color:rgba(245,200,66,.5)">Privacy Policy</a> &middot; <a href="https://sendcrypto.io/terms/" style="color:rgba(245,200,66,.5)">Terms</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
        }),
      });
      
      const resendText = await resendRes.text();
      console.log('Resend response:', resendRes.status, resendText);
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