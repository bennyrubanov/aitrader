import { HeartHandshake, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SubscriptionTier } from "@/lib/auth-state";

type PlanLabelProps = {
  isPremium: boolean;
  subscriptionTier?: SubscriptionTier;
  className?: string;
  iconClassName?: string;
  showIcon?: boolean;
};

const TIER_LABELS: Record<SubscriptionTier, string> = {
  free: "Free plan",
  supporter: "Supporter",
  outperformer: "Outperformer",
};

function OutperformerWordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex flex-wrap items-baseline uppercase", className)}>
      <span className="">O U T P E R F O R M E R</span>
    </span>
  );
}

function resolveTier(
  subscriptionTier: SubscriptionTier | undefined,
  isPremium: boolean
): SubscriptionTier {
  if (subscriptionTier === "supporter" || subscriptionTier === "outperformer") {
    return subscriptionTier;
  }
  if (subscriptionTier === "free") {
    return "free";
  }
  // Missing tier (e.g. stale localStorage): never assume Outperformer — prefer Supporter for paid.
  return isPremium ? "supporter" : "free";
}

export function PlanLabel({
  isPremium,
  subscriptionTier,
  className,
  iconClassName,
  showIcon = true,
}: PlanLabelProps) {
  const tier = resolveTier(subscriptionTier, isPremium);
  const label = TIER_LABELS[tier];

  const labelClass = cn(
    tier === "free" && "text-muted-foreground",
    tier === "supporter" && "font-bold text-amber-700 dark:text-amber-400",
    tier === "outperformer" && "-skew-x-12 font-semibold text-trader-blue"
  );

  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      {showIcon && tier === "outperformer" ? (
        <Sparkles className={cn("size-4 shrink-0 text-trader-blue", iconClassName)} />
      ) : null}
      {showIcon && tier === "supporter" ? (
        <HeartHandshake
          className={cn(
            "size-4 shrink-0 text-amber-600 dark:text-amber-500",
            iconClassName
          )}
        />
      ) : null}
      {tier === "outperformer" ? (
        <OutperformerWordmark className={labelClass} />
      ) : (
        <span className={labelClass}>{label}</span>
      )}
    </span>
  );
}
