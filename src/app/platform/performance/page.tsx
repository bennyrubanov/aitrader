import { redirect } from 'next/navigation';

// /platform/performance has moved to /performance (public page)
export default function PlatformPerformancePage() {
  redirect('/performance');
}
