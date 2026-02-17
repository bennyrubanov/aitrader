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

type NavMainItem = {
  title: string;
  url: string;
  icon: ComponentType<{ className?: string }>;
  isActive?: boolean;
  onNavigate?: (url: string) => void;
  onPrefetch?: (url: string) => void;
};

type NavMainProps = {
  items: NavMainItem[];
};

export function NavMain({ items }: NavMainProps) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>Platform</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => (
          <SidebarMenuItem key={item.title}>
            <SidebarMenuButton asChild isActive={item.isActive} tooltip={item.title}>
              <Link
                href={item.url}
                prefetch
                onMouseEnter={() => item.onPrefetch?.(item.url)}
                onFocus={() => item.onPrefetch?.(item.url)}
                onPointerDown={() => item.onNavigate?.(item.url)}
                onClick={() => item.onNavigate?.(item.url)}
              >
                <item.icon />
                <span>{item.title}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}
