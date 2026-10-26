import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../../config/env';

/**
 * Cloudflare R2 through its S3-compatible API. The bucket is private — objects are
 * only ever read through short-lived presigned URLs, never a public bucket URL.
 */
let client: S3Client | null = null;

export function isR2Configured(): boolean {
  return Boolean(env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_BUCKET);
}

function getClient(): S3Client {
  if (!isR2Configured()) {
    throw new Error('Cloudflare R2 is not configured — set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET');
  }
  client ??= new S3Client({
    region: 'auto',
    endpoint: env.R2_ENDPOINT ?? `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    // Path-style (<endpoint>/<bucket>/<key>) — the form R2's docs use, and what MinIO needs too.
    forcePathStyle: true,
    credentials: { accessKeyId: env.R2_ACCESS_KEY_ID!, secretAccessKey: env.R2_SECRET_ACCESS_KEY! },
  });
  return client;
}

export async function putObject(key: string, body: Buffer, contentType: string): Promise<void> {
  await getClient().send(
    new PutObjectCommand({ Bucket: env.R2_BUCKET, Key: key, Body: body, ContentType: contentType, ContentLength: body.length }),
  );
}

export async function deleteObject(key: string): Promise<void> {
  await getClient().send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET, Key: key }));
}

export async function getPresignedReadUrl(key: string, ttlSeconds = env.R2_PRESIGN_TTL_SECONDS): Promise<string> {
  return getSignedUrl(getClient(), new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: key }), { expiresIn: ttlSeconds });
}
