/**
 * Build-time config layered over app.json.
 *
 * Anything that differs per environment or must not be committed comes from
 * environment variables here — locally from the repo's .env, on EAS from the
 * build profile in eas.json or the project's EAS secrets.
 */
const { withAndroidManifest } = require('expo/config-plugins');

// Android 11+ hides other apps unless they are declared here, so without this
// canOpenURL('bolt://…') is always false and every ride button opens the web.
const OUTBOUND_SCHEMES = ['uber', 'bolt', 'indriver', 'comgooglemaps', 'spotify'];

const withOutboundAppQueries = (config) =>
  withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    const queries = (manifest.queries ??= [{}])[0];
    queries.intent = [
      ...(queries.intent ?? []),
      ...OUTBOUND_SCHEMES.map((scheme) => ({
        action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
        data: [{ $: { 'android:scheme': scheme } }],
      })),
    ];
    return cfg;
  });

module.exports = ({ config }) => {
  const projectId = process.env.EAS_PROJECT_ID;

  // Google sign-in returns to the app on the platform's own scheme: the
  // package name on Android, the reversed iOS client ID on iOS.
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  const googleIosScheme = iosClientId
    ? `com.googleusercontent.apps.${iosClientId.replace('.apps.googleusercontent.com', '')}`
    : null;
  const schemes = [config.scheme, config.android?.package, googleIosScheme].filter(Boolean);

  // Native crash capture, and source map upload on EAS when SENTRY_AUTH_TOKEN
  // is set. Without the token the build still succeeds, just unmapped.
  const sentryPlugin = [
    '@sentry/react-native/expo',
    {
      organization: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT_MOBILE ?? process.env.SENTRY_PROJECT,
    },
  ];

  return withOutboundAppQueries({
    ...config,
    plugins: [...(config.plugins ?? []), sentryPlugin],
    scheme: [...new Set(schemes)],
    ...(process.env.EXPO_OWNER ? { owner: process.env.EXPO_OWNER } : {}),
    extra: {
      ...config.extra,
      // Needed for Expo push tokens. Filled in by `eas init`, or set EAS_PROJECT_ID.
      ...(projectId ? { eas: { projectId } } : {}),
    },
  });
};
