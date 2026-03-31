import { createElement, type ComponentType } from 'react';
import { Platform } from 'react-native';

import type { ThemeTokens } from '@/constants/theme';
import type { ForecastGridPoint, ForecastPoint } from '@/lib/api';

type Props = {
  points: ForecastPoint[];
  heatPoints?: ForecastGridPoint[];
  scheme: 'light' | 'dark';
  t: ThemeTokens;
  userLocation?: { lat: number; lon: number } | null;
};

const RiskMapImpl: ComponentType<Props> =
  Platform.OS === 'web' ? require('./RiskMap.web').RiskMap : require('./RiskMap.native').RiskMap;

export function RiskMap(props: Props) {
  return createElement(RiskMapImpl, props);
}
