import { Injectable, Logger, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/configuration';

export interface VerifiedToken {
  uid: string;
  email?: string;
  name?: string;
  picture?: string;
}

/**
 * Verifies bearer tokens.
 *
 * In `firebase` mode this is a real Firebase Admin ID-token verification. In
 * `dev` mode it accepts `dev:<uid>` so the app, the CMS and the seed fixtures
 * can be exercised without a Firebase project. Dev mode refuses to start unless
 * NODE_ENV is explicitly development or test.
 */
@Injectable()
export class TokenVerifierService implements OnModuleInit {
  private readonly logger = new Logger(TokenVerifierService.name);
  private readonly mode: 'dev' | 'firebase';
  private firebaseAuth: import('firebase-admin/auth').Auth | null = null;

  constructor(private readonly config: ConfigService) {
    this.mode = this.config.get<AppConfig['auth']>('auth')?.mode ?? 'firebase';
  }

  async onModuleInit(): Promise<void> {
    if (this.mode === 'dev') {
      // Allow-list, not deny-list: staging, a typo or an unset NODE_ENV in a
      // container must never end up accepting forgeable dev tokens.
      const nodeEnv = process.env.NODE_ENV;
      if (nodeEnv !== 'development' && nodeEnv !== 'test') {
        throw new Error(
          `AUTH_MODE=dev is only permitted when NODE_ENV is development or test (got "${nodeEnv ?? 'unset'}").`,
        );
      }
      this.logger.warn('AUTH_MODE=dev — bearer tokens of the form "dev:<uid>" are accepted.');
      return;
    }

    const credentials = this.config.get<AppConfig['auth']>('auth')?.firebase;
    if (!credentials?.projectId || !credentials.clientEmail || !credentials.privateKey) {
      throw new Error(
        'AUTH_MODE=firebase requires FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY.',
      );
    }

    const { initializeApp, getApps, cert } = await import('firebase-admin/app');
    const { getAuth } = await import('firebase-admin/auth');
    const app =
      getApps()[0] ??
      initializeApp({
        credential: cert({
          projectId: credentials.projectId,
          clientEmail: credentials.clientEmail,
          privateKey: credentials.privateKey,
        }),
      });
    this.firebaseAuth = getAuth(app);
    this.logger.log('Firebase Auth token verification enabled');
  }

  async verify(token: string): Promise<VerifiedToken> {
    if (this.mode === 'dev') {
      if (!token.startsWith('dev:')) {
        throw new UnauthorizedException('Expected a "dev:<uid>" token while AUTH_MODE=dev.');
      }
      const uid = token.slice(4).trim();
      if (!uid) throw new UnauthorizedException('Malformed dev token.');
      return { uid, email: `${uid}@dev.onstage.local`, name: uid };
    }

    if (!this.firebaseAuth) {
      throw new UnauthorizedException('Auth is not initialised.');
    }

    try {
      const decoded = await this.firebaseAuth.verifyIdToken(token, true);
      return {
        uid: decoded.uid,
        email: decoded.email,
        name: decoded.name as string | undefined,
        picture: decoded.picture,
      };
    } catch (error) {
      this.logger.debug(`Token rejected: ${(error as Error).message}`);
      throw new UnauthorizedException('Invalid or expired token.');
    }
  }
}
