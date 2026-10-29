/**
 * Android App Links verification.
 *
 * Android fetches this before letting the Onstage app open onstage.co.za/event
 * and /artist links directly (the autoVerify intent filters in the mobile
 * app.json). ANDROID_CERT_SHA256 is the signing certificate fingerprint — from
 * `eas credentials` or Play Console → App integrity; comma-separate several
 * (e.g. upload key and Play app-signing key).
 */
// Read at request time: the IDs come from the runtime environment, not the build.
export const dynamic = 'force-dynamic';

export function GET() {
  const fingerprints = (process.env.ANDROID_CERT_SHA256 ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  const body = fingerprints.length
    ? [
        {
          relation: ['delegate_permission/common.handle_all_urls'],
          target: {
            namespace: 'android_app',
            package_name: process.env.ANDROID_PACKAGE ?? 'za.co.onstage',
            sha256_cert_fingerprints: fingerprints,
          },
        },
      ]
    : [];

  return Response.json(body);
}
