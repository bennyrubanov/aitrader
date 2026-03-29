import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient as createServerClient } from '@/utils/supabase/server';
import { resolveStripeCustomerForUser } from '@/lib/stripe-resolve-user-customer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const getStripe = () => {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('Missing STRIPE_SECRET_KEY');
  return new Stripe(key);
};

/** Positive `amount` on a customer balance transaction = credit added to the customer (balance more negative). */
async function customerHasEverReceivedCreditIncrease(
  stripe: Stripe,
  customerId: string
): Promise<boolean> {
  let startingAfter: string | undefined;
  for (let page = 0; page < 8; page++) {
    const txs = await stripe.customers.listBalanceTransactions(customerId, {
      limit: 100,
      starting_after: startingAfter,
    });
    if (txs.data.some((t) => t.amount > 0)) {
      return true;
    }
    if (!txs.has_more || txs.data.length === 0) {
      break;
    }
    startingAfter = txs.data[txs.data.length - 1]!.id;
  }
  return false;
}

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

    const customer = await stripe.customers.retrieve(customerId);
    if ('deleted' in customer && customer.deleted) {
      return NextResponse.json({
        balance: 0,
        currency: 'usd',
        creditCents: 0,
        hasEverHadCustomerCredit: false,
        showAccountCreditRow: false,
      });
    }

    const stripeCustomer = customer as Stripe.Customer;
    const balance = stripeCustomer.balance ?? 0;
    const currency = stripeCustomer.currency ?? 'usd';
    const creditCents = balance < 0 ? Math.abs(balance) : 0;
    const hasEverHadCustomerCredit =
      balance < 0 || (await customerHasEverReceivedCreditIncrease(stripe, customerId));
    const showAccountCreditRow = hasEverHadCustomerCredit;

    return NextResponse.json({
      balance,
      currency,
      creditCents,
      hasEverHadCustomerCredit,
      showAccountCreditRow,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to fetch balance',
      },
      { status: 400 }
    );
  }
}
