import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { request } from '../api/client';

/**
 * Push notifications.
 *
 * Devices register an Expo push token with the API (`/me/push-tokens`); the
 * worker delivers through the Expo push service, which fronts APNs and FCM.
 * Permission is only ever requested from an explicit user action (onboarding,
 * privacy settings) — on every other path we register silently if the OS
 * permission already exists, and do nothing otherwise.
 */

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const projectId: string | undefined =
  (Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)?.projectId ??
  Constants.easConfig?.projectId;

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Shows and reminders',
    importance: AndroidImportance.DEFAULT,
  });
}

async function currentToken(): Promise<string | null> {
  // Simulators and emulators without Play services cannot receive pushes, and
  // without an EAS project id there is no Expo token to issue.
  if (!Device.isDevice || !projectId) return null;
  try {
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    return data;
  } catch {
    return null;
  }
}

async function register(): Promise<boolean> {
  const token = await currentToken();
  if (!token) return false;
  await request('/me/push-tokens', {
    method: 'POST',
    body: { token, platform: Platform.OS },
  });
  return true;
}

/**
 * Asks for permission (if not yet decided) and registers this device.
 * Returns whether the device can now receive pushes.
 */
export async function enablePush(): Promise<boolean> {
  await ensureAndroidChannel();
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') {
    ({ status } = await Notifications.requestPermissionsAsync());
  }
  if (status !== 'granted') return false;
  return register().catch(() => false);
}

/** Re-registers on sign-in / app start when permission already exists. Never prompts. */
export async function syncPushToken(): Promise<void> {
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') return;
  await ensureAndroidChannel();
  await register().catch(() => undefined);
}

/** Stops pushes to this device for the signed-in account. */
export async function unregisterPushToken(): Promise<void> {
  const token = await currentToken();
  if (!token) return;
  await request('/me/push-tokens', { method: 'DELETE', body: { token, platform: Platform.OS } }).catch(
    () => undefined,
  );
}

/** Opens the screen a notification points at — on tap, including from a cold start. */
export function useNotificationRouting(): void {
  const router = useRouter();

  useEffect(() => {
    const open = (response: Notifications.NotificationResponse | null) => {
      const url = response?.notification.request.content.data?.url;
      if (typeof url === 'string' && url.startsWith('/')) router.push(url as never);
    };

    void Notifications.getLastNotificationResponseAsync().then(open);
    const subscription = Notifications.addNotificationResponseReceivedListener(open);
    return () => subscription.remove();
  }, [router]);
}
