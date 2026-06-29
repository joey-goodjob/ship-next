import { headers } from 'next/headers';
import { envConfigs } from '@/config';
import { md5 } from '@/lib/hash';
import { respData, respErr } from '@/lib/resp';
import { getAuth } from '@/core/auth';
import { getAllConfigs } from '@/modules/config/service';
import { getStorage, isStorageConfigured } from '@/modules/storage/service';

// Allowlist of raster image types only. SVG is intentionally excluded:
// SVG can embed <script>/HTML and, if served from our domain, becomes an
// XSS / social-engineering vector (Safe Browsing risk).
const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/heic': 'heic',
  'image/heif': 'heif',
};

const ALLOWED_IMAGE_TYPES = new Set(Object.keys(MIME_TO_EXT));

const extFromMime = (mimeType: string) => MIME_TO_EXT[mimeType] || '';

export async function POST(req: Request) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) return respErr('Unauthorized');

    const formData = await req.formData();
    const files = formData.getAll('files') as File[];
    if (!files.length) return respErr('No files provided');

    const configs = await getAllConfigs();
    const inlineMaxBytes = (Number(configs.inline_image_max_kb || envConfigs.inline_image_max_kb) || 2048) * 1024;
    const useStorage = isStorageConfigured(configs);
    const storage = useStorage ? getStorage(configs) : null;
    const uploadResults: Array<{ url: string; key: string; filename: string; deduped: boolean }> = [];

    for (const file of files) {
      if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
        return respErr(
          `File ${file.name} has an unsupported image type: ${file.type || 'unknown'}. Allowed: JPG, PNG, WebP, GIF, AVIF, HEIC.`,
        );
      }

      const arrayBuffer = await file.arrayBuffer();
      const body = new Uint8Array(arrayBuffer);

      // No storage configured → return data URL (caller persists it).
      if (!storage) {
        if (body.length > inlineMaxBytes) {
          const limitKb = Math.round(inlineMaxBytes / 1024);
          return respErr(
            `Image too large for inline storage (${(body.length / 1024).toFixed(0)}KB > ${limitKb}KB). Configure STORAGE_* env vars or use a smaller image.`,
          );
        }
        const base64 = Buffer.from(body).toString('base64');
        const dataUrl = `data:${file.type};base64,${base64}`;
        uploadResults.push({
          url: dataUrl,
          key: '',
          filename: file.name,
          deduped: false,
        });
        continue;
      }

      const digest = md5(body);
      const ext = extFromMime(file.type) || file.name.split('.').pop() || 'bin';
      const key = `uploads/${digest}.${ext}`;

      const exists = await storage.exists({ key });
      if (exists) {
        const publicUrl = storage.getPublicUrl({ key });
        if (publicUrl) {
          uploadResults.push({ url: publicUrl, key, filename: file.name, deduped: true });
          continue;
        }
      }

      const result = await storage.uploadFile({
        body,
        key,
        contentType: file.type,
        disposition: 'inline',
      });

      if (!result.success || !result.url) {
        return respErr(result.error || 'Upload failed');
      }

      uploadResults.push({
        url: result.url,
        key: result.key || key,
        filename: file.name,
        deduped: false,
      });
    }

    return respData({
      urls: uploadResults.map((r) => r.url),
      results: uploadResults,
    });
  } catch (e: any) {
    console.error('upload image failed:', e);
    return respErr(e?.message || 'upload image failed');
  }
}
