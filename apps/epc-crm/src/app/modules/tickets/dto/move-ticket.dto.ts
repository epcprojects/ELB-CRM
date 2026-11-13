import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsUUID } from 'class-validator';

export class MoveTicketDto {
  @ApiProperty({
    description: 'Project the ticket should be moved to.',
    format: 'uuid',
  })
  @IsUUID()
  @IsNotEmpty()
  targetProjectId: string;
}
