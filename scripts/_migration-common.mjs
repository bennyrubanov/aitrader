import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

export const requiredEnv = (name, value) => {
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
};

export const normalizeEmail = (email) =>
  typeof email === "string" ? email.trim().toLowerCase() : null;

export const envFlag = (name, defaultValue = false) => {
  const fallback = defaultValue ? "true" : "false";
  return (process.env[name] ?? fallback).toLowerCase() === "true";
};

export const getStripeClients = () => {
  const sourceStripeKey = requiredEnv("SOURCE_STRIPE_SECRET_KEY", process.env.SOURCE_STRIPE_SECRET_KEY);
  const targetStripeKey = requiredEnv(
    "TARGET_STRIPE_SECRET_KEY or STRIPE_SECRET_KEY",
    process.env.TARGET_STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY
  );
  return {
    sourceStripe: new Stripe(sourceStripeKey),
    targetStripe: new Stripe(targetStripeKey),
  };
};

export const getSupabaseAdmin = () => {
  const supabaseUrl = requiredEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
  const supabaseSecret = requiredEnv("SUPABASE_SECRET_KEY", process.env.SUPABASE_SECRET_KEY);
  return createClient(supabaseUrl, supabaseSecret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
};

export const buildAuthEmailMap = async (supabase, emails) => {
  const wanted = new Set(emails.map(normalizeEmail).filter(Boolean));
  const emailToUserId = new Map();

  let page = 1;
  const perPage = 1000;
  while (emailToUserId.size < wanted.size) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw new Error(`Supabase auth listUsers failed: ${error.message}`);
    }

    const users = data?.users ?? [];
    for (const user of users) {
      const normalized = normalizeEmail(user.email);
      if (!normalized || !wanted.has(normalized)) continue;
      emailToUserId.set(normalized, user.id);
    }

    if (users.length < perPage) {
      break;
    }
    page += 1;
  }

  return emailToUserId;
};

export const findMigratedCustomers = async (targetStripe) => {
  const rows = [];
  for await (const customer of targetStripe.customers.list({ limit: 100 })) {
    const sourceSubscriptionId = customer.metadata?.migrated_from_source_subscription_id;
    if (!sourceSubscriptionId) continue;
    const email = normalizeEmail(customer.email);
    if (!email) continue;
    rows.push({
      email,
      targetCustomerId: customer.id,
      sourceSubscriptionId,
    });
  }
  return rows;
};

export const getCustomerDefaultPaymentMethodId = async (stripe, customerId) => {
  const customer = await stripe.customers.retrieve(customerId, {
    expand: ["invoice_settings.default_payment_method"],
  });
  if ("deleted" in customer && customer.deleted) {
    return null;
  }

  const value = customer.invoice_settings?.default_payment_method;
  if (typeof value === "string") {
    return value;
  }
  if (value && typeof value !== "string") {
    return value.id;
  }
  return null;
};
