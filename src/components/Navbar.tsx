"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  BadgeCheck,
  Bell,
  Building2,
  ChevronDown,
  CircleHelp,
  CreditCard,
  FlaskConical,
  Gauge,
  Landmark,
  LayoutDashboard,
  Loader2,
  LogIn,
  LogOut,
  Map,
  Menu,
  Newspaper,
  Scale,
  ShieldCheck,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { getSupabaseBrowserClient } from "@/utils/supabase/browser";
import { useAuthState } from "@/components/auth/auth-state-provider";
import { PlanLabel } from "@/components/account/plan-label";

const platformNavItems = [
  { label: "Experiment & Research", href: "/experiment-research", icon: FlaskConical },
  { label: "Performance", href: "/platform/performance", icon: Gauge },
  { label: "Pricing & Features", href: "/pricing", icon: Landmark },
  { label: "Explore Platform", href: "/platform/current", icon: LayoutDashboard },
] as const;

const resourcesNavItems = [
  { label: "Roadmap & Changelog", href: "/roadmap-changelog", icon: Map },
  { label: "Blog", href: "/blog", icon: Newspaper },
  { label: "Help & Contact", href: "/contact", icon: CircleHelp },
] as const;

const companyNavItems = [
  { label: "About", href: "/about", icon: Building2 },
  { label: "Privacy Policy", href: "/privacy", icon: ShieldCheck },
  { label: "Terms of Service", href: "/terms", icon: Scale },
  { label: "Disclaimer", href: "/disclaimer", icon: TriangleAlert },
] as const;

type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

