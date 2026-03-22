import type { ReactNode } from 'react';

type Props = { children: ReactNode };

export default function ExplorePortfoliosLayout({ children }: Props) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {children}
    </div>
  );
}
