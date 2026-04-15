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
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { getSupabaseBrowserClient } from "@/utils/supabase/browser";
import { useAuthState } from "@/components/auth/auth-state-context";
import { PlanLabel } from "@/components/account/plan-label";
import { navigateWithFallback } from "@/lib/client-navigation";
import { STRATEGY_CONFIG } from "@/lib/strategyConfig";
import { shouldPersistSignInReturnPath } from "@/lib/auth-redirect";

const platformNavItems: PlatformNavItem[] = [
  { label: "Performance", href: `/performance/${STRATEGY_CONFIG.slug}`, icon: Gauge },
  { label: "Strategy Models", href: "/strategy-models", icon: FlaskConical },
  { label: "Pricing & Features", href: "/pricing", icon: Landmark },
  {
    label: "Explore Platform",
    href: "/platform/overview",
    icon: LayoutDashboard,
    trailingArrow: true,
  },
];

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

type PlatformNavItem = NavItem & { trailingArrow?: boolean };

const MARKETING_PREFETCH_ROUTES = [
  "/",
  "/strategy-models",
  "/performance",
  "/platform/overview",
  "/platform/settings",
  "/pricing",
  "/blog",
  "/contact",
  "/help",
  "/payment",
  "/about",
  "/roadmap-changelog",
  "/privacy",
  "/terms",
  "/disclaimer",
  "/sign-in",
  "/sign-up",
  "/forgot-password",
];

