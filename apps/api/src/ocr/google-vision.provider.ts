import type { PassportOcrProvider } from './passport-ocr.provider';

type VisionResponse = {
  responses?: { fullTextAnnotation?: { text?: string }; error?: { message?: string } }[];
};

/**
 * Google Cloud Vision TEXT_DETECTION. Much better on blurry phone photos, but the image
 * leaves the server: the privacy notice must mention it when this provider is enabled.
 */
export class GoogleVisionProvider implements PassportOcrProvider {
  readonly name = 'google-vision';

  constructor(private readonly apiKey: string) {}

  async recognize(image: Buffer): Promise<string> {
    const res = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(this.apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [{ image: { content: image.toString('base64') }, features: [{ type: 'TEXT_DETECTION' }] }],
        }),
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!res.ok) throw new Error(`Google Vision HTTP ${res.status}`);
    const body = (await res.json()) as VisionResponse;
    const first = body.responses?.[0];
    if (first?.error) throw new Error(`Google Vision: ${first.error.message ?? 'error'}`);
    return first?.fullTextAnnotation?.text ?? '';
  }
}
