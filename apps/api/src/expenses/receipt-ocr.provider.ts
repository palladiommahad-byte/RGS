/**
 * V2: read amount / date / supplier from a receipt photo to pre-fill the quick-add form.
 * Not implemented in V1 — the interface exists so a provider can be plugged in later
 * (same pattern as PassportOcrProvider).
 */
export type ReceiptOcrResult = { amountTtc?: number; tvaAmount?: number; date?: string; supplierName?: string };

export interface ReceiptOcrProvider {
  readonly name: string;
  extract(image: Buffer): Promise<ReceiptOcrResult | null>;
}

export const RECEIPT_OCR = Symbol('RECEIPT_OCR');
