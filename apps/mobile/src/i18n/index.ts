import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { SUPPORTED_LOCALES, isSupportedLocale, type Locale } from '@onstage/shared';

import af from './locales/af.json';
import en from './locales/en.json';
import zu from './locales/zu.json';

/**
 * Interface languages.
 *
 * English, isiZulu and Afrikaans. Adding a fourth is a JSON file and one line
 * here — no component changes — which is the whole reason for going through a
 * library rather than hard-coding strings.
 *
 * English is the fallback, so a translation file that is incomplete or still
 * under review renders English for the missing keys instead of showing a raw
 * key to the user.
 */

const STORAGE_KEY = 'onstage:locale';

export const resources = {
  en: { translation: en },
  zu: { translation: zu },
  af: { translation: af },
} as const;

/** The first device language Onstage actually supports, else English. */
function deviceLocale(): Locale {
  for (const locale of getLocales()) {
    const code = locale.languageCode ?? '';
    if (isSupportedLocale(code)) return code;
  }
  return 'en';
}

export async function initI18n(): Promise<typeof i18n> {
  const stored = await AsyncStorage.getItem(STORAGE_KEY).catch(() => null);
  const initial = stored && isSupportedLocale(stored) ? stored : deviceLocale();

  await i18n.use(initReactI18next).init({
    resources,
    lng: initial,
    fallbackLng: 'en',
    supportedLngs: [...SUPPORTED_LOCALES],
    // React Native has no Intl.PluralRules on older engines; i18next's own
    // plural resolution is used instead, hence the _one/_other key suffixes.
    interpolation: { escapeValue: false },
    returnNull: false,
    // A key that exists but is empty should fall back, not render blank.
    returnEmptyString: false,
  });

  return i18n;
}

export async function setLocale(locale: Locale): Promise<void> {
  await i18n.changeLanguage(locale);
  await AsyncStorage.setItem(STORAGE_KEY, locale).catch(() => undefined);
}

export function currentLocale(): Locale {
  const language = i18n.language?.split('-')[0] ?? 'en';
  return isSupportedLocale(language) ? language : 'en';
}

export default i18n;
