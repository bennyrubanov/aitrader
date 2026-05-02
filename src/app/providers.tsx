"use client";

import React, { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { type AuthState } from "@/lib/auth-state";
import { AuthStateProvider } from "@/components/auth/auth-state-provider";
import { PortfolioConfigProvider } from "@/components/portfolio-config";
import { MobileStaticRouteScrollToTop } from "@/components/mobile-static-route-scroll-to-top";
import { LandingRouteThemeSync } from "@/components/landing-route-theme-sync";

type ProvidersProps = {
  children: React.ReactNode;
  initialAuthState: AuthState;
};

const Providers = ({ children, initialAuthState }: ProvidersProps) => {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <AuthStateProvider initialState={initialAuthState}>
      <PortfolioConfigProvider>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <LandingRouteThemeSync />
          <QueryClientProvider client={queryClient}>
            <TooltipProvider>
              <MobileStaticRouteScrollToTop />
              {children}
              <Toaster />
              <Sonner />
            </TooltipProvider>
          </QueryClientProvider>
        </ThemeProvider>
      </PortfolioConfigProvider>
    </AuthStateProvider>
  );
};

export default Providers;
