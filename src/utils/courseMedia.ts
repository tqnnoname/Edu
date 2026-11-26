import type {
  CourseAttachment,
  CourseChapter,
  CourseLesson,
  LessonBlock,
  LessonSection,
  MicroCourse,
  Question,
} from '../types/exam';

const uploadedDataUriCache = new Map<string, string>();

export function isBase64DataUri(value?: string | null): boolean {
  if (typeof value !== 'string') return false;
  return /^data:[a-z0-9.+-]+\/[a-z0-9.+-]+;base64,/i.test(value.trim());
}

function getDataUriCacheKey(dataUrl: string): string {
  const len = dataUrl.length;
  return `${len}:${dataUrl.slice(0, 72)}:${dataUrl.slice(Math.max(0, len - 64))}`;
}

function guessExtensionFromMime(mimeType: string, fallbackName?: string): string {
  const mime = (mimeType || '').toLowerCase();
  if (mime.includes('png')) return '.png';
  if (mime.includes('jpeg') || mime.includes('jpg')) return '.jpg';
  if (mime.includes('webp')) return '.webp';
  if (mime.includes('gif')) return '.gif';
  if (mime.includes('pdf')) return '.pdf';
  if (mime.includes('wordprocessingml')) return '.docx';
  if (mime.includes('msword')) return '.doc';
  if (mime.includes('spreadsheetml')) return '.xlsx';
  if (mime.includes('ms-excel')) return '.xls';
  if (mime.includes('presentationml')) return '.pptx';
  if (mime.includes('ms-powerpoint')) return '.ppt';
  if (mime.includes('csv')) return '.csv';
  if (mime.includes('text/plain')) return '.txt';
  if (mime.includes('mpeg') || mime.includes('mp3')) return '.mp3';
  if (mime.includes('wav')) return '.wav';
  if (mime.includes('mp4')) return '.mp4';
  if (mime.includes('webm')) return '.webm';
  if (fallbackName && fallbackName.includes('.')) {
    const ext = fallbackName.slice(fallbackName.lastIndexOf('.')).toLowerCase();
    if (/^\.[a-z0-9]{1,6}$/.test(ext) && !['.svg', '.html', '.htm', '.js'].includes(ext)) {
      return ext;
    }
  }
  return '.bin';
}

async function rasterizeSvgDataUriToPng(svgDataUrl: string): Promise<string | null> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') return null;
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.onload = () => {
        try {
          const w = Math.max(1, Math.min(2000, img.naturalWidth || img.width || 800));
          const h = Math.max(1, Math.min(2000, img.naturalHeight || img.height || 600));
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(null);
            return;
          }
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/png'));
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = svgDataUrl;
    } catch {
      resolve(null);
    }
  });
}

export async function uploadBase64MediaToUrl(
  rawDataUrl: string,
  suggestedName?: string
): Promise<string | null> {
  if (!isBase64DataUri(rawDataUrl)) return rawDataUrl || null;
  const trimmed = rawDataUrl.trim();
  const cacheKey = getDataUriCacheKey(trimmed);
  const cached = uploadedDataUriCache.get(cacheKey);
  if (cached) return cached;

  let payloadDataUrl = trimmed;
  const mimeMatch = /^data:([^;]+);base64,/i.exec(trimmed);
  let mimeType = (mimeMatch?.[1] || 'application/octet-stream').toLowerCase();

  // Server forbids SVG upload for XSS safety -> rasterize SVG images to PNG first
  if (mimeType.includes('svg')) {
    const pngDataUrl = await rasterizeSvgDataUriToPng(trimmed);
    if (!pngDataUrl) return null;
    payloadDataUrl = pngDataUrl;
    mimeType = 'image/png';
  }

  const ext = guessExtensionFromMime(mimeType, suggestedName);
  const baseName = (suggestedName || `course_media_${Date.now()}`)
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 80);
  const finalName = `${baseName || 'media'}${ext}`;

  try {
    const res = await fetch('/api/upload-file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: finalName,
        mimeType,
        base64Data: payloadDataUrl,
      }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const uploadedUrl = json?.file?.url;
    if (json?.success && typeof uploadedUrl === 'string' && uploadedUrl.trim()) {
      uploadedDataUriCache.set(cacheKey, uploadedUrl.trim());
      return uploadedUrl.trim();
    }
    return null;
  } catch {
    return null;
  }
}

export async function uploadImageOrKeepFallback(
  compressedDataUrl: string,
  suggestedName?: string
): Promise<string> {
  if (!compressedDataUrl) return '';
  const uploaded = await uploadBase64MediaToUrl(compressedDataUrl, suggestedName);
  return uploaded || compressedDataUrl;
}

