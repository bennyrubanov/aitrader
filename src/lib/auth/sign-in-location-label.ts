const MAX_LEN = 80;

/**
 * Coarse location from Vercel request headers only (R7: no IP in payload).
 * Returns null when headers absent (e.g. local dev).
 */
export function buildSignInLocationLabel(request: Request): string | null {
  const headers = request.headers;
  const city = headers.get('x-vercel-ip-city')?.trim() ?? '';
  const region = headers.get('x-vercel-ip-country-region')?.trim() ?? '';
  const country = headers.get('x-vercel-ip-country')?.trim() ?? '';

  const parts: string[] = [];
  if (city) parts.push(city);
  if (region && region.toLowerCase() !== city.toLowerCase()) {
    parts.push(region);
  }
  if (country) {
    const c = country.toUpperCase();
    if (!parts.some((p) => p.toUpperCase() === c)) {
      parts.push(country);
    }
  }

  if (parts.length === 0) return null;

  const label = parts.join(', ').trim();
  if (!label) return null;
  return label.length > MAX_LEN ? label.slice(0, MAX_LEN) : label;
}
