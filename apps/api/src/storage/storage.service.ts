import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';

@Injectable()
export class StorageService implements OnModuleInit {
  private client: S3Client | null = null;
  private bucket = process.env.S3_BUCKET || 'gov-office-files';
  private localDir = join(process.cwd(), '.local-storage');
  private useLocal = false;

  async onModuleInit() {
    const endpoint = process.env.S3_ENDPOINT;
    if (!endpoint) {
      this.useLocal = true;
      await mkdir(this.localDir, { recursive: true });
      return;
    }
    this.client = new S3Client({
      region: process.env.S3_REGION || 'us-east-1',
      endpoint,
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY || 'gowminio',
        secretAccessKey: process.env.S3_SECRET_KEY || 'gowminio_change_me',
      },
    });
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      try {
        await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
      } catch {
        this.useLocal = true;
        await mkdir(this.localDir, { recursive: true });
      }
    }
  }

  async putObject(bytes: Buffer, contentType: string, prefix = 'attachments') {
    const key = `${prefix}/${randomUUID()}`;
    if (this.useLocal || !this.client) {
      await writeFile(join(this.localDir, key.replace(/\//g, '_')), bytes);
      return key;
    }
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: bytes,
        ContentType: contentType,
      }),
    );
    return key;
  }

  async getObject(key: string): Promise<Buffer> {
    if (this.useLocal || !this.client) {
      return readFile(join(this.localDir, key.replace(/\//g, '_')));
    }
    const res = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    const stream = res.Body as NodeJS.ReadableStream;
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
}
