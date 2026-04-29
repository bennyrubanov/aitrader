import { AuthPreviewPersistentHost } from '@/components/auth/auth-preview-persistent-host';
import Providers from '../providers';
import { getInitialAuthState } from '@/lib/get-initial-auth-state';

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const initialAuthState = await getInitialAuthState();
  return (
    <Providers initialAuthState={initialAuthState}>
      {children}
      <AuthPreviewPersistentHost />
    </Providers>
  );
}
