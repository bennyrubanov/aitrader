import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient as createServerClient } from '@/utils/supabase/server';
import { resolveStripeCustomerForUser } from '@/lib/stripe-resolve-user-customer';
import {
  describePlanTransitionForAppliedInvoice,
  retrieveInvoiceForTransitionLabel,
  type PaidPlanCadence,
} from '@/lib/stripe-invoice-plan-transition-label';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const getStripe = () => {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('Missing STRIPE_SECRET_KEY');
  return new Stripe(key);
};

export async function GET() {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const stripe = getStripe();
    const { customerId } = await resolveStripeCustomerForUser(
      stripe,
      supabase,
      user.id,
      user.email ?? undefined
    );

    const transactions = await stripe.customers.listBalanceTransactions(customerId, {
      limit: 50,
    });

    const priceResolutionCache = new Map<string, Promise<PaidPlanCadence | null>>();

    const items = await Promise.all(
      transactions.data.map(async (t) => {
        let planTransitionLabel: string | null = null;
        if (t.type === 'applied_to_invoice' && t.invoice) {
          const inv = await retrieveInvoiceForTransitionLabel(stripe, t.invoice);
          if (inv) {
            planTransitionLabel = await describePlanTransitionForAppliedInvoice(
              stripe,
              inv,
              priceResolutionCache
            );
          }
        }

        return {
          id: t.id,
          amount: t.amount,
          currency: t.currency,
          description:
            t.description ?? (t.type === 'adjustment' ? 'Balance adjustment' : t.type),
          created: new Date(t.created * 1000).toISOString(),
          type: t.type,
          endingBalance: typeof t.ending_balance === 'number' ? t.ending_balance : null,
          planTransitionLabel,
        };
      })
    );

    return NextResponse.json({ transactions: items });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to fetch transactions',
      },
      { status: 400 }
    );
  }
}
