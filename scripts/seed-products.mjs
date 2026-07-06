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
  AWS_BUCKET,
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
  // public domain used in project -- follow existing pattern
  return `https://images.markit.co.in/${key}`;
}

async function tryGenerateWithGemini(prompt) {
  if (!GEMINI_API_KEY) throw new Error('No GEMINI_API_KEY');
  // Try multiple client/endpoint strategies to support different API key types
  try {
    // 1) Try the official @google/genai client if installed
    const genai = await import('@google/genai').catch(() => null);
    if (genai) {
      try {
        const ImageModel = genai.ImageGenerationModel || genai.ImageModel || genai.Image;
        if (ImageModel) {
          const client = new ImageModel({ apiKey: GEMINI_API_KEY });
          const attemptFns = ['generate', 'generateImage', 'createImage'];
          for (const fn of attemptFns) {
            if (typeof client[fn] === 'function') {
              const res = await client[fn]({ prompt, size: '1024x1024' });
              const b64 = res?.artifacts?.[0]?.base64 || res?.images?.[0]?.b64_json || res?.artifacts?.[0]?.b64_json;
              if (b64) return `data:image/png;base64,${b64}`;
            }
          }
        }
      } catch (e) {
        console.warn('genai client attempt failed:', e?.message || e);
      }
    }

    // 2) Try Generative Language v1beta2 endpoint with Bearer auth and model 'gpt-image-1'
    try {
      const resp = await fetch('https://generativelanguage.googleapis.com/v1beta2/images:generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${GEMINI_API_KEY}`,
        },
        body: JSON.stringify({ model: 'gpt-image-1', prompt: [{ text: prompt }], size: '1024x1024' }),
      });
      if (resp.ok) {
        const j = await resp.json();
        const b64 = j?.artifacts?.[0]?.base64 || j?.data?.[0]?.b64_json || j?.candidates?.[0]?.image || j?.images?.[0]?.b64_json;
        if (b64) return `data:image/png;base64,${b64}`;
      } else {
        const t = await resp.text().catch(() => '');
        console.warn('v1beta2 responded', resp.status, t.slice(0, 200));
      }
    } catch (e) {
      console.warn('v1beta2 request failed:', e?.message || e);
    }

    // 3) Older v1 REST endpoint fallback (API key as query param)
    try {
      const resp2 = await fetch('https://generativelanguage.googleapis.com/v1/images:generate?key=' + GEMINI_API_KEY, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'gpt-image-1', prompt, size: '1024x1024' }),
      });
      if (resp2.ok) {
        const j2 = await resp2.json();
        const b642 = j2?.artifacts?.[0]?.base64 || j2?.data?.[0]?.b64_json || j2?.artifacts?.[0]?.b64;
        if (b642) return `data:image/png;base64,${b642}`;
      } else {
        const t2 = await resp2.text().catch(() => '');
        console.warn('v1 endpoint responded', resp2.status, t2.slice(0, 200));
      }
    } catch (e) {
      console.warn('v1 request failed:', e?.message || e);
    }
  } catch (err) {
    console.warn('Gemini generation overall failed, falling back to SVG. Error:', err?.message || err);
  }
  return null;
}

function svgDataUrlForText(text) {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns='http://www.w3.org/2000/svg' width='1024' height='1024'>\n  <rect width='100%' height='100%' fill='#ffffff'/>\n  <foreignObject x='32' y='32' width='960' height='960'>\n    <div xmlns='http://www.w3.org/1999/xhtml' style='font-family: Arial, Helvetica, sans-serif; font-size:40px; color:#222; display:flex; align-items:center; justify-content:center; height:100%; text-align:center;'>${escaped}</div>\n  </foreignObject>\n</svg>`;
  const b64 = Buffer.from(svg).toString('base64');
  return `data:image/svg+xml;base64,${b64}`;
}

async function generateAndUpload(prompt, keyPrefix) {
  const geminiResult = await tryGenerateWithGemini(prompt);
  const dataUrl = geminiResult || svgDataUrlForText(prompt.slice(0, 120));
  const key = makeKey(keyPrefix, dataUrl.startsWith('data:image/svg') ? 'svg' : 'jpg');
  const url = await uploadBase64ToR2(dataUrl, key);
  return { url, key };
}

async function run() {
  const companyId = '8ff16195-5dda-4f09-9cff-493f571a3927';

  console.log('Seeding categories...');
  const categories = [
    'Women Ethnic',
    'Women Western',
    'Kids',
    'Accessories',
    'Hijabs & Scarves',
    'Footwear',
    'Home & Living',
  ];

  const createdCats = [];
  for (const name of categories) {
    const c = await prisma.category.create({
      data: { name, companyId },
    });
    createdCats.push(c);
  }

  console.log('Seeding collections...');
  const collections = ['Summer Edit', 'Festive Picks', 'New Arrivals'];
  const createdCols = [];
  for (const name of collections) {
    const col = await prisma.collection.create({ data: { name, companyId } });
    createdCols.push(col);
  }

  console.log('Seeding products...');
  const sampleProducts = [];
  for (let i = 1; i <= 25; i++) {
    const cat = createdCats[i % createdCats.length];
    const col = createdCols[i % createdCols.length];
    const name = `${cat.name} Product ${i}`;
    const description = `High-quality ${cat.name.toLowerCase()} product numbered ${i}. Crafted for comfort and style.`;
    sampleProducts.push({ name, description, categoryId: cat.id, collectionId: col.id });
  }

  for (const p of sampleProducts) {
    const prompt = `Product photography: white background, studio-lit, close-up of '${p.name}'. Show texture and details, realistic colours, 1024x1024, high resolution.`;
    console.log('Generating image for', p.name);
    const { url } = await generateAndUpload(prompt, 'seed');

    const created = await prisma.product.create({
      data: {
        name: p.name,
        description: p.description,
        companyId,
        categoryId: p.categoryId,
        collectionId: p.collectionId,
        variants: {
          create: [
            {
              name: p.name + ' - Default',
              sprice: 799.0,
              pprice: 400.0,
              images: [url],
              companyId,
            },
          ],
        },
      },
      include: { variants: true },
    });

    console.log('Created product', created.id, 'with image', url);
  }

  console.log('Done seeding.');
}

run()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
