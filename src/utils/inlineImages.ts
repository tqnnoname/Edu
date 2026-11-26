import type React from 'react';
import type { LessonBlock, Question } from '../types/exam';

/**
 * Runtime registry for implicit inline images inserted via `[[img:id|title]]` tokens.
 * Keeps raw image data URLs / URLs completely hidden from text editors while allowing
 * cross-component live preview before saving into Question/LessonBlock `inlineImages` maps.
 */
const inMemoryImageRegistry = new Map<string, string>();

const INLINE_TOKEN_REGEX = /\[\[img:([a-zA-Z0-9_-]+)(?:\|([^\]]*))?\]\]/g;
const LEGACY_MD_IMG_REGEX = /!\[([^\]]*)\]\(([^)]+)\)/g;

export interface InlineImageMatch {
  fullMatch: string;
  id: string;
  title: string;
  src?: string;
  start: number;
  end: number;
}

export interface UnifiedInlineImageMatch {
  fullMatch: string;
  id: string;
  title: string;
  src?: string;
  isLegacyMarkdown: boolean;
}

export function sanitizeInlineImageTitle(title?: string): string {
  return String(title || '')
    .replace(/[\[\]]/g, '')
    .replace(/\|/g, '/')
    .replace(/\r?\n/g, ' ')
    .trim();
}

