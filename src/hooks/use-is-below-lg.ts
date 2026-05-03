'use client';

import { useSyncExternalStore } from 'react';

/** Matches Tailwind `lg:` (min-width 1024px) — true when viewport is narrower. */
function subscribeIsBelowLg(onStoreChange: () => void) {
  if (typeof window === 'undefined') return () => {};
  const mq = window.matchMedia('(max-width: 1023px)');
  mq.addEventListener('change', onStoreChange);
  return () => mq.removeEventListener('change', onStoreChange);
}

function getIsBelowLgSnapshot(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches;
}

function getIsBelowLgServerSnapshot(): boolean {
  return false;
}

export function useIsBelowLg(): boolean {
  return useSyncExternalStore(subscribeIsBelowLg, getIsBelowLgSnapshot, getIsBelowLgServerSnapshot);
}
