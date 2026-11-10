import { assertProductionConfig, productionConfigProblems } from './production-checks';

function prodEnv(overrides: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://onstage:s3cure-Pa55@postgres:5432/onstage?schema=public',
    FIREBASE_PROJECT_ID: 'onstage-prod',
    FIREBASE_CLIENT_EMAIL: 'sa@onstage-prod.iam.gserviceaccount.com',
    FIREBASE_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n',
    ...overrides,
  };
}

describe('worker productionConfigProblems', () => {
  it('checks nothing outside production', () => {
    expect(productionConfigProblems({ NODE_ENV: 'development' })).toEqual([]);
    expect(productionConfigProblems({})).toEqual([]);
  });

  it('accepts a complete production environment', () => {
    expect(productionConfigProblems(prodEnv())).toEqual([]);
  });

  it.each([
    ['DATABASE_URL', { DATABASE_URL: undefined }],
    ['DATABASE_URL', { DATABASE_URL: 'postgresql://onstage:onstage@localhost:5432/onstage' }],
    ['FIREBASE_PROJECT_ID', { FIREBASE_PROJECT_ID: '' }],
    ['FIREBASE_CLIENT_EMAIL', { FIREBASE_CLIENT_EMAIL: undefined }],
    ['FIREBASE_PRIVATE_KEY', { FIREBASE_PRIVATE_KEY: undefined }],
  ])('flags %s (%j)', (name, overrides) => {
    const problems = productionConfigProblems(prodEnv(overrides));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(name);
  });

  it('throws naming the variable without its value', () => {
    const leaked = 'postgresql://onstage:onstage@db:5432/onstage';
    expect(() => assertProductionConfig(prodEnv({ DATABASE_URL: leaked }))).toThrow(/DATABASE_URL/);
    expect(() => assertProductionConfig(prodEnv({ DATABASE_URL: leaked }))).not.toThrow(leaked);
  });
});
