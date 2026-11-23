import React, { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  GripVertical,
  RotateCcw,
  Eraser,
  ArrowRight,
  Columns2,
} from 'lucide-react';
import { Question } from '../types/exam';
import {
  formatMatchingLabel,
  getDisplayedLabelForAnswerValue,
  resolveRightItemByInputLabel,
} from '../utils/matching';
import { renderMath } from '../utils/renderMath';
import { RichContentRenderer } from './RichContentRenderer';

interface MatchingQuestionViewProps {
  question: Question;
  mode: 'taking' | 'preview' | 'review';
  userAnswer?: { [leftId: string]: string };
  onChange?: (updatedAnswer: { [leftId: string]: string }) => void;
  showSolutions?: boolean;
  isOnlyStudentAnswers?: boolean;
  fontSize?: 'small' | 'normal' | 'large';
  hidePrompt?: boolean;
}

export const MatchingQuestionView: React.FC<MatchingQuestionViewProps> = ({
  question,
  mode,
  userAnswer = {},
  onChange,
  showSolutions = false,
  isOnlyStudentAnswers = false,
  fontSize = 'normal',
  hidePrompt = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const splitWrapperRef = useRef<HTMLDivElement>(null);
  const [leftPanePercent, setLeftPanePercent] = useState<number>(58);
  const [isDraggingDivider, setIsDraggingDivider] = useState(false);

  const leftStyle = question.matchingLeftLabelStyle || 'number';
  const rightStyle = question.matchingRightLabelStyle || 'upper_alpha';
  const leftItems = question.matchingLeftItems || [];
  const rightItems = question.matchingRightItems || [];
  const correctPairs = question.matchingCorrectPairs || {};

  const distractorCount = Math.max(0, rightItems.length - leftItems.length);

  const textSizeClass =
    fontSize === 'small'
      ? 'text-xs'
      : fontSize === 'large'
      ? 'text-base'
      : 'text-sm';

  useEffect(() => {
    renderMath(containerRef.current);
  }, [question, mode, userAnswer, showSolutions, fontSize]);

  useEffect(() => {
    if (!isDraggingDivider) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!splitWrapperRef.current) return;
      const rect = splitWrapperRef.current.getBoundingClientRect();
      if (rect.width <= 0) return;
      const rawPercent = ((e.clientX - rect.left) / rect.width) * 100;
      const clamped = Math.min(72, Math.max(38, Math.round(rawPercent)));
      setLeftPanePercent(clamped);
    };

    const handleMouseUp = () => {
      setIsDraggingDivider(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingDivider]);

  const handleInputChange = (leftId: string, rawText: string) => {
    if (mode !== 'taking' || !onChange) return;
    const next = { ...userAnswer };
    const trimmed = rawText.trim();
    if (!trimmed) {
      delete next[leftId];
      onChange(next);
      return;
    }

    const matchedRight = resolveRightItemByInputLabel(rawText, rightItems, rightStyle);
    if (matchedRight) {
      next[leftId] = matchedRight.id;
    } else {
      next[leftId] = `__raw__:${rawText}`;
    }
    onChange(next);
  };

  const handleQuickPick = (leftId: string, rightId: string) => {
    if (mode !== 'taking' || !onChange) return;
    const next = { ...userAnswer };
    if (next[leftId] === rightId) {
      delete next[leftId];
    } else {
      next[leftId] = rightId;
    }
    onChange(next);
  };

  const handleClearLeft = (leftId: string) => {
    if (mode !== 'taking' || !onChange) return;
    const next = { ...userAnswer };
    delete next[leftId];
    onChange(next);
  };

  const rightLabelById = new Map<string, string>();
  const rightItemById = new Map<string, (typeof rightItems)[number]>();
  rightItems.forEach((rItem, idx) => {
    rightLabelById.set(rItem.id, formatMatchingLabel(idx, rightStyle, rItem.label));
    rightItemById.set(rItem.id, rItem);
  });

  return (
    <div ref={containerRef} className="space-y-3">
      {/* Orientation Status Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs">
        <div className="flex items-center gap-2 text-slate-700 font-semibold">
          <Columns2 className="w-4 h-4 text-blue-600 shrink-0" />
          <span>Thanh định hướng: Đề bài & hai cột (Trái)</span>
          <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-blue-700">Điền ghép đáp án (Phải)</span>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-slate-500">
          <span>
            Cột trái: <strong className="text-slate-700">{leftItems.length}</strong> ý | Cột phải:{' '}
            <strong className="text-slate-700">{rightItems.length}</strong> ý
            {distractorCount > 0 ? ` (${distractorCount} ý nhiễu)` : ''}
          </span>
          {leftPanePercent !== 58 && (
            <button
              type="button"
              onClick={() => setLeftPanePercent(58)}
              className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 bg-white border border-slate-200 rounded hover:bg-slate-100 text-slate-600 cursor-pointer"
              title="Đưa thanh định hướng về mặc định"
            >
              <RotateCcw className="w-3 h-3" />
              Mặc định
            </button>
          )}
        </div>
      </div>

      {/* Split Panel with Orientation Bar */}
      <div
        ref={splitWrapperRef}
        className={`flex flex-col md:flex-row items-stretch rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs ${
          isDraggingDivider ? 'select-none' : ''
        }`}
      >
        {/* LEFT PANE: Prompt + Two Columns */}
        <div
          className="p-4 bg-white space-y-4 w-full md:shrink-0"
          style={{ flexBasis: `${leftPanePercent}%` }}
        >
          {!hidePrompt && question.question && (
            <div className="pb-3 border-b border-slate-100">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                Đề bài
              </div>
              <RichContentRenderer
                content={question.question}
                imageUrl={question.imageUrl}
                className={`text-slate-800 ${
                  fontSize === 'small'
                    ? 'text-sm'
                    : fontSize === 'large'
                    ? 'text-lg'
                    : 'text-[15px]'
                }`}
              />
            </div>
          )}

          {/* Two Columns Display */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Left Column */}
            <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
                <span className="text-xs font-bold uppercase tracking-wider text-blue-700">
                  Cột trái ({leftItems.length} ý)
                </span>
              </div>
              <div className="space-y-2">
                {leftItems.map((item, idx) => {
                  const label = formatMatchingLabel(idx, leftStyle, item.label);
                  const hasText = Boolean(item.content?.trim());
                  const hasImg = Boolean(item.imageUrl?.trim());
                  return (
                    <div
                      key={item.id}
                      className="flex items-start gap-2.5 p-2.5 bg-white border border-slate-200 rounded-lg"
                    >
                      <span className="inline-flex items-center justify-center min-w-[26px] h-[26px] px-1.5 rounded-md bg-blue-600 text-white font-bold text-xs shrink-0">
                        {label}
                      </span>
                      <div className={`flex-1 min-w-0 text-slate-800 space-y-1.5 ${textSizeClass}`}>
                        {hasText && <RichContentRenderer content={item.content} />}
                        {hasImg && (
                          <div className={hasText ? 'pt-1' : ''}>
                            <img
                              src={item.imageUrl}
                              alt={`Hình ảnh ý cột trái ${label}`}
                              className="max-h-44 max-w-full rounded-lg border border-slate-200 object-contain bg-white p-0.5"
                              referrerPolicy="no-referrer"
                            />
                          </div>
                        )}
                        {!hasText && !hasImg && (
                          <span className="italic text-slate-400">(Chưa nhập nội dung)</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right Column */}
            <div className="bg-amber-50/40 border border-amber-200/80 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between border-b border-amber-200/70 pb-1.5">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-800">
                  Cột phải ({rightItems.length} ý)
                </span>
                {distractorCount > 0 && (
                  <span className="text-[10px] font-semibold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                    Có {distractorCount} ý nhiễu
                  </span>
                )}
              </div>
              <div className="space-y-2">
                {rightItems.map((item, idx) => {
                  const label = formatMatchingLabel(idx, rightStyle, item.label);
                  const isUsedInUserAnswer = Object.values(userAnswer || {}).includes(item.id);
                  const hasText = Boolean(item.content?.trim());
                  const hasImg = Boolean(item.imageUrl?.trim());
                  return (
                    <div
                      key={item.id}
                      className={`flex items-start gap-2.5 p-2.5 rounded-lg border transition-colors ${
                        isUsedInUserAnswer
                          ? 'bg-blue-50/70 border-blue-300'
                          : 'bg-white border-slate-200'
                      }`}
                    >
                      <span className="inline-flex items-center justify-center min-w-[26px] h-[26px] px-1.5 rounded-md bg-amber-600 text-white font-bold text-xs shrink-0">
                        {label}
                      </span>
                      <div className={`flex-1 min-w-0 text-slate-800 space-y-1.5 ${textSizeClass}`}>
                        {hasText && <RichContentRenderer content={item.content} />}
                        {hasImg && (
                          <div className={hasText ? 'pt-1' : ''}>
                            <img
                              src={item.imageUrl}
                              alt={`Hình ảnh ý cột phải ${label}`}
                              className="max-h-44 max-w-full rounded-lg border border-slate-200 object-contain bg-white p-0.5"
                              referrerPolicy="no-referrer"
                            />
                          </div>
                        )}
                        {!hasText && !hasImg && (
                          <span className="italic text-slate-400">(Chưa nhập nội dung)</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* CENTER ORIENTATION BAR (THANH ĐỊNH HƯỚNG) */}
        <div
          onMouseDown={() => setIsDraggingDivider(true)}
          role="separator"
          aria-orientation="vertical"
          title="Kéo thanh định hướng để thay đổi tỷ lệ Đề bài / Ghép đáp án"
          className={`hidden md:flex flex-col items-center justify-center w-3.5 shrink-0 cursor-col-resize border-x transition-colors ${
            isDraggingDivider
              ? 'bg-blue-100 border-blue-400 text-blue-700'
              : 'bg-slate-100 hover:bg-blue-50 border-slate-200 text-slate-400 hover:text-blue-600'
          }`}
        >
          <GripVertical className="w-3.5 h-3.5" />
        </div>

        {/* Mobile Orientation Divider */}
        <div className="flex md:hidden items-center justify-center py-1.5 bg-slate-100 border-y border-slate-200 text-[11px] font-semibold text-slate-600">
          ↓ Phần ghép đáp án tương ứng
        </div>

        {/* RIGHT PANE: Answer Matching Area (1 - ....) */}
        <div className="flex-1 p-4 bg-slate-50/60 space-y-3 min-w-[260px]">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Phần ghép đáp án
              </h4>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {mode === 'taking'
                  ? 'Điền nhãn cột phải vào chỗ chấm (hoặc bấm nhanh nhãn bên dưới).'
                  : 'Bảng đối chiếu cặp ghép (Trái - Phải).'}
              </p>
            </div>
          </div>

          <div className="space-y-2.5">
            {leftItems.map((leftItem, idx) => {
              const leftLabel = formatMatchingLabel(idx, leftStyle, leftItem.label);
              const rawAns = userAnswer?.[leftItem.id];
              const displayedInput = getDisplayedLabelForAnswerValue(
                rawAns,
                rightItems,
                rightStyle
              );
              const matchedRightItem =
                rawAns && !rawAns.startsWith('__raw__:') ? rightItemById.get(rawAns) : undefined;
              const expectedRightId = correctPairs[leftItem.id];
              const expectedLabel = expectedRightId ? rightLabelById.get(expectedRightId) || '' : '';
              const isCorrect =
                Boolean(expectedRightId) &&
                Boolean(rawAns) &&
                !rawAns.startsWith('__raw__:') &&
                rawAns === expectedRightId;

              let rowClasses = 'bg-white border-slate-200';
              if (mode === 'review' && !isOnlyStudentAnswers) {
                rowClasses = isCorrect
                  ? 'bg-emerald-50/70 border-emerald-300'
                  : 'bg-red-50/70 border-red-300';
              } else if (mode === 'taking' && matchedRightItem) {
                rowClasses = 'bg-blue-50/40 border-blue-300';
              }

              return (
                <div
                  key={leftItem.id}
                  className={`p-3 rounded-xl border transition-colors space-y-2 ${rowClasses}`}
                >
                  {/* Signature "1 - ......" row */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="inline-flex items-center justify-center min-w-[30px] h-[30px] px-2 rounded-lg bg-blue-600 text-white font-bold text-sm shrink-0">
                        {leftLabel}
                      </span>
                      <span className="font-bold text-slate-500 text-base shrink-0">—</span>

                      {mode === 'taking' ? (
                        <div className="relative flex-1 max-w-[140px]">
                          <input
                            type="text"
                            value={displayedInput}
                            onChange={(e) => handleInputChange(leftItem.id, e.target.value)}
                            placeholder=".........."
                            aria-label={`Đáp án ghép cho ý ${leftLabel}`}
                            className="w-full px-2.5 py-1 text-center font-bold text-sm tracking-wide text-slate-900 bg-white border-0 border-b-2 border-dotted border-blue-500 focus:border-solid focus:border-blue-700 focus:outline-none focus:bg-blue-50/30 rounded-t placeholder:text-slate-400 placeholder:tracking-widest"
                          />
                        </div>
                      ) : (
                        <div className="inline-flex items-center justify-center min-w-[74px] px-3 py-1 border-b-2 border-dotted border-slate-400 font-bold text-sm text-slate-800">
                          {mode === 'preview'
                            ? showSolutions && expectedLabel
                              ? expectedLabel
                              : '........'
                            : displayedInput || '(Trống)'}
                        </div>
                      )}
                    </div>

                    {/* Action / Status on right */}
                    {mode === 'taking' && rawAns && (
                      <button
                        type="button"
                        onClick={() => handleClearLeft(leftItem.id)}
                        className="p-1 text-slate-400 hover:text-red-600 rounded hover:bg-red-50 cursor-pointer"
                        title="Xóa lựa chọn"
                      >
                        <Eraser className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {mode === 'review' && !isOnlyStudentAnswers && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        {isCorrect ? (
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700">
                            <CheckCircle2 className="w-4 h-4" />
                            Đúng
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-red-600">
                            <XCircle className="w-4 h-4" />
                            Đáp án: {expectedLabel || '?'}
                          </span>
                        )}
                      </div>
                    )}

                    {mode === 'preview' && showSolutions && expectedLabel && (
                      <span className="text-xs font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 shrink-0">
                        {leftLabel} - {expectedLabel}
                      </span>
                    )}
                  </div>

                  {/* Quick-pick right-column label chips in taking mode */}
                  {mode === 'taking' && rightItems.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1 pt-0.5">
                      <span className="text-[10px] text-slate-400 mr-0.5">Chọn nhanh:</span>
                      {rightItems.map((rItem, rIdx) => {
                        const rLabel = formatMatchingLabel(rIdx, rightStyle, rItem.label);
                        const isSelected = rawAns === rItem.id;
                        return (
                          <button
                            key={rItem.id}
                            type="button"
                            onClick={() => handleQuickPick(leftItem.id, rItem.id)}
                            className={`min-w-[26px] h-[24px] px-1.5 rounded text-xs font-bold border transition-colors cursor-pointer ${
                              isSelected
                                ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                                : 'bg-white text-slate-700 border-slate-200 hover:border-blue-400 hover:text-blue-700'
                            }`}
                          >
                            {rLabel}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Unmatched warning while typing */}
                  {mode === 'taking' && rawAns?.startsWith('__raw__:') && (
                    <div className="text-[11px] text-amber-700 bg-amber-50 px-2 py-1 rounded border border-amber-200">
                      Nhãn "{displayedInput}" chưa khớp nhãn cột phải (
                      {rightItems
                        .map((r, rIdx) => formatMatchingLabel(rIdx, rightStyle, r.label))
                        .join(', ')}
                      ).
                    </div>
                  )}

                  {/* Preview of matched right content in taking/review */}
                  {matchedRightItem && (matchedRightItem.content?.trim() || matchedRightItem.imageUrl?.trim()) && (
                    <div className="text-xs text-slate-600 bg-white/80 px-2.5 py-1.5 rounded-lg border border-slate-200/80 flex items-start gap-1.5">
                      <span className="font-semibold text-amber-700 shrink-0">
                        ({displayedInput})
                      </span>
                      <div className="min-w-0 flex-1 space-y-1">
                        {matchedRightItem.content?.trim() && (
                          <RichContentRenderer content={matchedRightItem.content} />
                        )}
                        {matchedRightItem.imageUrl?.trim() && (
                          <img
                            src={matchedRightItem.imageUrl}
                            alt={`Ảnh đáp án (${displayedInput})`}
                            className="max-h-24 max-w-full rounded-md border border-slate-200 object-contain bg-white p-0.5"
                            referrerPolicy="no-referrer"
                          />
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
