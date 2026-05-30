import DOMPurify from 'isomorphic-dompurify';

// Sanitize any HTML content before rendering — prevents XSS
export function sanitizeHtml(dirty: string): string {
  if (!dirty) return '';
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'table', 'thead', 'tbody', 'tr', 'th', 'td'],
    ALLOWED_ATTR: ['href', 'title', 'target', 'rel'],
    ALLOW_DATA_ATTR: false,
  });
}

// Strict email validation — RFC 5322 simplified
export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  if (email.length > 254) return false;
  const regex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return regex.test(email.trim().toLowerCase());
}

// Anonymize IP to /24 subnet for GDPR-compliant logging
export function anonymizeIp(ip: string): string {
  if (!ip) return 'unknown';
  // IPv4
  if (ip.includes('.')) {
    const parts = ip.split('.');
    if (parts.length === 4) return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
  }
  // IPv6 — keep first 4 segments only
  if (ip.includes(':')) {
    const parts = ip.split(':');
    return parts.slice(0, 4).join(':') + '::0';
  }
  return 'unknown';
}

// HMAC signing for server-to-server requests
export async function signRequest(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function verifySignature(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  const expected = await signRequest(payload, secret);
  // Constant-time comparison to prevent timing attacks
  if (expected.length !== signature.length) return false;
  let result = 0;
  for (let i = 0; i < expected.length; i++) {
    result |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return result === 0;
}

// CORS handling with origin allowlist
export function corsHeaders(origin: string | null, allowedOrigins: string[]): Headers {
  const headers = new Headers();
  if (origin && allowedOrigins.includes(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Credentials', 'true');
  }
  headers.set('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, X-Signature, X-Partner-Key');
  headers.set('Access-Control-Max-Age', '86400');
  return headers;
}

// Rate limiting using Cloudflare KV (or in-memory for dev)
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
  kv?: KVNamespace
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  if (!kv) {
    // No KV bound — allow but log warning
    return { allowed: true, remaining: limit, resetAt: Date.now() + windowSeconds * 1000 };
  }

  const now = Date.now();
  const resetAt = now + windowSeconds * 1000;
  const stored = await kv.get(key, { type: 'json' }) as { count: number; resetAt: number } | null;

  if (!stored || stored.resetAt < now) {
    await kv.put(key, JSON.stringify({ count: 1, resetAt }), { expirationTtl: windowSeconds });
    return { allowed: true, remaining: limit - 1, resetAt };
  }

  if (stored.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: stored.resetAt };
  }

  await kv.put(
    key,
    JSON.stringify({ count: stored.count + 1, resetAt: stored.resetAt }),
    { expirationTtl: Math.ceil((stored.resetAt - now) / 1000) }
  );

  return { allowed: true, remaining: limit - stored.count - 1, resetAt: stored.resetAt };
}

// Generate cryptographically secure session ID
export function generateSessionId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// Validate origin against allowlist
export function isAllowedOrigin(origin: string | null, allowed: string[]): boolean {
  if (!origin) return false;
  return allowed.includes(origin);
}

// Honeypot field check — bot detection
export function checkHoneypot(formData: FormData): boolean {
  const honeypot = formData.get('website') || formData.get('url_check');
  return !honeypot; // empty = human, filled = bot
}

// KVNamespace type for Cloudflare
declare global {
  interface KVNamespace {
    get(key: string, options?: { type: 'json' | 'text' }): Promise<any>;
    put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
    delete(key: string): Promise<void>;
  }
}
