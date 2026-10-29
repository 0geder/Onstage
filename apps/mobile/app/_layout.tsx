import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { I18nextProvider } from 'react-i18next';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { apiConfigured, clearLegacyToken } from '../src/api/client';
import i18n, { initI18n } from '../src/i18n';
import { firebaseConfigured } from '../src/lib/firebase';
import { subscribeToAuthChanges } from '../src/lib/auth';
import { syncPushToken, useNotificationRouting } from '../src/lib/push';
import { colors } from '../src/theme';
import { Button, EmptyState, Loading, Screen } from '../src/components/ui';

/** Mounted beside the navigator so a cold-start notification tap has somewhere to go. */
function NotificationRoutes() {
  useNotificationRouting();
  return null;
}

/**
 * Last line of defence: any render error below the root lands here instead of
 * a white screen. Rendered outside the providers, so it uses i18n directly.
 */
export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  return (
    <Screen>
      <EmptyState
        title={i18n.t('common.crashTitle')}
        body={i18n.t('common.crashBody')}
        action={<Button label={i18n.t('common.retry')} onPress={() => void retry()} />}
      />
    </Screen>
  );
}

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
      await Promise.all([initI18n(), clearLegacyToken()]);
      setReady(true);
    })();
  }, []);

  // Connects the API client to Firebase's session for the lifetime of the app
  // — sign-in, sign-out and the hourly token refresh all flow through this one
  // subscription rather than being handled per screen.
  useEffect(() => {
    if (!firebaseConfigured) return undefined;
    let lastUid: string | null = null;
    const unsubscribe = subscribeToAuthChanges((user) => {
      void queryClient.invalidateQueries({ queryKey: ['me'] });
      // Token refreshes also fire this; only a new sign-in needs re-registering.
      if (user && user.uid !== lastUid) void syncPushToken();
      lastUid = user?.uid ?? null;
    });
    return unsubscribe;
  }, []);

  if (!ready) return <Loading />;

  if (!apiConfigured) {
    return (
      <Screen>
        <EmptyState title={i18n.t('common.setupTitle')} body={i18n.t('common.setupBody')} />
      </Screen>
    );
  }

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
              <Stack.Screen name="auth/sign-in" options={{ title: '' }} />
              <Stack.Screen name="auth/sign-up" options={{ title: '' }} />
              <Stack.Screen name="settings/index" options={{ title: 'Settings' }} />
              <Stack.Screen name="settings/notifications" options={{ title: 'Notifications' }} />
              <Stack.Screen name="settings/privacy" options={{ title: 'Privacy' }} />
              <Stack.Screen name="settings/language" options={{ title: 'Language' }} />
            </Stack>
            <NotificationRoutes />
          </QueryClientProvider>
        </I18nextProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
