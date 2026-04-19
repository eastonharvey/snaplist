import { createHash, randomBytes, createCipheriv, createDecipheriv } from 'crypto'

export function generateKey(): string {
  return `sk_${randomBytes(32).toString('hex')}`
}

export function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex')
}

function encryptionKey(): Buffer {
  const secret = process.env.API_KEY_ENCRYPTION_SECRET
  if (!secret || secret.length !== 64) {
    throw new Error('API_KEY_ENCRYPTION_SECRET must be a 64-char hex string')
  }
  return Buffer.from(secret, 'hex')
}

export function encryptKey(key: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const encrypted = Buffer.concat([cipher.update(key, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`
}

export function decryptKey(stored: string): string {
  const [ivHex, authTagHex, dataHex] = stored.split(':')
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')
  const data = Buffer.from(dataHex, 'hex')
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv)
  decipher.setAuthTag(authTag)
  return decipher.update(data).toString('utf8') + decipher.final('utf8')
}
