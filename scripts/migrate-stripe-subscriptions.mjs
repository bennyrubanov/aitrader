import {
  buildAuthEmailMap,
  envFlag,
  getStripeClients,
  getSupabaseAdmin,
  findMigratedCustomers,
} from "./_migration-common.mjs";

const dryRun = envFlag("MIGRATION_DRY_RUN", true);
const sourceAccountHint = process.env.SOURCE_STRIPE_ACCOUNT_ID ?? "acct_1Jh3kjG7ijNTxwtK";

const { sourceStripe: source, targetStripe: target } = getStripeClients();
const supabase = getSupabaseAdmin();
const nowUnix = () => Math.floor(Date.now() / 1000);

const getTargetPriceId = async (sourceSubscription) => {
  const sourceItem = sourceSubscription.items.data[0];
  const sourcePrice = sourceItem?.price;
  if (!sourcePrice?.recurring || !sourcePrice.currency || !sourcePrice.unit_amount) {
    throw new Error(`Unsupported source price shape for subscription ${sourceSubscription.id}`);
  }

  const sourceProduct =
    typeof sourcePrice.product === "string"
      ? await source.products.retrieve(sourcePrice.product)
      : sourcePrice.product;

  const targetProducts = await target.products.list({ active: true, limit: 100 });
  const matchingProduct = targetProducts.data.find((p) => p.name === sourceProduct.name);
  if (!matchingProduct) {
    throw new Error(`No matching target product found by name: ${sourceProduct.name}`);
  }

  const targetPrices = await target.prices.list({
    product: matchingProduct.id,
    active: true,
    limit: 100,
  });
  const matchingPrice = targetPrices.data.find(
    (p) =>
      p.unit_amount === sourcePrice.unit_amount &&
      p.currency === sourcePrice.currency &&
      p.recurring?.interval === sourcePrice.recurring.interval &&
      p.recurring?.interval_count === sourcePrice.recurring.interval_count
  );

  if (!matchingPrice) {
    throw new Error(
      `No matching target price found for product ${matchingProduct.id} (${sourceProduct.name})`
    );
  }

  return matchingPrice.id;
};

const createMigratedSubscription = async (params) => {
  try {
    return await target.subscriptions.create(params);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const paymentMethodMissing =
      message.includes("no attached payment source") ||
      message.includes("default payment method");

    if (!paymentMethodMissing) {
      throw error;
    }

    return target.subscriptions.create({
      ...params,
      collection_method: "send_invoice",
      days_until_due: 30,
    });
  }
};

const main = async () => {
  const sourceAccount = await source.accounts.retrieve();
  const targetAccount = await target.accounts.retrieve();

  console.log("Source Stripe account:", sourceAccount.id, sourceAccount.business_profile?.name ?? "(no name)");
  console.log("Target Stripe account:", targetAccount.id, targetAccount.business_profile?.name ?? "(no name)");
  console.log("Dry run:", dryRun ? "true" : "false");

  const migratedCustomers = await findMigratedCustomers(target);
  const authEmailMap = await buildAuthEmailMap(supabase, migratedCustomers.map((c) => c.email));

  const summary = {
    customersFound: migratedCustomers.length,
    subscriptionsCreated: 0,
    subscriptionsSkippedExisting: 0,
    subscriptionsCanceledImmediately: 0,
    profilesSetPremiumTrue: 0,
    profilesSetPremiumFalse: 0,
    missingAuthEmails: [],
  };

  for (const row of migratedCustomers) {
    const existingTargetSubs = await target.subscriptions.list({
      customer: row.targetCustomerId,
      status: "all",
      limit: 100,
    });
    const alreadyMigrated = existingTargetSubs.data.find(
      (sub) => sub.metadata?.migrated_from_source_subscription_id === row.sourceSubscriptionId
    );
    if (alreadyMigrated) {
      summary.subscriptionsSkippedExisting += 1;
      continue;
    }

    const sourceSub = await source.subscriptions.retrieve(row.sourceSubscriptionId, {
      expand: ["items.data.price.product"],
    });
    const targetPriceId = await getTargetPriceId(sourceSub);
    const userId = authEmailMap.get(row.email) ?? null;
    if (!userId) {
      summary.missingAuthEmails.push(row.email);
      continue;
    }

    const sourceStatus = sourceSub.status;
    const premiumEligible = sourceStatus === "active" || sourceStatus === "trialing";
    const targetMetadata = {
      user_id: userId,
      migrated_from_source_subscription_id: sourceSub.id,
      migrated_from_source_account_id: sourceAccountHint,
    };

    let createdSubscriptionId = null;
    if (!dryRun) {
      const createParams = {
        customer: row.targetCustomerId,
        items: [{ price: targetPriceId }],
        payment_settings: {
          save_default_payment_method: "on_subscription",
        },
        metadata: targetMetadata,
      };

      if (premiumEligible) {
        // Prevent an immediate second charge while old account is still active.
        if (sourceSub.current_period_end && sourceSub.current_period_end > nowUnix() + 300) {
          createParams.trial_end = sourceSub.current_period_end;
        }
      } else {
        // Create a concrete subscription record but keep entitlement inactive.
        createParams.trial_end = nowUnix() + 3600;
      }

      const created = await createMigratedSubscription(createParams);
      createdSubscriptionId = created.id;
      summary.subscriptionsCreated += 1;

      if (!premiumEligible) {
        await target.subscriptions.cancel(created.id, {
          invoice_now: false,
          prorate: false,
        });
        summary.subscriptionsCanceledImmediately += 1;
      }
    }

    if (!dryRun) {
      const profilePayload = {
        id: userId,
        email: row.email,
        is_premium: premiumEligible,
        stripe_subscription_status: premiumEligible ? "active" : "canceled",
        stripe_last_event_id: `migration_${sourceSub.id}`,
        stripe_last_event_created: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from("user_profiles").upsert(profilePayload, {
        onConflict: "id",
      });
      if (error) {
        throw new Error(`Supabase profile upsert failed for ${row.email}: ${error.message}`);
      }

      if (premiumEligible) {
        summary.profilesSetPremiumTrue += 1;
      } else {
        summary.profilesSetPremiumFalse += 1;
      }

      if (createdSubscriptionId) {
        await target.customers.update(row.targetCustomerId, {
          metadata: {
            migrated_target_subscription_id: createdSubscriptionId,
            migrated_from_source_subscription_id: row.sourceSubscriptionId,
          },
        });
      }
    }
  }

  console.log("Subscription migration summary:");
  console.log(JSON.stringify(summary, null, 2));
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
