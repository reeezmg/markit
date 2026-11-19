/** Normalize ordinary uploads to the embedded PNG/JPEG format used by all designers. */
export async function prepareDesignerImage(file: File) {
  if (file.size > 10 * 1024 * 1024) throw Error('Choose an image smaller than 10 MB.')
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  const png = bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
  const webp = String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  if (!png && !jpeg && !webp) throw Error('Choose a PNG, JPEG or WebP image.')
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(Error('This image could not be opened. Try exporting it as PNG or JPEG.')); image.src = url })
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 60000000) throw Error('The image is too large. Resize it below 60 megapixels.')
    let ratio = Math.min(1, 1800 / Math.max(image.naturalWidth, image.naturalHeight))
    const canvas = document.createElement('canvas')
    for (let attempt = 0; attempt < 8; attempt++) {
      canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio)); canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio))
      const ctx = canvas.getContext('2d')
      if (!ctx) throw Error('Image processing is unavailable in this browser.')
      ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
      let data = canvas.toDataURL('image/png')
      if (data.length > 340000) {
        ctx.globalCompositeOperation = 'destination-over'; ctx.fillStyle = 'white'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.globalCompositeOperation = 'source-over'
        data = canvas.toDataURL('image/jpeg', 0.86)
      }
      if (data.length <= 340000) return { data, width: canvas.width, height: canvas.height }
      ratio *= 0.72
    }
    throw Error('This image is too detailed. Try a smaller image.')
  } finally { URL.revokeObjectURL(url) }
}
