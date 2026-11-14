import { BadGatewayException, BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/configuration';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AppleTokenError, exchangeAppleAuthorizationCode } from './apple-sign-in';

/**
 * Keeps each Apple user's refresh token so account deletion can revoke it.
 *
 * The token sits in its own table (apple_credentials), never selected by any
 * response or by the data export, and cascades away with the user. It is
 * stored as Apple issued it — the repo has no at-rest encryption helper yet;
 * the database volume's own encryption is what protects it. Its only power is
 * to mint access tokens for Sign in with Apple, which carry no scopes beyond
 * name and email.
 */
@Injectable()
export class AppleSignInService {
  private readonly logger = new Logger(AppleSignInService.name);
  private warnedUnconfigured = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Returns false (and does nothing) when Apple credentials are not configured. */
  async storeAuthorization(
    userId: string,
    authorizationCode: string,
    fetchImpl: typeof fetch = fetch,
  ): Promise<boolean> {
    const apple = this.config.get<AppConfig['apple']>('apple');
    if (!apple) {
      if (!this.warnedUnconfigured) {
        this.warnedUnconfigured = true;
        this.logger.warn(
          'APPLE_TEAM_ID / APPLE_KEY_ID / APPLE_PRIVATE_KEY are not set; Apple authorization codes are ' +
            'being ignored, so Apple tokens cannot be revoked on account deletion.',
        );
      }
      return false;
    }

    let refreshToken: string;
    try {
      refreshToken = await exchangeAppleAuthorizationCode(apple, authorizationCode, fetchImpl);
    } catch (error) {
      // Never log the code or any token — only Apple's error code.
      if (error instanceof AppleTokenError && error.status >= 400 && error.status < 500) {
        this.logger.warn(`Apple rejected an authorization code for user ${userId}: ${error.code ?? error.status}`);
        throw new BadRequestException('Apple did not accept that authorization code.');
      }
      this.logger.error(`Apple token exchange failed for user ${userId}: ${(error as Error).message}`);
      throw new BadGatewayException('Could not reach Apple. Try again later.');
    }

    await this.prisma.appleCredential.upsert({
      where: { userId },
      create: { userId, refreshToken },
      update: { refreshToken },
    });
    return true;
  }
}