const Navbar: React.FC = () => {
  const [scrolled, setScrolled] = useState(false);
  const [isNavigatingToSignIn, setIsNavigatingToSignIn] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [avatarLoaded, setAvatarLoaded] = useState(false);
  const [openMenu, setOpenMenu] = useState<"platform" | "resources" | "company" | null>(null);
  const pathname = usePathname();
  /** Avoid nav active-state hydration mismatches when SSR pathname and client usePathname() disagree. */
  const [navPathReady, setNavPathReady] = useState(false);
  const router = useRouter();
  const authState = useAuthState();
  const isAuthenticated = authState.isAuthenticated;
  const hasPremiumAccess = authState.hasPremiumAccess;
  const subscriptionTier = authState.subscriptionTier;
  const isFreeSignedIn = isAuthenticated && !hasPremiumAccess;
  const primaryCtaHref = isAuthenticated ? "/platform/overview" : "/sign-up";
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
    setIsNavigatingToSignIn(false);
  }, [pathname]);

  useEffect(() => {
    setNavPathReady(true);
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    // Keep aggressive route warming for production UX, but avoid
    // eager precompile pressure in local dev.
    if (process.env.NODE_ENV !== "production") {
      return;
    }

    const warmRoutes = () => {
      MARKETING_PREFETCH_ROUTES.forEach((href) => {
        router.prefetch(href);
      });
    };

    warmRoutes();

    const intervalId = globalThis.setInterval(() => {
      warmRoutes();
    }, 30_000);

    const handleWindowFocus = () => {
      warmRoutes();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        warmRoutes();
      }
    };

    window.addEventListener("focus", handleWindowFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    let idleCallbackId: number | null = null;
    let timeoutId: ReturnType<typeof globalThis.setTimeout> | null = null;

    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      idleCallbackId = window.requestIdleCallback(warmRoutes, { timeout: 1500 });
    } else {
      timeoutId = globalThis.setTimeout(warmRoutes, 500);
    }

    return () => {
      globalThis.clearInterval(intervalId);
      window.removeEventListener("focus", handleWindowFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);

      if (idleCallbackId !== null) {
        window.cancelIdleCallback(idleCallbackId);
      }
      if (timeoutId !== null) {
        globalThis.clearTimeout(timeoutId);
      }
    };
  }, [router]);

  const handleLogin = () => {
    setIsNavigatingToSignIn(true);
    const currentPath = typeof window !== "undefined"
      ? window.location.pathname + window.location.search
      : "/";
    const signInHref = shouldPersistSignInReturnPath(currentPath)
      ? `/sign-in?next=${encodeURIComponent(currentPath)}`
      : "/sign-in";
    navigateWithFallback((href) => router.push(href), signInHref);
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
    navigateWithFallback((href) => router.push(href), "/");
    router.refresh();
  };

  const handlePrefetch = (href: string) => {
    router.prefetch(href);
  };

  const isActive = (href: string) => {
    if (!navPathReady) return false;
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const isPlatformActive =
    navPathReady &&
    (pathname.startsWith("/platform") ||
      pathname.startsWith("/strategy-models") ||
      pathname.startsWith("/performance") ||
      pathname === "/pricing");

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
          <DropdownMenuItem
            onSelect={() =>
              navigateWithFallback(
                (href) => router.push(href),
                hasPremiumAccess ? "/platform/settings" : "/pricing"
              )
            }
            className="gap-2"
          >
            <PlanLabel isPremium={hasPremiumAccess} subscriptionTier={subscriptionTier} />
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
              <DropdownMenuItem
                onSelect={() =>
                  navigateWithFallback((href) => router.push(href), "/platform/settings#account")
                }
                className="gap-2"
              >
            <BadgeCheck className="size-4 text-muted-foreground" />
            Account
          </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() =>
                  navigateWithFallback((href) => router.push(href), "/platform/settings#billing")
                }
                className="gap-2"
              >
            <CreditCard className="size-4 text-muted-foreground" />
            Billing
          </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() =>
                  navigateWithFallback(
                    (href) => router.push(href),
                    "/platform/settings#notifications"
                  )
                }
                className="gap-2"
              >
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
                  {platformNavItems.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      prefetch
                      onMouseEnter={() => handlePrefetch(item.href)}
                      onFocus={() => handlePrefetch(item.href)}
                      onPointerDown={() => handlePrefetch(item.href)}
                      className={`flex items-center rounded-lg px-3 py-2 text-sm transition-colors hover:bg-muted ${
                        item.trailingArrow ? "group " : ""
                      }${
                        isActive(item.href) ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <span className="inline-flex min-w-0 flex-1 items-center gap-2">
                        <item.icon size={14} className="shrink-0" />
                        <span className="truncate">{item.label}</span>
                      </span>
                      {item.trailingArrow ? (
                        <ArrowRight
                          size={14}
                          className="ml-2 shrink-0 opacity-0 transition-opacity group-hover:opacity-70 group-focus-visible:opacity-70"
                          aria-hidden
                        />
                      ) : null}
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
                disabled={isNavigatingToSignIn || isAuthLoading}
              >
                {isNavigatingToSignIn || isAuthLoading ? (
                  <Loader2 size={16} className="mr-2 animate-spin" />
                ) : (
                  <LogIn size={16} className="mr-2" />
                )}
                <span>Sign in</span>
              </Button>
            )}
            <Link
              href={primaryCtaHref}
              prefetch
              onMouseEnter={() => handlePrefetch(primaryCtaHref)}
              onFocus={() => handlePrefetch(primaryCtaHref)}
              onPointerDown={() => handlePrefetch(primaryCtaHref)}
            >
              <Button className="rounded-full bg-trader-blue px-5 text-white transition-all duration-300 hover:bg-trader-blue-dark">
                <span className="mr-2">
                  {isAuthenticated ? "Platform" : "Get Started"}
                </span>
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
              <SheetContent
                side="right"
                className="flex h-[100dvh] max-h-[100dvh] w-[88vw] max-w-sm flex-col overflow-hidden pr-4"
              >
                <SheetTitle className="sr-only">Main menu</SheetTitle>
                <div className="flex min-h-0 flex-1 flex-col pt-6">
                  <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-1 py-1">
                  <Accordion type="multiple" defaultValue={["platform"]} className="w-full">
                    <AccordionItem value="platform">
                      <AccordionTrigger className="py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:no-underline">
                        Platform
                      </AccordionTrigger>
                      <AccordionContent className="pb-1">
                        <div className="space-y-1">
                          {platformNavItems.map((item) => (
                            <SheetClose asChild key={item.href}>
                              <Link
                                href={item.href}
                                prefetch
                                onMouseEnter={() => handlePrefetch(item.href)}
                                onFocus={() => handlePrefetch(item.href)}
                                onPointerDown={() => handlePrefetch(item.href)}
                                className={`flex items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors hover:bg-muted ${
                                  item.trailingArrow ? "group " : ""
                                }${
                                  isActive(item.href)
                                    ? "text-foreground"
                                    : "text-muted-foreground hover:text-foreground"
                                }`}
                              >
                                <item.icon size={14} className="shrink-0" />
                                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                                {item.trailingArrow ? (
                                  <ArrowRight
                                    size={14}
                                    className="shrink-0 opacity-0 transition-opacity group-hover:opacity-70 group-focus-visible:opacity-70"
                                    aria-hidden
                                  />
                                ) : null}
                              </Link>
                            </SheetClose>
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>

                    <AccordionItem value="resources">
                      <AccordionTrigger className="py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:no-underline">
                        Resources
                      </AccordionTrigger>
                      <AccordionContent className="pb-1">
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
                      </AccordionContent>
                    </AccordionItem>

                    <AccordionItem value="company">
                      <AccordionTrigger className="py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:no-underline">
                        Company
                      </AccordionTrigger>
                      <AccordionContent className="pb-1">
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
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                  </div>

                  <div className="shrink-0 space-y-2 border-t border-border/60 pt-4">
                    {!isAuthenticated && (
                      <Button
                        variant="outline"
                        className="w-full justify-center rounded-full"
                        onClick={handleLogin}
                        disabled={isNavigatingToSignIn || isAuthLoading}
                      >
                        {isNavigatingToSignIn || isAuthLoading ? (
                          <Loader2 size={16} className="mr-2 animate-spin" />
                        ) : (
                          <LogIn size={16} className="mr-2" />
                        )}
                        <span>Sign in</span>
                      </Button>
                    )}
                    <SheetClose asChild>
                      <Link
                        href={primaryCtaHref}
                        prefetch
                        onMouseEnter={() => handlePrefetch(primaryCtaHref)}
                        onFocus={() => handlePrefetch(primaryCtaHref)}
                        onPointerDown={() => handlePrefetch(primaryCtaHref)}
                        className="block"
                      >
                        <Button className="w-full rounded-full bg-trader-blue text-white transition-all duration-300 hover:bg-trader-blue-dark">
                          <span className="mr-2">
                            {isAuthenticated ? "Platform" : "Get Started"}
                          </span>
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
