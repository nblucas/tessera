import type { Receipt } from '../data/expenses'

export const MAX_RECEIPT_BYTES = 1024 * 1024

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

export async function sha256Hex(data: ArrayBuffer): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', data))
}

export async function readReceipt(file: File): Promise<Receipt> {
  const [sha256, dataUrl] = await Promise.all([
    file.arrayBuffer().then(sha256Hex),
    readAsDataUrl(file),
  ])
  return {
    fileName: file.name,
    mimeType: file.type || 'application/octet-stream',
    dataUrl,
    sha256,
  }
}
