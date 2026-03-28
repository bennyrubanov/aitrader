"use client";

import { usePathname } from "next/navigation";
import { AuthPreviewPlaceholder } from "@/components/auth/auth-preview-placeholder";

const AUTH_PREVIEW_PATHS = new Set([
  "/sign-in",
  "/sign-up",
  "/forgot-password",
  "/update-password",
]);

export function AuthPreviewPersistentHost() {
  const pathname = usePathname();

  if (!pathname || !AUTH_PREVIEW_PATHS.has(pathname)) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-10 hidden lg:block">
      <div className="mx-auto grid h-full max-w-[1320px] grid-cols-2">
        <div />
        <section className="flex items-center justify-center px-10 py-12">
          <div className="pointer-events-auto w-full max-w-xl">
            <AuthPreviewPlaceholder />
          </div>
        </section>
      </div>
    </div>
  );
}
