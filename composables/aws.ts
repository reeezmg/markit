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

    constructor() {
        if (!AWS_ID || !AWS_SECRET)
            throw new Error('Missing AWS dotenv credentials');
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
                Bucket: AWS_BUCKET,
                Key: objectKey,
                ...(responseFileName && {
                    ResponseContentDisposition: `attachment; filename="${responseFileName}"`,
                }),
            });
            const signedUrl = await getSignedUrl(s3Client, command, {
                expiresIn: 3600, //Expiration time in seconds
            });
            return signedUrl;
        } catch (error) {
            console.log('Error', error);
            throw new Error('Generate S3SignedUrl Failed');
        }
    }

    public async uploadBase64File(
        base64String: string | undefined,
        key: string,
    ) {
        try {
            let prefixRegex = /^data:(.+);base64,/;
            let match = base64String.match(prefixRegex);
            if (!match) {
                throw new Error('Invalid Base64 String');
            }
            let base64Data = Uint8Array.from(
                atob(base64String.replace(prefixRegex, '')),
                (c) => c.charCodeAt(0),
            );
            const uploadResult = await this.s3Client.send(
                new PutObjectCommand({
                    Bucket: AWS_BUCKET,
                    Key: key,
                    Body: base64Data,
                    ContentEncoding: 'base64',
                    ContentType: match[1],
                }),
            );
            return uploadResult;
        } catch (error) {
            console.log('Error', error);
            // throw new Error('Upload File Failed');
        }
    }
}

// export default class AwsService {

//     s3Client: S3Client | undefined;
//     awsBucket: string | undefined;

//     constructor() {
//     }

//     async init() {
//         const infisicalProvider = new InfisicalProvider();
//         await infisicalProvider.init();
//         if (!infisicalProvider.awsSecrets) throw new Error('Missing AWS credentials from Infisical');
//         this.awsBucket = infisicalProvider.awsSecrets.bucket;
//         this.s3Client = new S3Client({
//             region: "ap-south-1",
//             credentials: {
//                 accessKeyId: infisicalProvider.awsSecrets.id,
//                 secretAccessKey: infisicalProvider.awsSecrets.secret,
//             },
//         });
//     }

//     public async generateS3SignedUrl(objectKey: string) {
//         try {
//             if (!this.s3Client) throw new Error('Missing AWS credentials from Infisical');
//             const command = new GetObjectCommand({
//                 Bucket: this.awsBucket,
//                 Key: objectKey,
//             });
//             const signedUrl = await getSignedUrl(this.s3Client, command, {
//                 expiresIn: 3600 //Expiration time in seconds
//             });
//             return signedUrl;
//         } catch (error) {
//             console.log("Error", error);
//             throw new Error('Generate S3SignedUrl Failed');
//         }
//     }
// }
