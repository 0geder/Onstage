import { Link, useRouter } from 'expo-router';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  appleSignInAvailable,
  signInWithApple,
  signInWithEmail,
  signInWithGoogleIdToken,
} from '../../src/lib/auth';
import { firebaseConfigured } from '../../src/lib/firebase';
import { routeAfterAuth } from '../../src/lib/post-auth';
import { Button, Divider, Screen } from '../../src/components/ui';
import { colors, radii, spacing, typography } from '../../src/theme';

// Required once per app so a browser-based OAuth redirect resolves back into
// the app instead of leaving the browser tab open.
WebBrowser.maybeCompleteAuthSession();

export default function SignInScreen() {
  const { t } = useTranslation();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Browser-based OAuth: works in Expo Go and a dev client alike, unlike
  // native Google Sign-In, which would need its own custom dev client build.
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    // No redirectUri override: Google only accepts the platform's own scheme
    // for native clients (the package name on Android, the reversed iOS client
    // ID on iOS), which the provider derives itself. Both schemes are
    // registered in app.config.js.
  });

  useEffect(() => {
    if (response?.type !== 'success') return;
    const idToken = response.params.id_token;
    if (!idToken) return;

    setBusy(true);
    signInWithGoogleIdToken(idToken)
      .then(() => routeAfterAuth(router))
      .catch((err) => setError((err as Error).message))
      .finally(() => setBusy(false));
    // response is a new object each auth attempt; router is stable from expo-router.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [response]);

  const submitEmail = async () => {
    setError(null);
    setBusy(true);
    try {
      await signInWithEmail(email.trim(), password);
      await routeAfterAuth(router);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const submitApple = async () => {
    setError(null);
    setBusy(true);
    try {
      await signInWithApple();
      await routeAfterAuth(router);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!firebaseConfigured) {
    return (
      <Screen>
        <View style={styles.content}>
          <Text style={styles.title}>{t('auth.notConfiguredTitle')}</Text>
          <Text style={styles.body}>{t('auth.notConfiguredBody')}</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{t('auth.signInTitle')}</Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder={t('auth.email')}
          placeholderTextColor={colors.textFaint}
          style={styles.input}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          accessibilityLabel={t('auth.email')}
        />
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder={t('auth.password')}
          placeholderTextColor={colors.textFaint}
          style={styles.input}
          secureTextEntry
          autoComplete="password"
          accessibilityLabel={t('auth.password')}
        />

        <Button
          label={t('auth.signIn')}
          onPress={() => void submitEmail()}
          loading={busy}
          disabled={!email || !password}
        />

        <View style={styles.dividerRow}>
          <Divider />
          <Text style={styles.dividerLabel}>{t('auth.orContinueWith')}</Text>
          <Divider />
        </View>

        <Button
          label={t('auth.continueWithGoogle')}
          variant="secondary"
          onPress={() => void promptAsync()}
          disabled={!request || busy}
        />

        {appleSignInAvailable() ? (
          <Button
            label={t('auth.continueWithApple')}
            variant="secondary"
            onPress={() => void submitApple()}
            disabled={busy}
          />
        ) : null}

        <Link href="/auth/sign-up" style={styles.link}>
          {t('auth.needAccount')}
        </Link>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.xl, gap: spacing.md },
  title: { ...typography.display, color: colors.text, marginBottom: spacing.sm },
  body: { ...typography.body, color: colors.textMuted, lineHeight: 22 },
  input: {
    minHeight: 48,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    color: colors.text,
    ...typography.body,
  },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginVertical: spacing.sm },
  dividerLabel: { ...typography.caption, color: colors.textFaint },
  error: {
    ...typography.caption,
    color: colors.statusCancelled,
    backgroundColor: colors.warningSurface,
    padding: spacing.md,
    borderRadius: radii.sm,
  },
  link: { ...typography.body, color: colors.accent, textAlign: 'center', marginTop: spacing.md },
});
