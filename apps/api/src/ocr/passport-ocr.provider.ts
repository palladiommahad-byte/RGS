/** Turns an image into raw text; MRZ extraction happens afterwards in mrz.ts. */
/** 'page': a whole photo (layout detected); 'block': a crop holding only the MRZ lines. */
export type OcrLayout = 'page' | 'block';

export interface PassportOcrProvider {
  readonly name: string;
  recognize(image: Buffer, layout?: OcrLayout): Promise<string>;
}

export const PASSPORT_OCR = Symbol('PASSPORT_OCR');