export async function uploadCourseFileToUrl(
  file: File
): Promise<{ ok: boolean; url?: string; error?: string }> {
  try {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error(`Không thể đọc tệp "${file.name}"`));
      reader.readAsDataURL(file);
    });
    if (!dataUrl) {
      return { ok: false, error: 'Tệp rỗng.' };
    }
    let payloadDataUrl = dataUrl;
    let mimeType = file.type || 'application/octet-stream';
    if (mimeType.toLowerCase().includes('svg') || file.name.toLowerCase().endsWith('.svg')) {
      const png = await rasterizeSvgDataUriToPng(dataUrl);
      if (png) {
        payloadDataUrl = png;
        mimeType = 'image/png';
      }
    }
    const res = await fetch('/api/upload-file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: file.name,
        mimeType,
        base64Data: payloadDataUrl,
      }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.success || !json?.file?.url) {
      return { ok: false, error: json?.error || `HTTP ${res.status}` };
    }
    return { ok: true, url: String(json.file.url) };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Lỗi tải tệp lên máy chủ.' };
  }
}

async function offloadInlineImagesMap(
  map?: Record<string, string>
): Promise<{ nextMap?: Record<string, string>; migratedCount: number }> {
  if (!map || typeof map !== 'object') return { nextMap: map, migratedCount: 0 };
  const entries = Object.entries(map);
  if (entries.length === 0) return { nextMap: undefined, migratedCount: 0 };

  let migratedCount = 0;
  const nextMap: Record<string, string> = {};

  for (const [imgId, src] of entries) {
    if (typeof src !== 'string' || !src.trim()) continue;
    if (isBase64DataUri(src)) {
      const uploaded = await uploadBase64MediaToUrl(src, `${imgId}.png`);
      if (uploaded) {
        nextMap[imgId] = uploaded;
        migratedCount++;
      } else {
        nextMap[imgId] = src;
      }
    } else {
      nextMap[imgId] = src;
    }
  }

  return {
    nextMap: Object.keys(nextMap).length > 0 ? nextMap : undefined,
    migratedCount,
  };
}

async function offloadAttachmentsList(
  list?: CourseAttachment[]
): Promise<{ nextList?: CourseAttachment[]; migratedCount: number }> {
  if (!Array.isArray(list)) return { nextList: list, migratedCount: 0 };
  if (list.length === 0) return { nextList: [], migratedCount: 0 };

  let migratedCount = 0;
  const nextList: CourseAttachment[] = [];

  for (const att of list) {
    if (!att || typeof att !== 'object') continue;
    if (att.dataUrl && isBase64DataUri(att.dataUrl)) {
      const uploaded = att.url && !isBase64DataUri(att.url)
        ? att.url
        : await uploadBase64MediaToUrl(att.dataUrl, att.name || `${att.id}.bin`);
      if (uploaded) {
        const copy: CourseAttachment = { ...att, url: uploaded };
        delete copy.dataUrl;
        nextList.push(copy);
        migratedCount++;
      } else {
        nextList.push(att);
      }
    } else {
      nextList.push(att);
    }
  }

  return { nextList, migratedCount };
}

async function offloadQuestionMedia(
  q?: Question
): Promise<{ nextQuestion?: Question; migratedCount: number }> {
  if (!q || typeof q !== 'object') return { nextQuestion: q, migratedCount: 0 };
  let migratedCount = 0;
  const copy: Question = { ...q };

  if (copy.imageUrl && isBase64DataUri(copy.imageUrl)) {
    const url = await uploadBase64MediaToUrl(copy.imageUrl, `q_${copy.id}.png`);
    if (url) {
      copy.imageUrl = url;
      migratedCount++;
    }
  }
  if (copy.explanationImageUrl && isBase64DataUri(copy.explanationImageUrl)) {
    const url = await uploadBase64MediaToUrl(copy.explanationImageUrl, `qexp_${copy.id}.png`);
    if (url) {
      copy.explanationImageUrl = url;
      migratedCount++;
    }
  }
  if (copy.inlineImages) {
    const res = await offloadInlineImagesMap(copy.inlineImages);
    copy.inlineImages = res.nextMap;
    migratedCount += res.migratedCount;
  }
  if (Array.isArray(copy.matchingLeftItems)) {
    copy.matchingLeftItems = await Promise.all(
      copy.matchingLeftItems.map(async (it) => {
        if (it?.imageUrl && isBase64DataUri(it.imageUrl)) {
          const url = await uploadBase64MediaToUrl(it.imageUrl, `match_l_${it.id}.png`);
          if (url) {
            migratedCount++;
            return { ...it, imageUrl: url };
          }
        }
        return it;
      })
    );
  }
  if (Array.isArray(copy.matchingRightItems)) {
    copy.matchingRightItems = await Promise.all(
      copy.matchingRightItems.map(async (it) => {
        if (it?.imageUrl && isBase64DataUri(it.imageUrl)) {
          const url = await uploadBase64MediaToUrl(it.imageUrl, `match_r_${it.id}.png`);
          if (url) {
            migratedCount++;
            return { ...it, imageUrl: url };
          }
        }
        return it;
      })
    );
  }
  if (Array.isArray(copy.subQuestions)) {
    const nextSubs: Question[] = [];
    for (const sub of copy.subQuestions) {
      const subRes = await offloadQuestionMedia(sub);
      if (subRes.nextQuestion) nextSubs.push(subRes.nextQuestion);
      migratedCount += subRes.migratedCount;
    }
    copy.subQuestions = nextSubs;
  }

  return { nextQuestion: copy, migratedCount };
}

