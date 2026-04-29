import { redirect } from 'next/navigation';

// Legacy platform path: canonical public models index lives at /strategy-models
export default function PlatformPerformancePage() {
  redirect('/strategy-models');
}
