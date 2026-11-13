import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsDateString, IsIn, IsOptional, IsUUID } from 'class-validator';

const toArray = ({ value }: { value: unknown }) =>
  value === undefined ? undefined : Array.isArray(value) ? value : [value];

export class AnalyticsQueryDto {
  @ApiPropertyOptional({ description: 'Restrict to leads created on/after this date (ISO).' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'Restrict to leads created on/before this date (ISO).' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({ type: [String], isArray: true })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsUUID('loose', { each: true })
  projectIds?: string[];

  @ApiPropertyOptional({ description: 'Restrict to a single agent.' })
  @IsOptional()
  @IsUUID('loose')
  agentId?: string;

  @ApiPropertyOptional({ enum: ['day', 'week', 'month'] })
  @IsOptional()
  @IsIn(['day', 'week', 'month'])
  granularity?: 'day' | 'week' | 'month';
}
