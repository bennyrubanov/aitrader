import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient as createServerClient } from "@/utils/supabase/server";
import type { SubscriptionTier } from "@/lib/auth-state";

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

const resolveTierFromSubscription = async (
  stripe: Stripe,
  subscription: Stripe.Subscription
): Promise<SubscriptionTier> => {
  const metaTier = subscription.metadata?.tier as SubscriptionTier | undefined;
  if (metaTier === "supporter" || metaTier === "outperformer") {
    return metaTier;
  }

  try {
    const priceId = subscription.items.data[0]?.price?.id;
    if (!priceId) return "outperformer";

    const price = await stripe.prices.retrieve(priceId, { expand: ["product"] });
    const product = price.product as Stripe.Product | null;
    if (!product || "deleted" in product) return "outperformer";

    const productTier = product.metadata?.tier as SubscriptionTier | undefined;
    if (productTier === "supporter" || productTier === "outperformer") {
      return productTier;
    }
  } catch {
    // ignore
  }

  return "outperformer";
};

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
      .select("email, subscription_tier, stripe_subscription_status")
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

    let matchedTier: SubscriptionTier = "free";
    let matchedStatus: Stripe.Subscription.Status | null = null;

    for (const customer of customers.data) {
      const subscriptions = await stripe.subscriptions.list({
        customer: customer.id,
        status: "all",
        limit: 100,
      });

      const activeSub = subscriptions.data.find((sub) => isPremiumStatus(sub.status));
      if (activeSub) {
        matchedStatus = activeSub.status;
        matchedTier = await resolveTierFromSubscription(stripe, activeSub);
        break;
      }
    }

    const reconciledTier: SubscriptionTier =
      matchedStatus ? matchedTier : ((existingProfile?.subscription_tier as SubscriptionTier) ?? "free");
    const subscriptionStatus = matchedStatus ?? existingProfile?.stripe_subscription_status ?? null;

    const { error: upsertError } = await supabase.from("user_profiles").upsert(
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
