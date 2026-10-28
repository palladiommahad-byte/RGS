import { Inject, Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';
import { parseMrzText, type MrzResult } from './mrz';
import { PASSPORT_OCR, type PassportOcrProvider } from './passport-ocr.provider';

const score = (r: MrzResult | null) => (r ? (r.valid ? 1000 : 0) + Object.keys(r.fields).length : -1);

/**
 * Image -> MRZ fields. Tries a plain greyscale page, then a binarised bottom band (where
 * the MRZ sits), stopping at the first fully valid read. Never throws: a failed read
 * just means the guest types the fields.
 */
@Injectable()
export class PassportReaderService {
  private readonly logger = new Logger(PassportReaderService.name);

  constructor(@Inject(PASSPORT_OCR) private readonly ocr: PassportOcrProvider) {}

  async read(image: Buffer): Promise<MrzResult | null> {
    try {
      const gray = await sharp(image).grayscale().png().toBuffer();
      let best = parseMrzText(await this.ocr.recognize(gray));
      if (best?.valid) return best;

      const { width = 0, height = 0 } = await sharp(gray).metadata();
      const top = Math.floor(height * 0.55);
      const band = await sharp(gray)
        .extract({ left: 0, top, width, height: height - top })
        .resize({ width: 1800 })
        .threshold(150)
        .png()
        .toBuffer();
      const second = parseMrzText(await this.ocr.recognize(band));
      if (score(second) > score(best)) best = second;
      return best;
    } catch (e) {
      this.logger.warn(`Passport OCR (${this.ocr.name}) failed: ${String(e)}`);
      return null;
    }
  }
}
