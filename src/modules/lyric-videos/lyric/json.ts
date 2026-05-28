import { createHash } from 'node:crypto';
import { ACTIVE_RUN_STATUSES } from './types';

export function safeJson(value: unknown) {
  return JSON.stringify(value ?? {});
}

export function parseJson<T>(value: unknown, fallback: T): T {
  if (!value || typeof value !== 'string') return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function chatContentToText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && 'text' in part) return String((part as any).text || '');
        if (part && typeof part === 'object' && 'content' in part) return chatContentToText((part as any).content);
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  if (value && typeof value === 'object') return JSON.stringify(value);
  return '';
}

export function parseJsonLoose<T>(value: unknown, fallback: T): T {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as T;
  if (Array.isArray(value)) return value as T;

  const text = chatContentToText(value).trim();
  if (!text) return fallback;

  const candidates = [text];
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) candidates.push(fenced[1].trim());

  const objectStart = text.indexOf('{');
  const objectEnd = text.lastIndexOf('}');
  if (objectStart >= 0 && objectEnd > objectStart) {
    candidates.push(text.slice(objectStart, objectEnd + 1));
  }

  const arrayStart = text.indexOf('[');
  const arrayEnd = text.lastIndexOf(']');
  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    candidates.push(text.slice(arrayStart, arrayEnd + 1));
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // Try the next likely JSON shape.
    }
  }

  return fallback;
}

export function previewText(value: unknown, maxLength = 1200) {
  return chatContentToText(value).replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

export function normalizeTitle(title?: string) {
  return title?.trim() || 'Untitled lyric video';
}

export function normalizePercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function requestHash(value: unknown) {
  return createHash('sha256').update(safeJson(value)).digest('hex');
}

export function isActiveRunStatus(status?: string | null) {
  return ACTIVE_RUN_STATUSES.includes(status as any);
}

export function parseJsonField<T>(value: unknown, fallback: T): T {
  return parseJson<T>(value, fallback);
}

export function sceneTextFromLineIds(linkedLineIds: string[], lines: any[]) {
  const idSet = new Set(linkedLineIds);
  return lines
    .filter((line) => idSet.has(line.id))
    .map((line) => line.text)
    .join(' ');
}
