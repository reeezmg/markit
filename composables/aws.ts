export default class CloudflareService {
  public async generateS3SignedUrl(
    objectKey: string,
    responseFileName?: string,
  ): Promise<string> {
    try {
      const result = await $fetch<{ url: string }>('/api/r2/signed-url', {
        method: 'POST',
        body: { key: objectKey, responseFileName },
      });
      return result.url;
    } catch (error) {
      console.error('Error', error);
      throw new Error('Generate R2 Signed URL Failed');
    }
  }


  /**
   * Delete uploaded media from R2 once the row referencing it is gone or its
   * image has been replaced. Call this *after* the database write succeeds —
   * the server skips any key something still points at.
   *
   * Housekeeping, so it never throws: a failed cleanup leaves an orphan object
   * in the bucket, which must not surface as a failed delete/save to the user.
   */
  public async deleteObjects(keys: (string | { uuid?: string } | null | undefined)[]) {
    const list = keys
      .map(k => (typeof k === 'string' ? k : k?.uuid || ''))
      .filter(Boolean)
    if (!list.length) return

    try {
      await $fetch('/api/r2/delete', { method: 'POST', body: { keys: list } });
    } catch (error) {
      console.error('R2 cleanup failed', error);
    }
  }

  public async uploadBase64Object(base64String: string, key: string) {
    try {
      const prefixRegex = /^data:(.+);base64,/;
      const match = base64String.match(prefixRegex);
      if (!match) throw new Error('Invalid Base64 String');

      return await $fetch('/api/r2/upload', {
        method: 'POST',
        body: { base64: base64String, key },
      });
    } catch (error) {
      console.error('Upload error', error);
      throw new Error('Upload File Failed');
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
