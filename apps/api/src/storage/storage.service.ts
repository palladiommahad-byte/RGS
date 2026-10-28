import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, Logger } from '@nestjs/common';
import { env } from '../config/env';

export type BucketName = 'passports' | 'receipts' | 'documents';

/**
 * S3-compatible object storage (MinIO locally, Cloudflare R2 in production).
 * Every bucket is private: objects are only reachable through short-lived signed URLs.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly s3: S3Client;
  private readonly buckets: Record<BucketName, string>;

  constructor() {
    const e = env();
    this.s3 = new S3Client({
      endpoint: e.S3_ENDPOINT,
      region: e.S3_REGION,
      credentials: { accessKeyId: e.S3_ACCESS_KEY, secretAccessKey: e.S3_SECRET_KEY },
      forcePathStyle: true, // required by MinIO, harmless for R2
    });
    this.buckets = {
      passports: e.S3_BUCKET_PASSPORTS,
      receipts: e.S3_BUCKET_RECEIPTS,
      documents: e.S3_BUCKET_DOCUMENTS,
    };
  }

  async put(bucket: BucketName, key: string, body: Buffer, contentType: string): Promise<void> {
    await this.s3.send(
      new PutObjectCommand({ Bucket: this.buckets[bucket], Key: key, Body: body, ContentType: contentType }),
    );
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
    return getSignedUrl(this.s3, new GetObjectCommand({ Bucket: this.buckets[bucket], Key: key }), {
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
