import { updateSession } from "@/utils/supabase/middleware";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!api/|_next/|favicon.ico|robots.txt|sitemap.xml|manifest\\.(?:json|webmanifest)|apple-touch-icon.*|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|avif|bmp|woff2?|ttf|otf|map|txt|xml|json)$).*)",
  ],
};
