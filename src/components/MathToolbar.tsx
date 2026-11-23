import React, { useEffect, useRef, useState } from 'react';
import {
  Table,
  Image,
  Sparkles,
  ChevronDown,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Highlighter,
  Palette,
  List,
  Heading3,
  AlignCenter,
  RemoveFormatting,
} from 'lucide-react';
import { renderMath } from '../utils/renderMath';
import {
  EditableTextElement,
  applyLinePrefixAtEditableElement,
  insertTextAtEditableElement,
  isEditableTextInput,
  resolveTargetEditableElement,
  stripFormattingAtEditableElement,
  wrapSelectionAtEditableElement,
} from '../utils/cursorInsert';
import { CopyContentButton } from './CopyContentButton';

interface MathToolbarProps {
  onInsert?: (text: string) => void;
  onInsertImage?: (url: string) => void;
  targetRef?: React.RefObject<EditableTextElement | null>;
  containerRef?: React.RefObject<HTMLElement | null>;
  getContainerEl?: () => HTMLElement | null;
  onAfterCursorInsert?: (insertedText: string) => void;
  compact?: boolean;
}

interface MathSnippet {
  label: string;
  displayTex: string;
  code: string;
  description: string;
  category: 'roots' | 'vectors' | 'fractions' | 'symbols';
}

const TEXT_COLOR_PALETTE = [
  { label: 'Màu đen mặc định', hex: '#0f172a' },
  { label: 'Đỏ nổi bật', hex: '#dc2626' },
  { label: 'Xanh dương', hex: '#2563eb' },
  { label: 'Xanh lá', hex: '#16a34a' },
  { label: 'Cam đậm', hex: '#ea580c' },
  { label: 'Tím', hex: '#9333ea' },
  { label: 'Vàng nâu', hex: '#b45309' },
  { label: 'Hồng đậm', hex: '#db2777' },
];

const MathSnippetPreview: React.FC<{ tex: string; fallback: string }> = ({ tex, fallback }) => {
  const spanRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!spanRef.current) return;
    spanRef.current.textContent = `$${tex}$`;
    renderMath(spanRef.current);
  }, [tex]);

  return (
    <span ref={spanRef} className="inline-block text-xs leading-none">
      {fallback}
    </span>
  );
};

