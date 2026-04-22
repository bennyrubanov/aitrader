'use client';

import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import {
  SIDEBAR_MENU_TRAILING_CLASSNAME,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type SecondaryItem = {
  title: string;
  url: string;
  icon: LucideIcon;
  onClick?: () => void;
  collapsible?: {
    content: React.ReactNode;
  };
};

type NavSecondaryProps = {
  items: SecondaryItem[];
  /** Extra rows rendered before `items` (same `SidebarMenu`). */
  menuPrefix?: React.ReactNode;
} & React.ComponentPropsWithoutRef<typeof SidebarGroup>;

type SecondaryItemWithCollapsible = SecondaryItem & {
  collapsible: NonNullable<SecondaryItem['collapsible']>;
};

function NavSecondaryCollapsibleItem({ item }: { item: SecondaryItemWithCollapsible }) {
  const { state, isMobile } = useSidebar();
  const [dialogOpen, setDialogOpen] = useState(false);
  const useDialog = !isMobile && state === 'collapsed';

  if (useDialog) {
    return (
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <SidebarMenuButton
          size="sm"
          type="button"
          tooltip={item.title}
          onClick={() => setDialogOpen(true)}
        >
          <item.icon className="size-4 shrink-0" />
          <span className={SIDEBAR_MENU_TRAILING_CLASSNAME}>
            <span className="min-w-0 flex-1 truncate">{item.title}</span>
          </span>
        </SidebarMenuButton>
        <DialogContent className="max-h-[min(85vh,36rem)] gap-4 overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{item.title}</DialogTitle>
          </DialogHeader>
          <div className="text-sm">{item.collapsible.content}</div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Collapsible className="group/collapsible">
      <CollapsibleTrigger asChild>
        <SidebarMenuButton size="sm" className="data-[state=open]:bg-sidebar-accent">
          <item.icon className="size-4 shrink-0" />
          <span className={SIDEBAR_MENU_TRAILING_CLASSNAME}>
            <span className="min-w-0 flex-1 truncate">{item.title}</span>
            <ChevronDown className="ml-auto size-4 shrink-0 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-180" />
          </span>
        </SidebarMenuButton>
      </CollapsibleTrigger>
      <CollapsibleContent>{item.collapsible.content}</CollapsibleContent>
    </Collapsible>
  );
}

export function NavSecondary({ items, menuPrefix, ...props }: NavSecondaryProps) {
  return (
    <SidebarGroup {...props}>
      <SidebarGroupContent>
        <SidebarMenu>
          {menuPrefix}
          {items.map((item) => (
            <SidebarMenuItem key={item.title}>
              {item.collapsible ? (
                <NavSecondaryCollapsibleItem item={{ ...item, collapsible: item.collapsible }} />
              ) : item.onClick ? (
                <SidebarMenuButton size="sm" onClick={item.onClick}>
                  <item.icon className="size-4 shrink-0" />
                  <span className={SIDEBAR_MENU_TRAILING_CLASSNAME}>
                    <span className="min-w-0 flex-1 truncate">{item.title}</span>
                  </span>
                </SidebarMenuButton>
              ) : (
                <SidebarMenuButton asChild size="sm">
                  <Link href={item.url}>
                    <item.icon className="size-4 shrink-0" />
                    <span className={SIDEBAR_MENU_TRAILING_CLASSNAME}>
                      <span className="min-w-0 flex-1 truncate">{item.title}</span>
                    </span>
                  </Link>
                </SidebarMenuButton>
              )}
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
