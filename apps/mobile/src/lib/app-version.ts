import * as Application from 'expo-application';
import Constants from 'expo-constants';

/**
 * What build this is, read from the installed binary rather than the JS
 * config: on store builds EAS sets the build number at build time, and only
 * the native side knows it. The commit pins a bug report to exact code.
 */
export const appVersion = Application.nativeApplicationVersion ?? Constants.expoConfig?.version;
export const appBuild = Application.nativeBuildVersion;
export const appCommit = (Constants.expoConfig?.extra?.commit as string | undefined) ?? null;

/** "0.2.0 (31) · 22c6383" */
export function versionLabel(): string {
  const build = appBuild ? ` (${appBuild})` : '';
  const commit = appCommit ? ` · ${appCommit}` : '';
  return `${appVersion ?? '?'}${build}${commit}`;
}

/** The Sentry release name: one per store build, matching uploaded source maps. */
export const sentryRelease =
  appVersion && appBuild ? `za.co.onstage@${appVersion}+${appBuild}` : appVersion;