export function generateImplicitImageId(): string {
  return `img_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Registers an image source (compressed data URL or external URL) implicitly under a short ID.
 */
export function registerImplicitImage(src: string, preferredId?: string): string {
  const cleanSrc = String(src || '').trim();
  const id = preferredId && /^[a-zA-Z0-9_-]+$/.test(preferredId)
    ? preferredId
    : generateImplicitImageId();
  if (cleanSrc) {
    inMemoryImageRegistry.set(id, cleanSrc);
  }
  return id;
}

/**
 * Populates runtime registry from a persisted `inlineImages` map on a Question or LessonBlock.
 */
export function registerImplicitImagesMap(map?: Record<string, string> | null): void {
  if (!map || typeof map !== 'object') return;
  Object.entries(map).forEach(([id, src]) => {
    if (id && typeof src === 'string' && src.trim()) {
      inMemoryImageRegistry.set(id, src.trim());
    }
  });
}

/**
 * Resolves an implicit image ID from scoped map first, then runtime registry.
 */
export function resolveImplicitImage(
  id: string,
  scopedMap?: Record<string, string> | null
): string | undefined {
  if (!id) return undefined;
  const fromScoped = scopedMap?.[id];
  if (typeof fromScoped === 'string' && fromScoped.trim()) {
    return fromScoped.trim();
  }
  return inMemoryImageRegistry.get(id);
}

/**
 * Formats a clean cursor-insertable token without exposing raw URLs or base64 data.
 */
export function formatInlineImageToken(id: string, title?: string): string {
  const cleanTitle = sanitizeInlineImageTitle(title);
  return cleanTitle ? `[[img:${id}|${cleanTitle}]]` : `[[img:${id}]]`;
}

export function extractInlineImageTokens(
  text: string,
  scopedMap?: Record<string, string> | null
): InlineImageMatch[] {
  if (!text) return [];
  const results: InlineImageMatch[] = [];
  const regex = new RegExp(INLINE_TOKEN_REGEX.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    const id = m[1];
    const title = (m[2] || '').trim();
    results.push({
      fullMatch: m[0],
      id,
      title,
      src: resolveImplicitImage(id, scopedMap),
      start: m.index,
      end: m.index + m[0].length,
    });
  }
  return results;
}

export function extractAllInlineImages(
  text: string,
  scopedMap?: Record<string, string> | null
): UnifiedInlineImageMatch[] {
  if (!text) return [];
  const results: UnifiedInlineImageMatch[] = [];

  for (const tok of extractInlineImageTokens(text, scopedMap)) {
    results.push({
      fullMatch: tok.fullMatch,
      id: tok.id,
      title: tok.title,
      src: tok.src,
      isLegacyMarkdown: false,
    });
  }

  const mdRegex = new RegExp(LEGACY_MD_IMG_REGEX.source, 'g');
  let m: RegExpExecArray | null;
  let legacyIdx = 0;
  while ((m = mdRegex.exec(text)) !== null) {
    results.push({
      fullMatch: m[0],
      id: `legacy_${legacyIdx++}`,
      title: (m[1] || '').trim(),
      src: (m[2] || '').trim(),
      isLegacyMarkdown: true,
    });
  }

  return results;
}

export function updateInlineImageTitleInText(
  text: string,
  match: UnifiedInlineImageMatch,
  newTitle: string
): string {
  if (!text || !match.fullMatch) return text;
  const cleanTitle = sanitizeInlineImageTitle(newTitle);
  const replacement = match.isLegacyMarkdown
    ? `![${cleanTitle || 'Hình minh họa'}](${match.src || ''})`
    : formatInlineImageToken(match.id, cleanTitle);
  return text.replace(match.fullMatch, replacement);
}

export function removeInlineImageFromText(text: string, fullMatch: string): string {
  if (!text || !fullMatch) return text;
  return text
    .replace(fullMatch, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/**
 * Collects only the `inlineImages` entries actually referenced by `[[img:id|...]]` tokens
 * in the provided strings, preventing orphaned image payloads from bloating storage.
 */
export function collectUsedInlineImages(
  texts: (string | undefined | null)[],
  existingMap?: Record<string, string> | null
): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const t of texts) {
    if (!t) continue;
    for (const tok of extractInlineImageTokens(t, existingMap)) {
      const resolved = resolveImplicitImage(tok.id, existingMap);
      if (resolved) {
        out[tok.id] = resolved;
      }
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Gathers all used implicit inline images across every text field of a Question
 * (including subQuestions) so `q.inlineImages` stays complete and self-contained.
 */
export function buildQuestionInlineImagesMap(q: Question): Record<string, string> | undefined {
  const texts: (string | undefined | null)[] = [
    q.question,
    q.explanation,
    q.sampleAnswer,
    ...(q.options || []),
    ...(q.tfItems || []).map((it) => it.statement),
    ...(q.matchingLeftItems || []).map((it) => it.content),
    ...(q.matchingRightItems || []).map((it) => it.content),
  ];

  const existing: Record<string, string> = { ...(q.inlineImages || {}) };
  (q.subQuestions || []).forEach((sub) => {
    texts.push(
      sub.question,
      sub.explanation,
      sub.sampleAnswer,
      ...(sub.options || []),
      ...(sub.tfItems || []).map((it) => it.statement),
      ...(sub.matchingLeftItems || []).map((it) => it.content),
      ...(sub.matchingRightItems || []).map((it) => it.content)
    );
    if (sub.inlineImages) {
      Object.assign(existing, sub.inlineImages);
    }
  });

  return collectUsedInlineImages(texts, existing);
}

export function buildBlockInlineImagesMap(block: LessonBlock): Record<string, string> | undefined {
  return collectUsedInlineImages(
    [block.contentMarkdown, block.caption, block.title],
    block.inlineImages
  );
}

/**
 * Extracts an image File from a clipboard paste event if the user pasted a screenshot / copied image.
 */
export function extractImageFileFromClipboardEvent(
  e: ClipboardEvent | React.ClipboardEvent
): File | null {
  const dt = e.clipboardData;
  if (!dt) return null;
  if (dt.files && dt.files.length > 0) {
    for (let i = 0; i < dt.files.length; i++) {
      const f = dt.files[i];
      if (f && f.type && f.type.startsWith('image/')) {
        return f;
      }
    }
  }
  if (dt.items && dt.items.length > 0) {
    for (let i = 0; i < dt.items.length; i++) {
      const item = dt.items[i];
      if (item && item.kind === 'file' && item.type.startsWith('image/')) {
        const f = item.getAsFile();
        if (f) return f;
      }
    }
  }
  return null;
}

export function formatInlineTokensForPlainText(text: string): string {
  if (!text) return '';
  return text.replace(new RegExp(INLINE_TOKEN_REGEX.source, 'g'), (_, _id, rawTitle) => {
    const clean = String(rawTitle || '').trim();
    return clean ? `[Hình ảnh: ${clean}]` : '[Hình ảnh minh họa]';
  });
}
