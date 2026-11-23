import React, { useEffect, useMemo, useRef } from 'react';
import { normalizeMathSyntax, renderMath } from '../utils/renderMath';

interface RichContentRendererProps {
  content: string;
  imageUrl?: string;
  className?: string;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const SAFE_COLOR_REGEX =
  /^(#[0-9a-fA-F]{3,8}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)|[a-zA-Z]{3,20})$/;

const SAFE_ALIGN_REGEX = /^(left|center|right|justify)$/;

interface SafeTagToken {
  isClosing: boolean;
  canonicalTag: string;
  html: string;
}

function buildSanitizedStyle(rawStyle: string | undefined, tagName: string): string {
  if (!rawStyle) return '';
  const declarations = rawStyle
    .split(';')
    .map((d) => d.trim())
    .filter(Boolean);
  const safeParts: string[] = [];

  for (const decl of declarations) {
    const colonIdx = decl.indexOf(':');
    if (colonIdx === -1) continue;
    const prop = decl.slice(0, colonIdx).trim().toLowerCase();
    const val = decl.slice(colonIdx + 1).trim();

    if (tagName === 'span' && (prop === 'color' || prop === 'background-color')) {
      if (SAFE_COLOR_REGEX.test(val)) {
        safeParts.push(`${prop}: ${val}`);
      }
    } else if (tagName === 'div' && prop === 'text-align') {
      if (SAFE_ALIGN_REGEX.test(val.toLowerCase())) {
        safeParts.push(`text-align: ${val.toLowerCase()}`);
      }
    }
  }

  return safeParts.join('; ');
}

export function renderRichTextToHtml(text: string): string {
  if (!text) return '';

  const blockHolders: string[] = [];
  const inlineHolders: string[] = [];
  const imageHolders: string[] = [];
  const tagHolders: SafeTagToken[] = [];

  // 1. Protect block math $$...$$
  let safe = text.replace(/\$\$([\s\S]*?)\$\$/g, (_, math) => {
    const key = `___DOM_BLOCKMATH_${blockHolders.length}___`;
    blockHolders.push(math);
    return key;
  });

  // 2. Protect inline math $...$
  safe = safe.replace(/\$([^\$\n]+?)\$/g, (_, math) => {
    const key = `___DOM_INLINEMATH_${inlineHolders.length}___`;
    inlineHolders.push(math);
    return key;
  });

  // 3. Protect Markdown images ![alt](src) (reject javascript: URIs)
  safe = safe.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) => {
    const trimmedSrc = String(src || '').trim();
    if (/^javascript:/i.test(trimmedSrc)) {
      return escapeHtml(alt || '');
    }
    const cleanAlt = String(alt || '').trim();
    const showCaption = Boolean(cleanAlt && cleanAlt.toLowerCase() !== 'image' && cleanAlt !== 'Hình minh họa');
    const key = `___DOM_IMG_${imageHolders.length}___`;
    imageHolders.push(
      `<figure class="my-3.5 text-center"><img src="${escapeHtml(trimmedSrc)}" alt="${escapeHtml(cleanAlt || 'Hình minh họa')}" class="max-h-80 max-w-full rounded-xl border border-slate-200 inline-block shadow-xs bg-white object-contain" referrerpolicy="no-referrer" />${
        showCaption ? `<figcaption class="text-xs text-slate-500 italic mt-1.5">${escapeHtml(cleanAlt)}</figcaption>` : ''
      }</figure>`
    );
    return key;
  });

