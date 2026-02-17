'use client';

import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

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
} & React.ComponentPropsWithoutRef<typeof SidebarGroup>;

export function NavSecondary({ items, ...props }: NavSecondaryProps) {
  return (
    <SidebarGroup {...props}>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.title}>
              {item.collapsible ? (
                <Collapsible className="group/collapsible">
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton size="sm" className="data-[state=open]:bg-sidebar-accent">
                      <item.icon />
                      <span>{item.title}</span>
                      <ChevronDown className="ml-auto size-4 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-180" />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>{item.collapsible.content}</CollapsibleContent>
                </Collapsible>
              ) : item.onClick ? (
                <SidebarMenuButton size="sm" onClick={item.onClick}>
                  <item.icon />
                  <span>{item.title}</span>
                </SidebarMenuButton>
              ) : (
                <SidebarMenuButton asChild size="sm">
                  <Link href={item.url}>
                    <item.icon />
                    <span>{item.title}</span>
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
