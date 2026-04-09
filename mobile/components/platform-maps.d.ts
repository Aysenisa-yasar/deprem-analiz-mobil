declare module '@/components/RiskMap' {
  import type { ComponentType } from 'react';
  import type { ThemeTokens } from '@/constants/theme';
  import type { ForecastGridPoint, ForecastPoint } from '@/lib/api';

  export const RiskMap: ComponentType<{
    points: ForecastPoint[];
    heatPoints?: ForecastGridPoint[];
    scheme: 'light' | 'dark';
    t: ThemeTokens;
    userLocation?: { lat: number; lon: number } | null;
    focusPoint?: { lat: number; lon: number } | null;
  }>;
}

declare module '@/components/QuakeMap' {
  import type { ComponentType } from 'react';
  import type { ThemeTokens } from '@/constants/theme';
  import type { QuakeEvent } from '@/lib/api';

  export const QuakeMap: ComponentType<{
    events: QuakeEvent[];
    scheme: 'light' | 'dark';
    t: ThemeTokens;
  }>;
}
