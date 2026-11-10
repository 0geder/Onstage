/**
 * Refuses to start a production worker that is missing what its jobs need.
 * Problems are reported by variable name only — never a value — since startup
 * errors land in container logs and Sentry. Outside NODE_ENV=production this
 * checks nothing.
 */

const DEV_DATABASE_PASSWORDS = new Set(['onstage', 'postgres', 'password', 'changeme']);

type Env = Record<string, string | undefined>;

function blank(value: string | undefined): boolean {
  return !value || value.trim() === '';
}

export function productionConfigProblems(env: Env): string[] {
  if (env.NODE_ENV !== 'production') return [];
  const problems: string[] = [];

  if (blank(env.DATABASE_URL)) {
    problems.push('DATABASE_URL is not set.');
  } else {
    let password: string | null;
    try {
      password = decodeURIComponent(new URL(env.DATABASE_URL!).password);
    } catch {
      password = null;
    }
    if (password === null) problems.push('DATABASE_URL is not a valid connection URL.');
    else if (password === '' || DEV_DATABASE_PASSWORDS.has(password)) {
      problems.push('DATABASE_URL has an empty or development database password.');
    }
  }

  // Account deletion (POPIA) must remove the Firebase sign-in too; without
  // these it would quietly delete only the database rows.
  for (const name of ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY']) {
    if (blank(env[name])) problems.push(`${name} is not set.`);
  }

  return problems;
}

/** Throws one error naming every missing or unsafe variable. */
export function assertProductionConfig(env: Env = process.env): void {
  const problems = productionConfigProblems(env);
  if (problems.length > 0) {
    throw new Error(
      `Refusing to start: production configuration is incomplete.\n  - ${problems.join('\n  - ')}`,
    );
  }
}
