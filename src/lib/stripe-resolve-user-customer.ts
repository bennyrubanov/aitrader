import 'server-only';

import Stripe from 'stripe';
import { createClient as createServerClient } from '@/utils/supabase/server';

export async function resolveStripeCustomerForUser(
  stripe: Stripe,
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  userId: string,
  userEmail: string | undefined
): Promise<{ customerId: string; subscriptionId: string | null }> {
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('email, stripe_customer_id, stripe_subscription_id')
    .eq('id', userId)
    .maybeSingle();

  const email = profile?.email ?? userEmail ?? null;
  let customerId = profile?.stripe_customer_id ?? null;

  if (!customerId && email) {
    const customers = await stripe.customers.list({ email, limit: 1 });
    customerId = customers.data[0]?.id ?? null;
  }

  if (!customerId) {
    throw new Error('No Stripe customer found for this account.');
  }

  return {
    customerId,
    subscriptionId: profile?.stripe_subscription_id ?? null,
  };
}
