import {
  envFlag,
  findMigratedCustomers,
  getCustomerDefaultPaymentMethodId,
  getStripeClients,
} from "./_migration-common.mjs";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://tryaitrader.com";
const dryRun = envFlag("MIGRATION_DRY_RUN", true);
const applySourceCancelAtPeriodEnd = envFlag("APPLY_SOURCE_CANCEL_AT_PERIOD_END", false);
const { sourceStripe: source, targetStripe: target } = getStripeClients();

const main = async () => {
  const sourceAccount = await source.accounts.retrieve();
  const targetAccount = await target.accounts.retrieve();
  console.log("Source Stripe account:", sourceAccount.id, sourceAccount.business_profile?.name ?? "(no name)");
  console.log("Target Stripe account:", targetAccount.id, targetAccount.business_profile?.name ?? "(no name)");
  console.log("Dry run:", dryRun ? "true" : "false");
  console.log("Apply source cancel_at_period_end:", applySourceCancelAtPeriodEnd ? "true" : "false");

  const migratedCustomers = await findMigratedCustomers(target);
  const summary = {
    customersFound: migratedCustomers.length,
    movedToAutoCharge: 0,
    pendingPaymentMethod: 0,
    sourceSetCancelAtPeriodEnd: 0,
    sourceAlreadyCancelAtPeriodEnd: 0,
    customerActions: [],
  };

  for (const row of migratedCustomers) {
    const targetSubs = await target.subscriptions.list({
      customer: row.targetCustomerId,
      status: "all",
      limit: 100,
    });
    const targetSub = targetSubs.data.find(
      (sub) => sub.metadata?.migrated_from_source_subscription_id === row.sourceSubscriptionId
    );

    if (!targetSub) {
      summary.customerActions.push({
        email: row.email,
        status: "missing_target_subscription",
      });
      continue;
    }

    const sourceSub = await source.subscriptions.retrieve(row.sourceSubscriptionId);
    const pmId = await getCustomerDefaultPaymentMethodId(target, row.targetCustomerId);
    let billingPortalUrl = null;

    if (targetSub.status === "active" && targetSub.collection_method !== "charge_automatically") {
      if (pmId) {
        if (!dryRun) {
          await target.subscriptions.update(targetSub.id, {
            collection_method: "charge_automatically",
            payment_settings: { save_default_payment_method: "on_subscription" },
          });
        }
        summary.movedToAutoCharge += 1;
      } else {
        if (!dryRun) {
          const portal = await target.billingPortal.sessions.create({
            customer: row.targetCustomerId,
            return_url: `${siteUrl}/billing`,
          });
          billingPortalUrl = portal.url;
        }
        summary.pendingPaymentMethod += 1;
      }
    }

    if (
      applySourceCancelAtPeriodEnd &&
      (sourceSub.status === "active" || sourceSub.status === "trialing") &&
      !sourceSub.cancel_at_period_end
    ) {
      if (!dryRun) {
        await source.subscriptions.update(sourceSub.id, { cancel_at_period_end: true });
      }
      summary.sourceSetCancelAtPeriodEnd += 1;
    } else if (sourceSub.cancel_at_period_end) {
      summary.sourceAlreadyCancelAtPeriodEnd += 1;
    }

    summary.customerActions.push({
      email: row.email,
      targetSubscriptionId: targetSub.id,
      targetStatus: targetSub.status,
      targetCollectionMethod: targetSub.collection_method,
      hasDefaultPaymentMethod: Boolean(pmId),
      sourceSubscriptionId: sourceSub.id,
      sourceStatus: sourceSub.status,
      sourceCancelAtPeriodEnd: sourceSub.cancel_at_period_end,
      ...(billingPortalUrl ? { billingPortalUrl } : {}),
    });
  }

  console.log("Finalize billing summary:");
  console.log(JSON.stringify(summary, null, 2));
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