  // 4. Tokenize ONLY whitelisted rich-text HTML tags before escaping remaining HTML
  safe = safe.replace(
    /<(\/?)(strong|b|em|i|u|s|del|strike|mark|span|div)(?:\s+style\s*=\s*(?:"([^"]*)"|'([^']*)'))?\s*>/gi,
    (_m, slash: string, rawTag: string, dblStyle?: string, sglStyle?: string) => {
      const lower = rawTag.toLowerCase();
      const canonical =
        lower === 'b'
          ? 'strong'
          : lower === 'i'
          ? 'em'
          : lower === 'del' || lower === 'strike'
          ? 's'
          : lower;
      const isClosing = Boolean(slash);

      let html = '';
      if (isClosing) {
        html = `</${canonical}>`;
      } else if (canonical === 'u') {
        html = '<u class="underline decoration-current underline-offset-2">';
      } else if (canonical === 's') {
        html = '<s class="line-through">';
      } else if (canonical === 'mark') {
        html = '<mark class="bg-yellow-200/80 text-slate-900 px-1 rounded">';
      } else if (canonical === 'span' || canonical === 'div') {
        const sanitizedStyle = buildSanitizedStyle(dblStyle ?? sglStyle, canonical);
        html = sanitizedStyle ? `<${canonical} style="${sanitizedStyle}">` : `<${canonical}>`;
      } else {
        html = `<${canonical}>`;
      }

      const key = `___DOM_TAG_${tagHolders.length}___`;
      tagHolders.push({ isClosing, canonicalTag: canonical, html });
      return key;
    }
  );

  // 5. Escape raw HTML in plain text so '<script>', 'x < y', etc. never corrupt DOM
  safe = escapeHtml(safe);

