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

  // ------------------------------
  // Resize image to 1024x1024 using canvas (INSIDE CLASS)
  // ------------------------------
  private resizeBase64 = async (base64: string, maxSize = 1024): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = base64;

      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = maxSize;
        canvas.height = maxSize;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          return reject("Canvas context error");
        }

        // Fill background white
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, maxSize, maxSize);

        // Maintain aspect ratio
        const ratio = Math.min(maxSize / img.width, maxSize / img.height);
        const newWidth = img.width * ratio;
        const newHeight = img.height * ratio;

        const offsetX = (maxSize - newWidth) / 2;
        const offsetY = (maxSize - newHeight) / 2;

        ctx.drawImage(img, offsetX, offsetY, newWidth, newHeight);

        // Export final resized base64
        resolve(canvas.toDataURL("image/jpeg", 0.95));
      };

      img.onerror = (err) => reject("Image load failed: " + err);
    });
  };

    private base64SizeMB(base64: string): number {
    // Remove prefix
    const stripped = base64.replace(/^data:.+;base64,/, "");
    const bytes = (stripped.length * 3) / 4;
    return bytes / (1024 * 1024);
  }

  


  // ------------------------------
  // MAIN UPLOAD FUNCTION
  // ------------------------------
  public async uploadBase64File(
    base64String: string,
    key: string,
    view?: string,
    categoryName?: string,
    targetAudience?: string,
    isAiImage?: boolean
  ): Promise<void> {
    try {
      const WORKER_URL = "https://wild-hill-b1b5.reezmohdmg16.workers.dev";
      const UPLOAD_SECRET = "upload_reez_2025_Xh39!poL";

 const originalMB = this.base64SizeMB(base64String);
      console.log(`📸 Original Base64 Size: ${originalMB.toFixed(2)} MB`);

      // ⭐ Resize on frontend
      const resizedBase64 = await this.resizeBase64(base64String, 1024);

      // ⭐ LOG RESIZED SIZE
      const resizedMB = this.base64SizeMB(resizedBase64);
      console.log(`🧩 Resized Base64 Size: ${resizedMB.toFixed(2)} MB`);

      // ⭐ Build prompt safely
      const prompt = `
Generate a professional e-commerce image with a pure white (#ffffff) background of an Indian ${targetAudience || "person"} model wearing this ${categoryName || "product"}.
Center the product clearly in the frame as used in online catalogs.
Preserve the color, texture, and design exactly as in the uploaded image.
Ensure pose and composition suitable for a ${view || "front"}-facing product display.
If any transparent areas exist, fill them with pure white (#ffffff)
If your rendering face then show the face completely.
Ensure the ${categoryName || "product"} occupies at least 70–80% of the frame, with a tight crop and clear visibility of all important details. The ${categoryName || "product"} should appear large and prominent, filling most of the image space.
Ensure model is wearing ${categoryName || "product"}
      `.trim();

      // ⭐ Send directly to Worker
      const response = await fetch(WORKER_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-upload-secret": UPLOAD_SECRET,
        },
        body: JSON.stringify({
          base64: resizedBase64,
          key,
          prompt,
          view,
          isAiImage: isAiImage ?? true,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error("❌ Worker Error:", data);
        throw new Error(data.error || "Worker upload failed");
      }

      console.log("✅ AI upload success:", data);

    } catch (err) {
      console.error("❌ Upload failed:", err);
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
    const result = await $fetch('https://solitary-brook-330b.reezmohdmg16.workers.dev', {
      method: 'POST',
      body: {
        url: `https://images.markit.co.in/${uuid}`,
        key: uuid,
        view,
        categoryName,
        targetAudience,
        isAiImage
      },
    });

    console.log('✅ AI upload success:', result);
    return result;
  } catch (err) {
    console.error('❌ Worker request failed:', err);
    throw err;
  }
}
}