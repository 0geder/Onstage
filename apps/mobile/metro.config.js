// Sentry's wrapper around Expo's default Metro config: the same bundling, plus
// debug ids so crash reports from release builds map back to real source lines.
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

module.exports = getSentryExpoConfig(__dirname);
