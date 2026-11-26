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
  Heading,
  IndentIncrease,
  IndentDecrease,
  AlignCenter,
  RemoveFormatting,
} from 'lucide-react';
import { renderMath } from '../utils/renderMath';
import {
  EditableTextElement,
  applyLinePrefixAtEditableElement,
  indentEditableLines,
  insertTextAtEditableElement,
  isEditableTextInput,
  resolveTargetEditableElement,
  stripFormattingAtEditableElement,
  wrapSelectionAtEditableElement,
} from '../utils/cursorInsert';
import { CopyContentButton } from './CopyContentButton';
import { InlineImageTitleModal } from './InlineImageTitleModal';
import { formatInlineImageToken, registerImplicitImage } from '../utils/inlineImages';

interface MathToolbarProps {
  onInsert?: (text: string) => void;
  onInsertImage?: (url: string) => void;
  onInsertInlineImage?: (imgId: string, imgSrc: string, title: string) => void;
  imageButtonLabel?: string;
  hideImageButton?: boolean;
  targetRef?: React.RefObject<EditableTextElement | null>;
  containerRef?: React.RefObject<HTMLElement | null>;
  getContainerEl?: () => HTMLElement | null;
  onAfterCursorInsert?: (insertedText: string) => void;
  compact?: boolean;
}

type MathCategory =
  | 'all'
  | 'sets_logic'
  | 'geometry'
  | 'constants'
  | 'roots'
  | 'vectors'
  | 'fractions'
  | 'symbols';

