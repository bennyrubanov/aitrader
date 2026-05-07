import { createHash } from 'node:crypto';

export type SignInFingerprintInput = {
  userAgent: string;
  secChUaMobile: string | null;
  secChUaPlatform: string;
};

/**
 * Stable per-client hash for sign-in dedupe / “new device” detection (not shown to users).
 */
export function computeSignInFingerprint(input: SignInFingerprintInput): string {
  const ua = input.userAgent.trim().slice(0, 512);
  const mob = (input.secChUaMobile ?? '').trim().slice(0, 32);
  const plat = input.secChUaPlatform.trim().slice(0, 128);
  const canonical = `${ua}\n${mob}\n${plat}`;
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}
