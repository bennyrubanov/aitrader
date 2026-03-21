import type { ReactNode } from 'react';

type Props = { children: ReactNode };

export default function ExplorePortfoliosLayout({ children }: Props) {
  return (
    <div className="flex min-h-0 flex-1 flex-col lg:min-h-0 lg:max-h-[calc(100svh-var(--header-height)-3.5rem)] lg:overflow-hidden">
      {children}
    </div>
  );
}
