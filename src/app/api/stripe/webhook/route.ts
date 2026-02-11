import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createAdminClient } from "@/utils/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const getStripeClient = () => {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("Missing STRIPE_SECRET_KEY");
  }
  return new Stripe(secretKey);
};

const updatePremiumByUserId = async (userId: string, isPremium: boolean) => {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("user_profiles")
    .update({ is_premium: isPremium, updated_at: new Date().toISOString() })
    .eq("id", userId);
  if (error) {
    throw new Error(error.message);
  }
};

const updatePremiumByEmail = async (email: string, isPremium: boolean) => {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("user_profiles")
    .update({ is_premium: isPremium, updated_at: new Date().toISOString() })
    .eq("email", email);
  if (error) {
    throw new Error(error.message);
  }
};

const resolveCustomerEmail = async (
  stripe: Stripe,
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null
) => {
  if (!customer) {
    return null;
  }
  if (typeof customer !== "string") {
    return "email" in customer ? customer.email ?? null : null;
  }

  const response = await stripe.customers.retrieve(customer);
  if (response && "email" in response) {
    return response.email ?? null;
  }
  return null;
};

export async function POST(req: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: "Missing STRIPE_WEBHOOK_SECRET" }, { status: 500 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing Stripe signature" }, { status: 400 });
  }

  const stripe = getStripeClient();
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid signature" },
      { status: 400 }
    );
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.user_id || session.client_reference_id || null;
        if (userId) {
          await updatePremiumByUserId(userId, true);
          break;
        }
        const email = session.customer_details?.email || session.customer_email || null;
        if (email) {
          await updatePremiumByEmail(email, true);
        }
        break;
      }
      case "checkout.session.expired": {
        break;
      }
      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice & {
          subscription?: string | Stripe.Subscription | null;
        };
        const subscriptionId =
          typeof invoice.subscription === "string"
            ? invoice.subscription
            : invoice.subscription?.id ?? null;
        const subscription = subscriptionId
          ? await stripe.subscriptions.retrieve(subscriptionId)
          : null;
        const userId = subscription?.metadata?.user_id || null;
        if (userId) {
          await updatePremiumByUserId(userId, true);
          break;
        }
        const email = await resolveCustomerEmail(stripe, invoice.customer);
        if (email) {
          await updatePremiumByEmail(email, true);
        }
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice & {
          subscription?: string | Stripe.Subscription | null;
        };
        const subscriptionId =
          typeof invoice.subscription === "string"
            ? invoice.subscription
            : invoice.subscription?.id ?? null;
        const subscription = subscriptionId
          ? await stripe.subscriptions.retrieve(subscriptionId)
          : null;
        const userId = subscription?.metadata?.user_id || null;
        if (userId) {
          await updatePremiumByUserId(userId, false);
          break;
        }
        const email = await resolveCustomerEmail(stripe, invoice.customer);
        if (email) {
          await updatePremiumByEmail(email, false);
        }
        break;
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = subscription.metadata?.user_id || null;
        if (userId) {
          await updatePremiumByUserId(userId, false);
          break;
        }
        const email = await resolveCustomerEmail(stripe, subscription.customer);
        if (email) {
          await updatePremiumByEmail(email, false);
        }
        break;
      }
      default:
        break;
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Webhook failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({ received: true });
}
