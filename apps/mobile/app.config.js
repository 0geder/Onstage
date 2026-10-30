/**
 * Build-time config layered over app.json.
 *
 * Anything that differs per environment or must not be committed comes from
 * environment variables here — locally from the repo's .env, on EAS from the
 * build profile in eas.json or the project's EAS secrets.
 */
module.exports = ({ config }) => {
  const projectId = process.env.EAS_PROJECT_ID;

  // Google sign-in returns to the app on the platform's own scheme: the
  // package name on Android, the reversed iOS client ID on iOS.
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  const googleIosScheme = iosClientId
    ? `com.googleusercontent.apps.${iosClientId.replace('.apps.googleusercontent.com', '')}`
    : null;
  const schemes = [config.scheme, config.android?.package, googleIosScheme].filter(Boolean);

  return {
    ...config,
    scheme: [...new Set(schemes)],
    ...(process.env.EXPO_OWNER ? { owner: process.env.EXPO_OWNER } : {}),
    extra: {
      ...config.extra,
      // Needed for Expo push tokens. Filled in by `eas init`, or set EAS_PROJECT_ID.
      ...(projectId ? { eas: { projectId } } : {}),
    },
  };
};
