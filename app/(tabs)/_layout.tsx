import { Tabs } from 'expo-router';
import React from 'react';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useTheme } from '@/hooks/use-theme';

export default function TabLayout() {
  const colors = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
        tabBarLabelStyle: { fontWeight: '500' },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Draw',
          tabBarIcon: ({ color }) => (
            <IconSymbol size={26} name="pencil.and.outline" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="write"
        options={{
          title: 'Write',
          tabBarIcon: ({ color }) => (
            <IconSymbol size={26} name="character.cursor.ibeam" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="robot"
        options={{
          title: 'Robot',
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="printer.fill" color={color} />,
        }}
      />
    </Tabs>
  );
}
