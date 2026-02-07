export function base64ToFile(base64: string, filename: string = 'cover.png'): File {
  const arr = base64.split(',')
  const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/png'
  const bstr = atob(arr[1])
  let n = bstr.length
  const u8arr = new Uint8Array(n)
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n)
  }
  return new File([u8arr], filename, { type: mime })
}

export function isBase64(str: string): boolean {
  return typeof str === 'string' && str.startsWith('data:image/')
}
