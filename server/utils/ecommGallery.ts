import { createError } from 'h3'
import { pool } from '~/server/db'

/**
 * Lazily provisions the ecomm_gallery table (mirrors the ecommFaqs pattern).
 * Uses CREATE TABLE IF NOT EXISTS so we never run a destructive `prisma db push`
 * against the shared production DB.
 *
 * A gallery row is either a PHOTO or a VIDEO (`type`), and carries an uploaded
 * R2 object (`media_key`) and/or an external link (`url`) — at least one of the
 * two must be present, both may be set at once:
 *   - VIDEO: `media_key` = uploaded video in R2, `url` = YouTube video/Short link
 *   - PHOTO: `media_key` = uploaded image in R2, `url` = external image URL
 *
 * Legacy rows were YouTube-only and stored `type = 'YOUTUBE'`; they are migrated
 * to 'VIDEO' here (their link already lives in `url`).
 */
const provisionEcommGalleryTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ecomm_gallery (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'VIDEO',
      media_key TEXT,
      url TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      status BOOLEAN NOT NULL DEFAULT TRUE
    )
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS ecomm_gallery_company_status_sort_idx
    ON ecomm_gallery (company_id, status, sort_order)
  `)

  // Legacy YouTube-only rows → VIDEO (idempotent).
  await pool.query(`UPDATE ecomm_gallery SET type = 'VIDEO' WHERE type = 'YOUTUBE'`)

  await pool.query(`ALTER TABLE ecomm_gallery ALTER COLUMN type SET DEFAULT 'VIDEO'`)

  // A row is meaningless without something to render — enforce it in the DB too.
  // NOT VALID so a stray legacy row with neither can't make this statement (and
  // with it every gallery request) fail; inserts and updates are still checked.
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ecomm_gallery_media_present_chk'
      ) THEN
        ALTER TABLE ecomm_gallery
        ADD CONSTRAINT ecomm_gallery_media_present_chk
        CHECK (media_key IS NOT NULL OR url IS NOT NULL) NOT VALID;
      END IF;
    END
    $$;
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS ecomm_gallery_company_type_status_sort_idx
    ON ecomm_gallery (company_id, type, status, sort_order)
  `)
}

// Provisioning now includes migration statements, so run it once per process
// rather than on every gallery request. A failure clears the memo so the next
// request retries instead of inheriting a broken table.
let provisioned: Promise<void> | null = null

export const ensureEcommGalleryTable = () => {
  if (!provisioned) {
    provisioned = provisionEcommGalleryTable().catch((error) => {
      provisioned = null
      throw error
    })
  }
  return provisioned
}

export const GALLERY_TYPES = ['PHOTO', 'VIDEO'] as const
export type GalleryType = (typeof GALLERY_TYPES)[number]

/** Legacy 'YOUTUBE' rows read before the migration lands are videos. */
export const normalizeGalleryType = (value: unknown): GalleryType =>
  String(value || '').toUpperCase() === 'PHOTO' ? 'PHOTO' : 'VIDEO'

export const YOUTUBE_RE = /(?:youtu\.be\/|v=|\/shorts\/|\/embed\/|\/live\/)([A-Za-z0-9_-]{11})/

/** Same rules as the R2 upload routes — keys are stored, never trusted from the client blindly. */
export const isValidMediaKey = (value: string) =>
  value.length <= 512
  && /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(value)
  && !value.split('/').includes('..')

export const isHttpUrl = (value: string) => /^https?:\/\/\S+$/i.test(value)

/**
 * A gallery row needs an uploaded file, an external link, or both — never neither.
 * Throws a 400 describing what is wrong; returns the cleaned values on success.
 */
export function validateGalleryMedia(input: {
  type: GalleryType
  mediaKey: string | null
  url: string | null
}) {
  const { type } = input
  const mediaKey = input.mediaKey?.trim() || null
  const url = input.url?.trim() || null

  if (!mediaKey && !url) {
    throw createError({
      statusCode: 400,
      statusMessage: type === 'VIDEO'
        ? 'Upload a video or add a YouTube link (or both)'
        : 'Upload a photo or add an image link (or both)',
    })
  }

  if (mediaKey && !isValidMediaKey(mediaKey)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid uploaded media reference' })
  }

  if (url) {
    if (!isHttpUrl(url)) {
      throw createError({ statusCode: 400, statusMessage: 'Link must be a valid http(s) URL' })
    }
    if (type === 'VIDEO' && !YOUTUBE_RE.test(url)) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Video links must be a YouTube video or Short URL',
      })
    }
  }

  return { type, mediaKey, url }
}
