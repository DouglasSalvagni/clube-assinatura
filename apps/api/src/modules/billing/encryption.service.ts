import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
@Injectable()
export class EncryptionService {
  private key(): Buffer {
    const raw = process.env.ENCRYPTION_KEY || 'development-only-encryption-key';
    return /^[a-f0-9]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : createHash('sha256').update(raw).digest();
  }
  encrypt(value: string): string {
    const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return [iv.toString('base64'), cipher.getAuthTag().toString('base64'), encrypted.toString('base64')].join('.');
  }
  decrypt(value: string): string {
    const [iv, tag, payload] = value.split('.');
    const decipher = createDecipheriv('aes-256-gcm', this.key(), Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(payload, 'base64')), decipher.final()]).toString('utf8');
  }
}
