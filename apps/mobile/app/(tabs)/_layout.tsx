import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors } from '../../src/theme';

/**
 * Four tabs, matching how the product is actually used: find something, look
 * something up, check what you committed to, manage yourself.
 */
function TabIcon({ glyph, colour }: { glyph: string; colour: string }) {
  return <Text style={{ fontSize: 20, color: colour }}>{glyph}</Text>;
}

export default function TabsLayout() {
  const { t } = useTranslation();

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textFaint,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.discover'),
          tabBarIcon: ({ color }) => <TabIcon glyph="◎" colour={color} />,
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: t('tabs.search'),
          tabBarIcon: ({ color }) => <TabIcon glyph="⌕" colour={color} />,
        }}
      />
      <Tabs.Screen
        name="plans"
        options={{
          title: t('tabs.plans'),
          tabBarIcon: ({ color }) => <TabIcon glyph="◆" colour={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('tabs.profile'),
          tabBarIcon: ({ color }) => <TabIcon glyph="●" colour={color} />,
        }}
      />
    </Tabs>
  );
}
