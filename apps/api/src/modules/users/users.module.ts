import { Module } from '@nestjs/common';
import { ConsentModule } from '../consent/consent.module';
import { AppleSignInService } from './apple-sign-in.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [ConsentModule],
  controllers: [UsersController],
  providers: [UsersService, AppleSignInService],
  exports: [UsersService],
})
export class UsersModule {}