export const MathToolbar: React.FC<MathToolbarProps> = ({
  onInsert,
  onInsertImage,
  targetRef,
  containerRef,
  getContainerEl,
  onAfterCursorInsert,
  compact = false,
}) => {
  const [showPresets, setShowPresets] = useState(false);
  const [showColorMenu, setShowColorMenu] = useState(false);
  const [activeColor, setActiveColor] = useState('#dc2626');
  const [activeCategory, setActiveCategory] = useState<'all' | 'roots' | 'vectors' | 'fractions' | 'symbols'>('all');
  const toolbarRootRef = useRef<HTMLDivElement>(null);
  const lastFocusedRef = useRef<EditableTextElement | null>(null);
  const getContainerElRef = useRef(getContainerEl);
  getContainerElRef.current = getContainerEl;

  // Ghi nhớ ô nhập liệu được focus gần nhất trong phạm vi containerRef / getContainerEl (hoặc tài liệu nếu không chỉ định)
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as Element | null;
      if (!isEditableTextInput(target)) return;
      if (toolbarRootRef.current?.contains(target)) return;
      const scopedEl = getContainerElRef.current ? getContainerElRef.current() : containerRef?.current || null;
      if (scopedEl) {
        if (scopedEl.contains(target)) {
          lastFocusedRef.current = target;
        }
      } else if (targetRef?.current) {
        if (targetRef.current === target) {
          lastFocusedRef.current = target;
        }
      } else {
        lastFocusedRef.current = target;
      }
    };

    document.addEventListener('focusin', handleFocusIn, true);
    return () => document.removeEventListener('focusin', handleFocusIn, true);
  }, [containerRef, targetRef]);

  const resolveEditable = () =>
    resolveTargetEditableElement({
      targetRef,
      containerRef,
      getContainerEl: getContainerElRef.current,
      lastFocusedRef,
      ignoreContainer: toolbarRootRef.current,
    });

  const handleInsertAtCursorOrFallback = (code: string) => {
    const targetEl = resolveEditable();

    if (targetEl && insertTextAtEditableElement(targetEl, code)) {
      lastFocusedRef.current = targetEl;
      onAfterCursorInsert?.(code);
      return;
    }

    onInsert?.(code);
  };

  const handleWrapFormat = (prefix: string, suffix: string, placeholder: string) => {
    const targetEl = resolveEditable();

    if (targetEl && wrapSelectionAtEditableElement(targetEl, prefix, suffix, placeholder)) {
      lastFocusedRef.current = targetEl;
      onAfterCursorInsert?.(`${prefix}${placeholder}${suffix}`);
      return;
    }

    const fallbackSnippet = `${prefix}${placeholder}${suffix}`;
    onInsert?.(fallbackSnippet);
  };

  const handleApplyLineFormat = (linePrefix: string, fallbackPlaceholder: string) => {
    const targetEl = resolveEditable();

    if (targetEl && applyLinePrefixAtEditableElement(targetEl, linePrefix)) {
      lastFocusedRef.current = targetEl;
      onAfterCursorInsert?.(linePrefix);
      return;
    }

    onInsert?.(`${linePrefix}${fallbackPlaceholder}`);
  };

  const handleClearFormatting = () => {
    const targetEl = resolveEditable();
    if (targetEl && stripFormattingAtEditableElement(targetEl)) {
      lastFocusedRef.current = targetEl;
      onAfterCursorInsert?.('');
    }
  };

  const handleApplyTextColor = (hex: string) => {
    setActiveColor(hex);
    setShowColorMenu(false);
    handleWrapFormat(`<span style="color:${hex}">`, '</span>', 'chữ màu');
  };

  const preventFocusSteal = (e: React.MouseEvent<HTMLButtonElement | HTMLLabelElement>) => {
    // Giữ nguyên focus và vị trí con trỏ tại input/textarea đang soạn thảo
    e.preventDefault();
  };

  const sampleImages = [
    {
      label: 'Đồ thị hàm bậc 3',
      url: 'https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=600&auto=format&fit=crop&q=80',
    },
    {
      label: 'Hình học Oxyz / Không gian',
      url: 'https://images.unsplash.com/photo-1509228468518-180dd4864904?w=600&auto=format&fit=crop&q=80',
    },
    {
      label: 'Sơ đồ mạch điện RLC',
      url: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=600&auto=format&fit=crop&q=80',
    },
  ];

  const snippets: MathSnippet[] = [
    // Căn thức
    { label: '√x', displayTex: '\\sqrt{x}', code: '$\\sqrt{x}$', description: 'Căn bậc 2: \\sqrt{x}', category: 'roots' },
    { label: '√(a+b)', displayTex: '\\sqrt{x^2+1}', code: '$\\sqrt{x^2+1}$', description: 'Căn biểu thức dài: \\sqrt{x^2+1}', category: 'roots' },
    { label: '∛x', displayTex: '\\sqrt[3]{x}', code: '$\\sqrt[3]{x}$', description: 'Căn bậc 3: \\sqrt[3]{x}', category: 'roots' },
    { label: 'ⁿ√A', displayTex: '\\sqrt[n]{A}', code: '$\\sqrt[n]{A}$', description: 'Căn bậc n: \\sqrt[n]{A}', category: 'roots' },

    // Vectơ (mũi tên hướng phải)
    { label: 'u⃗', displayTex: '\\vec{u}', code: '$\\vec{u}$', description: 'Vectơ 1 chữ cái: \\vec{u}', category: 'vectors' },
    { label: 'AB→', displayTex: '\\overrightarrow{AB}', code: '$\\overrightarrow{AB}$', description: 'Vectơ 2 điểm: \\overrightarrow{AB}', category: 'vectors' },
    { label: 'n⃗', displayTex: '\\vec{n}', code: '$\\vec{n} = (a; b; c)$', description: 'Vectơ pháp tuyến', category: 'vectors' },

    // Phân số & Mũ
    { label: 'a/b', displayTex: '\\frac{a}{b}', code: '$\\frac{a}{b}$', description: 'Phân số a/b', category: 'fractions' },
    { label: 'x²', displayTex: 'x^2', code: '$x^{2}$', description: 'Số mũ bậc 2', category: 'fractions' },
    { label: 'xⁿ', displayTex: 'x^n', code: '$x^{n}$', description: 'Số mũ bậc n', category: 'fractions' },
    { label: 'x₁', displayTex: 'x_1', code: '$x_{1}$', description: 'Chỉ số dưới', category: 'fractions' },

    // Ký hiệu & Giải tích
    { label: '∫', displayTex: '\\int_{a}^{b} f(x)dx', code: '$\\int_{a}^{b} f(x)dx$', description: 'Tích phân xác định', category: 'symbols' },
    { label: 'lim', displayTex: '\\lim_{x \\to x_0}', code: '$\\lim_{x \\to x_0}$', description: 'Giới hạn hàm số', category: 'symbols' },
    { label: '∑', displayTex: '\\sum_{i=1}^{n}', code: '$\\sum_{i=1}^{n}$', description: 'Tổng sigma', category: 'symbols' },
    { label: 'Hệ PT', displayTex: '\\begin{cases} a \\\\ b \\end{cases}', code: '$\\begin{cases} x + y = 2 \\\\ x - y = 0 \\end{cases}$', description: 'Hệ phương trình 2 ẩn', category: 'symbols' },
    { label: 'π', displayTex: '\\pi', code: '$\\pi$', description: 'Số Pi', category: 'symbols' },
    { label: '∞', displayTex: '\\infty', code: '$\\infty$', description: 'Vô cực', category: 'symbols' },
    { label: 'Δ', displayTex: '\\Delta', code: '$\\Delta$', description: 'Delta', category: 'symbols' },
    { label: 'α', displayTex: '\\alpha', code: '$\\alpha$', description: 'Alpha', category: 'symbols' },
    { label: '≤', displayTex: '\\le', code: '$\\le$', description: 'Nhỏ hơn hoặc bằng', category: 'symbols' },
    { label: '≥', displayTex: '\\ge', code: '$\\ge$', description: 'Lớn hơn hoặc bằng', category: 'symbols' },
    { label: '±', displayTex: '\\pm', code: '$\\pm$', description: 'Cộng trừ', category: 'symbols' },
    { label: '≠', displayTex: '\\ne', code: '$\\ne$', description: 'Khác', category: 'symbols' },
  ];

  const tableSample = `
| x | -\\infty | 1 | +\\infty |
| :--- | :---: | :---: | :---: |
| y' | + | 0 | - |
| y | -\\infty \\nearrow | 4 | \\searrow -\\infty |
`;

  const displayedSnippets =
    activeCategory === 'all'
      ? snippets
      : snippets.filter((s) => s.category === activeCategory);

  return (
    <div
      ref={toolbarRootRef}
      className={`bg-slate-50 border border-slate-200 rounded-lg ${compact ? 'p-2' : 'p-2.5'} mb-2 text-xs space-y-2`}
    >
      {/* Rich Text Formatting Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-1.5 border-b border-slate-200/70">
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[11px] font-semibold text-slate-600 mr-1">
            Soạn thảo:
          </span>

          <button
            type="button"
            onMouseDown={preventFocusSteal}
            onClick={() => handleWrapFormat('**', '**', 'chữ đậm')}
            className="w-7 h-7 inline-flex items-center justify-center rounded bg-white border border-slate-200 hover:bg-slate-100 hover:border-slate-300 text-slate-800 cursor-pointer"
            title="Chữ đậm (**văn bản**)"
            aria-label="Chữ đậm"
          >
            <Bold className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onMouseDown={preventFocusSteal}
            onClick={() => handleWrapFormat('*', '*', 'chữ nghiêng')}
            className="w-7 h-7 inline-flex items-center justify-center rounded bg-white border border-slate-200 hover:bg-slate-100 hover:border-slate-300 text-slate-800 cursor-pointer"
            title="Chữ in nghiêng (*văn bản*)"
            aria-label="Chữ in nghiêng"
          >
            <Italic className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onMouseDown={preventFocusSteal}
            onClick={() => handleWrapFormat('<u>', '</u>', 'chữ gạch chân')}
            className="w-7 h-7 inline-flex items-center justify-center rounded bg-white border border-slate-200 hover:bg-slate-100 hover:border-slate-300 text-slate-800 cursor-pointer"
            title="Chữ gạch chân (<u>văn bản</u>)"
            aria-label="Chữ gạch chân"
          >
            <Underline className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onMouseDown={preventFocusSteal}
            onClick={() => handleWrapFormat('~~', '~~', 'gạch ngang')}
            className="w-7 h-7 inline-flex items-center justify-center rounded bg-white border border-slate-200 hover:bg-slate-100 hover:border-slate-300 text-slate-800 cursor-pointer"
            title="Chữ gạch ngang (~~văn bản~~)"
            aria-label="Chữ gạch ngang"
          >
            <Strikethrough className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onMouseDown={preventFocusSteal}
            onClick={() => handleWrapFormat('<mark>', '</mark>', 'nội dung nổi bật')}
            className="w-7 h-7 inline-flex items-center justify-center rounded bg-white border border-slate-200 hover:bg-amber-50 hover:border-amber-300 text-amber-700 cursor-pointer"
            title="Tô màu nền chữ (<mark>...</mark>)"
            aria-label="Tô nền chữ"
          >
            <Highlighter className="w-3.5 h-3.5" />
          </button>

          {/* Text Color Dropdown + Quick Apply */}
          <div className="relative inline-flex items-center">
            <button
              type="button"
              onMouseDown={preventFocusSteal}
              onClick={() => handleApplyTextColor(activeColor)}
              className="h-7 px-1.5 inline-flex items-center gap-1 rounded-l bg-white border border-slate-200 hover:bg-slate-100 text-slate-800 cursor-pointer"
              title="Áp dụng màu chữ đang chọn"
              aria-label="Đổi màu chữ"
            >
              <Palette className="w-3.5 h-3.5 text-slate-700" />
              <span
                className="w-3 h-3 rounded-xs border border-slate-300 inline-block"
                style={{ backgroundColor: activeColor }}
              />
            </button>
            <button
              type="button"
              onMouseDown={preventFocusSteal}
              onClick={() => setShowColorMenu((prev) => !prev)}
              className="h-7 px-1 inline-flex items-center rounded-r bg-white border border-l-0 border-slate-200 hover:bg-slate-100 text-slate-600 cursor-pointer"
              title="Chọn bảng màu chữ"
              aria-label="Mở bảng màu chữ"
            >
              <ChevronDown className="w-3 h-3" />
            </button>

            {showColorMenu && (
              <div className="absolute left-0 top-full mt-1 w-52 bg-white border border-slate-200 rounded-xl shadow-lg p-2.5 z-30 space-y-2">
                <div className="text-[11px] font-bold text-slate-700">Chọn màu chữ:</div>
                <div className="grid grid-cols-4 gap-1.5">
                  {TEXT_COLOR_PALETTE.map((c) => (
                    <button
                      key={c.hex}
                      type="button"
                      onMouseDown={preventFocusSteal}
                      onClick={() => handleApplyTextColor(c.hex)}
                      title={c.label}
                      className={`h-7 rounded-md border flex items-center justify-center cursor-pointer transition-transform hover:scale-105 ${
                        activeColor === c.hex ? 'border-slate-900 ring-1 ring-slate-900' : 'border-slate-200'
                      }`}
                      style={{ backgroundColor: c.hex }}
                    >
                      <span className="text-[10px] font-bold text-white drop-shadow-xs">A</span>
                    </button>
                  ))}
                </div>
                <div className="pt-1.5 border-t border-slate-100 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-600">Màu tùy chọn:</span>
                  <input
                    type="color"
                    value={activeColor}
                    onChange={(e) => handleApplyTextColor(e.target.value)}
                    className="w-8 h-6 p-0 border border-slate-200 rounded cursor-pointer bg-white"
                    title="Chọn mã màu bất kỳ"
                  />
                </div>
              </div>
            )}
          </div>

          <span className="w-px h-4 bg-slate-200 mx-0.5" aria-hidden="true" />

          <button
            type="button"
            onMouseDown={preventFocusSteal}
            onClick={() => handleApplyLineFormat('### ', 'Tiêu đề mục')}
            className="w-7 h-7 inline-flex items-center justify-center rounded bg-white border border-slate-200 hover:bg-slate-100 hover:border-slate-300 text-slate-800 cursor-pointer"
            title="Tiêu đề mục (### Tiêu đề)"
            aria-label="Tiêu đề mục"
          >
            <Heading3 className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onMouseDown={preventFocusSteal}
            onClick={() => handleApplyLineFormat('- ', 'Ý thứ nhất')}
            className="w-7 h-7 inline-flex items-center justify-center rounded bg-white border border-slate-200 hover:bg-slate-100 hover:border-slate-300 text-slate-800 cursor-pointer"
            title="Danh sách gạch đầu dòng (- Ý)"
            aria-label="Danh sách gạch đầu dòng"
          >
            <List className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onMouseDown={preventFocusSteal}
            onClick={() => handleWrapFormat('<div style="text-align:center">', '</div>', 'Nội dung căn giữa')}
            className="w-7 h-7 inline-flex items-center justify-center rounded bg-white border border-slate-200 hover:bg-slate-100 hover:border-slate-300 text-slate-800 cursor-pointer"
            title="Căn giữa đoạn văn bản"
            aria-label="Căn giữa"
          >
            <AlignCenter className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onMouseDown={preventFocusSteal}
            onClick={handleClearFormatting}
            className="w-7 h-7 inline-flex items-center justify-center rounded bg-white border border-slate-200 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 text-slate-600 cursor-pointer"
            title="Xóa định dạng vùng đang bôi đen"
            aria-label="Xóa định dạng"
          >
            <RemoveFormatting className="w-3.5 h-3.5" />
          </button>

          <span className="w-px h-4 bg-slate-200 mx-0.5" aria-hidden="true" />

          <CopyContentButton
            compact
            getText={() => {
              const targetEl = resolveEditable();
              if (!targetEl) return '';
              const selStart = targetEl.selectionStart;
              const selEnd = targetEl.selectionEnd;
              if (
                typeof selStart === 'number' &&
                typeof selEnd === 'number' &&
                selEnd > selStart
              ) {
                return targetEl.value.slice(selStart, selEnd);
              }
              return targetEl.value || '';
            }}
            title="Sao chép vùng đang bôi đen hoặc toàn bộ nội dung trong ô đang soạn"
          />
        </div>

        <span className="text-[11px] font-normal text-slate-500 hidden md:inline">
          (bôi đen chữ để định dạng hoặc đặt trỏ để chèn công thức)
        </span>
      </div>

      {/* Header & Category Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-1.5 border-b border-slate-200/70">
        <div className="flex items-center gap-1.5 font-semibold text-slate-700">
          <Sparkles className="w-3.5 h-3.5 text-blue-600" />
          <span>Chèn công thức toán</span>
        </div>

        <div className="flex items-center gap-1 flex-wrap">
          {[
            { id: 'all', label: 'Tất cả' },
            { id: 'roots', label: 'Căn thức' },
            { id: 'vectors', label: 'Vectơ' },
            { id: 'fractions', label: 'Phân số & Mũ' },
            { id: 'symbols', label: 'Ký hiệu' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onMouseDown={preventFocusSteal}
              onClick={() => setActiveCategory(tab.id as typeof activeCategory)}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                activeCategory === tab.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Compact Formula Buttons */}
      <div className="flex flex-wrap items-center gap-1.5">
        {displayedSnippets.map((s, idx) => (
          <button
            key={`${s.category}_${idx}`}
            type="button"
            onMouseDown={preventFocusSteal}
            onClick={() => handleInsertAtCursorOrFallback(s.code)}
            className="px-2 py-1 bg-white hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300 border border-slate-200 rounded font-medium text-slate-800 transition-colors cursor-pointer flex items-center justify-center min-h-[28px]"
            title={`${s.description} — Nhấp để chèn tại vị trí con trỏ`}
          >
            <MathSnippetPreview tex={s.displayTex} fallback={s.label} />
          </button>
        ))}
      </div>

      {/* Auxiliary actions: Tables and Images */}
      <div className="flex flex-wrap items-center gap-2 pt-1.5 border-t border-slate-200/70">
        <button
          type="button"
          onMouseDown={preventFocusSteal}
          onClick={() => handleInsertAtCursorOrFallback(tableSample)}
          className="px-2 py-1 bg-white hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 border border-slate-200 rounded font-medium text-slate-700 transition-colors flex items-center gap-1 cursor-pointer"
          title="Chèn bảng biến thiên tại vị trí con trỏ"
        >
          <Table className="w-3.5 h-3.5 text-emerald-600" />
          <span>Chèn bảng biến thiên</span>
        </button>

        {onInsertImage && (
          <div className="relative inline-block">
            <button
              type="button"
              onMouseDown={preventFocusSteal}
              onClick={() => setShowPresets(!showPresets)}
              className="px-2 py-1 bg-white hover:bg-purple-50 hover:text-purple-700 hover:border-purple-300 border border-slate-200 rounded font-medium text-slate-700 transition-colors flex items-center gap-1 cursor-pointer"
            >
              <Image className="w-3.5 h-3.5 text-purple-600" />
              <span>Chèn hình ảnh / Đồ thị</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {showPresets && (
              <div className="absolute right-0 top-full mt-1 w-64 bg-white border border-slate-200 rounded-xl shadow-lg p-3 z-30 space-y-2">
                <div className="font-semibold text-slate-800 text-xs">Chèn URL hình ảnh:</div>
                <input
                  type="text"
                  placeholder="Dán link ảnh..."
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const val = (e.target as HTMLInputElement).value;
                      if (val) {
                        onInsertImage(val);
                        setShowPresets(false);
                      }
                    }
                  }}
                  className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-purple-600"
                />

                <div className="text-[11px] font-medium text-slate-500 pt-1 border-t border-slate-100">
                  Hoặc chọn mẫu có sẵn:
                </div>
                <div className="space-y-1">
                  {sampleImages.map((img, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        onInsertImage(img.url);
                        setShowPresets(false);
                      }}
                      className="w-full text-left p-1.5 hover:bg-purple-50 rounded text-xs text-slate-700 block transition-colors truncate cursor-pointer"
                    >
                      • {img.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
