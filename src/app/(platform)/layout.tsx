import { headers } from 'next/headers';
import { AuthPreviewPersistentHost } from '@/components/auth/auth-preview-persistent-host';
import Providers from '../providers';
import { getGuestPlatformPreviewPayloadCached } from '@/lib/guest-platform-preview';
import { getInitialAuthState } from '@/lib/get-initial-auth-state';
import { INVOKE_PATHNAME_HEADER } from '@/lib/invoke-pathname-header';

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const initialAuthState = await getInitialAuthState();
  const pathname = (await headers()).get(INVOKE_PATHNAME_HEADER) ?? '';
  const warmGuestAuthPreview = pathname === '/sign-in' || pathname === '/sign-up';
  const guestPreviewInitial = warmGuestAuthPreview
    ? await getGuestPlatformPreviewPayloadCached()
    : null;

  return (
    <Providers initialAuthState={initialAuthState}>
      {children}
      <AuthPreviewPersistentHost guestPreviewInitial={guestPreviewInitial} />
    </Providers>
  );
}
