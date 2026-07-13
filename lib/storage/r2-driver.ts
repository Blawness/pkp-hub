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

  /**
   * Basis untuk `documents.fileUrl`. Ini alamat objek yang sebenarnya di R2 —
   * tapi ia BUKAN alamat publik: membukanya tanpa tanda tangan menghasilkan
   * 400/403, dan memang begitu yang kita mau (bucket privat).
   *
   * Karena itu ia diturunkan dari akun + bucket, bukan dari sebuah env var.
   * Dulu ada `R2_PUBLIC_URL` untuk ini, dan itu jebakan: driver r2 hanya aktif
   * kalau SEMUA var R2 ada, jadi satu var yang lupa diisi membuat produksi
   * diam-diam jatuh ke driver local — yaitu disk ephemeral Vercel, tempat
   * dokumen hilang tanpa suara. Menghapus var yang tidak dipakai menghapus
   * cara gagalnya.
   *
   * `fileUrl` tidak pernah diserahkan ke browser; `downloadUrlFor()` di
   * `lib/storage/index.ts` yang menandatanganinya lebih dulu.
   */
  const objectBase = `https://${accountId}.r2.cloudflarestorage.com/${bucket}`;

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
      return `${objectBase}/${key}`;
    },
    async getUploadUrl(key, contentType): Promise<UploadTarget> {
      const uploadUrl = await presign(
        client,
        new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }),
        { expiresIn: 300 },
      );
      return { mode: "presigned", uploadUrl, publicUrl: `${objectBase}/${key}` };
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
      if (!fileUrl.startsWith(`${objectBase}/`)) {
        throw new Error(`Not an R2 storage URL: ${fileUrl}`);
      }
      return fileUrl.slice(objectBase.length + 1);
    },
  };
}
