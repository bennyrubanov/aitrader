'use client';

/**
 * Shared layout for subscription / billing change explanations (timing, charges, renewals).
 */
export function PlanChangeDetailBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-3 rounded-md border bg-muted/40 px-3 py-2.5 text-sm">{children}</div>
  );
}

export function PlanChangeDetailSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <p className="font-medium text-foreground">{title}</p>
      <div className="text-muted-foreground [&_strong]:font-medium [&_strong]:text-foreground">
        {children}
      </div>
    </div>
  );
}
