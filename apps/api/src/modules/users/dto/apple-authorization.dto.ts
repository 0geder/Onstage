import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class AppleAuthorizationDto {
  @ApiProperty({
    description:
      'The one-time authorizationCode from the Sign in with Apple credential. Valid for five minutes, single use.',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(1024)
  authorizationCode!: string;
}
