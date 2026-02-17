"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight, Loader2, LogIn } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/utils/supabase/browser";
import { ThemeToggle } from "@/components/theme-toggle";

const Navbar: React.FC = () => {
  const [scrolled, setScrolled] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [hasPremiumAccess, setHasPremiumAccess] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isSigningIn, setIsSigningIn] = useState(false);
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
    ["/", "/platform/current", "/sign-up", "/blog", "/contact", "/help", "/payment"].forEach((href) => {
      router.prefetch(href);
    });
  }, [router]);

  useEffect(() => {
    const hash = window.location.hash;
    if (hash) {
      const element = document.getElementById(hash.substring(1));
      if (element) {
        element.scrollIntoView({ behavior: "smooth" });
      }
    }
  }, [pathname]);

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

  const getHomeLink = (hash: string) => {
    return pathname === "/" ? hash : `/${hash}`;
  };

  const handlePrefetch = (href: string) => {
    router.prefetch(href);
  };

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

          <nav className="hidden md:flex gap-6">
            <Link
              href={getHomeLink("#features")}
              prefetch
              onMouseEnter={() => handlePrefetch(getHomeLink("#features"))}
              onFocus={() => handlePrefetch(getHomeLink("#features"))}
              onPointerDown={() => handlePrefetch(getHomeLink("#features"))}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Features
            </Link>
            <Link
              href={getHomeLink("#research")}
              prefetch
              onMouseEnter={() => handlePrefetch(getHomeLink("#research"))}
              onFocus={() => handlePrefetch(getHomeLink("#research"))}
              onPointerDown={() => handlePrefetch(getHomeLink("#research"))}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Research
            </Link>
            <Link
              href={getHomeLink("#performance")}
              prefetch
              onMouseEnter={() => handlePrefetch(getHomeLink("#performance"))}
              onFocus={() => handlePrefetch(getHomeLink("#performance"))}
              onPointerDown={() => handlePrefetch(getHomeLink("#performance"))}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Performance
            </Link>
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
                <span>Login</span>
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