  // 6. Apply safe Markdown formatting (headings, bullets, bold, italic, strikethrough)
  safe = safe
    .replace(/^##\s+(.+)$/gm, '<h3 class="font-extrabold text-slate-900 text-base sm:text-lg mt-1.5 mb-0.5">$1</h3>')
    .replace(/^###\s+(.+)$/gm, '<h4 class="font-bold text-slate-900 text-sm sm:text-base mt-1 mb-0.5">$1</h4>')
    .replace(
      /^[-•]\s+(.+)$/gm,
      '<div class="flex items-start gap-2 pl-1"><span class="text-slate-500 select-none">•</span><span class="flex-1">$1</span></div>'
    )
    .replace(/\*\*([^\n*]+?)\*\*/g, '<strong>$1</strong>')
    .replace(/~~([^\n~]+?)~~/g, '<s class="line-through">$1</s>')
    .replace(/(^|[^\w*])\*([^\n*]+?)\*([^\w*]|$)/g, '$1<em>$2</em>$3')
    .replace(/(^|[^\w*])\*([^\n*]+?)\*([^\w*]|$)/g, '$1<em>$2</em>$3');

  // 7. Preserve line breaks without doubling spacing after block elements
  safe = safe
    .replace(/(<\/h3>|<\/h4>|<\/div>)\n/g, '$1')
    .replace(/\n/g, '<br/>');

  // 8. Restore safe formatting tags with stack balancing so unclosed tags never leak
  const openTagStack: string[] = [];
  safe = safe.replace(/___DOM_TAG_(\d+)___/g, (_, idxStr: string) => {
    const tok = tagHolders[Number(idxStr)];
    if (!tok) return '';
    if (!tok.isClosing) {
      openTagStack.push(tok.canonicalTag);
      return tok.html;
    }
    const stackIdx = openTagStack.lastIndexOf(tok.canonicalTag);
    if (stackIdx === -1) return '';
    let closeSeq = '';
    while (openTagStack.length > stackIdx) {
      const popped = openTagStack.pop()!;
      closeSeq += `</${popped}>`;
    }
    return closeSeq;
  });

  while (openTagStack.length > 0) {
    const leftover = openTagStack.pop()!;
    safe += `</${leftover}>`;
  }

  // 9. Restore math expressions with delimiters intact for renderMath(element)
  safe = safe.replace(/___DOM_BLOCKMATH_(\d+)___/g, (_, idx) => {
    const escapedMath = escapeHtml(blockHolders[Number(idx)] ?? '');
    return `<div class="my-2.5 overflow-x-auto text-center katex-block">$$${escapedMath}$$</div>`;
  });

  safe = safe.replace(/___DOM_INLINEMATH_(\d+)___/g, (_, idx) => {
    const escapedMath = escapeHtml(inlineHolders[Number(idx)] ?? '');
    return `<span class="katex-inline inline-block px-0.5">$${escapedMath}$</span>`;
  });

  safe = safe.replace(/(?:<br\/>)*(___DOM_IMG_\d+___)(?:<br\/>)*/g, '$1');
  safe = safe.replace(/___DOM_IMG_(\d+)___/g, (_, idx) => imageHolders[Number(idx)] ?? '');

  return safe;
}

export const RichContentRenderer: React.FC<RichContentRendererProps> = ({
  content,
  imageUrl,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const renderedContent = useMemo(() => {
    if (!content) return null;

    const normalizedContent = normalizeMathSyntax(content);

    const lines = normalizedContent.split('\n');
    const blocks: { type: 'text' | 'table'; raw: string }[] = [];
    let currentTableLines: string[] = [];
    let currentTextLines: string[] = [];

    const flushText = () => {
      if (currentTextLines.length > 0) {
        blocks.push({ type: 'text', raw: currentTextLines.join('\n') });
        currentTextLines = [];
      }
    };

    const flushTable = () => {
      if (currentTableLines.length > 0) {
        blocks.push({ type: 'table', raw: currentTableLines.join('\n') });
        currentTableLines = [];
      }
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('|') && line.endsWith('|')) {
        flushText();
        currentTableLines.push(line);
      } else {
        if (currentTableLines.length > 0) {
          flushTable();
        }
        currentTextLines.push(lines[i]);
      }
    }
    flushText();
    flushTable();

    const processLatexInText = (text: string) => renderRichTextToHtml(text);

    const renderMarkdownTable = (tableStr: string) => {
      const rows = tableStr
        .trim()
        .split('\n')
        .map((r) =>
          r
            .split('|')
            .slice(1, -1)
            .map((c) => c.trim())
        );

      if (rows.length < 2) return tableStr;

      const headerRow = rows[0];
      const isSeparator = rows[1].every((cell) => /^:?-+:?$/.test(cell));
      const bodyRows = isSeparator ? rows.slice(2) : rows.slice(1);

      return (
        <div className="overflow-x-auto my-3 border border-slate-200 rounded-lg shadow-2xs">
          <table className="markdown-table m-0">
            <thead>
              <tr>
                {headerRow.map((cell, idx) => (
                  <th
                    key={idx}
                    dangerouslySetInnerHTML={{
                      __html: processLatexInText(cell),
                    }}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {bodyRows.map((row, rIdx) => (
                <tr key={rIdx}>
                  {row.map((cell, cIdx) => (
                    <td
                      key={cIdx}
                      dangerouslySetInnerHTML={{
                        __html: processLatexInText(cell),
                      }}
                    />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    };

    return (
      <div>
        {blocks.map((block, idx) => {
          if (block.type === 'table') {
            return <React.Fragment key={idx}>{renderMarkdownTable(block.raw)}</React.Fragment>;
          }
          return (
            <div
              key={idx}
              className="leading-relaxed"
              dangerouslySetInnerHTML={{
                __html: processLatexInText(block.raw),
              }}
            />
          );
        })}
      </div>
    );
  }, [content]);

  useEffect(() => {
    renderMath(containerRef.current);
  }, [content, imageUrl, renderedContent]);

  return (
    <div ref={containerRef} className={`rich-content question-container ${className}`}>
      {renderedContent}

      {imageUrl && (
        <div className="my-4 text-center">
          <img
            src={imageUrl}
            alt="Hình minh họa cho câu hỏi"
            className="max-h-80 max-w-full rounded-xl border border-slate-200 shadow-xs inline-block object-contain bg-white p-1"
            referrerPolicy="no-referrer"
            onError={(e) => {
              (e.target as HTMLElement).style.display = 'none';
            }}
          />
        </div>
      )}
    </div>
  );
};
