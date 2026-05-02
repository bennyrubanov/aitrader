'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

/** Session-only last viewed profile on `/platform/your-portfolios` (per tab). */
export const YOUR_PORTFOLIOS_LAST_PROFILE_SESSION_KEY = 'aitrader:your_portfolios_last_profile_v1';

export const YOUR_PORTFOLIOS_LAST_PROFILE_SESSION_EVENT = 'aitrader:your-portfolios-last-profile-session';

export function readYourPortfoliosLastProfileId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(YOUR_PORTFOLIOS_LAST_PROFILE_SESSION_KEY);
    if (raw == null) return null;
    const t = raw.trim();
    return t.length > 0 ? t : null;
  } catch {
    return null;
  }
}

export function writeYourPortfoliosLastProfileId(profileId: string): void {
  if (typeof window === 'undefined') return;
  try {
    const id = profileId.trim();
    if (!id) return;
    sessionStorage.setItem(YOUR_PORTFOLIOS_LAST_PROFILE_SESSION_KEY, id);
    window.dispatchEvent(new Event(YOUR_PORTFOLIOS_LAST_PROFILE_SESSION_EVENT));
  } catch {
    /* quota / private mode */
  }
}

export function yourPortfoliosHrefWithSessionRecall(): string {
  const id = readYourPortfoliosLastProfileId();
  if (!id) return '/platform/your-portfolios';
  return `/platform/your-portfolios?profile=${encodeURIComponent(id)}`;
}

/** Keeps sidebar / overview links aligned with session recall after the URL is updated on the your-portfolios screen. */
export function useYourPortfoliosNavHref(): string {
  const pathname = usePathname();
  const [href, setHref] = useState('/platform/your-portfolios');

  useEffect(() => {
    const sync = () => {
      setHref(yourPortfoliosHrefWithSessionRecall());
    };
    sync();
    window.addEventListener(YOUR_PORTFOLIOS_LAST_PROFILE_SESSION_EVENT, sync);
    return () => {
      window.removeEventListener(YOUR_PORTFOLIOS_LAST_PROFILE_SESSION_EVENT, sync);
    };
  }, [pathname]);

  return href;
}
