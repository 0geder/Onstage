/**
 * iOS Universal Links verification.
 *
 * iOS fetches this (no file extension, served as JSON) before letting the
 * Onstage app open onstage.co.za/event and /artist links — the
 * `applinks:onstage.co.za` associated domain in the mobile app.json.
 * APPLE_TEAM_ID is the 10-character Team ID from the Apple Developer account.
 */
// Read at request time: the IDs come from the runtime environment, not the build.
export const dynamic = 'force-dynamic';

export function GET() {
  const teamId = process.env.APPLE_TEAM_ID;
  const bundleId = process.env.IOS_BUNDLE_ID ?? 'za.co.onstage';

  return Response.json({
    applinks: {
      details: teamId
        ? [
            {
              appIDs: [`${teamId}.${bundleId}`],
              components: [{ '/': '/event/*' }, { '/': '/artist/*' }],
            },
          ]
        : [],
    },
  });
}
