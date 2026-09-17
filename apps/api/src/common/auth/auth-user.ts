import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** The resolved Onstage user attached to a request by the auth guards. */
export interface AuthUser {
  id: string;
  handle: string;
  displayName: string;
  email: string;
  isAdmin: boolean;
  createdAt: Date;
  bannedAt: Date | null;
}

export interface RequestWithUser extends Request {
  user?: AuthUser;
}

/** `@CurrentUser() user: AuthUser` — guaranteed present behind AuthGuard. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser | undefined => {
    const request = ctx.switchToHttp().getRequest<{ user?: AuthUser }>();
    return request.user;
  },
);

export function accountAgeHours(user: Pick<AuthUser, 'createdAt'>, now = new Date()): number {
  return (now.getTime() - user.createdAt.getTime()) / 3_600_000;
}
