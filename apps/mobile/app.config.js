/**
 * Build-time config layered over app.json.
 *
 * Anything that differs per environment or must not be committed comes from
 * environment variables here — locally from the repo's .env, on EAS from the
 * build profile in eas.json or the project's EAS secrets.
 */
module.exports = ({ config }) => {
  const projectId = process.env.EAS_PROJECT_ID;

  return {
    ...config,
    ...(process.env.EXPO_OWNER ? { owner: process.env.EXPO_OWNER } : {}),
    android: {
      ...config.android,
      config: {
        ...config.android?.config,
        // react-native-maps renders Google Maps on Android, which needs a key;
        // iOS uses Apple Maps and needs none.
        googleMaps: { apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY ?? '' },
      },
    },
    extra: {
      ...config.extra,
      // Needed for Expo push tokens. Filled in by `eas init`, or set EAS_PROJECT_ID.
      ...(projectId ? { eas: { projectId } } : {}),
    },
  };
};
