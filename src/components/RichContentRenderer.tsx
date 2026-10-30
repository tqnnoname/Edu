import React, { useMemo } from 'react';
import katex from 'katex';

interface RichContentRendererProps {
  content: string;
  imageUrl?: string;
  className?: string;
}

export const RichContentRenderer: React.FC<RichContentRendererProps> = ({
  content,
  imageUrl,
  className = '',
}) => {
  // Parse LaTeX math expressions, unicode roots, vectors, and Markdown tables
  const renderedContent = useMemo(() => {
    if (!content) return null;

    // Helper to safely render LaTeX formula
    const renderKatex = (latex: string, displayMode: boolean) => {
      try {
        // Automatically convert \vec{AB} (2+ uppercase letters) to \overrightarrow{AB}
        // so the right arrow stretches automatically to fit the expression underneath
        let cleanLatex = latex.trim();
        cleanLatex = cleanLatex.replace(/\\vec\{([A-Z]{2,})\}/g, '\\overrightarrow{$1}');

        return katex.renderToString(cleanLatex, {
          displayMode,
          throwOnError: false,
          output: 'html',
        });
      } catch (err) {
        console.warn('KaTeX render error:', err);
        return `<span class="font-mono text-slate-800">${latex}</span>`;
      }
    };

    // Pre-process common plain text / unicode math symbols:
    // Roots (√, ∛), Vectors (vecto, \vec, \overrightarrow)
    const normalizeMathSyntax = (raw: string) => {
      let text = raw;

      // 1. Protect existing block math $$...$$
      const blockMathHolders: string[] = [];
      text = text.replace(/\$\$([\s\S]*?)\$\$/g, (_, math) => {
        const key = `___BLOCKMATH_${blockMathHolders.length}___`;
        blockMathHolders.push(math);
        return key;
      });

      // 2. Protect existing inline math $...$
      const inlineMathHolders: string[] = [];
      text = text.replace(/\$([^\$\n]+?)\$/g, (_, math) => {
        const key = `___INLINEMATH_${inlineMathHolders.length}___`;
        inlineMathHolders.push(math);
        return key;
      });

      // 3. Process expressions outside of $...$:
      // Convert raw \sqrt[n]{x} or \sqrt{x}
      text = text.replace(/\\sqrt\[([^\]]+)\]\{([^\}]+)\}/g, '$\\sqrt[$1]{$2}$');
      text = text.replace(/\\sqrt\{([^\}]+)\}/g, '$\\sqrt{$1}$');

      // Convert unicode square root: √{expression} or √(expression) -> $\sqrt{expression}$
      text = text.replace(/√\{([^\}]+)\}/g, '$\\sqrt{$1}$');
      text = text.replace(/√\(([^\)]+)\)/g, '$\\sqrt{$1}$');
      // Convert unicode root with variable or number: √x or √2 or √ 25 -> $\sqrt{x}$
      text = text.replace(/√\s*([a-zA-Z0-9]+)/g, '$\\sqrt{$1}$');
      // Convert unicode cube root: ∛(expr) -> $\sqrt[3]{expr}$
      text = text.replace(/∛\{([^\}]+)\}/g, '$\\sqrt[3]{$1}$');
      text = text.replace(/∛\(([^\)]+)\)/g, '$\\sqrt[3]{$1}$');
      text = text.replace(/∛\s*([a-zA-Z0-9]+)/g, '$\\sqrt[3]{$1}$');

      // Convert raw \overrightarrow{...} outside $
      text = text.replace(/\\overrightarrow\{([^}]+)\}/g, '$\\overrightarrow{$1}$');

      // Convert raw \vec{...} outside $
      // If 2+ uppercase letters (e.g. \vec{AB}), use \overrightarrow to stretch snugly
      text = text.replace(/\\vec\{([A-Z]{2,})\}/g, '$\\overrightarrow{$1}$');
      text = text.replace(/\\vec\{([^}]+)\}/g, '$\\vec{$1}$');

      // Convert Vietnamese plain text vector notations:
      // "vecto AB" or "vecto(AB)" -> $\overrightarrow{AB}$
      text = text.replace(/\bvecto\s+([A-Z]{2,})\b/g, '$\\overrightarrow{$1}$');
      text = text.replace(/\bvecto\(([A-Z]{2,})\)/g, '$\\overrightarrow{$1}$');
      // "vecto u" or "vecto(u)" -> $\vec{u}$
      text = text.replace(/\bvecto\s+([a-zA-Z0-9])\b/g, '$\\vec{$1}$');
      text = text.replace(/\bvecto\(([a-zA-Z0-9])\)/g, '$\\vec{$1}$');
      // "vec(AB)" -> $\overrightarrow{AB}$
      text = text.replace(/\bvec\(([A-Z]{2,})\)/g, '$\\overrightarrow{$1}$');
      text = text.replace(/\bvec\(([a-zA-Z0-9])\)/g, '$\\vec{$1}$');

      // 4. Restore inline and block math holders
      text = text.replace(/___INLINEMATH_(\d+)___/g, (_, idx) => `$${inlineMathHolders[Number(idx)]}$`);
      text = text.replace(/___BLOCKMATH_(\d+)___/g, (_, idx) => `$$${blockMathHolders[Number(idx)]}$$`);

      return text;
    };

    const normalizedContent = normalizeMathSyntax(content);

    // First, check if there are markdown tables in content
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

    // Helper to render text with LaTeX formulas
    const processLatexInText = (text: string) => {
      // 1. Block formulas $$ ... $$
      const blockRegex = /\$\$([\s\S]*?)\$\$/g;
      // 2. Inline formulas $ ... $
      const inlineRegex = /\$([^\$\n]+?)\$/g;

      // Replace block math first
      let processed = text.replace(blockRegex, (_, math) => {
        return `<div class="my-2.5 overflow-x-auto text-center katex-block">${renderKatex(math, true)}</div>`;
      });

      // Replace inline math
      processed = processed.replace(inlineRegex, (_, math) => {
        return `<span class="katex-inline inline-block px-0.5">${renderKatex(math, false)}</span>`;
      });

      // Replace markdown image tags ![alt](url)
      const imgRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
      processed = processed.replace(imgRegex, (_, alt, src) => {
        return `<div class="my-3 text-center"><img src="${src}" alt="${alt}" class="max-h-72 max-w-full rounded-lg border border-slate-200 inline-block shadow-xs" referrerPolicy="no-referrer" /></div>`;
      });

      // Convert line breaks
      processed = processed.replace(/\n/g, '<br/>');

      return processed;
    };

    // Helper to render markdown table
    const renderMarkdownTable = (tableStr: string) => {
      const rows = tableStr.trim().split('\n').map((r) =>
        r
          .split('|')
          .slice(1, -1)
          .map((c) => c.trim())
      );

      if (rows.length < 2) return tableStr;

      const headerRow = rows[0];
      // Check if row 1 is separator (e.g. --- | ---)
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

  return (
    <div className={`rich-content ${className}`}>
      {renderedContent}

      {/* Explicit Question Image */}
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
