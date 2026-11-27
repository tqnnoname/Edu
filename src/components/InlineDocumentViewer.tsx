import React, { useEffect, useState } from 'react';
import {
  FileText,
  Download,
  ExternalLink,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Maximize2,
  Minimize2,
  AlertCircle,
  Loader2,
  FileSpreadsheet,
  File as FileIcon,
} from 'lucide-react';
import {
  PreviewableDocument,
  detectDocumentKind,
  isSafeDocumentUrl,
  createPdfBlobUrl,
  convertDocxToSafeHtml,
  parseSpreadsheetSheets,
  getDocumentTextContent,
  getDocumentArrayBuffer,
  extractReadableTextFromLegacyDoc,
  buildOfficeOrGooglePreviewUrl,
  type ParsedSpreadsheetSheet,
} from '../utils/documentPreview';
import { ResilientImage } from './ResilientImage';

interface InlineDocumentViewerProps {
  document: PreviewableDocument;
  heightClass?: string;
  showHeader?: boolean;
  compact?: boolean;
  onFullscreenToggle?: () => void;
  isFullscreen?: boolean;
}

export const InlineDocumentViewer: React.FC<InlineDocumentViewerProps> = ({
  document: doc,
  heightClass = 'h-[560px]',
  showHeader = true,
  compact = false,
  onFullscreenToggle,
  isFullscreen = false,
}) => {
  const kind = detectDocumentKind(doc);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [docxHtml, setDocxHtml] = useState<string | null>(null);
  const [sheets, setSheets] = useState<ParsedSpreadsheetSheet[]>([]);
  const [activeSheetIdx, setActiveSheetIdx] = useState(0);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [imageZoom, setImageZoom] = useState(1);

  const safeHref = doc.dataUrl && isSafeDocumentUrl(doc.dataUrl)
    ? doc.dataUrl
    : doc.url && isSafeDocumentUrl(doc.url)
    ? doc.url
    : undefined;

  useEffect(() => {
    let cancelled = false;
    let createdBlob: string | null = null;

    setLoading(false);
    setError(null);
    setPdfBlobUrl(null);
    setDocxHtml(null);
    setSheets([]);
    setActiveSheetIdx(0);
    setTextContent(null);
    setImageZoom(1);

    const load = async () => {
      if (kind === 'pdf') {
        if (doc.dataUrl) {
          const url = createPdfBlobUrl(doc);
          if (url && url.startsWith('blob:')) createdBlob = url;
          if (!cancelled) setPdfBlobUrl(url);
        } else if (doc.url && isSafeDocumentUrl(doc.url)) {
          if (!cancelled) setPdfBlobUrl(doc.url);
        }
        return;
      }

      if (kind === 'docx') {
        setLoading(true);
        try {
          const html = await convertDocxToSafeHtml(doc);
          if (!cancelled) setDocxHtml(html);
        } catch (err: any) {
          if (!cancelled) setError(err?.message || 'Không thể hiển thị trực tiếp file Word này.');
        } finally {
          if (!cancelled) setLoading(false);
        }
        return;
      }

      if (kind === 'spreadsheet') {
        setLoading(true);
        try {
          const parsed = await parseSpreadsheetSheets(doc);
          if (!cancelled) setSheets(parsed);
        } catch (err: any) {
          if (!cancelled) setError(err?.message || 'Không thể hiển thị trực tiếp bảng tính này.');
        } finally {
          if (!cancelled) setLoading(false);
        }
        return;
      }

      if (kind === 'text') {
        setLoading(true);
        try {
          const txt = await getDocumentTextContent(doc);
          if (!cancelled) setTextContent(txt);
        } catch (err: any) {
          if (!cancelled) setError(err?.message || 'Không thể đọc nội dung tệp văn bản.');
        } finally {
          if (!cancelled) setLoading(false);
        }
        return;
      }

      if (kind === 'doc_legacy') {
        setLoading(true);
        try {
          const buf = await getDocumentArrayBuffer(doc);
          const extracted = extractReadableTextFromLegacyDoc(buf);
          if (!cancelled) {
            if (extracted.length > 20) {
              setTextContent(extracted);
            } else {
              setError('Tệp .DOC nhị phân cũ chứa định dạng phức tạp, hãy dùng nút Mở tab mới / Tải xuống hoặc chuyển sang .DOCX / .PDF.');
            }
          }
        } catch (err: any) {
          if (!cancelled) setError(err?.message || 'Không thể đọc tệp .DOC.');
        } finally {
          if (!cancelled) setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
      if (createdBlob) {
        try {
          URL.revokeObjectURL(createdBlob);
        } catch {}
      }
    };
  }, [doc.id, doc.name, doc.mimeType, doc.dataUrl, doc.url, kind]);

  const gviewUrl =
    (kind === 'ppt' || kind === 'doc_legacy' || kind === 'link') && doc.url
      ? buildOfficeOrGooglePreviewUrl(doc.url)
      : null;

  const sizeLabel = doc.sizeBytes
    ? doc.sizeBytes >= 1024 * 1024
      ? `${(doc.sizeBytes / 1024 / 1024).toFixed(1)} MB`
      : `${Math.max(1, Math.round(doc.sizeBytes / 1024))} KB`
    : '';

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
      {showHeader && (
        <div className="px-3.5 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
              {kind === 'spreadsheet' ? (
                <FileSpreadsheet className="w-4 h-4" />
              ) : kind === 'unknown' ? (
                <FileIcon className="w-4 h-4" />
              ) : (
                <FileText className="w-4 h-4" />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-900 truncate" title={doc.name}>
                {doc.name}
              </p>
              <p className="text-[11px] text-slate-500">
                {kind === 'pdf' && 'PDF • Xem trực tiếp'}
                {kind === 'docx' && 'Word (.docx) • Xem trực tiếp'}
                {kind === 'doc_legacy' && 'Word (.doc) • Đọc nội dung'}
                {kind === 'spreadsheet' && 'Excel • Xem bảng tính'}
                {kind === 'image' && 'Hình ảnh'}
                {kind === 'text' && 'Văn bản • Xem trực tiếp'}
                {kind === 'audio' && 'Âm thanh'}
                {kind === 'video' && 'Video'}
                {kind === 'ppt' && 'PowerPoint'}
                {(kind === 'link' || kind === 'unknown') && 'Tài liệu đính kèm'}
                {sizeLabel ? ` • ${sizeLabel}` : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {kind === 'image' && (
              <>
                <button
                  type="button"
                  onClick={() => setImageZoom((z) => Math.max(0.5, Number((z - 0.25).toFixed(2))))}
                  className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 cursor-pointer"
                  title="Thu nhỏ"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="text-[11px] font-bold text-slate-600 tabular-nums px-1">
                  {Math.round(imageZoom * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => setImageZoom((z) => Math.min(3, Number((z + 0.25).toFixed(2))))}
                  className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 cursor-pointer"
                  title="Phóng to"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setImageZoom(1)}
                  className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 cursor-pointer"
                  title="Kích thước gốc"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </>
            )}

            {onFullscreenToggle && (
              <button
                type="button"
                onClick={onFullscreenToggle}
                className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-semibold flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                title={isFullscreen ? 'Thu gọn' : 'Mở rộng vùng xem'}
              >
                {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              </button>
            )}

            {safeHref && (
              <>
                {doc.url && isSafeDocumentUrl(doc.url) && (
                  <a
                    href={doc.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-semibold flex items-center gap-1 whitespace-nowrap shrink-0"
                    title="Mở ở tab mới"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    {!compact && <span>Mở tab mới</span>}
                  </a>
                )}
                <a
                  href={safeHref}
                  download={doc.name}
                  className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center gap-1 whitespace-nowrap shrink-0"
                  title="Tải xuống bản sao"
                >
                  <Download className="w-3.5 h-3.5" />
                  {!compact && <span>Tải xuống</span>}
                </a>
              </>
            )}
          </div>
        </div>
      )}

      {/* Body Preview */}
      <div className={`w-full overflow-auto bg-slate-100/60 ${heightClass}`}>
        {loading && (
          <div className="h-full flex flex-col items-center justify-center p-8 text-slate-600 gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
            <span className="text-xs font-semibold">Đang kết xuất nội dung tài liệu...</span>
          </div>
        )}

        {!loading && error && !gviewUrl && (
          <div className="h-full flex flex-col items-center justify-center p-6 text-center gap-3">
            <AlertCircle className="w-8 h-8 text-amber-500" />
            <p className="text-xs font-semibold text-slate-700 max-w-md">{error}</p>
            {safeHref && (
              <a
                href={safeHref}
                download={doc.name}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                Tải xuống {doc.name}
              </a>
            )}
          </div>
        )}

        {!loading && !error && kind === 'pdf' && pdfBlobUrl && (
          <iframe
            src={pdfBlobUrl}
            title={doc.name}
            className="w-full h-full border-0 bg-white"
          />
        )}

        {!loading && !error && kind === 'image' && safeHref && (
          <div className="min-h-full w-full flex items-center justify-center p-4 overflow-auto">
            <ResilientImage
              src={safeHref}
              alt={doc.name}
              style={{ transform: `scale(${imageZoom})`, transformOrigin: 'top center' }}
              className="max-w-full rounded-lg shadow-sm border border-slate-200 bg-white transition-transform duration-150"
            />
          </div>
        )}

        {!loading && !error && kind === 'audio' && safeHref && (
          <div className="h-full flex items-center justify-center p-6">
            <audio src={safeHref} controls className="w-full max-w-md" />
          </div>
        )}

        {!loading && !error && kind === 'video' && safeHref && (
          <div className="h-full flex items-center justify-center p-3 bg-slate-950">
            <video src={safeHref} controls className="max-h-full max-w-full rounded-lg" />
          </div>
        )}

        {!loading && !error && kind === 'docx' && docxHtml !== null && (
          <div className="p-5 sm:p-8 bg-white min-h-full">
            <div
              className="max-w-3xl mx-auto text-sm text-slate-800 leading-relaxed space-y-3 [&_h1]:text-xl [&_h1]:font-extrabold [&_h1]:text-slate-900 [&_h1]:mb-3 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-slate-900 [&_h2]:mt-4 [&_h3]:text-base [&_h3]:font-bold [&_table]:w-full [&_table]:border-collapse [&_table]:my-3 [&_td]:border [&_td]:border-slate-300 [&_td]:p-2 [&_th]:border [&_th]:border-slate-300 [&_th]:bg-slate-100 [&_th]:p-2 [&_th]:text-left [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_img]:max-w-full [&_img]:rounded-lg [&_img]:my-2"
              dangerouslySetInnerHTML={{ __html: docxHtml }}
            />
          </div>
        )}

        {!loading && !error && kind === 'spreadsheet' && sheets.length > 0 && (
          <div className="flex flex-col h-full bg-white">
            {sheets.length > 1 && (
              <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center gap-1.5 overflow-x-auto">
                {sheets.map((sh, idx) => (
                  <button
                    key={sh.name}
                    type="button"
                    onClick={() => setActiveSheetIdx(idx)}
                    className={`px-3 py-1 rounded-lg text-xs font-bold whitespace-nowrap cursor-pointer ${
                      activeSheetIdx === idx
                        ? 'bg-emerald-600 text-white'
                        : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {sh.name}
                  </button>
                ))}
              </div>
            )}
            <div className="flex-1 overflow-auto p-3">
              <table className="w-full border-collapse text-xs text-slate-800">
                <tbody>
                  {(sheets[activeSheetIdx]?.rows || []).map((row, rIdx) => (
                    <tr key={rIdx} className={rIdx === 0 ? 'bg-slate-100 font-bold' : 'even:bg-slate-50/60'}>
                      {row.map((cell, cIdx) => (
                        <td
                          key={cIdx}
                          className="border border-slate-200 px-2.5 py-1.5 whitespace-pre-wrap align-top"
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!loading && textContent !== null && (kind === 'text' || kind === 'doc_legacy') && (
          <div className="p-5 bg-white min-h-full">
            <pre className="text-xs sm:text-sm text-slate-800 whitespace-pre-wrap font-sans leading-relaxed max-w-4xl mx-auto">
              {textContent || '(Tệp trống)'}
            </pre>
          </div>
        )}

        {!loading && gviewUrl && !docxHtml && !pdfBlobUrl && !textContent && (
          <iframe
            src={gviewUrl}
            title={doc.name}
            className="w-full h-full border-0 bg-white"
          />
        )}

        {!loading &&
          !error &&
          !pdfBlobUrl &&
          docxHtml === null &&
          sheets.length === 0 &&
          textContent === null &&
          kind !== 'image' &&
          kind !== 'audio' &&
          kind !== 'video' &&
          !gviewUrl && (
            <div className="h-full flex flex-col items-center justify-center p-6 text-center gap-3">
              <FileIcon className="w-10 h-10 text-slate-400" />
              <div>
                <p className="text-sm font-bold text-slate-800">{doc.name}</p>
                <p className="text-xs text-slate-500 mt-1">
                  Định dạng này cần mở bằng ứng dụng ngoài hoặc chuyển đổi sang PDF/DOCX/XLSX để xem trực tiếp trong trình duyệt.
                </p>
              </div>
              {safeHref && (
                <a
                  href={safeHref}
                  download={doc.name}
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  Tải xuống tài liệu
                </a>
              )}
            </div>
          )}
      </div>
    </div>
  );
};
