import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

// Cloudflare R2 is S3-compatible. We talk to it with the AWS S3 client pointed
// at the R2 endpoint. Used server-side only (credentials are secret).

const accountId = process.env.R2_ACCOUNT_ID || "";
const bucket = process.env.R2_BUCKET || "buildledger-photos";
const publicUrl = (process.env.R2_PUBLIC_URL || "").replace(/\/$/, "");

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
  },
});

// Uploads a file buffer to R2 and returns its public URL.
export async function uploadToR2(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string
): Promise<string> {
  await r2.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
  return `${publicUrl}/${key}`;
}
