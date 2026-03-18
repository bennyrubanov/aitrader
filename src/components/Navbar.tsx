"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  ChevronDown,
  CircleHelp,
  FlaskConical,
  Gauge,
  Loader2,
  LogIn,
  Map,
  Newspaper,
  Scale,
  ShieldCheck,
  TriangleAlert,
  Building2,
  LayoutDashboard,
  Landmark,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/utils/supabase/browser";
import { ThemeToggle } from "@/components/theme-toggle";

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
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [hasPremiumAccess, setHasPremiumAccess] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [openMenu, setOpenMenu] = useState<"platform" | "resources" | "company" | null>(null);
  const pathname = usePathname();
  const router = useRouter();

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

  useEffect(() => {
    let isMounted = true;

    const loadAuthState = async () => {
      if (!isSupabaseConfigured()) {
        if (isMounted) {
          setIsAuthenticated(false);
          setHasPremiumAccess(false);
          setIsAuthLoading(false);
        }
        return;
      }

      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        if (isMounted) {
          setIsAuthenticated(false);
          setHasPremiumAccess(false);
          setIsAuthLoading(false);
        }
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      let premium = false;
      if (user) {
        const { data, error } = await supabase
          .from("user_profiles")
          .select("is_premium")
          .eq("id", user.id)
          .maybeSingle();
        premium = !error && Boolean(data?.is_premium);
      }

      if (isMounted) {
        setIsAuthenticated(Boolean(user));
        setHasPremiumAccess(premium);
        setIsAuthLoading(false);
      }
    };

    loadAuthState();

    const supabase = getSupabaseBrowserClient();
    const subscription = supabase?.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        setIsAuthenticated(false);
        setHasPremiumAccess(false);
        setIsAuthLoading(false);
        return;
      }
      void loadAuthState();
    });

    return () => {
      isMounted = false;
      subscription?.data.subscription.unsubscribe();
    };
  }, []);

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

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? "bg-background/80 backdrop-blur-md shadow-sm py-3" : "bg-transparent py-5"
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
              className="text-xl md:text-2xl font-bold text-foreground flex items-center"
            >
              <span className="text-trader-blue">AI</span>
              <span>Trader</span>
            </Link>
          </div>

          <nav className="hidden md:flex items-center gap-5">
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
                  openMenu === "platform"
                    ? "pointer-events-auto opacity-100"
                    : "pointer-events-none opacity-0"
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
                  openMenu === "resources"
                    ? "pointer-events-auto opacity-100"
                    : "pointer-events-none opacity-0"
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
                  openMenu === "company"
                    ? "pointer-events-auto opacity-100"
                    : "pointer-events-none opacity-0"
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

          <div className="flex items-center gap-2">
            <ThemeToggle className="rounded-full" />
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
              <Button className="rounded-full px-5 transition-all duration-300 bg-trader-blue hover:bg-trader-blue-dark text-white">
                <span className="mr-2">
                  {hasPremiumAccess ? "Platform" : "Get Started"}
                </span>
                <ArrowRight size={16} />
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Navbar;
