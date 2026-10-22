import { createError } from 'h3'
import { createTableReadinessCheck } from '~/server/utils/schemaReadiness'

// Schema belongs to schema.zmodel. Legacy YouTube types normalize on read;
// opening the gallery never migrates stored rows or changes constraints.
export const ensureEcommGalleryTable = createTableReadinessCheck(['ecomm_gallery'], 'Gallery')

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
