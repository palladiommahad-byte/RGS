import { ApiPropertyOptional } from '@nestjs/swagger';
import { MAX_PAGE_LIMIT, type Paginated } from '@riad/shared';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export class PaginationQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: MAX_PAGE_LIMIT })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_LIMIT)
  limit: number = 20;
}

export function pageArgs(q: PaginationQueryDto): { skip: number; take: number } {
  return { skip: (q.page - 1) * q.limit, take: q.limit };
}

export function paginated<T>(items: T[], total: number, q: PaginationQueryDto): Paginated<T> {
  return { items, total, page: q.page, limit: q.limit };
}
