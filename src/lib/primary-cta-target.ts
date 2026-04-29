export type PrimaryCtaTarget = {
  href: string;
  label: string;
};

export function getPrimaryCtaTarget(auth: {
  isAuthenticated: boolean;
  hasPremiumAccess: boolean;
}): PrimaryCtaTarget {
  if (auth.hasPremiumAccess) {
    return { href: '/platform/overview', label: 'Open platform' };
  }
  if (auth.isAuthenticated) {
    return { href: '/pricing', label: 'See plans' };
  }
  return { href: '/sign-up', label: 'Start for free' };
}
