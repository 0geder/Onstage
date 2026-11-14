import { generateKeyPairSync, verify } from 'node:crypto';
import { APPLE_AUDIENCE, appleClientSecret, revokeAppleRefreshToken, type AppleCredentials } from './apple';

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });

const credentials: AppleCredentials = {
  teamId: 'TEAM123456',
  keyId: 'KEY1234567',
  privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  clientId: 'za.co.onstage',
};

describe('appleClientSecret', () => {
  it('signs ES256 with the claims Apple requires', () => {
    const [header, payload, signature] = appleClientSecret(credentials).split('.');
    expect(JSON.parse(Buffer.from(header, 'base64url').toString())).toMatchObject({
      alg: 'ES256',
      kid: 'KEY1234567',
    });
    expect(JSON.parse(Buffer.from(payload, 'base64url').toString())).toMatchObject({
      iss: 'TEAM123456',
      aud: APPLE_AUDIENCE,
      sub: 'za.co.onstage',
    });
    expect(
      verify(
        'sha256',
        Buffer.from(`${header}.${payload}`),
        { key: publicKey, dsaEncoding: 'ieee-p1363' },
        Buffer.from(signature, 'base64url'),
      ),
    ).toBe(true);
  });
});

describe('revokeAppleRefreshToken', () => {
  it('posts the refresh token to /auth/revoke', async () => {
    const fetchMock = jest.fn().mockResolvedValue(new Response(null, { status: 200 }));
    await revokeAppleRefreshToken(credentials, 'r-token', fetchMock);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://appleid.apple.com/auth/revoke');
    expect(init.method).toBe('POST');
    const form = new URLSearchParams(init.body as string);
    expect(form.get('token')).toBe('r-token');
    expect(form.get('token_type_hint')).toBe('refresh_token');
    expect(form.get('client_id')).toBe('za.co.onstage');
    expect(form.get('client_secret')?.split('.')).toHaveLength(3);
  });

  it("throws with Apple's error code on failure", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ error: 'invalid_client' }), { status: 400 }));
    await expect(revokeAppleRefreshToken(credentials, 'r-token', fetchMock)).rejects.toThrow(
      /400 invalid_client/,
    );
  });
});
