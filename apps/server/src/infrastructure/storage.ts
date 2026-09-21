import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import type { Config } from '../shared/config.ts'

const DOWNLOAD_URL_TTL_SECONDS = 5 * 60

export type Storage = ReturnType<typeof createStorage>

// S3 API: MinIO in dev, R2 in production. Keys follow `org/{organizationId}/{entity}/{id}/{uuid}-{filename}`;
// callers check permissions before asking for a download URL.
export function createStorage(config: Config) {
  const client = new S3Client({
    region: config.S3_REGION,
    ...(config.S3_ENDPOINT !== undefined && { endpoint: config.S3_ENDPOINT }),
    forcePathStyle: config.S3_FORCE_PATH_STYLE,
    credentials: {
      accessKeyId: config.S3_ACCESS_KEY_ID,
      secretAccessKey: config.S3_SECRET_ACCESS_KEY,
    },
  })
  const bucket = config.S3_BUCKET

  return {
    async put(key: string, body: Uint8Array, contentType: string) {
      await client.send(
        new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }),
      )
    },

    // Always served as an attachment, so an uploaded HTML or SVG never renders on our origin.
    downloadUrl(key: string, filename: string) {
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      })
      return getSignedUrl(client, command, { expiresIn: DOWNLOAD_URL_TTL_SECONDS })
    },

    async delete(key: string) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
    },

    // Dev and tests only: MinIO starts empty. In production the bucket is provisioned with R2.
    async ensureBucket() {
      try {
        await client.send(new HeadBucketCommand({ Bucket: bucket }))
      } catch (error) {
        if (!(error instanceof S3ServiceException) || error.$metadata.httpStatusCode !== 404) {
          throw error
        }
        await client.send(new CreateBucketCommand({ Bucket: bucket }))
      }
    },

    close() {
      client.destroy()
    },
  }
}
