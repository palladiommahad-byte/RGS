import {
  CopyObjectCommand,
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { env } from '../config/env';

export type BucketName = 'passports' | 'receipts' | 'documents';

/**
 * S3-compatible object storage (MinIO locally, Cloudflare R2 in production).
 * Every bucket is private: objects are only reachable through short-lived signed URLs.
 */
@Injectable()
export class StorageService implements OnApplicationBootstrap {
  private readonly logger = new Logger(StorageService.name);
  private readonly s3: S3Client;
  /** Signs links for browsers; differs from `s3` when the API reaches storage on an internal address. */
  private readonly signer: S3Client;
  private readonly buckets: Record<BucketName, string>;

  constructor() {
    const e = env();
    const client = (endpoint: string | undefined) =>
      new S3Client({
        endpoint,
        region: e.S3_REGION,
        credentials: { accessKeyId: e.S3_ACCESS_KEY, secretAccessKey: e.S3_SECRET_KEY },
        forcePathStyle: true, // required by MinIO, harmless for R2
      });
    this.s3 = client(e.S3_ENDPOINT);
    this.signer = e.S3_PUBLIC_ENDPOINT ? client(e.S3_PUBLIC_ENDPOINT) : this.s3;
    this.buckets = {
      passports: e.S3_BUCKET_PASSPORTS,
      receipts: e.S3_BUCKET_RECEIPTS,
      documents: e.S3_BUCKET_DOCUMENTS,
    };
  }

  /** Creates missing buckets in the background, so the API never waits on storage to start. */
  onApplicationBootstrap(): void {
    void this.ensureBuckets();
  }

  /**
   * Creates each bucket that does not exist yet (fresh MinIO). Retries while storage is
   * starting; on a provider where buckets are made by hand (R2), a refusal is only logged.
   */
  async ensureBuckets(attempts = 15, delayMs = 2000): Promise<void> {
    for (const name of Object.values(this.buckets)) {
      for (let i = 1; ; i++) {
        try {
          await this.s3.send(new HeadBucketCommand({ Bucket: name }));
          break;
        } catch (e) {
          const status = (e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
          if (status === 404) {
            try {
              await this.s3.send(new CreateBucketCommand({ Bucket: name }));
              this.logger.log(`Created bucket ${name}`);
            } catch (err) {
              this.logger.warn(`Could not create bucket ${name}: ${String(err)}`);
            }
            break;
          }
          if (status !== undefined || i >= attempts) {
            this.logger.warn(`Bucket ${name} is not reachable: ${String(e)}`);
            break;
          }
          await new Promise((r) => setTimeout(r, delayMs)); // storage still starting
        }
      }
    }
  }

  async put(bucket: BucketName, key: string, body: Buffer, contentType: string): Promise<void> {
    await this.s3.send(
      new PutObjectCommand({ Bucket: this.buckets[bucket], Key: key, Body: body, ContentType: contentType }),
    );
  }

  async get(bucket: BucketName, key: string): Promise<Buffer> {
    const res = await this.s3.send(new GetObjectCommand({ Bucket: this.buckets[bucket], Key: key }));
    if (!res.Body) throw new Error(`Empty object ${bucket}/${key}`);
    return Buffer.from(await res.Body.transformToByteArray());
  }

  async copy(bucket: BucketName, fromKey: string, toKey: string): Promise<void> {
    const name = this.buckets[bucket];
    await this.s3.send(
      new CopyObjectCommand({ Bucket: name, Key: toKey, CopySource: `${name}/${encodeURI(fromKey)}` }),
    );
  }

  /** Best effort: a failed delete is logged, never thrown (the retention job retries). */
  async delete(bucket: BucketName, keys: (string | null | undefined)[]): Promise<void> {
    for (const key of keys) {
      if (!key) continue;
      try {
        await this.s3.send(new DeleteObjectCommand({ Bucket: this.buckets[bucket], Key: key }));
      } catch (e) {
        this.logger.warn(`Could not delete ${bucket}/${key}: ${String(e)}`);
      }
    }
  }

  signedUrl(bucket: BucketName, key: string, ttlSeconds = env().SIGNED_URL_TTL_SECONDS): Promise<string> {
    return getSignedUrl(this.signer, new GetObjectCommand({ Bucket: this.buckets[bucket], Key: key }), {
      expiresIn: ttlSeconds,
    });
  }

  /** Keys under `prefix` last modified before `before`. */
  async listOlderThan(bucket: BucketName, prefix: string, before: Date): Promise<string[]> {
    const keys: string[] = [];
    let token: string | undefined;
    do {
      const page = await this.s3.send(
        new ListObjectsV2Command({ Bucket: this.buckets[bucket], Prefix: prefix, ContinuationToken: token }),
      );
      for (const o of page.Contents ?? []) {
        if (o.Key && o.LastModified && o.LastModified < before) keys.push(o.Key);
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    return keys;
  }
}
