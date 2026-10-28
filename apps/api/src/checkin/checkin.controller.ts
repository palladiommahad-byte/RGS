import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  CHECKIN_MAX_UPLOAD_BYTES,
  type CheckinContextDto,
  type CheckinDoneDto,
  type PassportScanDto,
} from '@riad/shared';
import { Public } from '../common/auth/decorators';
import { CheckinLinkDto, CheckinSubmitDto } from './checkin.dto';
import { CheckinService } from './checkin.service';

const HOUR = 3_600_000;

/** The only unauthenticated business endpoints. Rate-limited per IP. */
@ApiTags('checkin')
@Public()
@Controller('checkin')
export class CheckinController {
  constructor(private readonly checkin: CheckinService) {}

  @Throttle({ default: { limit: 60, ttl: HOUR } })
  @Get('context')
  context(@Query() link: CheckinLinkDto): Promise<CheckinContextDto> {
    return this.checkin.context(link);
  }

  @Throttle({ default: { limit: 30, ttl: HOUR } })
  @Post('scan-passport')
  @HttpCode(HttpStatus.OK)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('image', { limits: { fileSize: CHECKIN_MAX_UPLOAD_BYTES, files: 1 } }))
  scanPassport(
    @Body() link: CheckinLinkDto,
    @UploadedFile() image: Express.Multer.File | undefined,
  ): Promise<PassportScanDto> {
    return this.checkin.scanPassport(link, image);
  }

  @Throttle({ default: { limit: 10, ttl: HOUR } })
  @Post('submit')
  submit(@Body() dto: CheckinSubmitDto): Promise<CheckinDoneDto> {
    return this.checkin.submit(dto, dto);
  }
}
