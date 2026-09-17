import { Global, Module } from '@nestjs/common';
import { AdminTokenGuard } from './admin-token.guard';
import { AdminGuard, AuthGuard, OptionalAuthGuard } from './auth.guard';
import { TokenVerifierService } from './token-verifier.service';
import { UserResolverService } from './user-resolver.service';

@Global()
@Module({
  providers: [
    TokenVerifierService,
    UserResolverService,
    AuthGuard,
    OptionalAuthGuard,
    AdminGuard,
    AdminTokenGuard,
  ],
  exports: [
    TokenVerifierService,
    UserResolverService,
    AuthGuard,
    OptionalAuthGuard,
    AdminGuard,
    AdminTokenGuard,
  ],
})
export class AuthModule {}
