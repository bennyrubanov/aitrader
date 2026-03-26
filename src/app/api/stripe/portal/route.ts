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

type StripePortalFlow = "default" | "subscription_update";

export async function POST(req: Request) {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let flow: StripePortalFlow = "default";
    try {
      const body = (await req.json().catch(() => ({}))) as { flow?: string };
      if (body.flow === "subscription_update") {
        flow = body.flow;
      }
    } catch {
      // ignore invalid JSON
    }

    const { data: profile } = await supabase
      .from("user_profiles")
      .select("email, stripe_customer_id, stripe_subscription_id")
      .eq("id", user.id)
      .single();

    const userEmail = profile?.email ?? user.email;
    if (!userEmail) {
      return NextResponse.json({ error: "User email not found" }, { status: 400 });
    }

    const stripe = getStripeClient();
    let customerId = profile?.stripe_customer_id ?? null;

    if (!customerId) {
      const customers = await stripe.customers.list({
        email: userEmail,
        limit: 1,
      });
      customerId = customers.data[0]?.id ?? null;
    }

    if (!customerId) {
      return NextResponse.json(
        { error: "No Stripe customer found for this account" },
        { status: 404 }
      );
    }

    const siteUrl = getSiteUrl(req);
    const returnUrl = new URL("/platform/settings", siteUrl);
    returnUrl.searchParams.set("billing", "1");
    const returnUrlString = returnUrl.toString();

    let subscriptionId = profile?.stripe_subscription_id ?? null;
    if (flow === "subscription_update" && !subscriptionId) {
      const subs = await stripe.subscriptions.list({
        customer: customerId,
        status: "all",
        limit: 20,
      });
      const premium = subs.data.find(
        (s) => s.status === "active" || s.status === "trialing" || s.status === "past_due"
      );
      subscriptionId = premium?.id ?? subs.data[0]?.id ?? null;
    }

    if (flow === "subscription_update") {
      if (!subscriptionId) {
        return NextResponse.json(
          { error: "No subscription found to manage. Start checkout from Pricing if you are on the free plan." },
          { status: 400 }
        );
      }
    }

    const baseParams: Stripe.BillingPortal.SessionCreateParams = {
      customer: customerId,
      return_url: returnUrlString,
    };

    let session: Stripe.Response<Stripe.BillingPortal.Session>;

    if (flow === "subscription_update") {
      session = await stripe.billingPortal.sessions.create({
        ...baseParams,
        flow_data: {
          type: "subscription_update",
          subscription_update: {
            subscription: subscriptionId!,
          },
        },
      });
    } else {
      session = await stripe.billingPortal.sessions.create(baseParams);
    }

    return NextResponse.json({ url: session.url });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create portal session" },
      { status: 500 }
    );
  }
}
