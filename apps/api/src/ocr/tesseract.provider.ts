import { Logger, type OnModuleDestroy } from '@nestjs/common';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createWorker, PSM, type Worker } from 'tesseract.js';
import type { PassportOcrProvider } from './passport-ocr.provider';

/**
 * Free, local OCR. One worker is created lazily and reused; requests queue on it.
 * The English model is downloaded once into `cacheDir` (bake it into the Docker image
 * for offline servers).
 */
export class TesseractProvider implements PassportOcrProvider, OnModuleDestroy {
  readonly name = 'tesseract';
  private readonly logger = new Logger(TesseractProvider.name);
  private worker: Promise<Worker> | null = null;

  constructor(private readonly cacheDir: string) {}

  async recognize(image: Buffer): Promise<string> {
    const worker = await this.getWorker();
    const { data } = await worker.recognize(image);
    return data.text;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.worker) await (await this.worker).terminate();
  }

  private getWorker(): Promise<Worker> {
    this.worker ??= (async () => {
      const cachePath = resolve(this.cacheDir);
      mkdirSync(cachePath, { recursive: true });
      const worker = await createWorker('eng', 1, { cachePath });
      // The MRZ alphabet only: far fewer misreads on the two bottom lines.
      await worker.setParameters({
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<',
        tessedit_pageseg_mode: PSM.AUTO,
      });
      this.logger.log('Tesseract worker ready');
      return worker;
    })().catch((e: unknown) => {
      this.worker = null; // retry on the next request
      throw e;
    });
    return this.worker;
  }
}
