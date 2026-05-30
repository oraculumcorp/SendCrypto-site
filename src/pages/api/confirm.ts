import type { APIRoute } from 'astro';
import { getServiceClient } from '../../lib/supabase';

export const prerender = false;

export const GET: APIRoute = async ({ url, locals }) => {
  const env = (locals as any).runtime?.env ?? {};
  const token = url.searchParams.get('token');

  if (!token) {
    return new Response(null, {
      status: 302,
      headers: { Location: '/?confirmed=invalid' },
    });
  }

  try {
    const supabase = getServiceClient(env);

    const { data, error } = await supabase
      .from('subscribers')
      .update({
        double_opt_in_confirmed: true,
        confirmed_at: new Date().toISOString(),
      })
      .eq('confirmation_token', token)
      .eq('double_opt_in_confirmed', false)
      .select('email')
      .maybeSingle();

    if (error || !data) {
      return new Response(null, {
        status: 302,
        headers: { Location: '/?confirmed=invalid' },
      });
    }

    return new Response(null, {
      status: 302,
      headers: { Location: '/?confirmed=true' },
    });
  } catch {
    return new Response(null, {
      status: 302,
      headers: { Location: '/?confirmed=error' },
    });
  }
};