interface MathSnippet {
  label: string;
  displayTex: string;
  code: string;
  description: string;
  category: Exclude<MathCategory, 'all'>;
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

const HEADING_OPTIONS = [
  { level: 1, prefix: '# ', label: 'Tiêu đề 1 (Rất lớn)', sampleClass: 'text-sm font-extrabold text-slate-900', tag: 'H1' },
  { level: 2, prefix: '## ', label: 'Tiêu đề 2 (Chương / Phần)', sampleClass: 'text-[13px] font-bold text-slate-900', tag: 'H2' },
  { level: 3, prefix: '### ', label: 'Tiêu đề 3 (Mục nhỏ)', sampleClass: 'text-xs font-bold text-slate-800', tag: 'H3' },
  { level: 4, prefix: '#### ', label: 'Tiêu đề 4 (Ý chi tiết)', sampleClass: 'text-[11px] font-semibold text-slate-700', tag: 'H4' },
];

const LIST_LEVEL_PRESETS: {
  group: string;
  items: { prefix: string; badge: string; label: string; placeholder: string }[];
}[] = [
  {
    group: 'Cấp 1 (Ý lớn)',
    items: [
      { prefix: '- ', badge: '•', label: 'Chấm tròn (-)', placeholder: 'Ý lớn thứ nhất' },
      { prefix: '▸ ', badge: '▸', label: 'Mũi tên tam giác (▸)', placeholder: 'Ý chính' },
      { prefix: '★ ', badge: '★', label: 'Ngôi sao nhấn mạnh (★)', placeholder: 'Ý trọng tâm' },
      { prefix: '✓ ', badge: '✓', label: 'Dấu kiểm (✓)', placeholder: 'Ý đạt / Lưu ý' },
      { prefix: '❖ ', badge: '❖', label: 'Hoa thị (❖)', placeholder: 'Nội dung chính' },
      { prefix: '1. ', badge: '1.', label: 'Số thứ tự (1. 2. 3.)', placeholder: 'Bước 1' },
      { prefix: 'I. ', badge: 'I.', label: 'Số La Mã (I. II.)', placeholder: 'Phần I' },
      { prefix: 'a) ', badge: 'a)', label: 'Chữ cái (a) b))', placeholder: 'Ý a' },
    ],
  },
  {
    group: 'Cấp 2 (Ý nhỏ nằm trong ý lớn)',
    items: [
      { prefix: '  - ', badge: '◦', label: 'Thụt cấp 2 tròn rỗng', placeholder: 'Ý nhỏ cấp 2' },
      { prefix: '  a) ', badge: 'a)', label: 'Thụt cấp 2 chữ a)', placeholder: 'Ý nhỏ a)' },
      { prefix: '  1. ', badge: '1.', label: 'Thụt cấp 2 số 1.', placeholder: 'Ý nhỏ 1.' },
      { prefix: '  ▸ ', badge: '▸', label: 'Thụt cấp 2 mũi tên', placeholder: 'Ý nhỏ cấp 2' },
    ],
  },
  {
    group: 'Cấp 3 & Cấp 4 (Ý con sâu hơn)',
    items: [
      { prefix: '    ▪ ', badge: '▪', label: 'Thụt cấp 3 ô vuông (▪)', placeholder: 'Ý chi tiết cấp 3' },
      { prefix: '    ✓ ', badge: '✓', label: 'Thụt cấp 3 dấu tích (✓)', placeholder: 'Ý chi tiết' },
      { prefix: '      → ', badge: '→', label: 'Thụt cấp 4 mũi tên (→)', placeholder: 'Ý con cấp 4' },
    ],
  },
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
  onInsertInlineImage,
  imageButtonLabel = 'Chèn ảnh tại con trỏ',
  hideImageButton = false,
  targetRef,
  containerRef,
  getContainerEl,
  onAfterCursorInsert,
  compact = false,
}) => {
  const [showColorMenu, setShowColorMenu] = useState(false);
  const [showHeadingMenu, setShowHeadingMenu] = useState(false);
  const [showListMenu, setShowListMenu] = useState(false);
  const [activeColor, setActiveColor] = useState('#dc2626');
  const [activeCategory, setActiveCategory] = useState<MathCategory>('all');
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [pendingCursorTarget, setPendingCursorTarget] = useState<{
    element: EditableTextElement | null;
    range: { start: number; end: number } | null;
  }>({ element: null, range: null });
  const toolbarRootRef = useRef<HTMLDivElement>(null);
  const lastFocusedRef = useRef<EditableTextElement | null>(null);
  const getContainerElRef = useRef(getContainerEl);
  getContainerElRef.current = getContainerEl;

  // Đóng dropdown khi click ra ngoài
  useEffect(() => {
    if (!showColorMenu && !showHeadingMenu && !showListMenu) return;
    const handleOutside = (e: MouseEvent) => {
      if (toolbarRootRef.current && !toolbarRootRef.current.contains(e.target as Node)) {
        setShowColorMenu(false);
        setShowHeadingMenu(false);
        setShowListMenu(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [showColorMenu, showHeadingMenu, showListMenu]);

  // Ghi nhớ ô nhập liệu được focus gần nhất trong phạm vi containerRef / getContainerEl
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as Element | null;
      if (!isEditableTextInput(target)) return;
      if (toolbarRootRef.current?.contains(target)) return;
      const scopedEl = getContainerElRef.current
        ? getContainerElRef.current()
        : containerRef?.current || null;
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

  const handleIndentLines = (direction: 'indent' | 'outdent') => {
    const targetEl = resolveEditable();
    if (targetEl && indentEditableLines(targetEl, direction)) {
      lastFocusedRef.current = targetEl;
      onAfterCursorInsert?.('');
    }
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
    e.preventDefault();
  };

  const handleOpenCursorImageModal = () => {
    setShowColorMenu(false);
    setShowHeadingMenu(false);
    setShowListMenu(false);
    const targetEl = resolveEditable();
    if (targetEl) {
      const start =
        typeof targetEl.selectionStart === 'number'
          ? targetEl.selectionStart
          : targetEl.value.length;
      const end =
        typeof targetEl.selectionEnd === 'number' ? targetEl.selectionEnd : start;
      setPendingCursorTarget({ element: targetEl, range: { start, end } });
    } else {
      setPendingCursorTarget({ element: null, range: null });
    }
    setIsImageModalOpen(true);
  };

  const handleConfirmCursorImage = (imageSrc: string, title: string) => {
    const imgId = registerImplicitImage(imageSrc);
    const token = formatInlineImageToken(imgId, title);
    if (onInsertInlineImage) {
      onInsertInlineImage(imgId, imageSrc, title);
    } else if (onInsertImage) {
      onInsertImage(imageSrc);
      setIsImageModalOpen(false);
      return;
    }

    const savedEl = pendingCursorTarget.element;
    const savedRange = pendingCursorTarget.range;
    if (savedEl && insertTextAtEditableElement(savedEl, token, savedRange)) {
      lastFocusedRef.current = savedEl;
      onAfterCursorInsert?.(token);
    } else {
      handleInsertAtCursorOrFallback(token);
    }
    setIsImageModalOpen(false);
  };

  const snippets: MathSnippet[] = [
    // Tập hợp & Logic
    { label: '∈', displayTex: '\\in', code: '$\\in$', description: 'Thuộc: \\in', category: 'sets_logic' },
    { label: '∉', displayTex: '\\notin', code: '$\\notin$', description: 'Không thuộc: \\notin', category: 'sets_logic' },
    { label: '⊂', displayTex: '\\subset', code: '$\\subset$', description: 'Tập con thực sự: \\subset', category: 'sets_logic' },
    { label: '⊆', displayTex: '\\subseteq', code: '$\\subseteq$', description: 'Tập con hoặc bằng: \\subseteq', category: 'sets_logic' },
    { label: '⊄', displayTex: '\\not\\subset', code: '$\\not\\subset$', description: 'Không là tập con: \\not\\subset', category: 'sets_logic' },
    { label: '⊃', displayTex: '\\supset', code: '$\\supset$', description: 'Tập cha: \\supset', category: 'sets_logic' },
    { label: '∪', displayTex: '\\cup', code: '$\\cup$', description: 'Hợp hai tập hợp: \\cup', category: 'sets_logic' },
    { label: '∩', displayTex: '\\cap', code: '$\\cap$', description: 'Giao hai tập hợp: \\cap', category: 'sets_logic' },
    { label: '∖', displayTex: '\\setminus', code: '$\\setminus$', description: 'Hiệu hai tập hợp: \\setminus', category: 'sets_logic' },
    { label: '∅', displayTex: '\\emptyset', code: '$\\emptyset$', description: 'Tập rỗng: \\emptyset', category: 'sets_logic' },
    { label: '∀', displayTex: '\\forall', code: '$\\forall$', description: 'Với mọi: \\forall', category: 'sets_logic' },
    { label: '∃', displayTex: '\\exists', code: '$\\exists$', description: 'Tồn tại: \\exists', category: 'sets_logic' },
    { label: '∃!', displayTex: '\\exists!', code: '$\\exists!$', description: 'Tồn tại duy nhất: \\exists!', category: 'sets_logic' },
    { label: '⇒', displayTex: '\\Rightarrow', code: '$\\Rightarrow$', description: 'Suy ra: \\Rightarrow', category: 'sets_logic' },
    { label: '⇔', displayTex: '\\Leftrightarrow', code: '$\\Leftrightarrow$', description: 'Tương đương: \\Leftrightarrow', category: 'sets_logic' },
    { label: 'ℕ', displayTex: '\\mathbb{N}', code: '$\\mathbb{N}$', description: 'Tập số tự nhiên: \\mathbb{N}', category: 'sets_logic' },
    { label: 'ℤ', displayTex: '\\mathbb{Z}', code: '$\\mathbb{Z}$', description: 'Tập số nguyên: \\mathbb{Z}', category: 'sets_logic' },
    { label: 'ℚ', displayTex: '\\mathbb{Q}', code: '$\\mathbb{Q}$', description: 'Tập số hữu tỉ: \\mathbb{Q}', category: 'sets_logic' },
    { label: 'ℝ', displayTex: '\\mathbb{R}', code: '$\\mathbb{R}$', description: 'Tập số thực: \\mathbb{R}', category: 'sets_logic' },

    // Hình học, Góc (mũ bao 1 chữ & 3 chữ) & Cung tròn (mũ bao 1 chữ, 2 chữ, 3 chữ)
    { label: '⊥', displayTex: '\\perp', code: '$\\perp$', description: 'Vuông góc: \\perp', category: 'geometry' },
    { label: '∥', displayTex: '\\parallel', code: '$\\parallel$', description: 'Song song: \\parallel', category: 'geometry' },
    { label: '∼', displayTex: '\\sim', code: '$\\sim$', description: 'Đồng dạng: \\sim', category: 'geometry' },
    { label: '≅', displayTex: '\\cong', code: '$\\cong$', description: 'Bằng nhau (hình học): \\cong', category: 'geometry' },
    { label: '°', displayTex: '90^\\circ', code: '$^\\circ$', description: 'Ký hiệu độ: ^\\circ', category: 'geometry' },
    { label: '△ABC', displayTex: '\\triangle ABC', code: '$\\triangle ABC$', description: 'Tam giác ABC: \\triangle ABC', category: 'geometry' },
    { label: 'Â', displayTex: '\\widehat{A}', code: '$\\widehat{A}$', description: 'Góc 1 chữ (mũ bao 1 chữ): \\widehat{A}', category: 'geometry' },
    { label: 'ÂBC', displayTex: '\\widehat{ABC}', code: '$\\widehat{ABC}$', description: 'Góc 3 chữ (mũ bao 3 chữ): \\widehat{ABC}', category: 'geometry' },
    { label: '∠ABC', displayTex: '\\angle ABC', code: '$\\angle ABC$', description: 'Góc ∠ABC: \\angle ABC', category: 'geometry' },
    { label: 'Cung a', displayTex: '\\overset{\\frown}{a}', code: '$\\overset{\\frown}{a}$', description: 'Cung 1 chữ (mũ cung bao 1 chữ)', category: 'geometry' },
    { label: 'Cung AB', displayTex: '\\overset{\\frown}{AB}', code: '$\\overset{\\frown}{AB}$', description: 'Cung AB (mũ cung bao 2 chữ)', category: 'geometry' },
    { label: 'Cung ABC', displayTex: '\\overset{\\frown}{ABC}', code: '$\\overset{\\frown}{ABC}$', description: 'Cung lớn ABC (mũ cung bao 3 chữ)', category: 'geometry' },

    // Hằng số & Ký hiệu Hy Lạp
    { label: 'e', displayTex: 'e', code: '$e$', description: 'Hằng số Euler (cơ số logarit tự nhiên e)', category: 'constants' },
    { label: 'γ', displayTex: '\\gamma', code: '$\\gamma$', description: 'Hằng số Gamma / Euler-Mascheroni (\\gamma)', category: 'constants' },
    { label: 'π', displayTex: '\\pi', code: '$\\pi$', description: 'Hằng số Pi (\\pi)', category: 'constants' },
    { label: 'φ', displayTex: '\\varphi', code: '$\\varphi$', description: 'Tỉ lệ vàng / Phi (\\varphi)', category: 'constants' },
    { label: 'ε', displayTex: '\\varepsilon', code: '$\\varepsilon$', description: 'Hằng số nhỏ Epsilon (\\varepsilon)', category: 'constants' },
    { label: 'λ', displayTex: '\\lambda', code: '$\\lambda$', description: 'Bước sóng / Giá trị riêng Lambda (\\lambda)', category: 'constants' },
    { label: 'μ', displayTex: '\\mu', code: '$\\mu$', description: 'Hệ số / Kỳ vọng Mu (\\mu)', category: 'constants' },
    { label: 'θ', displayTex: '\\theta', code: '$\\theta$', description: 'Góc Theta (\\theta)', category: 'constants' },
    { label: 'ω', displayTex: '\\omega', code: '$\\omega$', description: 'Tần số góc Omega (\\omega)', category: 'constants' },
    { label: 'Ω', displayTex: '\\Omega', code: '$\\Omega$', description: 'Không gian mẫu / Điện trở Omega (\\Omega)', category: 'constants' },
    { label: 'Δ', displayTex: '\\Delta', code: '$\\Delta$', description: 'Biệt thức Delta (\\Delta)', category: 'constants' },
    { label: 'α', displayTex: '\\alpha', code: '$\\alpha$', description: 'Alpha (\\alpha)', category: 'constants' },
    { label: 'β', displayTex: '\\beta', code: '$\\beta$', description: 'Beta (\\beta)', category: 'constants' },
    { label: 'σ', displayTex: '\\sigma', code: '$\\sigma$', description: 'Độ lệch chuẩn Sigma (\\sigma)', category: 'constants' },

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

    // Giải tích & So sánh
    { label: '∫', displayTex: '\\int_{a}^{b} f(x)dx', code: '$\\int_{a}^{b} f(x)dx$', description: 'Tích phân xác định', category: 'symbols' },
    { label: 'lim', displayTex: '\\lim_{x \\to x_0}', code: '$\\lim_{x \\to x_0}$', description: 'Giới hạn hàm số', category: 'symbols' },
    { label: '∑', displayTex: '\\sum_{i=1}^{n}', code: '$\\sum_{i=1}^{n}$', description: 'Tổng sigma', category: 'symbols' },
    { label: 'Hệ PT', displayTex: '\\begin{cases} a \\\\ b \\end{cases}', code: '$\\begin{cases} x + y = 2 \\\\ x - y = 0 \\end{cases}$', description: 'Hệ phương trình 2 ẩn', category: 'symbols' },
    { label: '∞', displayTex: '\\infty', code: '$\\infty$', description: 'Vô cực', category: 'symbols' },
    { label: '≤', displayTex: '\\le', code: '$\\le$', description: 'Nhỏ hơn hoặc bằng', category: 'symbols' },
    { label: '≥', displayTex: '\\ge', code: '$\\ge$', description: 'Lớn hơn hoặc bằng', category: 'symbols' },
    { label: '±', displayTex: '\\pm', code: '$\\pm$', description: 'Cộng trừ', category: 'symbols' },
    { label: '≠', displayTex: '\\ne', code: '$\\ne$', description: 'Khác', category: 'symbols' },
    { label: '≈', displayTex: '\\approx', code: '$\\approx$', description: 'Xấp xỉ', category: 'symbols' },
    { label: '≡', displayTex: '\\equiv', code: '$\\equiv$', description: 'Đồng dư / Trùng nhau', category: 'symbols' },
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

  const canShowImageButton = !hideImageButton && Boolean(onInsertInlineImage || onInsertImage);

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
              onClick={() => {
                setShowHeadingMenu(false);
                setShowListMenu(false);
                setShowColorMenu((prev) => !prev);
              }}
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

          {/* Heading Dropdown (H1 - H4) */}
          <div className="relative inline-flex items-center">
            <button
              type="button"
              onMouseDown={preventFocusSteal}
              onClick={() => {
                setShowColorMenu(false);
                setShowListMenu(false);
                setShowHeadingMenu((prev) => !prev);
              }}
              className="h-7 px-2 inline-flex items-center gap-1 rounded bg-white border border-slate-200 hover:bg-slate-100 hover:border-slate-300 text-slate-800 cursor-pointer font-semibold"
              title="Chọn cấp tiêu đề (H1, H2, H3, H4)"
              aria-label="Chọn cấp tiêu đề"
            >
              <Heading className="w-3.5 h-3.5" />
              <span className="text-[11px]">Tiêu đề</span>
              <ChevronDown className="w-3 h-3 text-slate-500" />
            </button>

            {showHeadingMenu && (
              <div className="absolute left-0 top-full mt-1 w-56 bg-white border border-slate-200 rounded-xl shadow-lg p-1.5 z-30 space-y-1">
                <div className="px-2 py-1 text-[10px] font-bold uppercase text-slate-500">
                  Cấp tiêu đề đoạn văn
                </div>
                {HEADING_OPTIONS.map((h) => (
                  <button
                    key={h.level}
                    type="button"
                    onMouseDown={preventFocusSteal}
                    onClick={() => {
                      setShowHeadingMenu(false);
                      handleApplyLineFormat(h.prefix, h.label);
                    }}
                    className="w-full px-2.5 py-1.5 rounded-lg hover:bg-slate-100 flex items-center justify-between gap-2 text-left cursor-pointer"
                  >
                    <span className={h.sampleClass}>{h.label}</span>
                    <span className="text-[10px] font-mono text-slate-400 shrink-0">{h.tag}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Multi-Symbol & Multi-Level List Picker */}
          <div className="relative inline-flex items-center">
            <button
              type="button"
              onMouseDown={preventFocusSteal}
              onClick={() => handleApplyLineFormat('- ', 'Ý thứ nhất')}
              className="h-7 px-1.5 inline-flex items-center gap-1 rounded-l bg-white border border-slate-200 hover:bg-slate-100 hover:border-slate-300 text-slate-800 cursor-pointer"
              title="Danh sách gạch đầu dòng (- Ý)"
              aria-label="Danh sách gạch đầu dòng"
            >
              <List className="w-3.5 h-3.5" />
              <span className="text-[11px] font-semibold hidden sm:inline">Ý</span>
            </button>
            <button
              type="button"
              onMouseDown={preventFocusSteal}
              onClick={() => {
                setShowColorMenu(false);
                setShowHeadingMenu(false);
                setShowListMenu((prev) => !prev);
              }}
              className="h-7 px-1 inline-flex items-center rounded-r bg-white border border-l-0 border-slate-200 hover:bg-slate-100 text-slate-600 cursor-pointer"
              title="Chọn ký hiệu & nhiều cấp danh sách (ý lớn / ý nhỏ)"
              aria-label="Mở bảng danh sách nhiều cấp"
            >
              <ChevronDown className="w-3 h-3" />
            </button>

            {showListMenu && (
              <div className="absolute left-0 top-full mt-1 w-72 max-h-80 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-xl p-2 z-30 space-y-2">
                {LIST_LEVEL_PRESETS.map((grp) => (
                  <div key={grp.group} className="space-y-1">
                    <div className="px-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      {grp.group}
                    </div>
                    <div className="grid grid-cols-1 gap-0.5">
                      {grp.items.map((item) => (
                        <button
                          key={item.prefix}
                          type="button"
                          onMouseDown={preventFocusSteal}
                          onClick={() => {
                            setShowListMenu(false);
                            handleApplyLineFormat(item.prefix, item.placeholder);
                          }}
                          className="w-full px-2 py-1.5 rounded-lg hover:bg-blue-50 text-left flex items-center justify-between gap-2 cursor-pointer"
                        >
                          <span className="flex items-center gap-2 min-w-0">
                            <span className="w-5 h-5 rounded bg-slate-100 border border-slate-200 flex items-center justify-center text-[11px] font-bold text-slate-700 shrink-0">
                              {item.badge}
                            </span>
                            <span className="text-[11px] font-medium text-slate-800 truncate">
                              {item.label}
                            </span>
                          </span>
                          <code className="text-[10px] text-slate-400 shrink-0">
                            {item.prefix.replace(/ /g, '·')}
                          </code>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            onMouseDown={preventFocusSteal}
            onClick={() => handleIndentLines('indent')}
            className="w-7 h-7 inline-flex items-center justify-center rounded bg-white border border-slate-200 hover:bg-slate-100 hover:border-slate-300 text-slate-800 cursor-pointer"
            title="Thụt vào cấp ý con (ý nhỏ trong ý lớn)"
            aria-label="Thụt vào cấp con"
          >
            <IndentIncrease className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onMouseDown={preventFocusSteal}
            onClick={() => handleIndentLines('outdent')}
            className="w-7 h-7 inline-flex items-center justify-center rounded bg-white border border-slate-200 hover:bg-slate-100 hover:border-slate-300 text-slate-800 cursor-pointer"
            title="Lùi ra cấp ý cha"
            aria-label="Lùi ra cấp cha"
          >
            <IndentDecrease className="w-3.5 h-3.5" />
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
          <span>Chèn công thức &amp; ký hiệu toán</span>
        </div>

        <div className="flex items-center gap-1 flex-wrap">
          {[
            { id: 'all', label: 'Tất cả' },
            { id: 'sets_logic', label: 'Tập hợp & Logic' },
            { id: 'geometry', label: 'Góc, Cung & Hình học' },
            { id: 'constants', label: 'Hằng số (e, γ...)' },
            { id: 'roots', label: 'Căn thức' },
            { id: 'vectors', label: 'Vectơ' },
            { id: 'fractions', label: 'Phân số & Mũ' },
            { id: 'symbols', label: 'Giải tích & So sánh' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onMouseDown={preventFocusSteal}
              onClick={() => setActiveCategory(tab.id as MathCategory)}
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
      <div className="flex flex-wrap items-center gap-1.5 max-h-36 overflow-y-auto pr-0.5">
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

        {canShowImageButton && (
          <button
            type="button"
            onMouseDown={preventFocusSteal}
            onClick={handleOpenCursorImageModal}
            className="px-2.5 py-1 bg-white hover:bg-purple-50 hover:text-purple-700 hover:border-purple-300 border border-slate-200 rounded font-medium text-slate-700 transition-colors flex items-center gap-1 cursor-pointer"
            title="Chọn hoặc dán ảnh và chèn vào đúng vị trí con trỏ đang đứng (chỉ cần nhập tiêu đề ảnh)"
          >
            <Image className="w-3.5 h-3.5 text-purple-600" />
            <span>{imageButtonLabel}</span>
          </button>
        )}
      </div>

      <InlineImageTitleModal
        isOpen={isImageModalOpen}
        targetLabel={pendingCursorTarget.element ? 'Ô đang đặt con trỏ' : undefined}
        onConfirm={handleConfirmCursorImage}
        onClose={() => setIsImageModalOpen(false)}
      />
    </div>
  );
};
