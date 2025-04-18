import {
    S3Client,
    GetObjectCommand,
    PutObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
const AWS_ID = process.env.AWS_ID;
const AWS_SECRET = process.env.AWS_SECRET;
const AWS_BUCKET = process.env.AWS_BUCKET;


if (!AWS_ID || !AWS_SECRET) throw new Error('Missing AWS dotenv credentials');

const s3Client = new S3Client({
    region: 'ap-south-1',
    credentials: {
        accessKeyId: AWS_ID,
        secretAccessKey: AWS_SECRET,
    },
});

export default class AwsService {
    s3Client: S3Client;
    awsBucket: string;
  
    constructor() {
      const config = useRuntimeConfig(); // ✅ now inside constructor
      const AWS_ID = config.public.awsId;
      const AWS_SECRET = config.public.awsSecret;
      const AWS_BUCKET = config.public.awsBucket;
  
      if (!AWS_ID || !AWS_SECRET || !AWS_BUCKET)
        throw new Error('Missing AWS dotenv credentials');
  
      this.awsBucket = AWS_BUCKET;
      this.s3Client = new S3Client({
        region: 'ap-south-1',
        credentials: {
          accessKeyId: AWS_ID,
          secretAccessKey: AWS_SECRET,
        },
      });
    }
  
    public async generateS3SignedUrl(
      objectKey: string,
      responseFileName?: string,
    ): Promise<string> {
      try {
        const command = new GetObjectCommand({
          Bucket: this.awsBucket,
          Key: objectKey,
          ...(responseFileName && {
            ResponseContentDisposition: `attachment; filename="${responseFileName}"`,
          }),
        });
        const signedUrl = await getSignedUrl(this.s3Client, command, {
          expiresIn: 3600,
        });
        return signedUrl;
      } catch (error) {
        console.error('Error', error);
        throw new Error('Generate S3SignedUrl Failed');
      }
    }
  
    public async uploadBase64File(base64String: string, key: string) {
      try {
        const prefixRegex = /^data:(.+);base64,/;
        const match = base64String.match(prefixRegex);
        if (!match) throw new Error('Invalid Base64 String');
  
        const base64Data = Uint8Array.from(
          atob(base64String.replace(prefixRegex, '')),
          (c) => c.charCodeAt(0),
        );
  
        const uploadResult = await this.s3Client.send(
          new PutObjectCommand({
            Bucket: this.awsBucket,
            Key: key,
            Body: base64Data,
            ContentEncoding: 'base64',
            ContentType: match[1],
          }),
        );
        return uploadResult;
      } catch (error) {
        console.error('Upload error', error);
        throw new Error('Upload File Failed');
      }
    }
  }
  