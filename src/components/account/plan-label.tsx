import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

type PlanLabelProps = {
  isPremium: boolean;
  className?: string;
  iconClassName?: string;
  showIcon?: boolean;
};

export function PlanLabel({
  isPremium,
  className,
  iconClassName,
  showIcon = true,
}: PlanLabelProps) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      {showIcon && isPremium ? (
        <Sparkles className={cn("size-4 text-trader-blue", iconClassName)} />
      ) : null}
      <span>{isPremium ? "Outperformer" : "Free version"}</span>
    </span>
  );
}

