import { redirect } from 'next/navigation';
import { STRATEGY_CONFIG } from '@/lib/strategyConfig';

export const revalidate = 300;

export const metadata = {
  title: 'Whitepaper | AITrader',
  description:
    'Technical notes on AITrader strategy-model methodology, portfolio construction, and research validation.',
};

export default function WhitepaperPage() {
  redirect(`/whitepaper/${STRATEGY_CONFIG.slug}`);
}
