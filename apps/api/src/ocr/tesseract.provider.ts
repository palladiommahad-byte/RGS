import { Logger, type OnModuleDestroy } from '@nestjs/common';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createWorker, PSM, type Worker } from 'tesseract.js';
import type { PassportOcrProvider } from './passport-ocr.provider';

/** A loaded worker holds ~100 MB; small servers get it back after this long unused. */
const IDLE_MS = 3 * 60_000;

/**
 * Free, local OCR. One worker is created on the first scan and reused while scans keep
 * coming (requests queue on it); it is shut down after IDLE_MS without a scan.
 * The English model is downloaded once into `cacheDir` (bake it into the Docker image
 * for offline servers).
 */
export class TesseractProvider implements PassportOcrProvider, OnModuleDestroy {
  readonly name = 'tesseract';
  private readonly logger = new Logger(TesseractProvider.name);
  private worker: Promise<Worker> | null = null;
  private busy = 0;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly cacheDir: string) {}

  async recognize(image: Buffer): Promise<string> {
    this.busy++;
    if (this.idleTimer) clearTimeout(this.idleTimer);
    try {
      const worker = await this.getWorker();
      const { data } = await worker.recognize(image);
      return data.text;
    } finally {
      this.busy--;
      if (this.busy === 0) {
        this.idleTimer = setTimeout(() => void this.release(), IDLE_MS);
        this.idleTimer.unref();
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    await this.release();
  }

  private async release(): Promise<void> {
    const pending = this.worker;
    if (!pending || this.busy > 0) return;
    this.worker = null;
    try {
      await (await pending).terminate();
      this.logger.log('Tesseract worker stopped (idle)');
    } catch {
      // it never started: nothing to free
    }
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
