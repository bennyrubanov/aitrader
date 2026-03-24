"use client";

import { useLayoutEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Home, LayoutDashboard } from "lucide-react";
import { hasPlatformTabSession } from "@/lib/platform-tab-session";

function referrerIsPlatformPage(): boolean {
  if (typeof document === "undefined") return false;
  const ref = document.referrer;
  if (!ref) return false;
  try {
    const u = new URL(ref);
    if (typeof window === "undefined") return false;
    if (u.origin !== window.location.origin) return false;
    return u.pathname.startsWith("/platform");
  } catch {
    return false;
  }
}

const NotFoundPage = () => {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const [destination, setDestination] = useState<"/" | "/platform">(() =>
    pathname.startsWith("/platform") ? "/platform" : "/"
  );

  useLayoutEffect(() => {
    console.warn("404: non-existent route:", pathname);
    const target =
      pathname.startsWith("/platform") ||
      referrerIsPlatformPage() ||
      hasPlatformTabSession()
        ? "/platform"
        : "/";
    setDestination(target);
    router.replace(target);
  }, [pathname, router]);

  const isPlatformReturn = destination === "/platform";

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40">
      <div className="max-w-md text-center p-8 bg-card border border-border rounded-xl shadow-soft">
        <h1 className="text-5xl font-bold text-foreground mb-4">404</h1>
        <p className="text-xl text-muted-foreground mb-6">Page not found</p>
        <p className="text-muted-foreground mb-8">
          It looks like you&apos;ve tried to access{" "}
          <strong>{pathname || "this page"}</strong> directly.
        </p>
        <Link href={destination}>
          <Button className="rounded-xl px-5 transition-all duration-300 bg-trader-blue text-white hover:bg-trader-blue-dark">
            {isPlatformReturn ? (
              <LayoutDashboard size={18} className="mr-2" />
            ) : (
              <Home size={18} className="mr-2" />
            )}
            <span>{isPlatformReturn ? "Return to Platform" : "Return to Home"}</span>
          </Button>
        </Link>
      </div>
    </div>
  );
};

export default NotFoundPage;
