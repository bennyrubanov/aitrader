'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import {
  readCachedModelSubs,
  readCachedPortfolioProfiles,
  readCachedPrefs,
  setCachedModelSubs,
  setCachedPortfolioProfiles,
  setCachedPrefs,
  type ModelSub,
  type Prefs,
  type ProfileRow,
} from '@/lib/notifications/settings-prewarm';

function firstModel(
  m: ModelSub['strategy_models']
): { slug: string; name: string } | null {
  if (!m) return null;
  return Array.isArray(m) ? m[0] ?? null : m;
}

export function NotificationsSettingsSection() {
  const { toast } = useToast();
  const [prefs, setPrefs] = useState<Prefs | null>(() => readCachedPrefs());
  const [subs, setSubs] = useState<ModelSub[]>(() => readCachedModelSubs() ?? []);
  const [profiles, setProfiles] = useState<ProfileRow[]>(() => readCachedPortfolioProfiles() ?? []);
  const [loading, setLoading] = useState(() => readCachedPrefs() == null);
  const [savingPrefs, setSavingPrefs] = useState(false);

  const load = useCallback(async () => {
    try {
      const [pRes, sRes, profRes] = await Promise.all([
        fetch('/api/platform/notification-preferences'),
        fetch('/api/platform/model-subscriptions'),
        fetch('/api/platform/user-portfolio-profile'),
      ]);
      if (pRes.ok) {
        const j = (await pRes.json()) as { preferences: Prefs };
        setPrefs(j.preferences);
        setCachedPrefs(j.preferences);
      }
      if (sRes.ok) {
        const j = (await sRes.json()) as { subscriptions: ModelSub[] };
        const nextSubs = j.subscriptions ?? [];
        setSubs(nextSubs);
        setCachedModelSubs(nextSubs);
      }
      if (profRes.ok) {
        const j = (await profRes.json()) as { profiles: ProfileRow[] };
        const nextProfiles = j.profiles ?? [];
        setProfiles(nextProfiles);
        setCachedPortfolioProfiles(nextProfiles);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const savePrefs = async (next: Partial<Prefs>) => {
    if (!prefs) return;
    setSavingPrefs(true);
    try {
      const body = { ...prefs, ...next };
      const res = await fetch('/api/platform/notification-preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Save failed');
      const j = (await res.json()) as { preferences: Prefs };
      setPrefs(j.preferences);
      setCachedPrefs(j.preferences);
      toast({ title: 'Saved' });
    } catch {
      toast({ title: 'Could not save', variant: 'destructive' });
    } finally {
      setSavingPrefs(false);
    }
  };

  const patchProfile = async (profileId: string, patch: Record<string, boolean>) => {
    const res = await fetch('/api/platform/user-portfolio-profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId, ...patch }),
    });
    if (!res.ok) {
      toast({ title: 'Could not save portfolio alerts', variant: 'destructive' });
      return;
    }
    toast({ title: 'Saved' });
    void load();
  };

  const removeSub = async (strategyId: string) => {
    const res = await fetch(
      `/api/platform/model-subscriptions?strategyId=${encodeURIComponent(strategyId)}`,
      { method: 'DELETE' }
    );
    if (!res.ok) {
      toast({ title: 'Could not remove', variant: 'destructive' });
      return;
    }
    void load();
  };

  if (loading || !prefs) {
    return <p className="px-5 py-3 text-sm text-muted-foreground">Loading notification settings…</p>;
  }

  return (
    <div className="space-y-0 divide-y">
      <div className="px-5 py-4 space-y-4">
        <p className="text-sm font-medium">Global</p>
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <Label className="text-sm">Weekly digest</Label>
            <p className="text-xs text-muted-foreground mt-0.5">Master switch for the weekly summary.</p>
          </div>
          <Switch
            checked={prefs.weekly_digest_enabled}
            disabled={savingPrefs}
            onCheckedChange={(v) => void savePrefs({ weekly_digest_enabled: v })}
          />
        </div>
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <Label className="text-sm">Weekly digest (in-app)</Label>
            <p className="text-xs text-muted-foreground mt-0.5">Summary of your week in the inbox.</p>
          </div>
          <Switch
            checked={prefs.weekly_digest_inapp}
            disabled={savingPrefs}
            onCheckedChange={(v) => void savePrefs({ weekly_digest_inapp: v })}
          />
        </div>
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <Label className="text-sm">Weekly digest (email)</Label>
            <p className="text-xs text-muted-foreground mt-0.5">Works with newsletter preferences below.</p>
          </div>
          <Switch
            checked={prefs.weekly_digest_email}
            disabled={savingPrefs}
            onCheckedChange={(v) => void savePrefs({ weekly_digest_email: v })}
          />
        </div>
        <div className="flex items-center justify-between gap-4">
          <Label className="text-sm">All transactional emails</Label>
          <Switch
            checked={prefs.email_enabled}
            disabled={savingPrefs}
            onCheckedChange={(v) => void savePrefs({ email_enabled: v })}
          />
        </div>
        <div className="flex items-center justify-between gap-4">
          <Label className="text-sm">All in-app alerts</Label>
          <Switch
            checked={prefs.inapp_enabled}
            disabled={savingPrefs}
            onCheckedChange={(v) => void savePrefs({ inapp_enabled: v })}
          />
        </div>
      </div>

      <div className="px-5 py-4 space-y-3">
        <p className="text-sm font-medium">Model subscriptions</p>
        {subs.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            None yet. Subscribe from a{' '}
            <Link href="/strategy-models" className="underline underline-offset-2">
              strategy model
            </Link>{' '}
            page.
          </p>
        ) : (
          subs.map((s) => {
            const meta = firstModel(s.strategy_models);
            return (
              <div
                key={s.strategy_id}
                className="flex flex-col gap-2 rounded-lg border bg-muted/20 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="text-sm font-medium truncate">{meta?.name ?? 'Model'}</span>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">Email</span>
                    <Switch
                      checked={s.email_enabled}
                      onCheckedChange={(v) => {
                        void (async () => {
                          const res = await fetch('/api/platform/model-subscriptions', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              strategyId: s.strategy_id,
                              notifyRatingChanges: s.notify_rating_changes,
                              emailEnabled: v,
                              inappEnabled: s.inapp_enabled,
                            }),
                          });
                          if (res.ok) void load();
                        })();
                      }}
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">In-app</span>
                    <Switch
                      checked={s.inapp_enabled}
                      onCheckedChange={(v) => {
                        void (async () => {
                          const res = await fetch('/api/platform/model-subscriptions', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              strategyId: s.strategy_id,
                              notifyRatingChanges: s.notify_rating_changes,
                              emailEnabled: s.email_enabled,
                              inappEnabled: v,
                            }),
                          });
                          if (res.ok) void load();
                        })();
                      }}
                    />
                  </div>
                  <Button type="button" variant="ghost" size="sm" onClick={() => void removeSub(s.strategy_id)}>
                    Remove
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="px-5 py-4 space-y-3">
        <p className="text-sm font-medium">Portfolio alerts</p>
        {profiles.length === 0 ? (
          <p className="text-xs text-muted-foreground">No followed portfolios.</p>
        ) : (
          profiles.map((p) => (
            <div
              key={p.id}
              className="flex flex-col gap-2 rounded-lg border bg-muted/20 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
            >
              <span className="text-sm font-medium truncate">
                {p.strategy_models?.name ?? 'Portfolio'}{' '}
                {p.portfolio_config?.label ? (
                  <span className="text-muted-foreground font-normal">· {p.portfolio_config.label}</span>
                ) : null}
              </span>
              <div className="flex flex-wrap gap-3 text-xs">
                <label className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">Rebalance</span>
                  <Switch
                    checked={p.notify_rebalance}
                    onCheckedChange={(v) => void patchProfile(p.id, { notifyRebalance: v })}
                  />
                </label>
                <label className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">Holdings</span>
                  <Switch
                    checked={p.notify_holdings_change}
                    onCheckedChange={(v) => void patchProfile(p.id, { notifyHoldingsChange: v })}
                  />
                </label>
                <label className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">Email</span>
                  <Switch
                    checked={p.email_enabled}
                    onCheckedChange={(v) => void patchProfile(p.id, { emailEnabled: v })}
                  />
                </label>
                <label className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">In-app</span>
                  <Switch
                    checked={p.inapp_enabled}
                    onCheckedChange={(v) => void patchProfile(p.id, { inappEnabled: v })}
                  />
                </label>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
