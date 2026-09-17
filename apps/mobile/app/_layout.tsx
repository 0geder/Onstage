import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { I18nextProvider } from 'react-i18next';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { loadToken } from '../src/api/client';
import i18n, { initI18n } from '../src/i18n';
import { colors } from '../src/theme';
import { Loading } from '../src/components/ui';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // The client already falls back to its own cache on failure, so retrying
      // hard here only delays showing the user something.
      retry: 1,
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    },
  },
});

export default function RootLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void (async () => {
      await Promise.all([initI18n(), loadToken()]);
      setReady(true);
    })();
  }, []);

  if (!ready) return <Loading />;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <I18nextProvider i18n={i18n}>
          <QueryClientProvider client={queryClient}>
            <StatusBar style="light" />
            <Stack
              screenOptions={{
                headerStyle: { backgroundColor: colors.background },
                headerTintColor: colors.text,
                headerTitleStyle: { fontWeight: '600' },
                contentStyle: { backgroundColor: colors.background },
                headerShadowVisible: false,
              }}
            >
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="artist/[slug]" options={{ title: '', headerTransparent: true }} />
              <Stack.Screen name="event/[slug]" options={{ title: '', headerTransparent: true }} />
              <Stack.Screen
                name="onboarding"
                options={{ headerShown: false, gestureEnabled: false }}
              />
              <Stack.Screen name="settings/index" options={{ title: 'Settings' }} />
              <Stack.Screen name="settings/notifications" options={{ title: 'Notifications' }} />
              <Stack.Screen name="settings/privacy" options={{ title: 'Privacy' }} />
              <Stack.Screen name="settings/language" options={{ title: 'Language' }} />
            </Stack>
          </QueryClientProvider>
        </I18nextProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
