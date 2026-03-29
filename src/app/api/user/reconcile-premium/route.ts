import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient as createServerClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import type { SubscriptionTier } from "@/lib/auth-state";
import {
  buildSubscriptionBillingExtras,
  resolveTierFromSubscription,
} from "@/lib/stripe-tier";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const getStripeClient = () => {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("Missing STRIPE_SECRET_KEY");
  }
  return new Stripe(secretKey);
};

const isPremiumStatus = (status: Stripe.Subscription.Status) =>
  status === "active" || status === "trialing" || status === "past_due";

export async function POST() {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: existingProfile } = await supabase
      .from("user_profiles")
      .select(
        "email, subscription_tier, stripe_subscription_status, stripe_current_period_end, stripe_cancel_at_period_end, stripe_pending_tier, stripe_recurring_interval, stripe_recurring_unit_amount, stripe_recurring_currency"
      )
      .eq("id", user.id)
      .maybeSingle();

    const userEmail = existingProfile?.email ?? user.email ?? null;
    if (!userEmail) {
      return NextResponse.json({ error: "User email missing" }, { status: 400 });
    }

    const stripe = getStripeClient();
    const customers = await stripe.customers.list({
      email: userEmail,
      limit: 10,
    });

    let matchedSub: Stripe.Subscription | null = null;

    outer: for (const customer of customers.data) {
      const subscriptions = await stripe.subscriptions.list({
        customer: customer.id,
        status: "all",
        limit: 100,
      });

      for (const sub of subscriptions.data) {
        if (isPremiumStatus(sub.status)) {
          matchedSub = sub;
          break outer;
        }
      }
    }

    const admin = createAdminClient();

    if (!matchedSub) {
      const reconciledTier: SubscriptionTier =
        (existingProfile?.subscription_tier as SubscriptionTier) ?? "free";
      const subscriptionStatus =
        (existingProfile?.stripe_subscription_status as Stripe.Subscription.Status | null) ?? null;

      const { error: upsertError } = await admin.from("user_profiles").upsert(
        {
          id: user.id,
          email: userEmail,
          subscription_tier: reconciledTier,
          stripe_subscription_status: subscriptionStatus,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      );

      if (upsertError) {
        return NextResponse.json({ error: upsertError.message }, { status: 500 });
      }

      return NextResponse.json({
        subscriptionTier: reconciledTier,
        isPremium: reconciledTier !== "free",
        stripeSubscriptionStatus: subscriptionStatus,
        stripeCurrentPeriodEnd: existingProfile?.stripe_current_period_end ?? null,
        stripeCancelAtPeriodEnd: Boolean(existingProfile?.stripe_cancel_at_period_end),
        stripePendingTier: (existingProfile?.stripe_pending_tier as SubscriptionTier | null) ?? null,
        stripeRecurringInterval:
          existingProfile?.stripe_recurring_interval === "month" ||
          existingProfile?.stripe_recurring_interval === "year"
            ? existingProfile.stripe_recurring_interval
            : null,
        stripeRecurringUnitAmount:
          typeof existingProfile?.stripe_recurring_unit_amount === "number"
            ? existingProfile.stripe_recurring_unit_amount
            : null,
        stripeRecurringCurrency:
          typeof existingProfile?.stripe_recurring_currency === "string"
            ? existingProfile.stripe_recurring_currency
            : null,
      });
    }

    const matchedTier = await resolveTierFromSubscription(stripe, matchedSub);
    const extras = await buildSubscriptionBillingExtras(stripe, matchedSub);

    const { error: upsertError } = await admin.from("user_profiles").upsert(
      {
        id: user.id,
        email: userEmail,
        subscription_tier: matchedTier,
        stripe_subscription_status: matchedSub.status,
        stripe_customer_id: extras.stripe_customer_id,
        stripe_subscription_id: extras.stripe_subscription_id,
        stripe_current_period_end: extras.stripe_current_period_end,
        stripe_cancel_at_period_end: extras.stripe_cancel_at_period_end,
        stripe_pending_tier: extras.stripe_pending_tier,
        stripe_recurring_interval: extras.stripe_recurring_interval,
        stripe_recurring_unit_amount: extras.stripe_recurring_unit_amount,
        stripe_recurring_currency: extras.stripe_recurring_currency,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );

    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 500 });
    }

    return NextResponse.json({
      subscriptionTier: matchedTier,
      isPremium: matchedTier !== "free",
      stripeSubscriptionStatus: matchedSub.status,
      stripeCurrentPeriodEnd: extras.stripe_current_period_end,
      stripeCancelAtPeriodEnd: extras.stripe_cancel_at_period_end,
      stripePendingTier: extras.stripe_pending_tier,
      stripeRecurringInterval: extras.stripe_recurring_interval,
      stripeRecurringUnitAmount: extras.stripe_recurring_unit_amount,
      stripeRecurringCurrency: extras.stripe_recurring_currency,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to reconcile premium subscription.",
      },
      { status: 500 }
    );
  }
}
