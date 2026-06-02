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

  const { company, email, volume, asset } = body;
  if (!company || !email || !volume || !asset) {
    return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400 });
  }

  const supabase = getC2CClient(env);
  const { error } = await supabase.from('business_leads').insert({
    company, email, volume, asset, status: 'new',
  });

  if (error) {
    return new Response(JSON.stringify({ error: 'Database error' }), { status: 500 });
  }

  return new Response(JSON.stringify({ success: true }), { status: 200 });
}