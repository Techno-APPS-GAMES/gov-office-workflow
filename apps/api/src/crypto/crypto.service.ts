import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from 'crypto';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class CryptoService {
  private masterKey(): Buffer {
    const hex = process.env.FILE_ENCRYPTION_MASTER_KEY || '';
    if (hex.length < 64) {
      // Dev fallback — production must set env
      return scryptSync('dev-only-master-key-change-me', 'gow-salt', 32);
    }
    return Buffer.from(hex.slice(0, 64), 'hex');
  }

  async hashPassword(password: string) {
    return bcrypt.hash(password, 12);
  }

  async verifyPassword(password: string, hash: string) {
    return bcrypt.compare(password, hash);
  }

  sha256(input: string | Buffer) {
    return createHash('sha256').update(input).digest('hex');
  }

  encryptSecret(plain: string): string {
    const iv = randomBytes(12);
    const key = this.masterKey();
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, enc]).toString('base64');
  }

  decryptSecret(payload: string): string {
    const buf = Buffer.from(payload, 'base64');
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const data = buf.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', this.masterKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  }

  /** Envelope encrypt file bytes; returns ciphertext + wrapped DEK */
  encryptFile(plain: Buffer): { ciphertext: Buffer; wrappedDek: string; sha256: string } {
    const dek = randomBytes(32);
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', dek, iv);
    const enc = Buffer.concat([cipher.update(plain), cipher.final()]);
    const tag = cipher.getAuthTag();
    const ciphertext = Buffer.concat([iv, tag, enc]);
    const wrappedDek = this.encryptSecret(dek.toString('base64'));
    return { ciphertext, wrappedDek, sha256: this.sha256(plain) };
  }

  decryptFile(ciphertext: Buffer, wrappedDek: string): Buffer {
    const dek = Buffer.from(this.decryptSecret(wrappedDek), 'base64');
    const iv = ciphertext.subarray(0, 12);
    const tag = ciphertext.subarray(12, 28);
    const data = ciphertext.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', dek, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]);
  }
}
