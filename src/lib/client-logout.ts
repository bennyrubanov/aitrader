"use client";

import { AUTH_SNAPSHOT_STORAGE_KEY } from "@/lib/auth-snapshot-storage-key";
import { navigateWithFallback } from "@/lib/client-navigation";
import { getSupabaseBrowserClient } from "@/utils/supabase/browser";

/** Minimal router surface for logout (avoids unstable `next/dist` types). */
export type LogoutRouter = {
  replace: (href: string) => void;
  refresh: () => void;
};

function clearAuthSnapshotFromStorage(): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.removeItem(AUTH_SNAPSHOT_STORAGE_KEY);
  } catch {
    // ignore private mode / quota
  }
}

function navigateHomeAndRefresh(router: LogoutRouter): void {
  navigateWithFallback((href) => router.replace(href), "/");
  queueMicrotask(() => {
    router.refresh();
  });
}

/**
 * Parallel sign-out + immediate navigation; navigation is not blocked on network latency.
 * Clears the auth snapshot before navigate so `/` does not hydrate Tier B from a stale session.
 */
export function logoutToHome(router: LogoutRouter): void {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    clearAuthSnapshotFromStorage();
    navigateHomeAndRefresh(router);
    return;
  }

  void supabase.auth.signOut().catch((err: unknown) => {
    console.error("[logout] signOut failed", err);
  });
  clearAuthSnapshotFromStorage();
  navigateHomeAndRefresh(router);
}
