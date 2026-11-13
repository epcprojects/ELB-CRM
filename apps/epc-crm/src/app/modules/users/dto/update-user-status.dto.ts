import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateUserStatusDto {
  @ApiProperty({
    description:
      'true to (re)activate the account, false to deactivate it (blocks login and password reset).',
  })
  @IsBoolean()
  isActive: boolean;
}
