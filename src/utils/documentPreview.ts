import mammoth from 'mammoth';
import DOMPurify from 'dompurify';
import * as XLSX from 'xlsx';

export interface PreviewableDocument {
  id?: string;
  name: string;
  mimeType?: string;
  sizeBytes?: number;
  dataUrl?: string;
  url?: string;
}

export type ResolvedDocumentKind =
  | 'pdf'
  | 'docx'
  | 'doc_legacy'
  | 'spreadsheet'
  | 'ppt'
  | 'text'
  | 'image'
  | 'audio'
  | 'video'
  | 'link'
  | 'unknown';

export function isSafeDocumentUrl(raw?: string): boolean {
  if (!raw || typeof raw !== 'string') return false;
  const trimmed = raw.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('/api/files/')) return true;
  if (trimmed.startsWith('blob:')) return true;
  if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) return true;
  if (trimmed.startsWith('data:')) {
    // Allow data URLs for safe non-HTML document/media/octet-stream payloads
    const header = trimmed.slice(0, 100).toLowerCase();
    if (header.includes('text/html') || header.includes('image/svg+xml')) return false;
    return true;
  }
  return false;
}

export function getDocumentExtension(name?: string): string {
  if (!name) return '';
  const clean = name.split('?')[0].split('#')[0].trim().toLowerCase();
  const idx = clean.lastIndexOf('.');
  return idx >= 0 ? clean.slice(idx + 1) : '';
}

export function detectDocumentKind(doc: PreviewableDocument): ResolvedDocumentKind {
  const mime = (doc.mimeType || '').toLowerCase();
  const ext = getDocumentExtension(doc.name || doc.url || '');

  if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(ext)) {
    return 'image';
  }
  if (mime.includes('pdf') || ext === 'pdf') {
    return 'pdf';
  }
  if (
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    ext === 'docx'
  ) {
    return 'docx';
  }
  if (mime === 'application/msword' || ext === 'doc') {
    return 'doc_legacy';
  }
  if (
    mime.includes('spreadsheetml') ||
    mime.includes('ms-excel') ||
    ['xlsx', 'xls', 'ods'].includes(ext)
  ) {
    return 'spreadsheet';
  }
  if (
    mime.includes('presentationml') ||
    mime.includes('ms-powerpoint') ||
    ['pptx', 'ppt', 'odp'].includes(ext)
  ) {
    return 'ppt';
  }
  if (
    mime.startsWith('text/') ||
    mime.includes('json') ||
    mime.includes('csv') ||
    ['txt', 'md', 'csv', 'json', 'log', 'py', 'cpp', 'c', 'java', 'ts', 'tsx', 'js', 'css', 'xml', 'sql'].includes(ext)
  ) {
    return 'text';
  }
  if (mime.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'm4a', 'aac'].includes(ext)) {
    return 'audio';
  }
  if (mime.startsWith('video/') || ['mp4', 'webm', 'mov', 'm4v'].includes(ext)) {
    return 'video';
  }
  if (doc.url && !doc.dataUrl) {
    return 'link';
  }
  return 'unknown';
}

export async function getDocumentArrayBuffer(doc: PreviewableDocument): Promise<ArrayBuffer> {
  const src = doc.dataUrl || doc.url || '';
  if (!isSafeDocumentUrl(src)) {
    throw new Error('Nguồn tài liệu không hợp lệ.');
  }
  if (src.startsWith('data:')) {
    const commaIdx = src.indexOf(',');
    const header = commaIdx >= 0 ? src.slice(0, commaIdx) : '';
    const payload = commaIdx >= 0 ? src.slice(commaIdx + 1) : src;
    if (header.includes(';base64')) {
      const bin = atob(payload);
      const len = bin.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = bin.charCodeAt(i);
      }
      return bytes.buffer;
    } else {
      const decoded = decodeURIComponent(payload);
      return new TextEncoder().encode(decoded).buffer;
    }
  }
  const resp = await fetch(src);
  if (!resp.ok) {
    throw new Error(`Không thể tải nội dung tệp (${resp.status}).`);
  }
  return await resp.arrayBuffer();
}

export async function getDocumentTextContent(doc: PreviewableDocument): Promise<string> {
  const buf = await getDocumentArrayBuffer(doc);
  try {
    return new TextDecoder('utf-8', { fatal: false }).decode(buf);
  } catch {
    return '';
  }
}

export async function convertDocxToSafeHtml(doc: PreviewableDocument): Promise<string> {
  const buf = await getDocumentArrayBuffer(doc);
  const res = await mammoth.convertToHtml({ arrayBuffer: buf });
  const rawHtml = res.value || '<p>Tài liệu trống.</p>';
  return DOMPurify.sanitize(rawHtml, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover'],
  });
}

