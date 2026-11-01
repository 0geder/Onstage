import { ApiProperty } from '@nestjs/swagger';
import { LIVESTREAM_PLATFORMS } from '@onstage/shared';
import type { LivestreamLinks } from '@onstage/shared';
import { IsObject } from 'class-validator';
import { IsLinkMap } from '../../../common/validation/link-map.validator';

export class SetLivestreamsDto {
  @ApiProperty({
    description: `Replaces the whole map; {} removes every link. Keys: ${LIVESTREAM_PLATFORMS.join(', ')}.`,
    example: { youtube: 'https://www.youtube.com/watch?v=…' },
  })
  @IsObject()
  @IsLinkMap(LIVESTREAM_PLATFORMS)
  links!: LivestreamLinks;
}
