import { Inject, Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';
import { bestMrz, parseMrzCandidates, type MrzCandidate, type MrzResult } from './mrz';
import { PASSPORT_OCR, type OcrLayout, type PassportOcrProvider } from './passport-ocr.provider';

/** Tries per photo, at most: each one is a full OCR pass (a few seconds on a small server). */
const MAX_PASSES = 7;

type Pass = { layout: OcrLayout; make: () => Promise<Buffer> };

/**
 * Image -> MRZ fields (document number, names, nationality, birth date, sex, expiry).
 * Phone photos are uneven: the photo is straightened and contrast-stretched, then read
 * several ways (the bottom band where the MRZ sits, at different crops and black/white
 * levels, sideways or upside down when the photo is turned, the whole page last). It stops
 * at the first fully valid MRZ; otherwise every reading is combined, each check-digit
 * field taken from a pass that got it right. Never throws: a failed read just means the
 * guest types the fields.
 */
@Injectable()
export class PassportReaderService {
  private readonly logger = new Logger(PassportReaderService.name);

  constructor(@Inject(PASSPORT_OCR) private readonly ocr: PassportOcrProvider) {}

  async read(image: Buffer): Promise<MrzResult | null> {
    try {
      const base = await sharp(image).rotate().grayscale().normalise().png().toBuffer();
      const { width = 0, height = 0 } = await sharp(base).metadata();
      const all: MrzCandidate[] = [];
      for (const pass of this.passes(base, width, height).slice(0, MAX_PASSES)) {
        const found = parseMrzCandidates(await this.ocr.recognize(await pass.make(), pass.layout));
        all.push(...found);
        if (found.some((c) => c.result.valid)) break;
      }
      return bestMrz(all);
    } catch (e) {
      this.logger.warn(`Passport OCR (${this.ocr.name}) failed: ${String(e)}`);
      return null;
    }
  }

  /** Readings to try, most likely first. */
  private passes(base: Buffer, width: number, height: number): Pass[] {
    // Bottom band of a (possibly turned) photo, enlarged so MRZ letters are ~40 px high.
    const band = (angle: 0 | 90 | 180 | 270, share: number, threshold?: number): Pass => ({
      layout: 'block',
      make: async () => {
        const turned = await sharp(base).rotate(angle).png().toBuffer();
        const { width: w = width, height: h = height } = await sharp(turned).metadata();
        const top = Math.floor(h * (1 - share));
        let img = sharp(turned)
          .extract({ left: 0, top, width: w, height: h - top })
          .resize({ width: 2200 })
          .sharpen();
        if (threshold) img = img.threshold(threshold);
        return img.png().toBuffer();
      },
    });
    const page: Pass = { layout: 'page', make: async () => sharp(base).resize({ width: 2000 }).png().toBuffer() };

    const upright = [band(0, 0.4), band(0, 0.4, 140), band(0, 0.5, 175), band(0, 0.3, 120)];
    // A tall photo of a passport page is usually turned: try both sideways readings early.
    const sideways = [band(90, 0.4), band(270, 0.4)];
    return height > width * 1.15
      ? [...sideways, ...upright, band(180, 0.4), page]
      : [...upright, band(180, 0.4), page, ...sideways];
  }
}
