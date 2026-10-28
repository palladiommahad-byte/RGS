import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TIMEZONE } from '@riad/shared';
import { PENDING_PREFIX } from '../checkin/checkin.service';
import { env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

const DAY_MS = 86_400_000;
const BATCH = 200;

/**
 * Data minimisation (law 09-08): passport images are deleted X days after the guest left
 * (or the stay was cancelled), the text register is kept. Abandoned uploads go after 24 h.
 */
@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  @Cron('0 30 3 * * *', { name: 'passport-retention', timeZone: TIMEZONE })
  async nightly(): Promise<void> {
    const photos = await this.purgePassportPhotos();
    const pending = await this.purgePendingUploads();
    this.logger.log(`Retention: ${photos} passport photos and ${pending} abandoned uploads deleted`);
  }

  async purgePassportPhotos(now: Date = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - env().PASSPORT_IMAGE_RETENTION_DAYS * DAY_MS);
    let total = 0;
    for (;;) {
      const guests = await this.prisma.guest.findMany({
        where: {
          passportPhotoKey: { not: null },
          stay: { status: { in: ['CHECKED_OUT', 'CANCELLED'] }, checkOutDate: { lt: cutoff } },
        },
        select: { id: true, passportPhotoKey: true },
        take: BATCH,
      });
      if (guests.length === 0) return total;
      await this.storage.delete('passports', guests.map((g) => g.passportPhotoKey));
      await this.prisma.guest.updateMany({
        where: { id: { in: guests.map((g) => g.id) } },
        data: { passportPhotoKey: null },
      });
      total += guests.length;
    }
  }

  async purgePendingUploads(now: Date = new Date()): Promise<number> {
    const keys = await this.storage.listOlderThan('passports', PENDING_PREFIX, new Date(now.getTime() - DAY_MS));
    await this.storage.delete('passports', keys);
    return keys.length;
  }
}
