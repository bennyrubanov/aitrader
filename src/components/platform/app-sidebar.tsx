"use client";

import type { ComponentType } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  CalendarDays,
  CalendarRange,
  Search,
  Settings,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";

type NavItem = {
  title: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
};

const mainItems: NavItem[] = [
  {
    title: "Daily Recommendations",
    href: "/platform/daily",
    icon: CalendarDays,
  },
  {
    title: "Weekly Recommendations",
    href: "/platform/weekly",
    icon: CalendarRange,
  },
  {
    title: "Custom Search",
    href: "/platform/custom-search",
    icon: Search,
  },
  {
    title: "AI Trader Performance",
    href: "/platform/performance",
    icon: BarChart3,
  },
];

const settingsItem: NavItem = {
  title: "Settings",
  href: "/platform/settings",
  icon: Settings,
};

const isItemActive = (pathname: string, href: string) => {
  if (pathname === href) {
    return true;
  }

  return pathname.startsWith(`${href}/`);
};

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar
      className="top-[var(--header-height)] h-[calc(100svh-var(--header-height))]!"
      variant="inset"
    >
      <SidebarHeader className="pt-3">
        <div className="px-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-sidebar-foreground/60">
            AITrader
          </p>
          <p className="text-sm text-sidebar-foreground/80">
            Daily and weekly ranking intelligence
          </p>
        </div>
      </SidebarHeader>
      <SidebarSeparator />
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Platform</SidebarGroupLabel>
          <SidebarMenu>
            {mainItems.map((item) => (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  asChild
                  isActive={isItemActive(pathname, item.href)}
                  tooltip={item.title}
                >
                  <Link href={item.href}>
                    <item.icon />
                    <span>{item.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              isActive={isItemActive(pathname, settingsItem.href)}
              tooltip={settingsItem.title}
            >
              <Link href={settingsItem.href}>
                <settingsItem.icon />
                <span>{settingsItem.title}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
