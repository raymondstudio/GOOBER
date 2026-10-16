import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export interface EncryptionContext { orderId: string; provider: string; environment: string }
export interface SealedPayload { keyId: string; ciphertext: string; nonce: string; tag: string }

function key() {
  const encoded = process.env.DELIVERY_KEY;
  const keyId = process.env.DELIVERY_KEY_ID;
  if (!encoded || !keyId || !/^[A-Za-z0-9+/]{43}=$/.test(encoded)) throw new Error('Delivery encryption configuration is unavailable');
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.length !== 32 || bytes.toString('base64') !== encoded) throw new Error('Delivery encryption configuration is unavailable');
  return { bytes, keyId };
}

function aad(context: EncryptionContext, keyId: string) {
  // Array encoding removes delimiter ambiguity; version and key ID are authenticated too.
  return Buffer.from(JSON.stringify(['goober.delivery.v1', keyId, context.orderId, context.provider, context.environment]));
}

export function seal(value: unknown, context: EncryptionContext): SealedPayload {
  const material = key();
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', material.bytes, nonce);
  cipher.setAAD(aad(context, material.keyId));
  const plaintext = JSON.stringify(value);
  if (plaintext === undefined || Buffer.byteLength(plaintext) > 64 * 1024) throw new Error('Delivery payload is invalid');
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return { keyId: material.keyId, nonce: nonce.toString('base64'), ciphertext: ciphertext.toString('base64'), tag: cipher.getAuthTag().toString('base64') };
}

export function open<T = unknown>(sealed: SealedPayload, context: EncryptionContext): T {
  try {
    const material = key();
    if (sealed.keyId !== material.keyId) throw new Error('Unknown key');
    const nonce = Buffer.from(sealed.nonce, 'base64');
    const tag = Buffer.from(sealed.tag, 'base64');
    const ciphertext = Buffer.from(sealed.ciphertext, 'base64');
    if (nonce.length !== 12 || tag.length !== 16 || ciphertext.length > 64 * 1024) throw new Error('Invalid envelope');
    const decipher = createDecipheriv('aes-256-gcm', material.bytes, nonce);
    decipher.setAAD(aad(context, material.keyId));
    decipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')) as T;
  } catch {
    // Never include decrypted data, ciphertext or secret-bearing provider errors in an error.
    throw new Error('Protected payload could not be authenticated');
  }
}
