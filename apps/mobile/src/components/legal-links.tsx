import * as WebBrowser from 'expo-web-browser';
import { StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors, typography } from '../theme';

const WEB_BASE = process.env.EXPO_PUBLIC_WEB_BASE_URL ?? 'https://onstage.co.za';

/** The terms and privacy policy, shown wherever an account can be created. */
export function LegalLinks() {
  const { t } = useTranslation();
  const open = (path: string) => void WebBrowser.openBrowserAsync(`${WEB_BASE}/${path}`);

  return (
    <Text style={styles.text}>
      {t('auth.agreement')}{'\n'}
      <Text style={styles.link} accessibilityRole="link" onPress={() => open('terms')}>
        {t('privacy.terms')}
      </Text>
      {'  ·  '}
      <Text style={styles.link} accessibilityRole="link" onPress={() => open('privacy')}>
        {t('privacy.policy')}
      </Text>
    </Text>
  );
}

const styles = StyleSheet.create({
  text: { ...typography.caption, color: colors.textFaint, textAlign: 'center', lineHeight: 18 },
  link: { color: colors.textMuted, textDecorationLine: 'underline' },
});
