"use client";

import type { ComponentType } from "react";
import Link from "next/link";
import {
  SIDEBAR_MENU_TRAILING_CLASSNAME,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  sidebarMenuButtonVariants,
  useSidebar,
} from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const roadmapSoonBadgeClass =
  "ml-auto shrink-0 rounded-md border border-sidebar-border bg-sidebar-accent/40 px-1.5 py-0 text-[10px] font-medium uppercase tracking-wide text-sidebar-foreground underline-offset-2 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar";

type NavMainItem = {
  title: string;
  url?: string;
  icon: ComponentType<{ className?: string }>;
  isActive?: boolean;
  onNavigate?: (url: string) => void;
  onPrefetch?: (url: string) => void;
  disabled?: boolean;
  badge?: string;
  /** When set with `badge`, renders the badge as a link (e.g. roadmap) instead of plain text. */
  badgeHref?: string;
  /** `data-platform-tour` on the nav link (e.g. post-onboarding tour). */
  dataPlatformTour?: string;
};

type NavMainProps = {
  items: NavMainItem[];
  label: string;
  hideLabel?: boolean;
  /** Extra classes on the section label (e.g. `mt-1` for spacing above the first group). */
  labelClassName?: string;
  /** Merged into `SidebarGroup` (e.g. `px-2 pb-2 pt-0` to tune top padding). */
  groupClassName?: string;
};

export function NavMain({
  items,
  label,
  hideLabel = false,
  labelClassName,
  groupClassName,
}: NavMainProps) {
  const { state, isMobile } = useSidebar();

  return (
    <SidebarGroup className={groupClassName}>
      {!hideLabel ? (
        <SidebarGroupLabel className={labelClassName}>{label}</SidebarGroupLabel>
      ) : null}
      <SidebarMenu>
        {items.map((item) => {
          const badgeEl =
            item.badge && item.badgeHref ? (
              <a
                href={item.badgeHref}
                target="_blank"
                rel="noopener noreferrer"
                className={roadmapSoonBadgeClass}
              >
                {item.badge}
              </a>
            ) : item.badge ? (
              <Badge
                variant="outline"
                className="ml-auto shrink-0 rounded-md px-1.5 py-0 text-[10px] uppercase tracking-wide"
              >
                {item.badge}
              </Badge>
            ) : null;

          const content = (
            <>
              <item.icon className="size-4 shrink-0" />
              <span className={SIDEBAR_MENU_TRAILING_CLASSNAME}>
                <span className="min-w-0 flex-1 truncate">{item.title}</span>
                {badgeEl}
              </span>
            </>
          );

          const disabledSoonRow =
            item.disabled && !item.url && item.badge && item.badgeHref ? (
              <div
                className={cn(
                  sidebarMenuButtonVariants({ variant: "default", size: "default" }),
                  "cursor-default text-muted-foreground opacity-90"
                )}
                aria-label={`${item.title} (${item.badge}, opens roadmap in a new tab)`}
              >
                {content}
              </div>
            ) : null;

          return (
            <SidebarMenuItem key={item.title}>
              {disabledSoonRow ? (
                state === "collapsed" && !isMobile ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="outline-none">{disabledSoonRow}</div>
                    </TooltipTrigger>
                    <TooltipContent side="right" align="center">
                      {item.title}
                      {item.badge ? ` (${item.badge})` : ""}
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  disabledSoonRow
                )
              ) : item.disabled || !item.url ? (
                <SidebarMenuButton
                  type="button"
                  aria-disabled="true"
                  tooltip={`${item.title}${item.badge ? ` (${item.badge})` : ''}`}
                >
                  {content}
                </SidebarMenuButton>
              ) : (
                <SidebarMenuButton asChild isActive={item.isActive} tooltip={item.title}>
                  <Link
                    href={item.url}
                    prefetch
                    data-platform-tour={item.dataPlatformTour}
                    onMouseEnter={() => item.onPrefetch?.(item.url!)}
                    onFocus={() => item.onPrefetch?.(item.url!)}
                    onPointerDown={() => item.onNavigate?.(item.url!)}
                    onClick={() => item.onNavigate?.(item.url!)}
                  >
                    {content}
                  </Link>
                </SidebarMenuButton>
              )}
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}
