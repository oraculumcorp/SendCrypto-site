import type { APIContext } from 'astro';
import { getC2CClient } from '../../lib/supabase';
import { isAllowedOrigin } from '../../lib/security';

export const prerender = false;

export async function POST({ request, locals }: APIContext) {
  const env = (locals as any).runtime?.env ?? {};
  const origin = request.headers.get('origin');
  const allowed = env.ALLOWED_ORIGINS?.split(',') ?? ['https://crypto2cash.io'];
  if (!isAllowedOrigin(origin, allowed)) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  const { email, company, use_case } = body;
  if (!email) {
    return new Response(JSON.stringify({ error: 'Email required' }), { status: 400 });
  }

  const supabase = getC2CClient(env);
  const { error } = await supabase.from('api_waitlist').insert({
    email,
    company: company ?? null,
    use_case: use_case ?? null,
  });

  if (error?.code === '23505') {
    return new Response(JSON.stringify({ success: true, duplicate: true }), { status: 200 });
  }

  if (error) {
    return new Response(JSON.stringify({ error: 'Database error' }), { status: 500 });
  }

  return new Response(JSON.stringify({ success: true }), { status: 200 });
}