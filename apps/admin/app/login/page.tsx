import { redirect } from 'next/navigation';
import { operatorsConfigured } from '../../lib/operators';
import { getOperator } from '../../lib/session';
import { SignInForm } from './form';

export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  if (await getOperator()) redirect('/');
  const { next } = await searchParams;

  return (
    <div className="login-wrap">
      <h2>Sign in to Onstage admin</h2>
      {operatorsConfigured() ? (
        <SignInForm next={next ?? '/'} />
      ) : (
        <div className="error">
          No operator accounts are configured. Set ADMIN_USERS (see .env.example) and restart.
        </div>
      )}
    </div>
  );
}
