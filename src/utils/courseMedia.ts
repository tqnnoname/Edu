import type {
  ClassroomHomework,
  CourseAttachment,
  CourseChapter,
  CourseLesson,
  Exam,
  HomeworkAttachment,
  HomeworkSubmission,
  LessonBlock,
  LessonSection,
  MicroCourse,
  Question,
} from '../types/exam';
import {
  isFirestoreMediaUri,
  promoteLocalUploadUrlToFirestoreMedia,
  uploadImageAssetToFirestore,
} from './mediaAssets';

const uploadedDataUriCache = new Map<string, string>();

export function isBase64DataUri(value?: string | null): boolean {
  if (typeof value !== 'string') return false;
  return /^data:[a-z0-9.+-]+\/[a-z0-9.+-]+;base64,/i.test(value.trim());
}

function isImageDataUri(value?: string | null): boolean {
  if (typeof value !== 'string') return false;
  return /^data:image\/[a-z0-9.+-]+;base64,/i.test(value.trim());
}

function isLocalApiFileUrl(value?: string | null): boolean {
  if (typeof value !== 'string') return false;
  return value.trim().startsWith('/api/files/');
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
  if (!rawDataUrl) return null;
  const trimmed = rawDataUrl.trim();
  if (isFirestoreMediaUri(trimmed)) return trimmed;

  // Promote reachable legacy /api/files/... images into Cloud Firestore mediaAssets
  if (isLocalApiFileUrl(trimmed)) {
    const promoted = await promoteLocalUploadUrlToFirestoreMedia(trimmed);
    return promoted || trimmed;
  }

  if (!isBase64DataUri(trimmed)) return trimmed;

  const cacheKey = getDataUriCacheKey(trimmed);
  const cached = uploadedDataUriCache.get(cacheKey);
  if (cached) return cached;

  let payloadDataUrl = trimmed;
  const mimeMatch = /^data:([^;]+);base64,/i.exec(trimmed);
  let mimeType = (mimeMatch?.[1] || 'application/octet-stream').toLowerCase();

  // Rasterize SVG images to PNG first for XSS safety & universal compatibility
  if (mimeType.includes('svg')) {
    const pngDataUrl = await rasterizeSvgDataUriToPng(trimmed);
    if (!pngDataUrl) return null;
    payloadDataUrl = pngDataUrl;
    mimeType = 'image/png';
  }

  // Prefer persistent Cloud Firestore mediaAssets for all images so mobile/tablet/shared URLs never get 404
  if (isImageDataUri(payloadDataUrl)) {
    const fsUri = await uploadImageAssetToFirestore(payloadDataUrl, {
      fileName: suggestedName,
      visibility: 'public',
    });
    if (fsUri) {
      uploadedDataUriCache.set(cacheKey, fsUri);
      return fsUri;
    }
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

    // Store images directly in Cloud Firestore mediaAssets so cross-device views never lose them
    if (isImageDataUri(payloadDataUrl)) {
      const fsUri = await uploadImageAssetToFirestore(payloadDataUrl, {
        fileName: file.name,
        visibility: 'public',
      });
      if (fsUri) {
        return { ok: true, url: fsUri };
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

async function resolveOrOffloadImageSource(
  src: string | undefined,
  suggestedName: string
): Promise<{ nextSrc?: string; changed: boolean }> {
  if (typeof src !== 'string') return { nextSrc: src, changed: false };
  const trimmed = src.trim();
  if (!trimmed) return { nextSrc: src, changed: false };
  if (isBase64DataUri(trimmed)) {
    const uploaded = await uploadBase64MediaToUrl(trimmed, suggestedName);
    if (uploaded && uploaded !== trimmed) {
      return { nextSrc: uploaded, changed: true };
    }
    return { nextSrc: src, changed: false };
  }
  if (isLocalApiFileUrl(trimmed)) {
    const promoted = await promoteLocalUploadUrlToFirestoreMedia(trimmed);
    if (promoted && promoted !== trimmed) {
      return { nextSrc: promoted, changed: true };
    }
  }
  return { nextSrc: src, changed: false };
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
    const res = await resolveOrOffloadImageSource(src, `${imgId}.png`);
    nextMap[imgId] = res.nextSrc || src;
    if (res.changed) migratedCount++;
  }

  return {
    nextMap: Object.keys(nextMap).length > 0 ? nextMap : undefined,
    migratedCount,
  };
}

async function offloadAttachmentsList<T extends CourseAttachment | HomeworkAttachment>(
  list?: T[]
): Promise<{ nextList?: T[]; migratedCount: number }> {
  if (!Array.isArray(list)) return { nextList: list, migratedCount: 0 };
  if (list.length === 0) return { nextList: [], migratedCount: 0 };

  let migratedCount = 0;
  const nextList: T[] = [];

  for (const att of list) {
    if (!att || typeof att !== 'object') continue;
    if (att.dataUrl && isBase64DataUri(att.dataUrl)) {
      const uploaded = att.url && !isBase64DataUri(att.url) && !isLocalApiFileUrl(att.url)
        ? att.url
        : await uploadBase64MediaToUrl(att.dataUrl, att.name || `${att.id}.bin`);
      if (uploaded) {
        const copy: T = { ...att, url: uploaded };
        delete (copy as any).dataUrl;
        nextList.push(copy);
        migratedCount++;
      } else {
        nextList.push(att);
      }
    } else if (att.url && isLocalApiFileUrl(att.url)) {
      const promoted = await promoteLocalUploadUrlToFirestoreMedia(att.url);
      if (promoted && promoted !== att.url) {
        nextList.push({ ...att, url: promoted });
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

  if (copy.imageUrl) {
    const res = await resolveOrOffloadImageSource(copy.imageUrl, `q_${copy.id}.png`);
    if (res.changed && res.nextSrc) {
      copy.imageUrl = res.nextSrc;
      migratedCount++;
    }
  }
  if (copy.explanationImageUrl) {
    const res = await resolveOrOffloadImageSource(copy.explanationImageUrl, `qexp_${copy.id}.png`);
    if (res.changed && res.nextSrc) {
      copy.explanationImageUrl = res.nextSrc;
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
        if (it?.imageUrl) {
          const res = await resolveOrOffloadImageSource(it.imageUrl, `match_l_${it.id}.png`);
          if (res.changed && res.nextSrc) {
            migratedCount++;
            return { ...it, imageUrl: res.nextSrc };
          }
        }
        return it;
      })
    );
  }
  if (Array.isArray(copy.matchingRightItems)) {
    copy.matchingRightItems = await Promise.all(
      copy.matchingRightItems.map(async (it) => {
        if (it?.imageUrl) {
          const res = await resolveOrOffloadImageSource(it.imageUrl, `match_r_${it.id}.png`);
          if (res.changed && res.nextSrc) {
            migratedCount++;
            return { ...it, imageUrl: res.nextSrc };
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

  if (copy.imageUrl) {
    const res = await resolveOrOffloadImageSource(copy.imageUrl, `blk_${copy.id}.png`);
    if (res.changed && res.nextSrc) {
      copy.imageUrl = res.nextSrc;
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

  if (copy.homework && typeof copy.homework === 'object') {
    const hwCopy: any = { ...copy.homework };
    if (hwCopy.inlineImages) {
      const res = await offloadInlineImagesMap(hwCopy.inlineImages);
      hwCopy.inlineImages = res.nextMap;
      migratedCount += res.migratedCount;
    }
    if (Array.isArray(hwCopy.attachments)) {
      const attRes = await offloadAttachmentsList(hwCopy.attachments);
      hwCopy.attachments = attRes.nextList;
      migratedCount += attRes.migratedCount;
    }
    copy.homework = hwCopy;
  }

  return { nextLesson: copy, migratedCount };
}

export async function offloadCourseBase64MediaToUrls(
  course: MicroCourse
): Promise<{ course: MicroCourse; migratedCount: number }> {
  let migratedCount = 0;
  const copy: MicroCourse = { ...course };

  if (copy.coverImageUrl) {
    const res = await resolveOrOffloadImageSource(copy.coverImageUrl, `cover_${copy.id}.png`);
    if (res.changed && res.nextSrc) {
      copy.coverImageUrl = res.nextSrc;
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

export async function offloadExamBase64MediaToUrls(
  exam: Exam
): Promise<{ exam: Exam; migratedCount: number }> {
  let migratedCount = 0;
  const copy: Exam = { ...exam };

  if (Array.isArray(copy.questions)) {
    const nextQuestions: Question[] = [];
    for (const q of copy.questions) {
      const res = await offloadQuestionMedia(q);
      if (res.nextQuestion) nextQuestions.push(res.nextQuestion);
      migratedCount += res.migratedCount;
    }
    copy.questions = nextQuestions;
  }

  if (copy.attachedFile?.url && isLocalApiFileUrl(copy.attachedFile.url)) {
    const promoted = await promoteLocalUploadUrlToFirestoreMedia(copy.attachedFile.url);
    if (promoted && promoted !== copy.attachedFile.url) {
      copy.attachedFile = { ...copy.attachedFile, url: promoted };
      migratedCount++;
    }
  } else if (
    copy.attachedFile?.dataUrl &&
    (isImageDataUri(copy.attachedFile.dataUrl) ||
      (isBase64DataUri(copy.attachedFile.dataUrl) && copy.attachedFile.dataUrl.length > 400000))
  ) {
    const uploaded = await uploadBase64MediaToUrl(copy.attachedFile.dataUrl, copy.attachedFile.name);
    if (uploaded) {
      const nextAtt = { ...copy.attachedFile, url: uploaded };
      delete nextAtt.dataUrl;
      copy.attachedFile = nextAtt;
      migratedCount++;
    }
  }

  return { exam: copy, migratedCount };
}

export async function offloadClassroomHomeworkMediaToUrls(
  hw: ClassroomHomework
): Promise<{ homework: ClassroomHomework; migratedCount: number }> {
  let migratedCount = 0;
  const copy: ClassroomHomework = { ...hw };
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
  return { homework: copy, migratedCount };
}

export async function offloadHomeworkSubmissionMediaToUrls(
  sub: HomeworkSubmission
): Promise<{ submission: HomeworkSubmission; migratedCount: number }> {
  let migratedCount = 0;
  const copy: HomeworkSubmission = { ...sub };

  if (Array.isArray(copy.imageUrls)) {
    const nextUrls: string[] = [];
    for (let i = 0; i < copy.imageUrls.length; i++) {
      const raw = copy.imageUrls[i];
      if (!raw) continue;
      const res = await resolveOrOffloadImageSource(raw, `hw_${copy.id}_${i}.png`);
      nextUrls.push(res.nextSrc || raw);
      if (res.changed) migratedCount++;
    }
    copy.imageUrls = nextUrls;
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

  return { submission: copy, migratedCount };
}

/**
 * Strips any remaining large Base64 data URIs before writing a document to Firestore
 * so Firestore documents stay small and never fail the 1 MiB limit.
 * Preserves `fsmedia://<assetId>` URIs intact.
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
  const needsMigration = (v?: string) => isBase64DataUri(v) || isLocalApiFileUrl(v);
  const checkInline = (m?: Record<string, string>) =>
    Boolean(m && Object.values(m).some((v) => needsMigration(v)));
  const checkAtt = (a?: CourseAttachment[]) =>
    Boolean(a && a.some((it) => isBase64DataUri(it?.dataUrl) || needsMigration(it?.url)));

  if (needsMigration(course.coverImageUrl) || checkInline(course.inlineImages)) return true;

  const inspectLesson = (les: CourseLesson): boolean => {
    if (checkInline(les.inlineImages) || checkAtt(les.attachments)) return true;
    if ((les.sections || []).some((s) => checkInline(s.inlineImages))) return true;
    for (const blk of les.blocks || []) {
      if (needsMigration(blk.imageUrl) || checkInline(blk.inlineImages) || checkAtt(blk.attachments)) {
        return true;
      }
      const q = blk.question;
      if (q) {
        if (
          needsMigration(q.imageUrl) ||
          needsMigration(q.explanationImageUrl) ||
          checkInline(q.inlineImages)
        ) {
          return true;
        }
        if ((q.subQuestions || []).some((sub) => needsMigration(sub.imageUrl) || checkInline(sub.inlineImages))) {
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