async function offloadBlockMedia(
  block: LessonBlock
): Promise<{ nextBlock: LessonBlock; migratedCount: number }> {
  let migratedCount = 0;
  const copy: LessonBlock = { ...block };

  if (copy.imageUrl && isBase64DataUri(copy.imageUrl)) {
    const url = await uploadBase64MediaToUrl(copy.imageUrl, `blk_${copy.id}.png`);
    if (url) {
      copy.imageUrl = url;
      migratedCount++;
    }
  }
  if (copy.inlineImages) {
    const res = await offloadInlineImagesMap(copy.inlineImages);
    copy.inlineImages = res.nextMap;
    migratedCount += res.migratedCount;
  }
  if (copy.attachments) {
    const attRes = await offloadAttachmentsList(copy.attachments);
    copy.attachments = attRes.nextList;
    migratedCount += attRes.migratedCount;
  }
  if (copy.question) {
    const qRes = await offloadQuestionMedia(copy.question);
    copy.question = qRes.nextQuestion;
    migratedCount += qRes.migratedCount;
  }

  return { nextBlock: copy, migratedCount };
}

async function offloadSectionMedia(
  sec: LessonSection
): Promise<{ nextSection: LessonSection; migratedCount: number }> {
  if (!sec.inlineImages) return { nextSection: sec, migratedCount: 0 };
  const res = await offloadInlineImagesMap(sec.inlineImages);
  return {
    nextSection: { ...sec, inlineImages: res.nextMap },
    migratedCount: res.migratedCount,
  };
}

async function offloadLessonMedia(
  lesson: CourseLesson
): Promise<{ nextLesson: CourseLesson; migratedCount: number }> {
  let migratedCount = 0;
  const copy: CourseLesson = { ...lesson };

  if (copy.inlineImages) {
    const res = await offloadInlineImagesMap(copy.inlineImages);
    copy.inlineImages = res.nextMap;
    migratedCount += res.migratedCount;
  }
  if (copy.attachments) {
    const attRes = await offloadAttachmentsList(copy.attachments);
    copy.attachments = attRes.nextList;
    migratedCount += attRes.migratedCount;
  }
  if (Array.isArray(copy.sections)) {
    const nextSections: LessonSection[] = [];
    for (const sec of copy.sections) {
      const sRes = await offloadSectionMedia(sec);
      nextSections.push(sRes.nextSection);
      migratedCount += sRes.migratedCount;
    }
    copy.sections = nextSections;
  }
  if (Array.isArray(copy.blocks)) {
    const nextBlocks: LessonBlock[] = [];
    for (const blk of copy.blocks) {
      const bRes = await offloadBlockMedia(blk);
      nextBlocks.push(bRes.nextBlock);
      migratedCount += bRes.migratedCount;
    }
    copy.blocks = nextBlocks;
  }

  return { nextLesson: copy, migratedCount };
}

export async function offloadCourseBase64MediaToUrls(
  course: MicroCourse
): Promise<{ course: MicroCourse; migratedCount: number }> {
  let migratedCount = 0;
  const copy: MicroCourse = { ...course };

  if (copy.coverImageUrl && isBase64DataUri(copy.coverImageUrl)) {
    const url = await uploadBase64MediaToUrl(copy.coverImageUrl, `cover_${copy.id}.png`);
    if (url) {
      copy.coverImageUrl = url;
      migratedCount++;
    }
  }
  if (copy.inlineImages) {
    const res = await offloadInlineImagesMap(copy.inlineImages);
    copy.inlineImages = res.nextMap;
    migratedCount += res.migratedCount;
  }
  if (Array.isArray(copy.chapters)) {
    const nextChapters: CourseChapter[] = [];
    for (const chap of copy.chapters) {
      const chapCopy: CourseChapter = { ...chap };
      if (chapCopy.inlineImages) {
        const res = await offloadInlineImagesMap(chapCopy.inlineImages);
        chapCopy.inlineImages = res.nextMap;
        migratedCount += res.migratedCount;
      }
      const nextLessons: CourseLesson[] = [];
      for (const les of chapCopy.lessons || []) {
        const lRes = await offloadLessonMedia(les);
        nextLessons.push(lRes.nextLesson);
        migratedCount += lRes.migratedCount;
      }
      chapCopy.lessons = nextLessons;
      nextChapters.push(chapCopy);
    }
    copy.chapters = nextChapters;
  }
  if (Array.isArray(copy.lessons)) {
    const nextFlat: CourseLesson[] = [];
    for (const les of copy.lessons) {
      const lRes = await offloadLessonMedia(les);
      nextFlat.push(lRes.nextLesson);
      migratedCount += lRes.migratedCount;
    }
    copy.lessons = nextFlat;
  }

  return { course: copy, migratedCount };
}

