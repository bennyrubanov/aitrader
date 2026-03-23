"use client";

import { useMemo } from "react";
import {
  BadgeCheck,
  Bell,
  ChevronsUpDown,
  CreditCard,
  LogIn,
  LogOut,
} from "lucide-react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SIDEBAR_MENU_TRAILING_CLASSNAME,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { PlanLabel } from "@/components/account/plan-label";
import type { SubscriptionTier } from "@/lib/auth-state";

type NavUserProps = {
  user: {
    name: string;
    email: string;
    avatar: string;
    isPremium: boolean;
    subscriptionTier?: SubscriptionTier;
    isAuthenticated: boolean;
  };
  onOpenAccount: () => void;
  onOpenBilling: () => void;
  onOpenNotifications: () => void;
  onUpgrade: () => void;
  onSignOut: () => void;
  onSignIn: () => void;
};

export function NavUser({
  user,
  onOpenAccount,
  onOpenBilling,
  onOpenNotifications,
  onUpgrade,
  onSignOut,
  onSignIn,
}: NavUserProps) {
  const { isMobile, sidebarMode, setSidebarHoverExpanded, setSidebarNavMenuOpen } = useSidebar();

  const initials = useMemo(() => {
    const source = user.name || user.email || "U";
    const parts = source.split(" ").filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
    }
    return (source[0] ?? "U").toUpperCase();
  }, [user.email, user.name]);

  if (!user.isAuthenticated) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            size="lg"
            onClick={onSignIn}
            className="bg-sidebar-accent/60 hover:bg-sidebar-accent"
          >
            <Avatar className="h-7 w-7 shrink-0 rounded-full">
              <AvatarFallback className="rounded-full">{initials}</AvatarFallback>
            </Avatar>
            <span className={SIDEBAR_MENU_TRAILING_CLASSNAME}>
              <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">Guest</span>
                <span className="truncate text-xs">Sign in to access account</span>
              </div>
              <LogIn className="ml-auto size-3.5 shrink-0" />
            </span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu
          onOpenChange={(open) => {
            setSidebarNavMenuOpen(open);
            if (sidebarMode === 'hover_expand' && open) {
              setSidebarHoverExpanded(true);
            }
          }}
        >
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="bg-sidebar-accent/60 hover:bg-sidebar-accent data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="h-7 w-7 shrink-0 rounded-full">
                <AvatarImage src={user.avatar} alt={user.name} />
                <AvatarFallback className="rounded-full">{initials}</AvatarFallback>
              </Avatar>
              <span className={SIDEBAR_MENU_TRAILING_CLASSNAME}>
                <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{user.name}</span>
                  <span className="truncate text-xs">{user.email}</span>
                </div>
                <ChevronsUpDown className="ml-auto size-3.5 shrink-0" />
              </span>
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="h-7 w-7 rounded-full">
                  <AvatarImage src={user.avatar} alt={user.name} />
                  <AvatarFallback className="rounded-full">{initials}</AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{user.name}</span>
                  <span className="truncate text-xs">{user.email}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem onSelect={onUpgrade} className="gap-2">
                <PlanLabel
                  isPremium={user.isPremium}
                  subscriptionTier={user.subscriptionTier}
                />
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem onSelect={onOpenAccount} className="gap-2">
                <BadgeCheck className="size-4 text-muted-foreground" />
                Account
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onOpenBilling} className="gap-2">
                <CreditCard className="size-4 text-muted-foreground" />
                Billing
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onOpenNotifications} className="gap-2">
                <Bell className="size-4 text-muted-foreground" />
                Notifications
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onSignOut} className="gap-2">
              <LogOut className="size-4 text-muted-foreground" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
