#!/usr/bin/env node
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import crypto from 'crypto';

const prisma = new PrismaClient();
const {
  R2_ID,
  R2_SECRET,
  R2_BUCKET,
  R2_ACCOUNT_ID,
  GEMINI_API_KEY,
} = process.env;

if (!R2_ID || !R2_SECRET || !R2_BUCKET || !R2_ACCOUNT_ID) {
  console.error('Missing R2 credentials in environment (R2_ID / R2_SECRET / R2_BUCKET / R2_ACCOUNT_ID)');
  process.exit(1);
}

const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ID,
    secretAccessKey: R2_SECRET,
  },
});

function makeKey(prefix = 'products', ext = 'jpg') {
  return `${prefix}/${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
}

async function uploadBase64ToR2(dataUrl, key) {
  const match = dataUrl.match(/^data:(.+);base64,(.+)$/);
  if (!match) throw new Error('Invalid data URL');
  const contentType = match[1];
  const b64 = match[2];
  const buffer = Buffer.from(b64, 'base64');

  const cmd = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    ACL: 'public-read',
  });

  await r2Client.send(cmd);
  return `https://images.markit.co.in/${key}`;
}

async function tryGenerateWithGemini(prompt) {
  if (!GEMINI_API_KEY) throw new Error('No GEMINI_API_KEY');

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${GEMINI_API_KEY}`;

  async function callGemini(imageB64, promptText) {
    const payload = {
      contents: [
        {
          role: 'user',
          parts: [
            { text: `${promptText}\n\nIMPORTANT:\n- Output image MUST be 1024x1024\n- Pure white background only\n- No shadows` },
            ...(imageB64
              ? [
                  {
                    inlineData: {
                      mimeType: 'image/jpeg',
                      data: imageB64,
                    },
                  },
                ]
              : []),
          ],
        },
      ],
      generationConfig: { response_modalities: ['IMAGE'] },
    };

    const res = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error(json?.error?.message || `HTTP ${res.status}`);
    return json;
  }

  function findBase64String(obj) {
    if (!obj) return null;
    if (typeof obj === 'string') {
      if (obj.startsWith('data:')) return obj;
      const b64like = /^([A-Za-z0-9+/=\s]{100,})$/;
      if (b64like.test(obj.replace(/\s+/g, ''))) return obj.replace(/\s+/g, '');
      return null;
    }
    if (Array.isArray(obj)) {
      for (const item of obj) {
        const found = findBase64String(item);
        if (found) return found;
      }
    } else if (typeof obj === 'object') {
      for (const k of Object.keys(obj)) {
        const found = findBase64String(obj[k]);
        if (found) return found;
      }
    }
    return null;
  }

  try {
    const json = await callGemini(null, prompt);
    const maybeB64 = findBase64String(json);
    if (!maybeB64) return null;
    if (maybeB64.startsWith('data:')) return maybeB64;
    return `data:image/jpeg;base64,${maybeB64}`;
  } catch (err) {
    console.warn('Gemini generateContent failed:', err?.message || err);
    return null;
  }
}

function svgDataUrlForText(text) {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns='http://www.w3.org/2000/svg' width='1024' height='1024'>\n  <rect width='100%' height='100%' fill='#ffffff'/>\n  <foreignObject x='32' y='32' width='960' height='960'>\n    <div xmlns='http://www.w3.org/1999/xhtml' style='font-family: Arial, Helvetica, sans-serif; font-size:40px; color:#222; display:flex; align-items:center; justify-content:center; height:100%; text-align:center;'>${escaped}</div>\n  </foreignObject>\n</svg>`;
  const b64 = Buffer.from(svg).toString('base64');
  return `data:image/svg+xml;base64,${b64}`;
}

async function run() {
  const companyId = '8ff16195-5dda-4f09-9cff-493f571a3927';
  console.log('Fetching products for company', companyId);
  const products = await prisma.product.findMany({ where: { companyId }, include: { variants: true } });
  console.log('Found', products.length, 'products');

  for (const p of products) {
    const prompt = `Product photography: white background, studio-lit, close-up of '${p.name}'. Show texture and details, realistic colours, 1024x1024, high resolution.`;
    console.log('Generating image for', p.name);
    const gemini = await tryGenerateWithGemini(prompt);
    const dataUrl = gemini || svgDataUrlForText(p.name);
    const key = makeKey('regenerated', dataUrl.startsWith('data:image/svg') ? 'svg' : 'jpg');
    const url = await uploadBase64ToR2(dataUrl, key);

    if (p.variants && p.variants.length > 0) {
      const variantId = p.variants[0].id;
      await prisma.variant.update({ where: { id: variantId }, data: { images: [url] } });
      console.log('Updated variant', variantId, 'images ->', url);
    } else {
      await prisma.variant.create({ data: { name: p.name + ' - Default', sprice: 999, pprice: 500, images: [url], productId: p.id, companyId } });
      console.log('Created default variant for product', p.id);
    }
  }

  console.log('Image regeneration complete');
}

run().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });