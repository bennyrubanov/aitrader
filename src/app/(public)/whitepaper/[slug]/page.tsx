import { redirect } from 'next/navigation';
export const dynamic = 'force-static';
/** Must match `PUBLIC_STATIC_REVALIDATE` in `@/lib/public-cache` (Next requires a literal here). */
export const revalidate = false;
export const dynamicParams = true;

export function generateStaticParams(): { slug: string }[] {
  return [];
}

export default function WhitepaperSlugRedirectPage() {
  redirect('/whitepaper');
}
