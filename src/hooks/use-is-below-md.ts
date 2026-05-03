'use client';

import { useSyncExternalStore } from 'react';

/** Matches Tailwind `md:` (min-width 768px) — true when viewport is narrower. */
function subscribeIsBelowMd(onStoreChange: () => void) {
  if (typeof window === 'undefined') return () => {};
  const mq = window.matchMedia('(max-width: 767px)');
  mq.addEventListener('change', onStoreChange);
  return () => mq.removeEventListener('change', onStoreChange);
}

function getIsBelowMdSnapshot(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;
}

function getIsBelowMdServerSnapshot(): boolean {
  return false;
}

export function useIsBelowMd(): boolean {
  return useSyncExternalStore(subscribeIsBelowMd, getIsBelowMdSnapshot, getIsBelowMdServerSnapshot);
}
