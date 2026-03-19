import { Sparkles } from "lucide-react";
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
  free: 'Free plan',
  supporter: 'Supporter',
  outperformer: 'Outperformer',
};

export function PlanLabel({
  isPremium,
  subscriptionTier,
  className,
  iconClassName,
  showIcon = true,
}: PlanLabelProps) {
  const label = subscriptionTier ? TIER_LABELS[subscriptionTier] : isPremium ? 'Outperformer' : 'Free plan';

  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      {showIcon && isPremium ? (
        <Sparkles className={cn("size-4 text-trader-blue", iconClassName)} />
      ) : null}
      <span>{label}</span>
    </span>
  );
}
