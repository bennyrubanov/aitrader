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

export async function POST(req: Request) {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("user_profiles")
      .select("email")
      .eq("id", user.id)
      .single();

    const userEmail = profile?.email ?? user.email;
    if (!userEmail) {
      return NextResponse.json({ error: "User email not found" }, { status: 400 });
    }

    const stripe = getStripeClient();
    const customers = await stripe.customers.list({
      email: userEmail,
      limit: 1,
    });

    const customer = customers.data[0];
    if (!customer?.id) {
      return NextResponse.json(
        { error: "No Stripe customer found for this account" },
        { status: 404 }
      );
    }

    const siteUrl = getSiteUrl(req);
    const session = await stripe.billingPortal.sessions.create({
      customer: customer.id,
      return_url: `${siteUrl}/platform/settings`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create portal session" },
      { status: 500 }
    );
  }
}
