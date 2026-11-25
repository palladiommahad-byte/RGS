import { Inject, Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';
import { bestMrz, parseMrzCandidates, type MrzCandidate, type MrzResult } from './mrz';
import { PASSPORT_OCR, type OcrLayout, type PassportOcrProvider } from './passport-ocr.provider';

/** Tries per photo, at most: each one is a full OCR pass. */
const MAX_PASSES = 6;
/** No new pass starts after this long: the guest is waiting on a phone (fields stay editable). */
const TIME_BUDGET_MS = 12_000;
/**
 * Width the MRZ band is scaled to. The 44-character lines span the page, so ~1400 px gives
 * letters about 30 px high: what Tesseract reads best, and far quicker than larger crops.
 */
const BAND_WIDTH = 1400;

type Pass = { layout: OcrLayout; make: () => Promise<Buffer> };

/**
 * Image -> MRZ fields (document number, names, nationality, birth date, sex, expiry).
 * Phone photos are uneven: the photo is straightened and contrast-stretched, then read
 * several ways (the bottom band where the MRZ sits, at different crops and black/white
 * levels, sideways or upside down when the photo is turned, the whole page last). It stops
 * as soon as the readings so far combine into a valid MRZ (each check-digit field taken
 * from a pass that got it right), or when the time budget is spent. Never throws: a failed
 * read just means the guest types the fields.
 */
@Injectable()
export class PassportReaderService {
  private readonly logger = new Logger(PassportReaderService.name);

  constructor(@Inject(PASSPORT_OCR) private readonly ocr: PassportOcrProvider) {}

  /** Loads the OCR engine ahead of the first photo (guest opened the check-in link). */
  warm(): void {
    this.ocr.warm?.();
  }

  async read(image: Buffer): Promise<MrzResult | null> {
    const started = Date.now();
    try {
      const base = await sharp(image).rotate().grayscale().normalise().png().toBuffer();
      const { width = 0, height = 0 } = await sharp(base).metadata();
      const all: MrzCandidate[] = [];
      let passes = 0;
      for (const pass of this.passes(base, width, height).slice(0, MAX_PASSES)) {
        if (passes > 0 && Date.now() - started > TIME_BUDGET_MS) break;
        passes++;
        all.push(...parseMrzCandidates(await this.ocr.recognize(await pass.make(), pass.layout)));
        if (bestMrz(all)?.valid) break;
      }
      const result = bestMrz(all);
      this.logger.log(`Passport read in ${Date.now() - started} ms, ${passes} pass(es), ${result ? (result.valid ? 'valid' : 'partial') : 'nothing'}`);
      return result;
    } catch (e) {
      this.logger.warn(`Passport OCR (${this.ocr.name}) failed: ${String(e)}`);
      return null;
    }
  }

  /** Readings to try, most likely first. */
  private passes(base: Buffer, width: number, height: number): Pass[] {
    // Each orientation is computed once and shared by the passes that use it.
    const turned = new Map<number, Promise<{ img: Buffer; w: number; h: number }>>();
    const turn = (angle: 0 | 90 | 180 | 270) => {
      if (!turned.has(angle)) {
        turned.set(
          angle,
          (async () => {
            if (angle === 0) return { img: base, w: width, h: height };
            const img = await sharp(base).rotate(angle).png().toBuffer();
            const m = await sharp(img).metadata();
            return { img, w: m.width ?? height, h: m.height ?? width };
          })(),
        );
      }
      return turned.get(angle)!;
    };
    // Bottom band of a (possibly turned) photo, scaled so MRZ letters are ~30 px high.
    const band = (angle: 0 | 90 | 180 | 270, share: number, threshold?: number): Pass => ({
      layout: 'block',
      make: async () => {
        const { img: src, w, h } = await turn(angle);
        const top = Math.floor(h * (1 - share));
        let img = sharp(src)
          .extract({ left: 0, top, width: w, height: h - top })
          .resize({ width: BAND_WIDTH })
          .sharpen();
        if (threshold) img = img.threshold(threshold);
        return img.png().toBuffer();
      },
    });
    const page: Pass = { layout: 'page', make: async () => sharp(base).resize({ width: 1600 }).png().toBuffer() };

    const upright = [band(0, 0.35), band(0, 0.35, 140), band(0, 0.5, 170)];
    // A tall photo of a passport page is usually turned: try both sideways readings early.
    const sideways = [band(90, 0.35), band(270, 0.35)];
    return height > width * 1.15
      ? [...sideways, ...upright, band(180, 0.35), page]
      : [...upright, band(180, 0.35), ...sideways, page];
  }
}
