import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { ROOM_STATUSES, type RoomStatus } from '@riad/shared';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { PaginationQueryDto } from '../common/pagination';
import { QueryBoolean, TrimToUndefined } from '../common/validation';

export class CreateRoomDto {
  @ApiProperty({ example: 'Chambre Safran' })
  @TrimToUndefined()
  @IsString()
  @Length(1, 60)
  name: string;

  @ApiProperty({ example: 'Double' })
  @TrimToUndefined()
  @IsString()
  @Length(1, 60)
  type: string;

  @ApiProperty({ example: 2 })
  @IsInt()
  @Min(1)
  @Max(20)
  capacity: number;

  @ApiProperty({ description: 'Centimes per night', example: 90000 })
  @IsInt()
  @Min(0)
  basePrice: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateRoomDto extends PartialType(CreateRoomDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class SetRoomStatusDto {
  @ApiProperty({ enum: ROOM_STATUSES })
  @IsIn(ROOM_STATUSES)
  status: RoomStatus;
}

export class ListRoomsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @QueryBoolean()
  @IsBoolean()
  includeInactive?: boolean;
}
