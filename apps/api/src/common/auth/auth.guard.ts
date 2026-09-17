import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser } from './auth-user';
import { TokenVerifierService } from './token-verifier.service';
import { UserResolverService } from './user-resolver.service';

function bearer(request: Request): string | null {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token.length > 0 ? token : null;
}

/** Requires a valid token. Attaches the resolved user to the request. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly verifier: TokenVerifierService,
    private readonly users: UserResolverService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const token = bearer(request);
    if (!token) throw new UnauthorizedException('Sign in to continue.');

    request.user = await this.users.resolve(await this.verifier.verify(token));
    return true;
  }
}

/**
 * Attaches the user when a token is present and valid, and otherwise lets the
 * request through anonymously. Used on read endpoints that personalise their
 * response (viewerHasLiked, viewerAttendance) but must work signed out.
 */
@Injectable()
export class OptionalAuthGuard implements CanActivate {
  constructor(
    private readonly verifier: TokenVerifierService,
    private readonly users: UserResolverService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const token = bearer(request);
    if (!token) return true;

    try {
      request.user = await this.users.resolve(await this.verifier.verify(token));
    } catch {
      // A bad token on a public endpoint is treated as signed out, not as an error.
    }
    return true;
  }
}

/** Platform staff only. Sits behind AuthGuard. */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    if (!request.user?.isAdmin) {
      throw new UnauthorizedException('Administrator access required.');
    }
    return true;
  }
}
