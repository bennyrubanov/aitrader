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

const resolveCheckoutPriceId = async (stripe: Stripe) => {
  if (process.env.STRIPE_PRICE_ID) {
    return process.env.STRIPE_PRICE_ID;
  }

  const productId = process.env.STRIPE_PRODUCT_ID;
  if (!productId) {
    throw new Error("Missing STRIPE_PRICE_ID or STRIPE_PRODUCT_ID");
  }

  const prices = await stripe.prices.list({
    product: productId,
    active: true,
    limit: 10,
  });

  const monthlyRecurringPrice =
    prices.data.find((price) => price.type === "recurring" && price.recurring?.interval === "month") ??
    prices.data.find((price) => price.type === "recurring") ??
    prices.data[0];

  if (!monthlyRecurringPrice?.id) {
    throw new Error("No active Stripe price found for STRIPE_PRODUCT_ID");
  }

  return monthlyRecurringPrice.id;
};

const getSiteUrl = (request: Request) => {
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL;
  }

  const origin = request.headers.get("origin");
  if (origin) {
    return origin;
  }

  throw new Error("Missing NEXT_PUBLIC_SITE_URL");
};

export async function POST(req: Request) {
  try {
    // Get the current user from Supabase
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user profile to check email
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("email")
      .eq("id", user.id)
      .single();

    const userEmail = profile?.email || user.email;

    if (!userEmail) {
      return NextResponse.json(
        { error: "User email not found" },
        { status: 400 }
      );
    }

    const stripe = getStripeClient();
    const priceId = await resolveCheckoutPriceId(stripe);
    const siteUrl = getSiteUrl(req);

    const { error: profileUpsertError } = await supabase.from("user_profiles").upsert(
      {
        id: user.id,
        email: userEmail,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );

    if (profileUpsertError) {
      throw new Error(profileUpsertError.message);
    }

    // Create a Stripe Checkout session with user metadata
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${siteUrl}/platform?subscription=success`,
      cancel_url: `${siteUrl}/payment?subscription=cancelled`,
      customer_email: userEmail,
      client_reference_id: user.id,
      metadata: {
        user_id: user.id,
      },
      subscription_data: {
        metadata: {
          user_id: user.id,
        },
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Stripe checkout error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to create checkout",
      },
      { status: 500 }
    );
  }
}
