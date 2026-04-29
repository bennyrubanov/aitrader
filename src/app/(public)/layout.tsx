import { DEFAULT_AUTH_STATE } from '@/lib/auth-state';
import Providers from '../providers';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <Providers initialAuthState={DEFAULT_AUTH_STATE}>{children}</Providers>;
}
