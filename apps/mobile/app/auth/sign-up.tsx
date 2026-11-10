import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { useTranslation } from 'react-i18next';
import { signUpWithEmail } from '../../src/lib/auth';
import { firebaseConfigured } from '../../src/lib/firebase';
import { routeAfterAuth } from '../../src/lib/post-auth';
import { LegalLinks } from '../../src/components/legal-links';
import { Button, Screen } from '../../src/components/ui';
import { colors, radii, spacing, typography } from '../../src/theme';

/**
 * Email/password sign-up.
 *
 * Google and Apple are one-tap and create an account implicitly on first use,
 * so they live on the sign-in screen rather than being duplicated here — this
 * screen exists only for the email/password path, which needs its own fields.
 */
export default function SignUpScreen() {
  const { t } = useTranslation();
  const router = useRouter();

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      await signUpWithEmail(email.trim(), password, displayName);
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
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>{t('auth.notConfiguredTitle')}</Text>
          <Text style={styles.body}>{t('auth.notConfiguredBody')}</Text>
        </ScrollView>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{t('auth.signUpTitle')}</Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TextInput
          value={displayName}
          onChangeText={setDisplayName}
          placeholder={t('auth.displayName')}
          placeholderTextColor={colors.textFaint}
          style={styles.input}
          autoComplete="name"
          accessibilityLabel={t('auth.displayName')}
        />
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
          autoComplete="password-new"
          accessibilityLabel={t('auth.password')}
        />
        <Text style={styles.hint}>{t('auth.passwordHint')}</Text>

        <Button
          label={t('auth.signUp')}
          onPress={() => void submit()}
          loading={busy}
          disabled={!email || password.length < 6}
        />

        <Link href="/auth/sign-in" style={styles.link}>
          {t('auth.haveAccount')}
        </Link>

        <LegalLinks />
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
  hint: { ...typography.caption, color: colors.textFaint, marginTop: -spacing.sm },
  error: {
    ...typography.caption,
    color: colors.statusCancelled,
    backgroundColor: colors.warningSurface,
    padding: spacing.md,
    borderRadius: radii.sm,
  },
  link: { ...typography.body, color: colors.accent, textAlign: 'center', marginTop: spacing.md },
});
