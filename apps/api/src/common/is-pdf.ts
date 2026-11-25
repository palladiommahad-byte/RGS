/** True when the bytes look like a PDF (every PDF starts with "%PDF-", maybe after a BOM/whitespace). */
export function isPdf(buffer: Buffer): boolean {
  return buffer.subarray(0, 1024).toString('latin1').trimStart().startsWith('%PDF-');
}
