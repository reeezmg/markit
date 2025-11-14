import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import imageCompression from 'browser-image-compression'


export default class CloudflareService {
  s3Client: S3Client;
  r2Bucket: string;
  r2AccountId: string;

  constructor() {
    const config = useRuntimeConfig();
    const R2_ID = config.public.r2Id;
    const R2_SECRET = config.public.r2Secret;
    const R2_BUCKET = config.public.r2Bucket;
    const R2_ACCOUNT_ID = config.public.r2AccountId;

    if (!R2_ID || !R2_SECRET || !R2_BUCKET || !R2_ACCOUNT_ID)
      throw new Error('Missing Cloudflare R2 credentials');

    this.r2Bucket = R2_BUCKET;
    this.r2AccountId = R2_ACCOUNT_ID;

    this.s3Client = new S3Client({
      region: 'auto', // required but unused by R2
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ID,
        secretAccessKey: R2_SECRET,
      },
    });
  }

  public async generateS3SignedUrl(
    objectKey: string,
    responseFileName?: string,
  ): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.r2Bucket,
        Key: objectKey,
        ...(responseFileName && {
          ResponseContentDisposition: `attachment; filename="${responseFileName}"`,
        }),
      });

      const signedUrl = await getSignedUrl(this.s3Client, command, {
        expiresIn: 3600, // 1 hour
      });

      return signedUrl;
    } catch (error) {
      console.error('Error', error);
      throw new Error('Generate R2 Signed URL Failed');
    }
  }


public async uploadBase64File(
  base64String: string,
  key: string,
  view?: string,
  categoryName?: string,
  targetAudience?: string,
  isAiImage?: boolean
): Promise<void> {
  try {
    // Convert base64 → File
    const res = await fetch(base64String)
    const blob = await res.blob()
    const file = new File([blob], 'upload.jpg', { type: blob.type })

  // 🔹 Compress on client
const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);

const compressedFile = await imageCompression(file, {
  maxWidthOrHeight: 1024,
  maxSizeMB: 1,
  initialQuality: 0.8,
  useWebWorker: !isIOS,  // iOS = no worker, still compresses
});


// ✅ Log original and compressed sizes
console.log(
  `📸 Original size: ${(file.size / 1024 / 1024).toFixed(2)} MB`
)
console.log(
  `🧩 Compressed size: ${(compressedFile.size / 1024 / 1024).toFixed(2)} MB`
)

// Convert compressed file → base64 again
const compressedBase64 = await imageCompression.getDataUrlFromFile(compressedFile)

    // 🔹 Send smaller base64 payload to server
    const ress = await $fetch('/api/upload', {
      method: 'POST',
      body: {
        base64: compressedBase64,
        key,
        view,
        categoryName,
        targetAudience,
        isAiImage,
      },
    })
          console.log('✅ AI upload success:', ress);
  } catch (err) {
    console.error('Upload failed:', err)
  }
}
public async aify(
    uuid: string,
    view?: string,
    categoryName?: string,
    targetAudience?: string,
    isAiImage: boolean = true
  ): Promise<any> {
    try {
        console.log(uuid,view,categoryName,targetAudience)
      const result = await $fetch('/api/aify', {
        method: 'POST',
        body: {
          url:`https://images.markit.co.in/${uuid}`,
          key:uuid,
          view,
          categoryName,
          targetAudience,
        },
      });

      console.log('✅ AI upload success:', result);
      return result;
    } catch (err) {
      console.error('❌ Upload failed:', err);
      throw err;
    }
  }
}  