import { createHmac, timingSafeEqual } from 'crypto';

/** `all` = master notification email off; `onboarding` = stop welcome series only. */
export type UnsubscribeScope = 'all' | 'onboarding';

export type UnsubscribePayload = { userId: string; scope: UnsubscribeScope };

function getSecret() {
  return process.env.NOTIFICATIONS_UNSUBSCRIBE_SECRET ?? '';
}

export function signUnsubscribePayload(payload: UnsubscribePayload): string {
  const secret = getSecret();
  if (!secret) return '';
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyUnsubscribePayload(token: string): UnsubscribePayload | null {
  const secret = getSecret();
  if (!secret || !token.includes('.')) return null;
  const lastDot = token.lastIndexOf('.');
  const body = token.slice(0, lastDot);
  const sig = token.slice(lastDot + 1);
  const expected = createHmac('sha256', secret).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as {
      userId?: string;
      scope?: string;
    };
    if (!parsed?.userId) return null;
    if (parsed.scope === 'onboarding') {
      return { userId: parsed.userId, scope: 'onboarding' };
    }
    if (parsed.scope === 'all' || parsed.scope == null) {
      return { userId: parsed.userId, scope: 'all' };
    }
  } catch {
    return null;
  }
  return null;
}