/**
 * Strips any remaining large Base64 data URIs before writing a document to Firestore
 * so Firestore documents stay small and never fail the 1 MiB limit.
 */
export function sanitizeInlineImagesForFirestore(
  map?: Record<string, string>
): Record<string, string> | undefined {
  if (!map || typeof map !== 'object') return undefined;
  const cleaned: Record<string, string> = {};
  for (const [k, v] of Object.entries(map)) {
    if (typeof v !== 'string' || !v.trim()) continue;
    if (isBase64DataUri(v) && v.length > 1024) continue;
    cleaned[k] = v.slice(0, 2000);
  }
  return Object.keys(cleaned).length > 0 ? cleaned : undefined;
}

export function sanitizeAttachmentsForFirestore(
  list?: CourseAttachment[]
): CourseAttachment[] | undefined {
  if (!Array.isArray(list)) return undefined;
  return list
    .filter((att) => att && typeof att === 'object')
    .slice(0, 40)
    .map((att) => {
      const cleanUrl =
        typeof att.url === 'string' && (!isBase64DataUri(att.url) || att.url.length <= 1024)
          ? att.url.slice(0, 2000)
          : undefined;
      const cleanDataUrl =
        !cleanUrl &&
        typeof att.dataUrl === 'string' &&
        (!isBase64DataUri(att.dataUrl) || att.dataUrl.length <= 1024)
          ? att.dataUrl.slice(0, 2000)
          : undefined;
      return {
        id: String(att.id || ''),
        name: String(att.name || 'Tài liệu').slice(0, 240),
        mimeType: String(att.mimeType || 'application/octet-stream').slice(0, 120),
        ...(typeof att.sizeBytes === 'number' ? { sizeBytes: att.sizeBytes } : {}),
        ...(cleanUrl ? { url: cleanUrl } : {}),
        ...(cleanDataUrl ? { dataUrl: cleanDataUrl } : {}),
        ...(att.uploadedAt ? { uploadedAt: String(att.uploadedAt).slice(0, 64) } : {}),
        ...(att.uploadedBy ? { uploadedBy: String(att.uploadedBy).slice(0, 150) } : {}),
      };
    });
}

export function sanitizeUrlForFirestore(url?: string): string | undefined {
  if (typeof url !== 'string') return undefined;
  const trimmed = url.trim();
  if (!trimmed) return undefined;
  if (isBase64DataUri(trimmed) && trimmed.length > 1024) return undefined;
  return trimmed.slice(0, 2000);
}

export function courseHasEmbeddedBase64(course: MicroCourse): boolean {
  const checkInline = (m?: Record<string, string>) =>
    Boolean(m && Object.values(m).some((v) => isBase64DataUri(v)));
  const checkAtt = (a?: CourseAttachment[]) =>
    Boolean(a && a.some((it) => isBase64DataUri(it?.dataUrl) || isBase64DataUri(it?.url)));

  if (isBase64DataUri(course.coverImageUrl) || checkInline(course.inlineImages)) return true;

  const inspectLesson = (les: CourseLesson): boolean => {
    if (checkInline(les.inlineImages) || checkAtt(les.attachments)) return true;
    if ((les.sections || []).some((s) => checkInline(s.inlineImages))) return true;
    for (const blk of les.blocks || []) {
      if (isBase64DataUri(blk.imageUrl) || checkInline(blk.inlineImages) || checkAtt(blk.attachments)) {
        return true;
      }
      const q = blk.question;
      if (q) {
        if (
          isBase64DataUri(q.imageUrl) ||
          isBase64DataUri(q.explanationImageUrl) ||
          checkInline(q.inlineImages)
        ) {
          return true;
        }
        if ((q.subQuestions || []).some((sub) => isBase64DataUri(sub.imageUrl) || checkInline(sub.inlineImages))) {
          return true;
        }
      }
    }
    return false;
  };

  if ((course.lessons || []).some(inspectLesson)) return true;
  for (const ch of course.chapters || []) {
    if (checkInline(ch.inlineImages)) return true;
    if ((ch.lessons || []).some(inspectLesson)) return true;
  }
  return false;
}
