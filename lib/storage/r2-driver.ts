import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl as presign } from "@aws-sdk/s3-request-presigner";
import { env } from "@/env";
import type { StorageDriver, UploadTarget } from "./types";

/**
 * Cloudflare R2 driver (S3-compatible). Only constructed when every
 * `R2_*` env var in `env.ts` is present — see `index.ts`.
 */
export function createR2Driver(): StorageDriver {
  const accountId = env.R2_ACCOUNT_ID as string;
  const bucket = env.R2_BUCKET as string;
  const publicUrl = (env.R2_PUBLIC_URL as string).replace(/\/$/, "");

  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID as string,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY as string,
    },
  });

  return {
    name: "r2",
    async put(key, body, contentType) {
      await client.send(
        new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }),
      );
      return `${publicUrl}/${key}`;
    },
    async getUploadUrl(key, contentType): Promise<UploadTarget> {
      const uploadUrl = await presign(
        client,
        new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }),
        { expiresIn: 300 },
      );
      return { mode: "presigned", uploadUrl, publicUrl: `${publicUrl}/${key}` };
    },
    async getSignedUrl(key) {
      return presign(client, new GetObjectCommand({ Bucket: bucket, Key: key }), {
        expiresIn: 3600,
      });
    },
    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
    keyFromUrl(fileUrl) {
      if (!fileUrl.startsWith(`${publicUrl}/`)) {
        throw new Error(`Not an R2 storage URL: ${fileUrl}`);
      }
      return fileUrl.slice(publicUrl.length + 1);
    },
  };
}
