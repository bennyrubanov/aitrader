"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { useDevLandingThemeOverride } from "@/components/theme-provider";
import { useEffectiveResolvedTheme } from "@/hooks/use-effective-resolved-theme";

type ThemeToggleProps = {
  className?: string;
};

export function ThemeToggle({ className }: ThemeToggleProps) {
  const pathname = usePathname();
  const { setTheme } = useTheme();
  const devLandingCtx = useDevLandingThemeOverride();
  const effective = useEffectiveResolvedTheme();
  const [mounted, setMounted] = useState(false);

  const isDevHomePreview =
    process.env.NODE_ENV === "development" && pathname === "/" && devLandingCtx != null;

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={className}
        aria-label="Toggle theme"
        disabled
      >
        <Sun className="size-4" />
      </Button>
    );
  }

  const isDark = effective === "dark";

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={className}
      aria-label={
        isDevHomePreview
          ? `Preview ${isDark ? "light" : "dark"} mode (refresh restores OS theme)`
          : `Switch to ${isDark ? "light" : "dark"} mode`
      }
      onClick={() => {
        if (isDevHomePreview && devLandingCtx) {
          devLandingCtx.setDevLandingOverride(isDark ? "light" : "dark");
          return;
        }
        setTheme(isDark ? "light" : "dark");
      }}
    >
      {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}
