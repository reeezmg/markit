async function convertFileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onloadend = () => {
      const result = reader.result
      if (typeof result === 'string') {
        resolve(result)
      } else {
        reject(new Error('Failed to convert file to base64 string'))
      }
    }

    reader.onerror = () => {
      reject(new Error('File reading failed'))
    }

    reader.readAsDataURL(file)
  })
}

export async function prepareFileForApi(file: File): Promise<string> {
  return await convertFileToBase64(file)
}
