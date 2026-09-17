import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

/**
 * `attended` is deliberately absent: it is applied after the show by the
 * worker, never claimed by the client, because it gates the live rating.
 */
export class SetAttendanceDto {
  @ApiProperty({ enum: ['interested', 'going'] })
  @IsIn(['interested', 'going'])
  state!: 'interested' | 'going';
}
