import { Module } from '@nestjs/common';
import { env } from '../config/env';
import { GoogleVisionProvider } from './google-vision.provider';
import { PASSPORT_OCR } from './passport-ocr.provider';
import { PassportReaderService } from './passport-reader.service';
import { TesseractProvider } from './tesseract.provider';

@Module({
  providers: [
    {
      provide: PASSPORT_OCR,
      useFactory: () => {
        const { GOOGLE_VISION_API_KEY, OCR_CACHE_DIR } = env();
        return GOOGLE_VISION_API_KEY
          ? new GoogleVisionProvider(GOOGLE_VISION_API_KEY)
          : new TesseractProvider(OCR_CACHE_DIR);
      },
    },
    PassportReaderService,
  ],
  exports: [PassportReaderService],
})
export class OcrModule {}
