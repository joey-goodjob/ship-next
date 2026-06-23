import { headers } from 'next/headers';
import { getAuth } from '@/core/auth';
import { respErr } from '@/lib/resp';
import { findAdminCreationMedia, type AdminCreationMediaKind } from '@/modules/lyric-videos/admin';
import { hasPermission } from '@/modules/rbac/service';

const MEDIA_KINDS = new Set<AdminCreationMediaKind>([
  'source-audio',
  'processed-audio',
  'rendered-video',
]);

function isMediaKind(value: string | null): value is AdminCreationMediaKind {
  return Boolean(value && MEDIA_KINDS.has(value as AdminCreationMediaKind));
}

function proxyHeaders(response: Response) {
  const headers = new Headers();
  for (const name of [
    'content-type',
    'content-length',
    'content-range',
    'accept-ranges',
    'cache-control',
    'etag',
    'last-modified',
  ]) {
    const value = response.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (!headers.has('content-type')) {
    headers.set('content-type', 'application/octet-stream');
  }
  return headers;
}

async function handleRequest(req: Request, params: Promise<{ id: string }>) {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return respErr('Unauthorized');

  const isAdmin = await hasPermission(session.user.id, 'admin.*');
  if (!isAdmin) return respErr('Forbidden');

  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const kind = searchParams.get('kind');
  if (!isMediaKind(kind)) {
    return respErr('Invalid media kind');
  }

  const mediaUrl = await findAdminCreationMedia({ projectId: id, kind });
  if (!mediaUrl) {
    return respErr('Media is unavailable');
  }

  const upstreamHeaders = new Headers();
  const range = req.headers.get('range');
  if (range) upstreamHeaders.set('range', range);

  const response = await fetch(mediaUrl, {
    method: req.method,
    headers: upstreamHeaders,
  });

  if (!response.ok) {
    return new Response(`Failed to fetch media: ${response.statusText}`, {
      status: response.status,
    });
  }

  return new Response(response.body, {
    status: response.status,
    headers: proxyHeaders(response),
  });
}

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  return handleRequest(req, context.params);
}

export async function HEAD(req: Request, context: { params: Promise<{ id: string }> }) {
  return handleRequest(req, context.params);
}
