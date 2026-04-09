import React from 'react';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Tabs } from 'expo-router';
import { Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useColorScheme } from '@/components/useColorScheme';
import { useClientOnlyValue } from '@/components/useClientOnlyValue';
import { theme } from '@/constants/theme';

function TabBarIcon(props: {
  name: React.ComponentProps<typeof FontAwesome>['name'];
  color: string;
}) {
  return <FontAwesome size={20} style={{ marginBottom: -1 }} {...props} />;
}

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const t = theme[colorScheme === 'dark' ? 'dark' : 'light'];
  const insets = useSafeAreaInsets();
  const bottom = Math.max(insets.bottom, 10) + 6;

  return (
    <Tabs
      screenOptions={{
        headerShown: useClientOnlyValue(false, true),
        headerStyle: { backgroundColor: t.brandHeader },
        headerTintColor: t.text,
        headerTitleStyle: { fontWeight: '700', fontSize: 17 },
        headerShadowVisible: false,
        tabBarActiveTintColor: t.brandTab,
        tabBarInactiveTintColor: t.textMuted,
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700', marginTop: 1 },
        tabBarBackground: () => (
          <View
            style={{
              flex: 1,
              borderRadius: 30,
              backgroundColor: t.tabBar,
              borderWidth: 1,
              borderColor: t.tabBarBorder,
            }}
          />
        ),
        tabBarStyle: {
          position: 'absolute',
          left: 18,
          right: 18,
          bottom,
          height: 66,
          paddingTop: 8,
          paddingBottom: 6,
          borderRadius: 30,
          borderTopWidth: 0,
          backgroundColor: 'transparent',
          ...Platform.select({
            ios: {
              shadowColor: t.glowBlue,
              shadowOffset: { width: 0, height: 10 },
              shadowOpacity: colorScheme === 'dark' ? 0.22 : 0.16,
              shadowRadius: 22,
            },
            android: { elevation: 12 },
          }),
        },
        tabBarItemStyle: { paddingVertical: 2, borderRadius: 20 },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Ana sayfa',
          headerShown: false,
          tabBarIcon: ({ color }) => <TabBarIcon name="heartbeat" color={color} />,
        }}
      />
      <Tabs.Screen
        name="forecast"
        options={{
          title: 'Uyarilar',
          tabBarIcon: ({ color }) => <TabBarIcon name="line-chart" color={color} />,
        }}
      />
      <Tabs.Screen
        name="assistant"
        options={{
          title: 'Asistan',
          tabBarIcon: ({ color }) => <TabBarIcon name="magic" color={color} />,
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: 'Mesajlar',
          tabBarHideOnKeyboard: true,
          tabBarIcon: ({ color }) => <TabBarIcon name="comments" color={color} />,
        }}
      />
      <Tabs.Screen
        name="emergency"
        options={{
          title: 'Acil',
          headerShown: false,
          tabBarIcon: ({ color }) => <TabBarIcon name="bell" color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Ayar',
          tabBarIcon: ({ color }) => <TabBarIcon name="cog" color={color} />,
        }}
      />
    </Tabs>
  );
}
