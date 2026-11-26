import React, { useState } from 'react';
import {
  Plus,
  Trash2,
  Link2,
  AlertCircle,
  CheckCircle2,
  X,
} from 'lucide-react';
import { MatchingItem, MatchingLabelStyle, Question } from '../types/exam';
import {
  formatMatchingLabel,
  MATCHING_LABEL_PRESETS,
  MATCHING_LABEL_STYLE_OPTIONS,
} from '../utils/matching';
import { AttachedImageBox } from './InlineImageTitleModal';
import { MatchingQuestionView } from './MatchingQuestionView';

interface MatchingQuestionEditorProps {
  question: Question;
  onChange: (updatedFields: Partial<Question>) => void;
  idPrefix?: string;
}

export const MatchingQuestionEditor: React.FC<MatchingQuestionEditorProps> = ({
  question,
  onChange,
  idPrefix = 'match',
}) => {
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);

  const leftStyle: MatchingLabelStyle = question.matchingLeftLabelStyle || 'number';
  const rightStyle: MatchingLabelStyle = question.matchingRightLabelStyle || 'upper_alpha';
  const leftItems: MatchingItem[] = question.matchingLeftItems || [];
  const rightItems: MatchingItem[] = question.matchingRightItems || [];
  const correctPairs: { [leftId: string]: string } = question.matchingCorrectPairs || {};

  const distractorCount = rightItems.length - leftItems.length;
  const isRightEnough = rightItems.length >= leftItems.length;

  const makeUniqueId = (side: 'L' | 'R') =>
    `${idPrefix}_${side}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  const handleApplyPreset = (left: MatchingLabelStyle, right: MatchingLabelStyle) => {
    onChange({
      matchingLeftLabelStyle: left,
      matchingRightLabelStyle: right,
    });
  };

  const handleAddLeftItem = () => {
    const newLeft: MatchingItem = { id: makeUniqueId('L'), content: '' };
    const nextLeft = [...leftItems, newLeft];
    let nextRight = [...rightItems];

    // Đảm bảo số ô cột phải >= số ô cột trái
    while (nextRight.length < nextLeft.length) {
      nextRight.push({ id: makeUniqueId('R'), content: '' });
    }

    const nextPairs = { ...correctPairs };
    // Gợi ý ghép mặc định vào ô cột phải cùng vị trí nếu có
    const candidateRight = nextRight[nextLeft.length - 1] || nextRight[0];
    if (candidateRight) {
      nextPairs[newLeft.id] = candidateRight.id;
    }

    onChange({
      matchingLeftItems: nextLeft,
      matchingRightItems: nextRight,
      matchingCorrectPairs: nextPairs,
    });
  };

  const handleRemoveLeftItem = (leftId: string) => {
    if (leftItems.length <= 1) return;
    const nextLeft = leftItems.filter((item) => item.id !== leftId);
    const nextPairs = { ...correctPairs };
    delete nextPairs[leftId];
    onChange({
      matchingLeftItems: nextLeft,
      matchingCorrectPairs: nextPairs,
    });
  };

  const handleUpdateLeftItem = (leftId: string, patch: Partial<MatchingItem>) => {
    const nextLeft = leftItems.map((item) => (item.id === leftId ? { ...item, ...patch } : item));
    onChange({ matchingLeftItems: nextLeft });
  };

  const handleAddRightItem = () => {
    const newRight: MatchingItem = { id: makeUniqueId('R'), content: '' };
    onChange({ matchingRightItems: [...rightItems, newRight] });
  };

  const handleRemoveRightItem = (rightId: string) => {
    // Bắt buộc số ô cột phải >= số ô cột trái
    if (rightItems.length <= leftItems.length) return;
    const nextRight = rightItems.filter((item) => item.id !== rightId);
    const fallbackRightId = nextRight[0]?.id || '';
    const nextPairs: { [leftId: string]: string } = {};
    Object.entries(correctPairs).forEach(([lId, rId]) => {
      nextPairs[lId] = rId === rightId ? fallbackRightId : rId;
    });

    onChange({
      matchingRightItems: nextRight,
      matchingCorrectPairs: nextPairs,
    });
  };

  const handleUpdateRightItem = (rightId: string, patch: Partial<MatchingItem>) => {
    const nextRight = rightItems.map((item) =>
      item.id === rightId ? { ...item, ...patch } : item
    );
    onChange({ matchingRightItems: nextRight });
  };

  const handlePairChange = (leftId: string, rightId: string) => {
    onChange({
      matchingCorrectPairs: {
        ...correctPairs,
        [leftId]: rightId,
      },
    });
  };

  return (
    <div className="space-y-4 bg-slate-50/80 border border-slate-200 rounded-xl p-4">
      {/* 1. Cấu hình kiểu đánh ý hai cột */}
      <div className="space-y-2.5 pb-3 border-b border-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
            <Link2 className="w-3.5 h-3.5 text-blue-600" />
            <span>Kiểu đánh ý hai cột (Hỗ trợ chữ, công thức & hình ảnh)</span>
          </div>

          <div
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border ${
              isRightEnough
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-red-50 text-red-700 border-red-200'
            }`}
          >
            {isRightEnough ? (
              <CheckCircle2 className="w-3.5 h-3.5" />
            ) : (
              <AlertCircle className="w-3.5 h-3.5" />
            )}
            <span>
              Trái: {leftItems.length} ý | Phải: {rightItems.length} ý
              {distractorCount > 0 ? ` (+${distractorCount} ý nhiễu)` : ''}
            </span>
          </div>
        </div>

        {/* Quick presets */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-medium text-slate-500 mr-1">Mẫu nhanh:</span>
          {MATCHING_LABEL_PRESETS.map((preset) => {
            const isActive = leftStyle === preset.left && rightStyle === preset.right;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleApplyPreset(preset.left, preset.right)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-slate-700 border-slate-200 hover:border-blue-300 hover:bg-blue-50'
                }`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>

        {/* Custom column label style selectors */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Đánh ý Cột trái (Đề bài):
            </label>
            <select
              value={leftStyle}
              onChange={(e) =>
                onChange({ matchingLeftLabelStyle: e.target.value as MatchingLabelStyle })
              }
              className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              {MATCHING_LABEL_STYLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Đánh ý Cột phải (Đáp án & Ý nhiễu):
            </label>
            <select
              value={rightStyle}
              onChange={(e) =>
                onChange({ matchingRightLabelStyle: e.target.value as MatchingLabelStyle })
              }
              className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              {MATCHING_LABEL_STYLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {imageUploadError && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 font-medium">
          <span>{imageUploadError}</span>
          <button
            type="button"
            onClick={() => setImageUploadError(null)}
            className="text-red-500 hover:text-red-700 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 2. Danh sách ý Cột Trái & Cột Phải */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* LEFT COLUMN EDITOR */}
        <div className="space-y-2.5 bg-white border border-slate-200 rounded-xl p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-blue-700 uppercase tracking-wider">
              Cột trái ({leftItems.length} ý)
            </span>
            <button
              type="button"
              onClick={handleAddLeftItem}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-semibold cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Thêm ý trái
            </button>
          </div>

          <div className="space-y-2.5">
            {leftItems.map((leftItem, idx) => {
              const displayLabel = formatMatchingLabel(idx, leftStyle, leftItem.label);
              const mappedRightId = correctPairs[leftItem.id] || '';

              return (
                <div
                  key={leftItem.id}
                  className="p-2.5 rounded-lg border border-slate-200 bg-slate-50/70 space-y-2"
                >
                  <div className="flex items-center gap-2">
                    {leftStyle === 'custom' ? (
                      <input
                        type="text"
                        value={leftItem.label ?? ''}
                        onChange={(e) =>
                          handleUpdateLeftItem(leftItem.id, { label: e.target.value })
                        }
                        placeholder={String(idx + 1)}
                        className="w-14 px-2 py-1 text-center font-bold text-xs bg-white border border-blue-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-600"
                        title="Nhãn tùy chỉnh"
                      />
                    ) : (
                      <span className="inline-flex items-center justify-center min-w-[28px] h-7 px-1.5 rounded-md bg-blue-600 text-white font-bold text-xs shrink-0">
                        {displayLabel}
                      </span>
                    )}

                    <input
                      type="text"
                      value={leftItem.content}
                      onChange={(e) =>
                        handleUpdateLeftItem(leftItem.id, { content: e.target.value })
                      }
                      placeholder={`Nội dung ý trái ${displayLabel} (hoặc để trống nếu dùng ảnh)...`}
                      className="flex-1 min-w-0 px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />

                    <button
                      type="button"
                      onClick={() => handleRemoveLeftItem(leftItem.id)}
                      disabled={leftItems.length <= 1}
                      className="p-1 text-slate-400 hover:text-red-600 disabled:opacity-30 cursor-pointer shrink-0"
                      title="Xóa ý cột trái"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Image attachment (upload or Ctrl+V paste — no raw URL exposed) */}
                  <div className="pl-9">
                    <AttachedImageBox
                      compact
                      label={`Ảnh ý trái ${displayLabel}`}
                      imageUrl={leftItem.imageUrl}
                      showCaption={false}
                      onChangeImage={(url) =>
                        handleUpdateLeftItem(leftItem.id, { imageUrl: url || undefined })
                      }
                    />
                  </div>

                  {/* Select correct right item */}
                  <div className="flex items-center gap-2 pl-9">
                    <span className="text-[11px] font-semibold text-slate-600 shrink-0">
                      Ghép đúng với:
                    </span>
                    <select
                      value={mappedRightId}
                      onChange={(e) => handlePairChange(leftItem.id, e.target.value)}
                      className="flex-1 min-w-0 px-2 py-1 bg-white border border-emerald-300 rounded-md text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="">-- Chọn đáp án cột phải --</option>
                      {rightItems.map((rItem, rIdx) => {
                        const rLabel = formatMatchingLabel(rIdx, rightStyle, rItem.label);
                        const trimmedText = rItem.content?.trim() || '';
                        const shortText =
                          trimmedText.length > 36
                            ? `${trimmedText.slice(0, 36)}...`
                            : trimmedText;
                        const preview = shortText
                          ? rItem.imageUrl
                            ? `${shortText} [Có ảnh]`
                            : shortText
                          : rItem.imageUrl
                          ? '[Hình ảnh]'
                          : '(Chưa nhập nội dung)';
                        return (
                          <option key={rItem.id} value={rItem.id}>
                            {rLabel} — {preview}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT COLUMN EDITOR */}
        <div className="space-y-2.5 bg-white border border-slate-200 rounded-xl p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-800 uppercase tracking-wider">
              Cột phải ({rightItems.length} ý — phải ≥ {leftItems.length})
            </span>
            <button
              type="button"
              onClick={handleAddRightItem}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-lg text-xs font-semibold cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Thêm ý phải / nhiễu
            </button>
          </div>

          <div className="space-y-2.5">
            {rightItems.map((rightItem, idx) => {
              const displayLabel = formatMatchingLabel(idx, rightStyle, rightItem.label);
              const linkedLeftLabels = leftItems
                .map((l, lIdx) =>
                  correctPairs[l.id] === rightItem.id
                    ? formatMatchingLabel(lIdx, leftStyle, l.label)
                    : null
                )
                .filter(Boolean);
              const isDistractor = linkedLeftLabels.length === 0;
              const cannotDelete = rightItems.length <= leftItems.length;

              return (
                <div
                  key={rightItem.id}
                  className={`p-2.5 rounded-lg border space-y-2 ${
                    isDistractor
                      ? 'border-amber-200 bg-amber-50/40'
                      : 'border-slate-200 bg-slate-50/70'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {rightStyle === 'custom' ? (
                      <input
                        type="text"
                        value={rightItem.label ?? ''}
                        onChange={(e) =>
                          handleUpdateRightItem(rightItem.id, { label: e.target.value })
                        }
                        placeholder={formatMatchingLabel(idx, 'upper_alpha')}
                        className="w-14 px-2 py-1 text-center font-bold text-xs bg-white border border-amber-300 rounded-md focus:outline-none focus:ring-1 focus:ring-amber-600"
                        title="Nhãn tùy chỉnh"
                      />
                    ) : (
                      <span className="inline-flex items-center justify-center min-w-[28px] h-7 px-1.5 rounded-md bg-amber-600 text-white font-bold text-xs shrink-0">
                        {displayLabel}
                      </span>
                    )}

                    <input
                      type="text"
                      value={rightItem.content}
                      onChange={(e) =>
                        handleUpdateRightItem(rightItem.id, { content: e.target.value })
                      }
                      placeholder={`Nội dung ý phải ${displayLabel} (hoặc để trống nếu dùng ảnh)...`}
                      className="flex-1 min-w-0 px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />

                    <button
                      type="button"
                      onClick={() => handleRemoveRightItem(rightItem.id)}
                      disabled={cannotDelete}
                      className="p-1 text-slate-400 hover:text-red-600 disabled:opacity-30 cursor-pointer shrink-0"
                      title={
                        cannotDelete
                          ? 'Số ý cột phải phải lớn hơn hoặc bằng số ý cột trái'
                          : 'Xóa ý cột phải'
                      }
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Image attachment (upload or Ctrl+V paste — no raw URL exposed) */}
                  <div className="pl-9">
                    <AttachedImageBox
                      compact
                      label={`Ảnh ý phải ${displayLabel}`}
                      imageUrl={rightItem.imageUrl}
                      showCaption={false}
                      onChangeImage={(url) =>
                        handleUpdateRightItem(rightItem.id, { imageUrl: url || undefined })
                      }
                    />
                  </div>

                  <div className="pl-9 text-[11px]">
                    {isDistractor ? (
                      <span className="inline-block px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold">
                        Ý nhiễu (không ghép với ý cột trái nào)
                      </span>
                    ) : (
                      <span className="inline-block px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold">
                        Đang là đáp án của ý trái: {linkedLeftLabels.join(', ')}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Live Preview of Matching Question */}
      <div className="p-3 bg-white border border-blue-200 rounded-xl space-y-2">
        <div className="text-[11px] font-bold text-blue-800 uppercase tracking-wider">
          Xem trước ghép đôi (KaTeX &amp; Hình ảnh hai cột):
        </div>
        <MatchingQuestionView
          question={question}
          mode="preview"
          showSolutions={true}
          hidePrompt={true}
        />
      </div>
    </div>
  );
};
