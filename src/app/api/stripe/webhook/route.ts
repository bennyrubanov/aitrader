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

type EntitlementContext = {
  eventId: string;
  eventCreatedIso: string;
  subscriptionStatus: Stripe.Subscription.Status | null;
};

const isPremiumSubscriptionStatus = (status: Stripe.Subscription.Status) => {
  // Strict entitlement: only active/trialing users are premium.
  return status === "active" || status === "trialing";
};

const isStaleEvent = (incomingEventCreatedIso: string, previousEventCreatedIso: string | null) => {
  if (!previousEventCreatedIso) {
    return false;
  }

  const incomingTs = Date.parse(incomingEventCreatedIso);
  const previousTs = Date.parse(previousEventCreatedIso);
  if (Number.isNaN(incomingTs) || Number.isNaN(previousTs)) {
    return false;
  }

  return incomingTs < previousTs;
};

const applyPremiumByUserId = async (
  userId: string,
  email: string | null,
  isPremium: boolean,
  context: EntitlementContext
) => {
  const supabase = createAdminClient();
  const { data: existing, error: existingError } = await supabase
    .from("user_profiles")
    .select("stripe_last_event_created")
    .eq("id", userId)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }

  if (isStaleEvent(context.eventCreatedIso, existing?.stripe_last_event_created ?? null)) {
    return;
  }

  const { error: upsertError } = await supabase.from("user_profiles").upsert(
    {
      id: userId,
      ...(email ? { email } : {}),
      is_premium: isPremium,
      stripe_last_event_id: context.eventId,
      stripe_last_event_created: context.eventCreatedIso,
      stripe_subscription_status: context.subscriptionStatus,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );

  if (upsertError) {
    throw new Error(upsertError.message);
  }
};

const resolveAuthUserIdByEmail = async (email: string) => {
  const normalizedEmail = email.trim().toLowerCase();
  const perPage = 1000;
  let page = 1;

  while (true) {
    const { data, error } = await createAdminClient().auth.admin.listUsers({ page, perPage });
    if (error) {
      throw new Error(error.message);
    }

    const users = data?.users ?? [];
    const match = users.find((user) => user.email?.trim().toLowerCase() === normalizedEmail);
    if (match) {
      return match.id;
    }

    if (users.length < perPage) {
      break;
    }
    page += 1;
  }

  return null;
};

const updatePremiumByEmail = async (email: string, isPremium: boolean, context: EntitlementContext) => {
  const supabase = createAdminClient();
  const normalizedEmail = email.trim().toLowerCase();
  const { data, error } = await supabase
    .from("user_profiles")
    .select("id")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (data?.id) {
    await applyPremiumByUserId(data.id, normalizedEmail, isPremium, context);
    return;
  }

  const userId = await resolveAuthUserIdByEmail(normalizedEmail);
  if (userId) {
    await applyPremiumByUserId(userId, normalizedEmail, isPremium, context);
    return;
  }

  console.warn("Stripe webhook: could not map email to auth user", {
    email: normalizedEmail,
    isPremium,
    eventId: context.eventId,
  });
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

const getCustomerIdFromUnknown = (
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null | undefined
) => {
  if (!customer) {
    return null;
  }
  if (typeof customer === "string") {
    return customer;
  }
  if ("deleted" in customer && customer.deleted) {
    return null;
  }
  return customer.id;
};

const maybeSwitchMigratedSubsToAutoCharge = async (
  stripe: Stripe,
  customerId: string | null
) => {
  if (!customerId) {
    return;
  }

  const customer = await stripe.customers.retrieve(customerId, {
    expand: ["invoice_settings.default_payment_method"],
  });

  if ("deleted" in customer && customer.deleted) {
    return;
  }

  const stripeCustomer = customer as Stripe.Customer;
  const hasDefaultPaymentMethod = Boolean(stripeCustomer.invoice_settings?.default_payment_method);
  if (!hasDefaultPaymentMethod) {
    return;
  }

  const subs = await stripe.subscriptions.list({
    customer: customerId,
    status: "active",
    limit: 100,
  });

  for (const sub of subs.data) {
    const isMigrated = Boolean(sub.metadata?.migrated_from_source_subscription_id);
    const needsSwitch = sub.collection_method !== "charge_automatically";
    if (!isMigrated || !needsSwitch) {
      continue;
    }

    await stripe.subscriptions.update(sub.id, {
      collection_method: "charge_automatically",
      payment_settings: { save_default_payment_method: "on_subscription" },
    });
  }
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
    const eventCreatedIso = new Date(event.created * 1000).toISOString();

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.user_id || session.client_reference_id || null;
        const context: EntitlementContext = {
          eventId: event.id,
          eventCreatedIso,
          subscriptionStatus: "active",
        };
        if (userId) {
          await applyPremiumByUserId(userId, null, true, context);
          break;
        }
        const email = session.customer_details?.email || session.customer_email || null;
        if (email) {
          await updatePremiumByEmail(email, true, context);
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
        const context: EntitlementContext = {
          eventId: event.id,
          eventCreatedIso,
          subscriptionStatus: subscription?.status ?? "active",
        };
        const userId = subscription?.metadata?.user_id || null;
        if (userId) {
          await applyPremiumByUserId(userId, null, true, context);
          break;
        }
        const email = await resolveCustomerEmail(stripe, invoice.customer);
        if (email) {
          await updatePremiumByEmail(email, true, context);
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
        const context: EntitlementContext = {
          eventId: event.id,
          eventCreatedIso,
          subscriptionStatus: subscription?.status ?? "past_due",
        };
        const userId = subscription?.metadata?.user_id || null;
        if (userId) {
          await applyPremiumByUserId(userId, null, false, context);
          break;
        }
        const email = await resolveCustomerEmail(stripe, invoice.customer);
        if (email) {
          await updatePremiumByEmail(email, false, context);
        }
        break;
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const context: EntitlementContext = {
          eventId: event.id,
          eventCreatedIso,
          subscriptionStatus: subscription.status,
        };
        const userId = subscription.metadata?.user_id || null;
        if (userId) {
          await applyPremiumByUserId(userId, null, false, context);
          break;
        }
        const email = await resolveCustomerEmail(stripe, subscription.customer);
        if (email) {
          await updatePremiumByEmail(email, false, context);
        }
        break;
      }
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const isPremium = isPremiumSubscriptionStatus(subscription.status);
        const context: EntitlementContext = {
          eventId: event.id,
          eventCreatedIso,
          subscriptionStatus: subscription.status,
        };
        const userId = subscription.metadata?.user_id || null;
        if (userId) {
          await applyPremiumByUserId(userId, null, isPremium, context);
          break;
        }
        const email = await resolveCustomerEmail(stripe, subscription.customer);
        if (email) {
          await updatePremiumByEmail(email, isPremium, context);
        }
        break;
      }
      case "payment_method.attached": {
        const paymentMethod = event.data.object as Stripe.PaymentMethod;
        const customerId = getCustomerIdFromUnknown(paymentMethod.customer);
        await maybeSwitchMigratedSubsToAutoCharge(stripe, customerId);
        break;
      }
      case "customer.updated": {
        const customer = event.data.object as Stripe.Customer;
        const customerId = getCustomerIdFromUnknown(customer);
        await maybeSwitchMigratedSubsToAutoCharge(stripe, customerId);
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
