import type { LucideIcon } from 'lucide-react';
import { BadgeCheck, Bell, CreditCard, KeyRound } from 'lucide-react';

/** Shared order + targets for account shortcuts in Navbar and platform sidebar user menu. */
export type AccountSettingsQuickLink = {
  href: string;
  label: string;
  Icon: LucideIcon;
};

export const ACCOUNT_SETTINGS_QUICK_LINKS: AccountSettingsQuickLink[] = [
  { href: '/platform/settings/account', label: 'Account', Icon: BadgeCheck },
  { href: '/platform/settings/security', label: 'Security', Icon: KeyRound },
  { href: '/platform/settings/billing', label: 'Billing', Icon: CreditCard },
  { href: '/platform/settings/notifications', label: 'Notifications', Icon: Bell },
];
