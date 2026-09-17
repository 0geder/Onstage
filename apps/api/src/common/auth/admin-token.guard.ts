import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

/**
 * Guards the admin CMS endpoints with a shared token.
 *
 * The CMS is a server-side Next.js app holding the token in its own environment,
 * so this never reaches a browser. Human moderators additionally sign in and are
 * checked by AdminGuard; this token authenticates the CMS process itself.
 */
@Injectable()
export class AdminTokenGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.get<string>('adminApiToken') ?? '';
    if (!expected || expected === 'change-me-in-every-environment') {
      throw new UnauthorizedException('ADMIN_API_TOKEN is not configured.');
    }

    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers.authorization ?? '';
    const provided = header.startsWith('Bearer ') ? header.slice(7).trim() : '';

    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException('Invalid admin token.');
    }
    return true;
  }
}
