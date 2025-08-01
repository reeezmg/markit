import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

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

  public async uploadBase64File(base64String: string, key: string) {
     try {
    const result = await $fetch('/api/upload', {
      method: 'POST',
      body: {
        base64: base64String,
        key: key, // R2 object key
      },
    });

    console.log('Upload successful:', result);
  } catch (err) {
    console.error('Upload failed:', err);
  }
};
}  