"use client";

import React, { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { type AuthState } from "@/lib/auth-state";
import { AuthStateProvider } from "@/components/auth/auth-state-provider";

type ProvidersProps = {
  children: React.ReactNode;
  initialAuthState: AuthState;
};

const Providers = ({ children, initialAuthState }: ProvidersProps) => {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <AuthStateProvider initialState={initialAuthState}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            {children}
            <Toaster />
            <Sonner />
          </TooltipProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </AuthStateProvider>
  );
};

export default Providers;
