"use client";

import type { ComponentType } from "react";
import Link from "next/link";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";

type NavMainItem = {
  title: string;
  url?: string;
  icon: ComponentType<{ className?: string }>;
  isActive?: boolean;
  onNavigate?: (url: string) => void;
  onPrefetch?: (url: string) => void;
  disabled?: boolean;
  badge?: string;
};

type NavMainProps = {
  items: NavMainItem[];
  label: string;
  hideLabel?: boolean;
};

export function NavMain({ items, label, hideLabel = false }: NavMainProps) {
  return (
    <SidebarGroup>
      {!hideLabel ? <SidebarGroupLabel>{label}</SidebarGroupLabel> : null}
      <SidebarMenu>
        {items.map((item) => {
          const content = (
            <>
              <item.icon className="size-4 shrink-0" />
              <span className="truncate">{item.title}</span>
              {item.badge ? (
                <Badge variant="outline" className="ml-auto shrink-0 rounded-md px-1.5 py-0 text-[10px] uppercase tracking-wide">
                  {item.badge}
                </Badge>
              ) : null}
            </>
          );

          return (
            <SidebarMenuItem key={item.title}>
              {item.disabled || !item.url ? (
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
