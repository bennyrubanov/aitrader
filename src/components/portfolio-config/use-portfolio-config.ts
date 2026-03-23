'use client';

import { useContext } from 'react';
import {
  PortfolioConfigContext,
  type PortfolioConfigContextValue,
} from './portfolio-config-context-core';

export function usePortfolioConfig(): PortfolioConfigContextValue {
  const ctx = useContext(PortfolioConfigContext);
  if (!ctx) throw new Error('usePortfolioConfig must be used within PortfolioConfigProvider');
  return ctx;
}
