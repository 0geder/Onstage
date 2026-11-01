import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Icon } from '../../src/components/icon';
import { colors } from '../../src/theme';

/**
 * Four tabs, matching how the product is actually used: find something, look
 * something up, check what you committed to, manage yourself. Line icons that
 * fill in when active, so where you are reads at a glance.
 */
export default function TabsLayout() {
  const { t } = useTranslation();

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopColor: colors.border,
        },
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.textFaint,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.discover'),
          tabBarIcon: ({ color, focused }) => (
            <Icon name={focused ? 'home-fill' : 'home'} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: t('tabs.search'),
          tabBarIcon: ({ color }) => <Icon name="search" color={color} />,
        }}
      />
      <Tabs.Screen
        name="plans"
        options={{
          title: t('tabs.plans'),
          tabBarIcon: ({ color }) => <Icon name="plans" color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('tabs.profile'),
          tabBarIcon: ({ color, focused }) => (
            <Icon name={focused ? 'profile-fill' : 'profile'} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
