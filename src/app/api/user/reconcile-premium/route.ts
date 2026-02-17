import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient as createServerClient } from "@/utils/supabase/server";

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
  status === "active" || status === "trialing";

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
      .select("email, is_premium, stripe_subscription_status")
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

    let matchedStatus: Stripe.Subscription.Status | null = null;

    for (const customer of customers.data) {
      const subscriptions = await stripe.subscriptions.list({
        customer: customer.id,
        status: "all",
        limit: 100,
      });

      const premiumSub = subscriptions.data.find((sub) => isPremiumStatus(sub.status));
      if (premiumSub) {
        matchedStatus = premiumSub.status;
        break;
      }
    }

    const reconciledPremium = matchedStatus ? true : Boolean(existingProfile?.is_premium);
    const subscriptionStatus = matchedStatus ?? existingProfile?.stripe_subscription_status ?? null;

    const { error: upsertError } = await supabase.from("user_profiles").upsert(
      {
        id: user.id,
        email: userEmail,
        is_premium: reconciledPremium,
        stripe_subscription_status: subscriptionStatus,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );

    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 500 });
    }

    return NextResponse.json({
      isPremium: reconciledPremium,
      stripeSubscriptionStatus: subscriptionStatus,
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
