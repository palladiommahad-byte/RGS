/** Turns an image into raw text; MRZ extraction happens afterwards in mrz.ts. */
export interface PassportOcrProvider {
  readonly name: string;
  recognize(image: Buffer): Promise<string>;
}

export const PASSPORT_OCR = Symbol('PASSPORT_OCR');
