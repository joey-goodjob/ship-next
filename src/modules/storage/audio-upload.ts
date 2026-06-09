const AUDIO_EXTENSIONS = new Map<string, string>([
  ['audio/mpeg', 'mp3'],
  ['audio/mp3', 'mp3'],
  ['audio/wav', 'wav'],
  ['audio/x-wav', 'wav'],
  ['audio/mp4', 'm4a'],
  ['audio/x-m4a', 'm4a'],
  ['audio/aac', 'aac'],
  ['audio/ogg', 'ogg'],
  ['audio/flac', 'flac'],
]);

export function extFromAudioMime(mimeType: string, filename = '') {
  const normalizedMime = mimeType.toLowerCase();
  const mapped = AUDIO_EXTENSIONS.get(normalizedMime);
  if (mapped) return mapped;

  const fileExt = filename.split('.').pop()?.trim().toLowerCase();
  if (fileExt && ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac'].includes(fileExt)) {
    return fileExt;
  }

  if (normalizedMime.includes('mpeg') || normalizedMime.includes('mp3')) return 'mp3';
  if (normalizedMime.includes('wav')) return 'wav';
  if (normalizedMime.includes('mp4') || normalizedMime.includes('m4a')) return 'm4a';
  if (normalizedMime.includes('aac')) return 'aac';
  if (normalizedMime.includes('ogg')) return 'ogg';
  if (normalizedMime.includes('flac')) return 'flac';
  return 'mp3';
}

export function buildAudioUploadKey(params: {
  userId: string;
  digest: string;
  mimeType: string;
  filename?: string;
  uploadedAt?: Date;
}) {
  const uploadedAt = params.uploadedAt || new Date();
  const year = String(uploadedAt.getUTCFullYear());
  const month = String(uploadedAt.getUTCMonth() + 1).padStart(2, '0');
  const safeUserId = params.userId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const ext = extFromAudioMime(params.mimeType, params.filename);
  return `uploads/audio/${safeUserId}/${year}/${month}/${params.digest}.${ext}`;
}
