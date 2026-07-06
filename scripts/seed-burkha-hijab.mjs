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
  console.error('Missing R2 credentials');
  process.exit(1);
}

const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ID, secretAccessKey: R2_SECRET },
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
  await r2Client.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: buffer, ContentType: contentType, ACL: 'public-read' }));
  return `https://images.markit.co.in/${key}`;
}

async function tryGenerateWithGemini(prompt) {
  if (!GEMINI_API_KEY) return null;
  try {
    // Try v1beta2 bearer endpoint
    const resp = await fetch('https://generativelanguage.googleapis.com/v1beta2/images:generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GEMINI_API_KEY}` },
      body: JSON.stringify({ model: 'gpt-image-1', prompt: [{ text: prompt }], size: '1024x1024' }),
    });
    if (resp.ok) {
      const j = await resp.json();
      const b64 = j?.artifacts?.[0]?.base64 || j?.data?.[0]?.b64_json || j?.images?.[0]?.b64_json;
      if (b64) return `data:image/png;base64,${b64}`;
    } else {
      const t = await resp.text().catch(() => '');
      console.warn('Gemini v1beta2 responded', resp.status, t.slice(0, 200));
    }
  } catch (e) {
    console.warn('Gemini request failed', e?.message || e);
  }
  return null;
}

function svgDataUrlForText(text) {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns='http://www.w3.org/2000/svg' width='1024' height='1024'>\n  <rect width='100%' height='100%' fill='#ffffff'/>\n  <foreignObject x='32' y='32' width='960' height='960'>\n    <div xmlns='http://www.w3.org/1999/xhtml' style='font-family: Arial, Helvetica, sans-serif; font-size:40px; color:#222; display:flex; align-items:center; justify-content:center; height:100%; text-align:center;'>${escaped}</div>\n  </foreignObject>\n</svg>`;
  const b64 = Buffer.from(svg).toString('base64');
  return `data:image/svg+xml;base64,${b64}`;
}

async function run() {
  const companyId = '8ff16195-5dda-4f09-9cff-493f571a3927';

  console.log('Deleting existing products for company', companyId);
  await prisma.product.deleteMany({ where: { companyId } });
  console.log('Deleting existing categories and collections');
  await prisma.category.deleteMany({ where: { companyId } });
  await prisma.collection.deleteMany({ where: { companyId } });

  const categories = ['Burkha', 'Hijab', 'Scarf', 'Abaya', 'Niqab', 'Modest Tops', 'Modest Dresses'];
  const collections = ['Burkha Collection', 'Hijab Essentials', 'Islamic Modest Wear'];

  const createdCats = [];
  for (const name of categories) {
    const c = await prisma.category.create({ data: { name, companyId } });
    createdCats.push(c);
  }

  const createdCols = [];
  for (const name of collections) {
    const col = await prisma.collection.create({ data: { name, companyId } });
    createdCols.push(col);
  }

  // Create 25 products distributed across categories/collections
  for (let i = 1; i <= 25; i++) {
    const cat = createdCats[i % createdCats.length];
    const col = createdCols[i % createdCols.length];
    const name = `${cat.name} ${i}`;
    const description = `Premium ${cat.name.toLowerCase()} crafted for modest wear. Item ${i}.`;

    const prompt = `Studio product photo on white background of a ${cat.name} called '${name}'. Show texture and details, realistic colors, 1024x1024.`;
    console.log('Generating image for', name);
    const gemini = await tryGenerateWithGemini(prompt);
    const dataUrl = gemini || svgDataUrlForText(name);
    const key = makeKey('seed-burkha', dataUrl.startsWith('data:image/svg') ? 'svg' : 'jpg');
    const url = await uploadBase64ToR2(dataUrl, key);

    const created = await prisma.product.create({
      data: {
        name,
        description,
        companyId,
        categoryId: cat.id,
        collectionId: col.id,
        variants: { create: [{ name: name + ' - Default', sprice: 999, pprice: 500, images: [url], companyId }] },
      },
      include: { variants: true },
    });

    console.log('Created product', created.id, 'image', url);
  }

  console.log('Seeding complete');
}

run().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });
