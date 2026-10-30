import React, { useState } from 'react';
import { Table, Image, Sparkles, ChevronDown, Check, Hash, MoveRight } from 'lucide-react';
import katex from 'katex';

interface MathToolbarProps {
  onInsert: (text: string) => void;
  onInsertImage?: (url: string) => void;
}

interface MathItem {
  label: string;
  displayTex?: string;
  code: string;
  description: string;
  isRoot?: boolean;
  isVector?: boolean;
}

export const MathToolbar: React.FC<MathToolbarProps> = ({ onInsert, onInsertImage }) => {
  const [showPresets, setShowPresets] = useState(false);
  const [activeCategory, setActiveCategory] = useState<'all' | 'roots' | 'vectors' | 'fractions' | 'symbols'>('all');

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

  // Specific root items (Căn thức - vừa vặn với biểu thức)
  const rootSnippets: MathItem[] = [
    {
      label: '√x',
      displayTex: '\\sqrt{x}',
      code: '$\\sqrt{x}$',
      description: 'Căn bậc 2 vừa vặn: \\sqrt{x}',
      isRoot: true,
    },
    {
      label: '∛x',
      displayTex: '\\sqrt[3]{x}',
      code: '$\\sqrt[3]{x}$',
      description: 'Căn bậc 3: \\sqrt[3]{x}',
      isRoot: true,
    },
    {
      label: 'ⁿ√A',
      displayTex: '\\sqrt[n]{A}',
      code: '$\\sqrt[n]{A}$',
      description: 'Căn bậc n tổng quát: \\sqrt[n]{A}',
      isRoot: true,
    },
    {
      label: '√(x²+1)',
      displayTex: '\\sqrt{x^2 + 1}',
      code: '$\\sqrt{x^2 + 1}$',
      description: 'Căn thức đa thức vừa vặn',
      isRoot: true,
    },
    {
      label: '√(a²+b²)',
      displayTex: '\\sqrt{a^2 + b^2}',
      code: '$\\sqrt{a^2 + b^2}$',
      description: 'Căn tổng bình phương (Module / Độ dài)',
      isRoot: true,
    },
    {
      label: '√a / b',
      displayTex: '\\frac{\\sqrt{a}}{b}',
      code: '$\\frac{\\sqrt{a}}{b}$',
      description: 'Phân số có căn thức ở tử',
      isRoot: true,
    },
    {
      label: 'a / √b',
      displayTex: '\\frac{a}{\\sqrt{b}}',
      code: '$\\frac{a}{\\sqrt{b}}$',
      description: 'Trục căn thức ở mẫu',
      isRoot: true,
    },
    {
      label: '√f(x)=g(x)',
      displayTex: '\\sqrt{f(x)} = g(x)',
      code: '$\\sqrt{f(x)} = g(x)$',
      description: 'Phương trình chứa căn thức',
      isRoot: true,
    },
    {
      label: '√Δ',
      displayTex: '\\sqrt{\\Delta}',
      code: '$\\sqrt{\\Delta}$',
      description: 'Căn biệt thức Delta phương trình bậc 2',
      isRoot: true,
    },
  ];

  // Specific vector items (Dấu mũi tên phải trên vector - tự động vừa vặn)
  const vectorSnippets: MathItem[] = [
    {
      label: 'u⃗',
      displayTex: '\\vec{u}',
      code: '$\\vec{u}$',
      description: 'Vectơ 1 chữ cái: \\vec{u} (mũi tên phải trên chữ)',
      isVector: true,
    },
    {
      label: 'v⃗',
      displayTex: '\\vec{v}',
      code: '$\\vec{v}$',
      description: 'Vectơ v: \\vec{v}',
      isVector: true,
    },
    {
      label: 'AB→',
      displayTex: '\\overrightarrow{AB}',
      code: '$\\overrightarrow{AB}$',
      description: 'Vectơ 2 điểm: \\overrightarrow{AB} (mũi tên co giãn vừa vặn AB)',
      isVector: true,
    },
    {
      label: 'MN→',
      displayTex: '\\overrightarrow{MN}',
      code: '$\\overrightarrow{MN}$',
      description: 'Vectơ đoạn MN: \\overrightarrow{MN}',
      isVector: true,
    },
    {
      label: 'n⃗',
      displayTex: '\\vec{n} = (a; b; c)',
      code: '$\\vec{n} = (a; b; c)$',
      description: 'Vectơ pháp tuyến trong không gian',
      isVector: true,
    },
    {
      label: '|AB|',
      displayTex: '|\\overrightarrow{AB}|',
      code: '$|\\overrightarrow{AB}|$',
      description: 'Độ dài vectơ AB',
      isVector: true,
    },
    {
      label: 'a⃗·b⃗',
      displayTex: '\\vec{a} \\cdot \\vec{b}',
      code: '$\\vec{a} \\cdot \\vec{b}$',
      description: 'Tích vô hướng 2 vectơ',
      isVector: true,
    },
  ];

  // Other math items
  const otherSnippets: MathItem[] = [
    { label: 'a/b', displayTex: '\\frac{a}{b}', code: '$\\frac{a}{b}$', description: 'Phân số a/b' },
    { label: 'x²', displayTex: 'x^2', code: '$x^{2}$', description: 'Số mũ lũy thừa bậc 2' },
    { label: 'xⁿ', displayTex: 'x^n', code: '$x^{n}$', description: 'Số mũ lũy thừa bậc n' },
    { label: 'x₁', displayTex: 'x_1', code: '$x_{1}$', description: 'Chỉ số dưới (subscript)' },
    { label: '∫', displayTex: '\\int_{a}^{b} f(x)dx', code: '$\\int_{a}^{b} f(x)dx$', description: 'Tích phân xác định' },
    { label: 'lim', displayTex: '\\lim_{x \\to x_0}', code: '$\\lim_{x \\to x_0}$', description: 'Giới hạn hàm số' },
    { label: '∑', displayTex: '\\sum_{i=1}^{n}', code: '$\\sum_{i=1}^{n}$', description: 'Tổng sigma' },
    {
      label: 'Hệ PT',
      displayTex: '\\begin{cases} a \\\\ b \\end{cases}',
      code: '$\\begin{cases} x + y = 2 \\\\ x - y = 0 \\end{cases}$',
      description: 'Hệ phương trình 2 ẩn',
    },
    { label: 'π', displayTex: '\\pi', code: '$\\pi$', description: 'Số Pi' },
    { label: '∞', displayTex: '\\infty', code: '$\\infty$', description: 'Vô cực' },
    { label: 'Δ', displayTex: '\\Delta', code: '$\\Delta$', description: 'Delta' },
    { label: 'α', displayTex: '\\alpha', code: '$\\alpha$', description: 'Alpha' },
    { label: '≤', displayTex: '\\le', code: '$\\le$', description: 'Nhỏ hơn hoặc bằng' },
    { label: '≥', displayTex: '\\ge', code: '$\\ge$', description: 'Lớn hơn hoặc bằng' },
    { label: '±', displayTex: '\\pm', code: '$\\pm$', description: 'Cộng trừ' },
    { label: '≠', displayTex: '\\ne', code: '$\\ne$', description: 'Khác' },
  ];

  const tableSample = `
| x | -\\infty | 1 | +\\infty |
| :--- | :---: | :---: | :---: |
| y' | + | 0 | - |
| y | -\\infty \\nearrow | 4 | \\searrow -\\infty |
`;

  // Safe KaTeX renderer for button preview
  const renderMiniKatex = (tex: string) => {
    try {
      return katex.renderToString(tex, {
        displayMode: false,
        throwOnError: false,
      });
    } catch {
      return null;
    }
  };

  const displayedSnippets =
    activeCategory === 'roots'
      ? rootSnippets
      : activeCategory === 'vectors'
      ? vectorSnippets
      : activeCategory === 'fractions'
      ? otherSnippets.filter((s) => s.code.includes('frac') || s.code.includes('^') || s.code.includes('_'))
      : activeCategory === 'symbols'
      ? otherSnippets.filter((s) => !s.code.includes('frac') && !s.code.includes('^'))
      : [...rootSnippets, ...vectorSnippets, ...otherSnippets];

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 mb-3 text-xs space-y-2">
      {/* Category selector row */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 pb-2">
        <div className="flex items-center gap-1.5 font-bold text-slate-800">
          <Sparkles className="w-3.5 h-3.5 text-blue-600" />
          <span>Công cụ toán học & Chèn công thức:</span>
        </div>

        {/* Filter chips */}
        <div className="flex items-center gap-1 flex-wrap">
          <button
            type="button"
            onClick={() => setActiveCategory('all')}
            className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer ${
              activeCategory === 'all'
                ? 'bg-blue-600 text-white shadow-2xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            Tất cả
          </button>
          <button
            type="button"
            onClick={() => setActiveCategory('roots')}
            className={`px-2 py-0.5 rounded text-[11px] font-bold transition-colors cursor-pointer flex items-center gap-1 ${
              activeCategory === 'roots'
                ? 'bg-emerald-600 text-white shadow-2xs ring-1 ring-emerald-500'
                : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200'
            }`}
            title="Xem các dạng căn thức vừa vặn"
          >
            <span>√ Căn thức ({rootSnippets.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveCategory('vectors')}
            className={`px-2 py-0.5 rounded text-[11px] font-bold transition-colors cursor-pointer flex items-center gap-1 ${
              activeCategory === 'vectors'
                ? 'bg-indigo-600 text-white shadow-2xs ring-1 ring-indigo-500'
                : 'bg-indigo-50 text-indigo-800 hover:bg-indigo-100 border border-indigo-200'
            }`}
            title="Xem các dạng mũi tên vectơ vừa vặn"
          >
            <span>→ Vectơ ({vectorSnippets.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveCategory('fractions')}
            className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer ${
              activeCategory === 'fractions'
                ? 'bg-blue-600 text-white shadow-2xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            Phân số & Mũ
          </button>
          <button
            type="button"
            onClick={() => setActiveCategory('symbols')}
            className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer ${
              activeCategory === 'symbols'
                ? 'bg-blue-600 text-white shadow-2xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            Ký hiệu
          </button>
        </div>
      </div>

      {/* Prominent Sections when 'all' is active */}
      {activeCategory === 'all' && (
        <div className="space-y-1.5">
          {/* 1. Root Bar (Căn thức vừa vặn) */}
          <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-lg p-1.5 flex flex-wrap items-center gap-1.5">
            <div className="text-[11px] font-bold text-emerald-900 flex items-center gap-1 shrink-0 px-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span>Dấu căn vừa vặn (√, ∛, ⁿ√):</span>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              {rootSnippets.map((s, idx) => {
                const htmlKatex = s.displayTex ? renderMiniKatex(s.displayTex) : null;
                return (
                  <button
                    key={`root_${idx}`}
                    type="button"
                    onClick={() => onInsert(s.code)}
                    className="px-2 py-1 bg-white hover:bg-emerald-100 hover:border-emerald-400 border border-emerald-200 rounded text-emerald-900 transition-all font-semibold flex items-center gap-1 shadow-2xs cursor-pointer"
                    title={`${s.description} (Nhấp để chèn)`}
                  >
                    {htmlKatex ? (
                      <span
                        dangerouslySetInnerHTML={{ __html: htmlKatex }}
                        className="inline-block scale-95"
                      />
                    ) : (
                      <span>{s.label}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Vector Bar (Mũi tên phải trên vectơ vừa vặn) */}
          <div className="bg-indigo-50/70 border border-indigo-200/80 rounded-lg p-1.5 flex flex-wrap items-center gap-1.5">
            <div className="text-[11px] font-bold text-indigo-900 flex items-center gap-1 shrink-0 px-1">
              <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
              <span>Mũi tên phải vectơ (u⃗, AB→):</span>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              {vectorSnippets.map((s, idx) => {
                const htmlKatex = s.displayTex ? renderMiniKatex(s.displayTex) : null;
                return (
                  <button
                    key={`vec_${idx}`}
                    type="button"
                    onClick={() => onInsert(s.code)}
                    className="px-2 py-1 bg-white hover:bg-indigo-100 hover:border-indigo-400 border border-indigo-200 rounded text-indigo-900 transition-all font-semibold flex items-center gap-1 shadow-2xs cursor-pointer"
                    title={`${s.description} (Nhấp để chèn)`}
                  >
                    {htmlKatex ? (
                      <span
                        dangerouslySetInnerHTML={{ __html: htmlKatex }}
                        className="inline-block scale-95"
                      />
                    ) : (
                      <span>{s.label}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Math Buttons List */}
      <div className="flex flex-wrap items-center gap-1">
        {displayedSnippets.map((s, idx) => {
          const htmlKatex = s.displayTex ? renderMiniKatex(s.displayTex) : null;
          return (
            <button
              key={idx}
              type="button"
              onClick={() => onInsert(s.code)}
              className={`px-2 py-1 bg-white hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300 border rounded font-mono text-slate-800 transition-colors shadow-2xs cursor-pointer flex items-center gap-1 ${
                s.isRoot
                  ? 'border-emerald-300 bg-emerald-50/40 text-emerald-900 font-bold hover:bg-emerald-100'
                  : s.isVector
                  ? 'border-indigo-300 bg-indigo-50/40 text-indigo-900 font-bold hover:bg-indigo-100'
                  : 'border-slate-200'
              }`}
              title={`${s.description} - Nhấp để chèn`}
            >
              {htmlKatex ? (
                <span
                  dangerouslySetInnerHTML={{ __html: htmlKatex }}
                  className="inline-block scale-90"
                />
              ) : (
                <span>{s.label}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Auxiliary actions: Tables and Images */}
      <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-200/60">
        <button
          type="button"
          onClick={() => onInsert(tableSample)}
          className="px-2.5 py-1 bg-white hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 border border-slate-200 rounded font-medium text-slate-700 transition-colors flex items-center gap-1 cursor-pointer"
          title="Chèn bảng biến thiên mẫu (Markdown Table)"
        >
          <Table className="w-3.5 h-3.5 text-emerald-600" />
          <span>Bảng biến thiên mẫu</span>
        </button>

        {onInsertImage && (
          <div className="relative inline-block">
            <button
              type="button"
              onClick={() => setShowPresets(!showPresets)}
              className="px-2.5 py-1 bg-white hover:bg-purple-50 hover:text-purple-700 hover:border-purple-300 border border-slate-200 rounded font-medium text-slate-700 transition-colors flex items-center gap-1 cursor-pointer"
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
                  placeholder="Dán link ảnh (https://...)"
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
                      className="w-full text-left p-1.5 hover:bg-purple-50 rounded text-xs text-slate-700 block transition-colors truncate"
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