const Navbar: React.FC = () => {
  const [scrolled, setScrolled] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [avatarLoaded, setAvatarLoaded] = useState(false);
  const [openMenu, setOpenMenu] = useState<"platform" | "resources" | "company" | null>(null);
  const pathname = usePathname();
  const router = useRouter();
  const authState = useAuthState();
  const isAuthenticated = authState.isAuthenticated;
  const hasPremiumAccess = authState.hasPremiumAccess;
  const isAuthLoading = !authState.isLoaded;
  const account = {
    name: authState.name,
    email: authState.email,
    avatar: authState.avatar,
  };

  useEffect(() => {
    setAvatarLoaded(false);
  }, [account.avatar]);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    [
      "/",
      "/experiment-research",
      "/platform/performance",
      "/platform/current",
      "/platform/settings",
      "/pricing",
      "/blog",
      "/contact",
      "/about",
      "/roadmap-changelog",
      "/privacy",
      "/terms",
      "/disclaimer",
      "/sign-up",
    ].forEach((href) => {
      router.prefetch(href);
    });
  }, [router]);

  const handleLogin = async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      return;
    }

    setIsSigningIn(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/platform/current`,
      },
    });

    if (error) {
      setIsSigningIn(false);
      alert("Unable to start sign in. Please try again.");
    }
  };

  const handleSignOut = async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      return;
    }

    setIsSigningOut(true);
    await supabase.auth.signOut();
    setIsSigningOut(false);
    setIsMobileMenuOpen(false);
    router.push("/");
    router.refresh();
  };

  const handlePrefetch = (href: string) => {
    router.prefetch(href);
  };

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const isPlatformActive =
    pathname.startsWith("/platform") || pathname === "/experiment-research" || pathname === "/pricing";

  const dropdownButtonClass = (active: boolean) =>
    `inline-flex items-center gap-1 transition-colors ${
      active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
    }`;

  const accountInitials = (() => {
    const source = account.name || account.email || "U";
    const parts = source.split(" ").filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
    }
    return (source[0] ?? "U").toUpperCase();
  })();

  const AccountDropdown = ({ mobile = false }: { mobile?: boolean }) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background/80 transition-colors hover:bg-muted"
          aria-label="Open account menu"
        >
          <div className="relative">
            {!avatarLoaded && account.avatar && (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-[-2px] rounded-full border border-trader-blue/30 animate-pulse"
              />
            )}
            <Avatar className="h-7 w-7">
              <AvatarImage
                src={account.avatar}
                alt={account.name}
                className={`transition-opacity duration-300 ${avatarLoaded ? "opacity-100" : "opacity-0"}`}
                onLoad={() => setAvatarLoaded(true)}
              />
              <AvatarFallback>{accountInitials}</AvatarFallback>
            </Avatar>
          </div>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56 rounded-lg" align="end" sideOffset={8}>
        <DropdownMenuLabel className="p-0 font-normal">
          <div className="flex items-center gap-2 px-2 py-1.5 text-left text-sm">
            <div className="relative">
              {!avatarLoaded && account.avatar && (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-[-2px] rounded-full border border-trader-blue/30 animate-pulse"
                />
              )}
              <Avatar className="h-7 w-7">
                <AvatarImage
                  src={account.avatar}
                  alt={account.name}
                  className={`transition-opacity duration-300 ${avatarLoaded ? "opacity-100" : "opacity-0"}`}
                  onLoad={() => setAvatarLoaded(true)}
                />
                <AvatarFallback>{accountInitials}</AvatarFallback>
              </Avatar>
            </div>
            <div className="grid flex-1 text-left leading-tight">
              <span className="truncate font-medium">{account.name}</span>
              <span className="truncate text-xs text-muted-foreground">{account.email}</span>
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onSelect={() => router.push("/platform/settings")} className="gap-2">
            <PlanLabel isPremium={hasPremiumAccess} className="text-trader-blue font-medium" />
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onSelect={() => router.push("/platform/settings#account")} className="gap-2">
            <BadgeCheck className="size-4 text-muted-foreground" />
            Account
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => router.push("/platform/settings#billing")} className="gap-2">
            <CreditCard className="size-4 text-muted-foreground" />
            Billing
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => router.push("/platform/settings#notifications")} className="gap-2">
            <Bell className="size-4 text-muted-foreground" />
            Notifications
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={handleSignOut} className="gap-2" disabled={isSigningOut}>
          <LogOut className="size-4 text-muted-foreground" />
          {isSigningOut ? "Logging out..." : "Log out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? "bg-background/80 py-3 shadow-sm backdrop-blur-md" : "bg-transparent py-5"
      }`}
    >
      <div className="container mx-auto px-4 md:px-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <Link
              href="/"
              prefetch
              onMouseEnter={() => handlePrefetch("/")}
              onFocus={() => handlePrefetch("/")}
              onPointerDown={() => handlePrefetch("/")}
              className="flex items-center text-xl font-bold text-foreground md:text-2xl"
            >
              <span className="text-trader-blue">AI</span>
              <span>Trader</span>
            </Link>
          </div>

          <nav className="hidden items-center gap-5 md:flex">
            <div
              className="relative"
              onMouseEnter={() => setOpenMenu("platform")}
              onMouseLeave={() => setOpenMenu(null)}
            >
              <button
                type="button"
                className={dropdownButtonClass(isPlatformActive)}
                aria-expanded={openMenu === "platform"}
              >
                Platform
                <ChevronDown
                  size={14}
                  className={`transition-transform duration-200 ${
                    openMenu === "platform" ? "rotate-180" : "rotate-0"
                  }`}
                />
              </button>
              <div
                className={`absolute left-0 top-full z-50 w-64 pt-2 transition-all ${
                  openMenu === "platform" ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
                }`}
              >
                <div className="rounded-xl border border-border bg-card/95 p-2 shadow-lg backdrop-blur-sm">
                  {platformNavItems.map((item: NavItem) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      prefetch
                      onMouseEnter={() => handlePrefetch(item.href)}
                      onFocus={() => handlePrefetch(item.href)}
                      onPointerDown={() => handlePrefetch(item.href)}
                      className={`block rounded-lg px-3 py-2 text-sm transition-colors hover:bg-muted ${
                        isActive(item.href) ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <span className="inline-flex items-center gap-2">
                        <item.icon size={14} />
                        {item.label}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>

            <div
              className="relative"
              onMouseEnter={() => setOpenMenu("resources")}
              onMouseLeave={() => setOpenMenu(null)}
            >
              <button
                type="button"
                className={dropdownButtonClass(
                  isActive("/roadmap-changelog") || isActive("/blog") || isActive("/contact"),
                )}
                aria-expanded={openMenu === "resources"}
              >
                Resources
                <ChevronDown
                  size={14}
                  className={`transition-transform duration-200 ${
                    openMenu === "resources" ? "rotate-180" : "rotate-0"
                  }`}
                />
              </button>
              <div
                className={`absolute left-0 top-full z-50 w-64 pt-2 transition-all ${
                  openMenu === "resources" ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
                }`}
              >
                <div className="rounded-xl border border-border bg-card/95 p-2 shadow-lg backdrop-blur-sm">
                  {resourcesNavItems.map((item: NavItem) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      prefetch
                      onMouseEnter={() => handlePrefetch(item.href)}
                      onFocus={() => handlePrefetch(item.href)}
                      onPointerDown={() => handlePrefetch(item.href)}
                      className={`block rounded-lg px-3 py-2 text-sm transition-colors hover:bg-muted ${
                        isActive(item.href) ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <span className="inline-flex items-center gap-2">
                        <item.icon size={14} />
                        {item.label}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>

            <div
              className="relative"
              onMouseEnter={() => setOpenMenu("company")}
              onMouseLeave={() => setOpenMenu(null)}
            >
              <button
                type="button"
                className={dropdownButtonClass(
                  isActive("/about") ||
                    isActive("/privacy") ||
                    isActive("/terms") ||
                    isActive("/disclaimer"),
                )}
                aria-expanded={openMenu === "company"}
              >
                Company
                <ChevronDown
                  size={14}
                  className={`transition-transform duration-200 ${
                    openMenu === "company" ? "rotate-180" : "rotate-0"
                  }`}
                />
              </button>
              <div
                className={`absolute left-0 top-full z-50 w-64 pt-2 transition-all ${
                  openMenu === "company" ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
                }`}
              >
                <div className="rounded-xl border border-border bg-card/95 p-2 shadow-lg backdrop-blur-sm">
                  {companyNavItems.map((item: NavItem) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      prefetch
                      onMouseEnter={() => handlePrefetch(item.href)}
                      onFocus={() => handlePrefetch(item.href)}
                      onPointerDown={() => handlePrefetch(item.href)}
                      className={`block rounded-lg px-3 py-2 text-sm transition-colors hover:bg-muted ${
                        isActive(item.href) ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <span className="inline-flex items-center gap-2">
                        <item.icon size={14} />
                        {item.label}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </nav>

          <div className="hidden items-center gap-2 md:flex">
            <ThemeToggle className="rounded-full" />
            {isAuthenticated && <AccountDropdown />}
            {!isAuthenticated && (
              <Button
                variant="outline"
                className="rounded-full px-5"
                onClick={handleLogin}
                disabled={isSigningIn || isAuthLoading}
              >
                {isSigningIn || isAuthLoading ? (
                  <Loader2 size={16} className="mr-2 animate-spin" />
                ) : (
                  <LogIn size={16} className="mr-2" />
                )}
                <span>Sign in</span>
              </Button>
            )}
            <Link
              href={hasPremiumAccess ? "/platform/current" : "/sign-up"}
              prefetch
              onMouseEnter={() => handlePrefetch(hasPremiumAccess ? "/platform/current" : "/sign-up")}
              onFocus={() => handlePrefetch(hasPremiumAccess ? "/platform/current" : "/sign-up")}
              onPointerDown={() => handlePrefetch(hasPremiumAccess ? "/platform/current" : "/sign-up")}
            >
              <Button className="rounded-full bg-trader-blue px-5 text-white transition-all duration-300 hover:bg-trader-blue-dark">
                <span className="mr-2">{hasPremiumAccess ? "Platform" : "Get Started"}</span>
                <ArrowRight size={16} />
              </Button>
            </Link>
          </div>

          <div className="flex items-center gap-2 md:hidden">
            <ThemeToggle className="rounded-full" />
            {isAuthenticated && <AccountDropdown mobile />}
            <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" className="rounded-full" aria-label="Open navigation menu">
                  <Menu size={18} />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[88vw] max-w-sm pr-4">
                <SheetTitle className="sr-only">Main menu</SheetTitle>
                <div className="mt-6 flex h-full flex-col">
                  <div className="space-y-5">
                    <div>
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Platform
                      </h3>
                      <div className="space-y-1">
                        {platformNavItems.map((item: NavItem) => (
                          <SheetClose asChild key={item.href}>
                            <Link
                              href={item.href}
                              prefetch
                              onMouseEnter={() => handlePrefetch(item.href)}
                              onFocus={() => handlePrefetch(item.href)}
                              onPointerDown={() => handlePrefetch(item.href)}
                              className={`flex items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors hover:bg-muted ${
                                isActive(item.href)
                                  ? "text-foreground"
                                  : "text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              <item.icon size={14} />
                              {item.label}
                            </Link>
                          </SheetClose>
                        ))}
                      </div>
                    </div>

                    <div>
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Resources
                      </h3>
                      <div className="space-y-1">
                        {resourcesNavItems.map((item: NavItem) => (
                          <SheetClose asChild key={item.href}>
                            <Link
                              href={item.href}
                              prefetch
                              onMouseEnter={() => handlePrefetch(item.href)}
                              onFocus={() => handlePrefetch(item.href)}
                              onPointerDown={() => handlePrefetch(item.href)}
                              className={`flex items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors hover:bg-muted ${
                                isActive(item.href)
                                  ? "text-foreground"
                                  : "text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              <item.icon size={14} />
                              {item.label}
                            </Link>
                          </SheetClose>
                        ))}
                      </div>
                    </div>

                    <div>
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Company
                      </h3>
                      <div className="space-y-1">
                        {companyNavItems.map((item: NavItem) => (
                          <SheetClose asChild key={item.href}>
                            <Link
                              href={item.href}
                              prefetch
                              onMouseEnter={() => handlePrefetch(item.href)}
                              onFocus={() => handlePrefetch(item.href)}
                              onPointerDown={() => handlePrefetch(item.href)}
                              className={`flex items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors hover:bg-muted ${
                                isActive(item.href)
                                  ? "text-foreground"
                                  : "text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              <item.icon size={14} />
                              {item.label}
                            </Link>
                          </SheetClose>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="mt-auto space-y-2 pt-6">
                    {!isAuthenticated && (
                      <Button
                        variant="outline"
                        className="w-full justify-center rounded-full"
                        onClick={handleLogin}
                        disabled={isSigningIn || isAuthLoading}
                      >
                        {isSigningIn || isAuthLoading ? (
                          <Loader2 size={16} className="mr-2 animate-spin" />
                        ) : (
                          <LogIn size={16} className="mr-2" />
                        )}
                        <span>Sign in</span>
                      </Button>
                    )}
                    <SheetClose asChild>
                      <Link
                        href={hasPremiumAccess ? "/platform/current" : "/sign-up"}
                        prefetch
                        onMouseEnter={() => handlePrefetch(hasPremiumAccess ? "/platform/current" : "/sign-up")}
                        onFocus={() => handlePrefetch(hasPremiumAccess ? "/platform/current" : "/sign-up")}
                        onPointerDown={() => handlePrefetch(hasPremiumAccess ? "/platform/current" : "/sign-up")}
                        className="block"
                      >
                        <Button className="w-full rounded-full bg-trader-blue text-white transition-all duration-300 hover:bg-trader-blue-dark">
                          <span className="mr-2">{hasPremiumAccess ? "Platform" : "Get Started"}</span>
                          <ArrowRight size={16} />
                        </Button>
                      </Link>
                    </SheetClose>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Navbar;
