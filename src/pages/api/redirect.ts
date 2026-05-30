import type { APIRoute } from 'astro';
import { getPublicClient } from '../../lib/supabase';

export const prerender = false;

export const GET: APIRoute = async ({ url, locals }) => {
  const env = (locals as any).runtime?.env || import.meta.env;
  const provider = url.searchParams.get('p');

  if (!provider || !/^[a-z0-9-]+$/.test(provider)) {
    return Astro.redirect ? Astro.redirect('/') : new Response(null, {
      status: 302,
      headers: { Location: 'https://sendcrypto.io/' },
    });
  }

  try {
    const supabase = getPublicClient(env);
    const { data } = await supabase
      .from('providers')
      .select('affiliate_url')
      .eq('slug', provider)
      .maybeSingle();

    if (data?.affiliate_url) {
      return new Response(null, {
        status: 302,
        headers: {
          Location: data.affiliate_url,
          'Referrer-Policy': 'no-referrer',
          'Cache-Control': 'no-store',
        },
      });
    }
  } catch {}

  return new Response(null, {
    status: 302,
    headers: { Location: 'https://sendcrypto.io/' },
  });
};
