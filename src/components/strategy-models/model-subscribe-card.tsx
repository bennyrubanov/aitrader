'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useAuthState } from '@/components/auth/auth-state-context';
import { useToast } from '@/hooks/use-toast';

type Props = {
  strategyId: string;
  strategyName: string;
};

export function ModelSubscribeCard({ strategyId, strategyName }: Props) {
  const { isAuthenticated, isLoaded } = useAuthState();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [inappEnabled, setInappEnabled] = useState(true);

  const load = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    try {
      const res = await fetch('/api/platform/model-subscriptions');
      if (!res.ok) return;
      const j = (await res.json()) as {
        subscriptions: Array<{
          strategy_id: string;
          email_enabled?: boolean;
          inapp_enabled?: boolean;
          notify_rating_changes?: boolean;
        }>;
      };
      const row = (j.subscriptions ?? []).find((s) => s.strategy_id === strategyId);
      setSubscribed(Boolean(row));
      if (row) {
        setEmailEnabled(row.email_enabled !== false);
        setInappEnabled(row.inapp_enabled !== false);
      }
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, strategyId]);

  useEffect(() => {
    if (!isLoaded || !isAuthenticated) return;
    void load();
  }, [isLoaded, isAuthenticated, load]);

  const persist = async (next: {
    subscribed: boolean;
    email: boolean;
    inapp: boolean;
  }) => {
    setSaving(true);
    try {
      if (!next.subscribed) {
        const res = await fetch(
          `/api/platform/model-subscriptions?strategyId=${encodeURIComponent(strategyId)}`,
          { method: 'DELETE' }
        );
        if (!res.ok) throw new Error('Could not update subscription');
        setSubscribed(false);
        toast({ title: 'Unsubscribed', description: `Alerts off for ${strategyName}.` });
        return;
      }
      const res = await fetch('/api/platform/model-subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategyId,
          notifyRatingChanges: true,
          emailEnabled: next.email,
          inappEnabled: next.inapp,
        }),
      });
      if (!res.ok) throw new Error('Could not save');
      setSubscribed(true);
      toast({ title: 'Saved', description: `Alerts for ${strategyName} updated.` });
    } catch (e) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : 'Try again.',
        variant: 'destructive',
      });
      void load();
    } finally {
      setSaving(false);
    }
  };

  if (!isLoaded || !isAuthenticated) return null;
  if (loading) {
    return (
      <Card className="border-dashed">
        <CardHeader className="py-3">
          <CardTitle className="text-sm">Alerts</CardTitle>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-sm">Model alerts</CardTitle>
        <CardDescription className="text-xs">
          Get notified when weekly AI ratings move a stock between buy, hold, and sell for this model.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 pb-4">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="model-sub-main" className="text-sm">
            Subscribe
          </Label>
          <Switch
            id="model-sub-main"
            checked={subscribed}
            disabled={saving}
            onCheckedChange={(on) => {
              setSubscribed(on);
              void persist({ subscribed: on, email: emailEnabled, inapp: inappEnabled });
            }}
          />
        </div>
        {subscribed ? (
          <>
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="model-sub-email" className="text-xs text-muted-foreground">
                Email
              </Label>
              <Switch
                id="model-sub-email"
                checked={emailEnabled}
                disabled={saving}
                onCheckedChange={(on) => {
                  setEmailEnabled(on);
                  void persist({ subscribed: true, email: on, inapp: inappEnabled });
                }}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="model-sub-inapp" className="text-xs text-muted-foreground">
                In-app
              </Label>
              <Switch
                id="model-sub-inapp"
                checked={inappEnabled}
                disabled={saving}
                onCheckedChange={(on) => {
                  setInappEnabled(on);
                  void persist({ subscribed: true, email: emailEnabled, inapp: on });
                }}
              />
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
