import { BadGatewayException, BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { generateKeyPairSync, verify } from 'node:crypto';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { AppleConfig } from '../../config/configuration';
import {
  APPLE_AUDIENCE,
  AppleTokenError,
  appleClientSecret,
  exchangeAppleAuthorizationCode,
} from './apple-sign-in';
import { AppleSignInService } from './apple-sign-in.service';

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });

const apple: AppleConfig = {
  teamId: 'TEAM123456',
  keyId: 'KEY1234567',
  privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  clientId: 'za.co.onstage',
};

function decode(part: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as Record<string, unknown>;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('appleClientSecret', () => {
  it('is an ES256 JWT with the claims Apple requires, verifiable with the key', () => {
    const now = new Date('2026-11-10T12:00:00Z');
    const jwt = appleClientSecret(apple, now);
    const [header, payload, signature] = jwt.split('.');

    expect(decode(header)).toEqual({ alg: 'ES256', kid: 'KEY1234567', typ: 'JWT' });
    const iat = Math.floor(now.getTime() / 1000);
    expect(decode(payload)).toEqual({
      iss: 'TEAM123456',
      iat,
      exp: iat + 300,
      aud: APPLE_AUDIENCE,
      sub: 'za.co.onstage',
    });

    const raw = Buffer.from(signature, 'base64url');
    expect(raw).toHaveLength(64); // JWS r||s, not DER
    const valid = verify(
      'sha256',
      Buffer.from(`${header}.${payload}`),
      { key: publicKey, dsaEncoding: 'ieee-p1363' },
      raw,
    );
    expect(valid).toBe(true);
  });

  it('fails verification against a different key', () => {
    const other = generateKeyPairSync('ec', { namedCurve: 'P-256' }).publicKey;
    const [header, payload, signature] = appleClientSecret(apple).split('.');
    const valid = verify(
      'sha256',
      Buffer.from(`${header}.${payload}`),
      { key: other, dsaEncoding: 'ieee-p1363' },
      Buffer.from(signature, 'base64url'),
    );
    expect(valid).toBe(false);
  });
});

describe('exchangeAppleAuthorizationCode', () => {
  it('posts the code as a form and returns the refresh token', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      jsonResponse(200, { access_token: 'a', refresh_token: 'r-token', id_token: 'i' }),
    );

    await expect(exchangeAppleAuthorizationCode(apple, 'the-code', fetchMock)).resolves.toBe('r-token');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://appleid.apple.com/auth/token');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe(
      'application/x-www-form-urlencoded',
    );
    const form = new URLSearchParams(init.body as string);
    expect(form.get('grant_type')).toBe('authorization_code');
    expect(form.get('code')).toBe('the-code');
    expect(form.get('client_id')).toBe('za.co.onstage');
    expect(form.get('client_secret')?.split('.')).toHaveLength(3);
  });

  it("surfaces Apple's error code", async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(400, { error: 'invalid_grant' }));
    const error = await exchangeAppleAuthorizationCode(apple, 'used', fetchMock).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppleTokenError);
    expect(error).toMatchObject({ code: 'invalid_grant', status: 400 });
  });

  it('rejects a success with no refresh token', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200, { access_token: 'a' }));
    await expect(exchangeAppleAuthorizationCode(apple, 'c', fetchMock)).rejects.toBeInstanceOf(
      AppleTokenError,
    );
  });
});

describe('AppleSignInService', () => {
  function setup(config: AppleConfig | null) {
    const prisma = { appleCredential: { upsert: jest.fn().mockResolvedValue({}) } };
    const configService = { get: jest.fn().mockReturnValue(config) };
    const service = new AppleSignInService(
      prisma as unknown as PrismaService,
      configService as unknown as ConfigService,
    );
    return { prisma, service };
  }

  it('does nothing when Apple is not configured', async () => {
    const { prisma, service } = setup(null);
    const fetchMock = jest.fn();
    await expect(service.storeAuthorization('user-1', 'code-1234', fetchMock)).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(prisma.appleCredential.upsert).not.toHaveBeenCalled();
  });

  it('stores the refresh token against the user', async () => {
    const { prisma, service } = setup(apple);
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200, { refresh_token: 'r-token' }));
    await expect(service.storeAuthorization('user-1', 'code-1234', fetchMock)).resolves.toBe(true);
    expect(prisma.appleCredential.upsert).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      create: { userId: 'user-1', refreshToken: 'r-token' },
      update: { refreshToken: 'r-token' },
    });
  });

  it('answers 400 for a code Apple rejects and 502 when Apple is unreachable', async () => {
    const { prisma, service } = setup(apple);
    const rejected = jest.fn().mockResolvedValue(jsonResponse(400, { error: 'invalid_grant' }));
    await expect(service.storeAuthorization('user-1', 'code-1234', rejected)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    const down = jest.fn().mockRejectedValue(new Error('ECONNRESET'));
    await expect(service.storeAuthorization('user-1', 'code-1234', down)).rejects.toBeInstanceOf(
      BadGatewayException,
    );
    expect(prisma.appleCredential.upsert).not.toHaveBeenCalled();
  });
});
