import { assertProductionConfig, productionConfigProblems } from './production-checks';

const SECRET = 'a'.repeat(64);

/** A complete production environment; each test breaks one thing. */
function prodEnv(overrides: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://onstage:s3cure-Pa55@postgres:5432/onstage?schema=public',
    REDIS_URL: 'redis://:r3dis@redis:6379',
    AUTH_MODE: 'firebase',
    FIREBASE_PROJECT_ID: 'onstage-prod',
    FIREBASE_CLIENT_EMAIL: 'sa@onstage-prod.iam.gserviceaccount.com',
    FIREBASE_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n',
    ADMIN_API_TOKEN: SECRET,
    CORS_ORIGINS: 'https://onstage.co.za,https://admin.onstage.co.za',
    TRUST_PROXY: '1',
    ...overrides,
  };
}

describe('productionConfigProblems', () => {
  it('checks nothing outside production, so .env.example keeps working', () => {
    expect(productionConfigProblems({ NODE_ENV: 'development', AUTH_MODE: 'dev' })).toEqual([]);
    expect(productionConfigProblems({ NODE_ENV: 'test' })).toEqual([]);
    expect(productionConfigProblems({})).toEqual([]);
  });

  it('accepts a complete production environment', () => {
    expect(productionConfigProblems(prodEnv())).toEqual([]);
    expect(productionConfigProblems(prodEnv({ AUTH_MODE: undefined }))).toEqual([]);
  });

  it.each([
    ['DATABASE_URL', { DATABASE_URL: undefined }],
    ['DATABASE_URL', { DATABASE_URL: 'postgresql://onstage:onstage@localhost:5432/onstage' }],
    ['DATABASE_URL', { DATABASE_URL: 'postgresql://onstage@postgres:5432/onstage' }],
    ['DATABASE_URL', { DATABASE_URL: 'not a url' }],
    ['REDIS_URL', { REDIS_URL: '' }],
    ['AUTH_MODE', { AUTH_MODE: 'dev' }],
    ['AUTH_MODE', { AUTH_MODE: 'test' }],
    ['FIREBASE_PROJECT_ID', { FIREBASE_PROJECT_ID: undefined }],
    ['FIREBASE_CLIENT_EMAIL', { FIREBASE_CLIENT_EMAIL: ' ' }],
    ['FIREBASE_PRIVATE_KEY', { FIREBASE_PRIVATE_KEY: undefined }],
    ['FIREBASE_PRIVATE_KEY', { FIREBASE_PRIVATE_KEY: 'not-a-key' }],
    ['ADMIN_API_TOKEN', { ADMIN_API_TOKEN: undefined }],
    ['ADMIN_API_TOKEN', { ADMIN_API_TOKEN: 'change-me-in-every-environment' }],
    ['ADMIN_API_TOKEN', { ADMIN_API_TOKEN: 'short' }],
    ['HOWLER_WEBHOOK_TOKEN', { HOWLER_WEBHOOK_TOKEN: 'short' }],
    ['CORS_ORIGINS', { CORS_ORIGINS: undefined }],
    ['CORS_ORIGINS', { CORS_ORIGINS: '*' }],
    ['CORS_ORIGINS', { CORS_ORIGINS: 'https://onstage.co.za,http://localhost:3001' }],
    ['TRUST_PROXY', { TRUST_PROXY: undefined }],
  ])('flags %s (%j)', (name, overrides) => {
    const problems = productionConfigProblems(prodEnv(overrides));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(name);
  });

  it('treats Sign in with Apple as optional, but not half-configured', () => {
    const key = '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n';
    expect(productionConfigProblems(prodEnv({ APPLE_TEAM_ID: 'TEAM123456' }))).toEqual([]);
    expect(
      productionConfigProblems(
        prodEnv({ APPLE_TEAM_ID: 'TEAM123456', APPLE_KEY_ID: 'KEY1234567', APPLE_PRIVATE_KEY: key }),
      ),
    ).toEqual([]);

    const missingTeam = productionConfigProblems(prodEnv({ APPLE_KEY_ID: 'KEY1234567', APPLE_PRIVATE_KEY: key }));
    expect(missingTeam).toHaveLength(1);
    expect(missingTeam[0]).toContain('APPLE_TEAM_ID');

    const badKey = productionConfigProblems(
      prodEnv({ APPLE_TEAM_ID: 'TEAM123456', APPLE_KEY_ID: 'KEY1234567', APPLE_PRIVATE_KEY: 'nope' }),
    );
    expect(badKey).toEqual(['APPLE_PRIVATE_KEY does not look like a PEM private key.']);
  });

  it('reports every problem at once', () => {
    const problems = productionConfigProblems({ NODE_ENV: 'production' });
    for (const name of ['DATABASE_URL', 'REDIS_URL', 'FIREBASE_PROJECT_ID', 'ADMIN_API_TOKEN', 'CORS_ORIGINS', 'TRUST_PROXY']) {
      expect(problems.some((problem) => problem.includes(name))).toBe(true);
    }
  });
});

describe('assertProductionConfig', () => {
  it('names the variable but never echoes its value', () => {
    const leaked = 'postgresql://onstage:onstage@db:5432/onstage';
    let message = '';
    try {
      assertProductionConfig(prodEnv({ DATABASE_URL: leaked, ADMIN_API_TOKEN: 'tiny-secret' }));
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('DATABASE_URL');
    expect(message).toContain('ADMIN_API_TOKEN');
    expect(message).not.toContain(leaked);
    expect(message).not.toContain('tiny-secret');
  });

  it('passes a valid production environment', () => {
    expect(() => assertProductionConfig(prodEnv())).not.toThrow();
  });
});
