// Used in Feb 2026 to migrate users from old stripe account (bennyrubanov) to new stripe account (aitrader)

import {
  buildAuthEmailMap,
  envFlag,
  getStripeClients,
  getSupabaseAdmin,
  normalizeEmail,
} from "./_migration-common.mjs";

const dryRun = envFlag("MIGRATION_DRY_RUN", true);
const limit = Number.parseInt(process.env.MIGRATION_LIMIT ?? "0", 10);

const { sourceStripe, targetStripe } = getStripeClients();
const supabase = getSupabaseAdmin();

const premiumStatuses = new Set(["active", "trialing"]);

const listPremiumSourceSubscriptions = async () => {
  const rows = [];
  for (const status of premiumStatuses) {
    const iter = sourceStripe.subscriptions.list({
      status,
      limit: 100,
      expand: ["data.customer"],
    });
    // eslint-disable-next-line no-restricted-syntax
    for await (const sub of iter) {
      const customer =
        typeof sub.customer === "string" || !sub.customer || sub.customer.deleted
          ? null
          : sub.customer;
      const email = normalizeEmail(customer?.email);
      if (!email) continue;

      rows.push({
        email,
        name: customer?.name ?? null,
        sourceCustomerId: customer?.id ?? null,
        sourceSubscriptionId: sub.id,
        subscriptionStatus: sub.status,
        currentPeriodEnd: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
      });

      if (limit > 0 && rows.length >= limit) {
        return rows;
      }
    }
  }
  return rows;
};

const ensureTargetCustomer = async (row) => {
  const existing = await targetStripe.customers.list({ email: row.email, limit: 1 });
  const first = existing.data[0];
  if (first) {
    return { id: first.id, created: false };
  }

  const created = await targetStripe.customers.create({
    email: row.email,
    name: row.name ?? undefined,
    metadata: {
      migrated_from_source_customer_id: row.sourceCustomerId ?? "",
      migrated_from_source_subscription_id: row.sourceSubscriptionId,
    },
  });
  return { id: created.id, created: true };
};

const upsertPremiumProfile = async (userId, email) => {
  const { error } = await supabase.from("user_profiles").upsert(
    {
      id: userId,
      email,
      is_premium: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );
  if (error) {
    throw new Error(`Supabase upsert failed for ${email}: ${error.message}`);
  }
};

const main = async () => {
  const sourceAccount = await sourceStripe.accounts.retrieve();
  const targetAccount = await targetStripe.accounts.retrieve();

  console.log("Source Stripe account:", sourceAccount.id, sourceAccount.business_profile?.name ?? "(no name)");
  console.log("Target Stripe account:", targetAccount.id, targetAccount.business_profile?.name ?? "(no name)");
  console.log("Dry run:", dryRun ? "true" : "false");

  const rows = await listPremiumSourceSubscriptions();
  const deduped = new Map();
  for (const row of rows) {
    if (!deduped.has(row.email)) {
      deduped.set(row.email, row);
    }
  }
  const users = Array.from(deduped.values());
  console.log(`Premium users found in source account: ${users.length}`);
  const authEmailMap = await buildAuthEmailMap(supabase, users.map((u) => u.email));

  const summary = {
    totalPremiumUsers: users.length,
    targetCustomersCreated: 0,
    targetCustomersReused: 0,
    supabasePremiumGranted: 0,
    supabaseAuthUserMissing: 0,
    missingAuthEmails: [],
  };

  for (const user of users) {
    if (!dryRun) {
      const customerResult = await ensureTargetCustomer(user);
      if (customerResult.created) {
        summary.targetCustomersCreated += 1;
      } else {
        summary.targetCustomersReused += 1;
      }
    }

    const authUserId = authEmailMap.get(user.email) ?? null;
    if (!authUserId) {
      summary.supabaseAuthUserMissing += 1;
      summary.missingAuthEmails.push(user.email);
      continue;
    }

    if (!dryRun) {
      await upsertPremiumProfile(authUserId, user.email);
    }
    summary.supabasePremiumGranted += 1;
  }

  console.log("Migration summary:");
  console.log(JSON.stringify(summary, null, 2));
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
