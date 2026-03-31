import { createElement, type ComponentType } from 'react';
import { Platform } from 'react-native';

import type { ThemeTokens } from '@/constants/theme';
import type { QuakeEvent } from '@/lib/api';

type Props = {
  events: QuakeEvent[];
  scheme: 'light' | 'dark';
  t: ThemeTokens;
};

const QuakeMapImpl: ComponentType<Props> =
  Platform.OS === 'web'
    ? require('./QuakeMap.web').QuakeMap
    : require('./QuakeMap.native').QuakeMap;

export function QuakeMap(props: Props) {
  return createElement(QuakeMapImpl, props);
}