export interface ParsedSpreadsheetSheet {
  name: string;
  rows: string[][];
}

export async function parseSpreadsheetSheets(
  doc: PreviewableDocument
): Promise<ParsedSpreadsheetSheet[]> {
  const buf = await getDocumentArrayBuffer(doc);
  const wb = XLSX.read(buf, { type: 'array' });
  return wb.SheetNames.slice(0, 12).map((sheetName) => {
    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: '' });
    return {
      name: sheetName,
      rows: rows.slice(0, 300).map((r) => (Array.isArray(r) ? r.map((c) => String(c ?? '')) : [])),
    };
  });
}

/**
 * Trích xuất đoạn text đọc được từ file .doc (nhị phân OLE2 cổ điển) nếu cần hiển thị nhanh
 */
export function extractReadableTextFromLegacyDoc(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  // Try UTF-16LE sequences common in Word 97-2003 .doc files
  const utf16Lines: string[] = [];
  let current = '';
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    const code = bytes[i] | (bytes[i + 1] << 8);
    if (
      (code >= 0x20 && code <= 0x7e) ||
      (code >= 0x00a0 && code <= 0x1ef9) ||
      code === 0x0a ||
      code === 0x0d ||
      code === 0x09
    ) {
      current += code === 0x0d ? '\n' : String.fromCharCode(code);
    } else {
      if (current.trim().length >= 16) {
        utf16Lines.push(current.trim());
      }
      current = '';
    }
  }
  if (current.trim().length >= 16) utf16Lines.push(current.trim());
  if (utf16Lines.length > 0) {
    return utf16Lines.join('\n\n').slice(0, 30000);
  }
  // Fallback ASCII
  const ascii = new TextDecoder('utf-8', { fatal: false })
    .decode(bytes)
    .replace(/[^\x20-\x7E\n\r\t]/g, ' ')
    .replace(/[ ]{3,}/g, '\n')
    .trim();
  return ascii.slice(0, 20000);
}

export function createPdfBlobUrl(doc: PreviewableDocument): string | null {
  const src = doc.dataUrl || '';
  if (!src.startsWith('data:')) return doc.url && isSafeDocumentUrl(doc.url) ? doc.url : null;
  try {
    const commaIdx = src.indexOf(',');
    if (commaIdx < 0) return src;
    const base64 = src.slice(commaIdx + 1);
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      bytes[i] = bin.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: 'application/pdf' });
    return URL.createObjectURL(blob);
  } catch {
    return doc.url && isSafeDocumentUrl(doc.url) ? doc.url : null;
  }
}

export async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Không thể đọc tệp từ máy tính.'));
    reader.readAsDataURL(file);
  });
}

/**
 * Tải tệp thông minh:
 * - File <= 500KB: giữ nguyên dataUrl (đồng bộ trực tiếp trong Cloud Firestore cho mọi thiết bị).
 * - File > 500KB (tới 25MB): gửi lên /api/upload-file lấy URL `/api/files/...` gọn nhẹ, không làm tràn giới hạn 1MB Firestore.
 */
export async function uploadAttachmentSmart(file: File): Promise<{
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  dataUrl?: string;
  url?: string;
}> {
  const dataUrl = await fileToDataUrl(file);
  const resolvedMime = file.type || 'application/octet-stream';

  if (file.size <= 500 * 1024) {
    return {
      id: 'att_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      name: file.name,
      mimeType: resolvedMime,
      sizeBytes: file.size,
      dataUrl,
    };
  }

  // Try uploading larger files to server disk endpoint
  try {
    const resp = await fetch('/api/upload-file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: file.name,
        mimeType: resolvedMime,
        base64Data: dataUrl,
      }),
    });
    if (resp.ok) {
      const json = await resp.json();
      if (json?.success && json?.file?.url) {
        return {
          id: json.file.id || 'att_' + Date.now(),
          name: file.name,
          mimeType: json.file.mimeType || resolvedMime,
          sizeBytes: file.size,
          url: json.file.url,
        };
      }
    }
  } catch {}

  // Fallback for moderate files <= 900KB
  if (file.size <= 900 * 1024) {
    return {
      id: 'att_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      name: file.name,
      mimeType: resolvedMime,
      sizeBytes: file.size,
      dataUrl,
    };
  }

  throw new Error(
    `Tệp "${file.name}" (${(file.size / 1024 / 1024).toFixed(1)} MB) chưa thể tải lên máy chủ lưu trữ.`
  );
}

export function buildOfficeOrGooglePreviewUrl(rawUrl: string): string | null {
  if (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://')) return null;
  // Microsoft Office Online / Google Docs viewer requires public http(s) URL
  return `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(rawUrl)}`;
}
