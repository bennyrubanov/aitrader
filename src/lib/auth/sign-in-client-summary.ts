import { UAParser } from 'ua-parser-js';

export type DeviceClassForSummary = 'mobile' | 'tablet' | 'desktop' | 'unknown';

export type SignInClientSummaryInput = {
  userAgent: string;
  secChUaPlatform: string;
  deviceClass: DeviceClassForSummary;
};

function deviceClassFallback(deviceClass: DeviceClassForSummary): string {
  switch (deviceClass) {
    case 'mobile':
      return 'A mobile device';
    case 'tablet':
      return 'A tablet';
    case 'desktop':
      return 'A desktop device';
    default:
      return 'This device';
  }
}

/**
 * Short English phrase for security notifications (browser + OS), never raw UA (R7).
 */
export function formatSignInClientSummary(input: SignInClientSummaryInput): string {
  const ua = input.userAgent.trim();
  const parser = new UAParser(ua);
  const r = parser.getResult();
  const browser = (r.browser?.name ?? '').trim();
  const os = (r.os?.name ?? '').trim();

  let out = '';
  if (browser && os) {
    out = `${browser} on ${os}`;
  } else if (browser) {
    out = browser;
  } else if (os) {
    out = os;
  }

  const plat = input.secChUaPlatform.trim().replace(/^["']|["']$/g, '');
  if (!out && plat) {
    out = plat.length > 120 ? plat.slice(0, 120) : plat;
  }

  out = out.trim();
  if (!out) {
    out = deviceClassFallback(input.deviceClass);
  }

  return out.length > 120 ? out.slice(0, 120) : out;
}
