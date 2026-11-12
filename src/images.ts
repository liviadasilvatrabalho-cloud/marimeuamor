import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { pool } from '../db';

const UPLOAD_ROOT = path.resolve(process.cwd(), 'data', 'uploads');

const DATA_URL_RE = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/;

function extensionFor(mimeType: string) {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
  };
  return map[mimeType] || 'bin';
}

/**
 * Percorre o AppState e substitui data URLs de imagem por caminhos servidos
 * por /api/files/:id. Os bytes vão para data/uploads e apenas os metadados
 * ficam no Postgres (storage_files).
 */
export async function persistDataUrls(
  value: any,
  profileId: string | null,
  bucket = 'meal-photos'
): Promise<{ value: any; replaced: number }> {
  let replaced = 0;

  async function walk(node: any): Promise<any> {
    if (typeof node === 'string') {
      const match = node.match(DATA_URL_RE);
      if (!match) return node;
      const [, mime, base64] = match;
      const buffer = Buffer.from(base64, 'base64');
      if (!buffer.length) return node;

      fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
      const id = crypto.randomUUID();
      const fileName = `${id}.${extensionFor(mime)}`;
      fs.writeFileSync(path.join(UPLOAD_ROOT, fileName), buffer);

      if (pool) {
        await pool.query(
          `INSERT INTO storage_files
             (id, bucket, file_path, file_name, mime_type, size_bytes, uploaded_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [id, bucket, fileName, fileName, mime, buffer.length, profileId]
        );
      }
      replaced++;
      return `/api/files/${id}`;
    }

    if (Array.isArray(node)) {
      const out: any[] = [];
      for (const item of node) out.push(await walk(item));
      return out;
    }

    if (node && typeof node === 'object') {
      const out: Record<string, any> = {};
      for (const [key, item] of Object.entries(node)) out[key] = await walk(item);
      return out;
    }

    return node;
  }

  const result = await walk(value);
  return { value: result, replaced };
}
