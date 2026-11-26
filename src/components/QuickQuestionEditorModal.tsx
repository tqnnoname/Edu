import React, { useState, useEffect } from 'react';
import {
  MatchingItem,
  MatchingLabelStyle,
  Question,
  QuestionType,
  TrueFalseItem,
  TrueFalseScoringMode,
} from '../types/exam';
import { X, Save, Trash2, Plus, Image as ImageIcon, Eye } from 'lucide-react';
import { MathToolbar } from './MathToolbar';
import { RichContentRenderer } from './RichContentRenderer';
import { MatchingQuestionEditor } from './MatchingQuestionEditor';
import { MatchingQuestionView } from './MatchingQuestionView';
import { processImageFile } from '../utils/imageUpload';
import {
  formatAcceptedShortAnswersList,
  formatShortAnswerDecimalComma,
  formatTrueFalseScoringRule,
  parseAcceptedShortAnswers,
} from '../utils/scoring';
import { CopyContentButton } from './CopyContentButton';
import { formatQuestionForCopy } from '../utils/clipboard';
import {
  AttachedImageBox,
  InlineImageStrip,
  InlineImageTitleModal,
} from './InlineImageTitleModal';
import {
  buildQuestionInlineImagesMap,
  extractImageFileFromClipboardEvent,
  formatInlineImageToken,
  registerImplicitImage,
  registerImplicitImagesMap,
} from '../utils/inlineImages';
import {
  EditableTextElement,
  insertTextAtEditableElement,
} from '../utils/cursorInsert';

interface QuickQuestionEditorModalProps {
  isOpen: boolean;
  question: Question | null;
  onSave: (updatedQuestion: Question) => void;
  onDelete?: (questionId: string) => void;
  onClose: () => void;
}

export const QuickQuestionEditorModal: React.FC<QuickQuestionEditorModalProps> = ({
  isOpen,
  question,
  onSave,
  onDelete,
  onClose,
}) => {
  const modalBodyRef = React.useRef<HTMLDivElement>(null);
  const fieldRefs = React.useRef<{ [key: string]: EditableTextElement | null }>({});
  const [qText, setQText] = useState(question?.question || '');
  const [imageUrl, setImageUrl] = useState(question?.imageUrl || '');
  const [imageCaption, setImageCaption] = useState(question?.imageCaption || '');
  const [points, setPoints] = useState(question?.points || 1.0);
  const [topic, setTopic] = useState(question?.topic || '');
  const [explanation, setExplanation] = useState(question?.explanation || '');
  const [explanationImageUrl, setExplanationImageUrl] = useState(question?.explanationImageUrl || '');
  const [explanationImageCaption, setExplanationImageCaption] = useState(
    question?.explanationImageCaption || ''
  );
  const [inlineImages, setInlineImages] = useState<Record<string, string>>(
    question?.inlineImages ? { ...question.inlineImages } : {}
  );
  const [sampleAnswer, setSampleAnswer] = useState(question?.sampleAnswer || '');
  const [options, setOptions] = useState<string[]>(question?.options ? [...question.options] : []);
  const [optionImages, setOptionImages] = useState<(string | undefined)[]>(
    question?.optionImages ? [...question.optionImages] : []
  );
  const [correctAnswer, setCorrectAnswer] = useState(question?.correctAnswer ?? 0);
  const [correctAnswers, setCorrectAnswers] = useState<number[]>(
    question?.correctAnswers ? [...question.correctAnswers] : []
  );
  const [tfItems, setTfItems] = useState<TrueFalseItem[]>(
    question?.tfItems ? JSON.parse(JSON.stringify(question.tfItems)) : []
  );
  const [tfScoringMode, setTfScoringMode] = useState<TrueFalseScoringMode>(
    question?.tfScoringMode || 'standard_ministry'
  );
  const [tfTierPoints, setTfTierPoints] = useState<number[]>(
    question?.tfTierPoints || [0.1, 0.25, 0.5, 1.0]
  );
  const [acceptedAnswers, setAcceptedAnswers] = useState<string[]>(
    question?.acceptedAnswers ? [...question.acceptedAnswers] : ['']
  );
  const [subQuestions, setSubQuestions] = useState<Question[]>(
    question?.subQuestions ? JSON.parse(JSON.stringify(question.subQuestions)) : []
  );
  const [matchingLeftLabelStyle, setMatchingLeftLabelStyle] = useState<MatchingLabelStyle>(
    question?.matchingLeftLabelStyle || 'number'
  );
  const [matchingRightLabelStyle, setMatchingRightLabelStyle] = useState<MatchingLabelStyle>(
    question?.matchingRightLabelStyle || 'upper_alpha'
  );
  const [matchingLeftItems, setMatchingLeftItems] = useState<MatchingItem[]>(
    question?.matchingLeftItems ? JSON.parse(JSON.stringify(question.matchingLeftItems)) : []
  );
  const [matchingRightItems, setMatchingRightItems] = useState<MatchingItem[]>(
    question?.matchingRightItems ? JSON.parse(JSON.stringify(question.matchingRightItems)) : []
  );
  const [matchingCorrectPairs, setMatchingCorrectPairs] = useState<{ [leftId: string]: string }>(
    question?.matchingCorrectPairs ? { ...question.matchingCorrectPairs } : {}
  );
  const [activeOptImgEdit, setActiveOptImgEdit] = useState<number | null>(null);
  const [activeSubOptImgEdit, setActiveSubOptImgEdit] = useState<{ subIdx: number; optIdx: number } | null>(null);
  const [preview, setPreview] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [savedSuccessToast, setSavedSuccessToast] = useState<string | null>(null);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [cursorImageModal, setCursorImageModal] = useState<{
    isOpen: boolean;
    field: 'qText' | 'sampleAnswer' | 'explanation' | 'subQuestion' | 'subExplanation';
    subIdx?: number;
    initialImageSrc: string;
    targetEl: EditableTextElement | null;
    range: { start: number; end: number } | null;
    targetLabel: string;
  } | null>(null);

  const lastInitializedKeyRef = React.useRef<string>('');

  useEffect(() => {
    if (!isOpen || !question) {
      lastInitializedKeyRef.current = '';
      return;
    }
    const initKey = `${question.id}`;
    if (lastInitializedKeyRef.current === initKey) {
      // Tránh ghi đè nội dung đang soạn thảo khi component cha re-render hoặc đồng bộ nền
      return;
    }
    lastInitializedKeyRef.current = initKey;
    registerImplicitImagesMap(question.inlineImages);
    (question.subQuestions || []).forEach((s) => registerImplicitImagesMap(s.inlineImages));
    setQText(question.question);
    setImageUrl(question.imageUrl || '');
    setImageCaption(question.imageCaption || '');
    setPoints(question.points || 1.0);
    setTopic(question.topic || '');
    setExplanation(question.explanation || '');
    setExplanationImageUrl(question.explanationImageUrl || '');
    setExplanationImageCaption(question.explanationImageCaption || '');
    setInlineImages(question.inlineImages ? { ...question.inlineImages } : {});
    setSampleAnswer(question.sampleAnswer || '');
    setOptions(question.options ? [...question.options] : []);
    setOptionImages(question.optionImages ? [...question.optionImages] : []);
    setCorrectAnswer(question.correctAnswer ?? 0);
    setCorrectAnswers(question.correctAnswers ? [...question.correctAnswers] : []);
    setTfItems(question.tfItems ? JSON.parse(JSON.stringify(question.tfItems)) : []);
    setTfScoringMode(question.tfScoringMode || 'standard_ministry');
    setTfTierPoints(question.tfTierPoints || [0.1, 0.25, 0.5, 1.0]);
    setAcceptedAnswers(question.acceptedAnswers ? [...question.acceptedAnswers] : ['']);
    setSubQuestions(question.subQuestions ? JSON.parse(JSON.stringify(question.subQuestions)) : []);
    setMatchingLeftLabelStyle(question.matchingLeftLabelStyle || 'number');
    setMatchingRightLabelStyle(question.matchingRightLabelStyle || 'upper_alpha');
    setMatchingLeftItems(
      question.matchingLeftItems ? JSON.parse(JSON.stringify(question.matchingLeftItems)) : []
    );
    setMatchingRightItems(
      question.matchingRightItems ? JSON.parse(JSON.stringify(question.matchingRightItems)) : []
    );
    setMatchingCorrectPairs(
      question.matchingCorrectPairs ? { ...question.matchingCorrectPairs } : {}
    );
    setActiveOptImgEdit(null);
    setActiveSubOptImgEdit(null);
    setErrorMessage(null);
    setSavedSuccessToast(null);
    setIsConfirmingDelete(false);
    setCursorImageModal(null);
  }, [isOpen, question]);

  if (!isOpen || !question) return null;

  const openCursorImageModal = (
    field: 'qText' | 'sampleAnswer' | 'explanation' | 'subQuestion' | 'subExplanation',
    targetLabel: string,
    subIdx?: number,
    initialImageSrc: string = ''
  ) => {
    const key = subIdx !== undefined ? `${field}_${subIdx}` : field;
    const el = fieldRefs.current[key] || null;
    const range = el
      ? {
          start: typeof el.selectionStart === 'number' ? el.selectionStart : el.value.length,
          end: typeof el.selectionEnd === 'number' ? el.selectionEnd : el.value.length,
        }
      : null;
    setCursorImageModal({
      isOpen: true,
      field,
      subIdx,
      initialImageSrc,
      targetEl: el,
      range,
      targetLabel,
    });
  };

  const handleFieldPasteImage = async (
    e: React.ClipboardEvent<HTMLTextAreaElement | HTMLInputElement>,
    field: 'qText' | 'sampleAnswer' | 'explanation' | 'subQuestion' | 'subExplanation',
    targetLabel: string,
    subIdx?: number
  ) => {
    const file = extractImageFileFromClipboardEvent(e);
    if (!file) return;
    e.preventDefault();
    const el = e.currentTarget;
    const range = {
      start: typeof el.selectionStart === 'number' ? el.selectionStart : el.value.length,
      end: typeof el.selectionEnd === 'number' ? el.selectionEnd : el.value.length,
    };
    try {
      const compressed = await processImageFile(file, 1200, 0.85);
      setCursorImageModal({
        isOpen: true,
        field,
        subIdx,
        initialImageSrc: compressed,
        targetEl: el,
        range,
        targetLabel,
      });
    } catch (err: any) {
      setErrorMessage(err?.message || 'Không thể xử lý ảnh vừa dán.');
    }
  };

  const handleConfirmCursorImage = (imageSrc: string, title: string) => {
    if (!cursorImageModal) return;
    const { field, subIdx, targetEl, range } = cursorImageModal;
    const imgId = registerImplicitImage(imageSrc);
    const token = formatInlineImageToken(imgId, title);
    setInlineImages((prev) => ({ ...prev, [imgId]: imageSrc }));

    if (subIdx !== undefined) {
      setSubQuestions((prev) => {
        const next = [...prev];
        if (next[subIdx]) {
          next[subIdx] = {
            ...next[subIdx],
            inlineImages: { ...(next[subIdx].inlineImages || {}), [imgId]: imageSrc },
          };
        }
        return next;
      });
    }

    if (targetEl && insertTextAtEditableElement(targetEl, token, range)) {
      setCursorImageModal(null);
      return;
    }

    if (field === 'qText') {
      setQText((prev) => (prev ? `${prev}\n${token}` : token));
    } else if (field === 'sampleAnswer') {
      setSampleAnswer((prev) => (prev ? `${prev}\n${token}` : token));
    } else if (field === 'explanation') {
      setExplanation((prev) => (prev ? `${prev}\n${token}` : token));
    } else if (subIdx !== undefined) {
      setSubQuestions((prev) => {
        const next = [...prev];
        const sub = next[subIdx];
        if (!sub) return prev;
        if (field === 'subQuestion') {
          next[subIdx] = { ...sub, question: sub.question ? `${sub.question}\n${token}` : token };
        } else if (field === 'subExplanation') {
          next[subIdx] = {
            ...sub,
            explanation: sub.explanation ? `${sub.explanation}\n${token}` : token,
          };
        }
        return next;
      });
    }
    setCursorImageModal(null);
  };

  const buildUpdatedQuestion = (): Question | null => {
    if (!qText.trim()) {
      setErrorMessage('Nội dung câu hỏi không được để trống!');
      return null;
    }

    const sanitizedSubQuestions =
      question.type === 'grouped'
        ? subQuestions.map((sub) => {
            const normalizedSub: Question =
              sub.type === 'text_input'
                ? {
                    ...sub,
                    acceptedAnswers: parseAcceptedShortAnswers((sub.acceptedAnswers || []).join('; ')),
                  }
                : { ...sub };
            return {
              ...normalizedSub,
              imageCaption: normalizedSub.imageCaption?.trim() || undefined,
              explanationImageUrl: normalizedSub.explanationImageUrl?.trim() || undefined,
              explanationImageCaption: normalizedSub.explanationImageCaption?.trim() || undefined,
              inlineImages: buildQuestionInlineImagesMap(normalizedSub),
            };
          })
        : question.subQuestions;

    const draft: Question = {
      ...question,
      question: qText.trim(),
      imageUrl: imageUrl.trim() || undefined,
      imageCaption: imageCaption.trim() || undefined,
      points: Number(points) || 1.0,
      topic: topic.trim() || undefined,
      explanation: explanation.trim() || 'Xem lại kiến thức trọng tâm.',
      explanationImageUrl: explanationImageUrl.trim() || undefined,
      explanationImageCaption: explanationImageCaption.trim() || undefined,
      inlineImages,
      options:
        question.type === 'single_choice' || question.type === 'multiple_choice'
          ? options
          : question.options,
      optionImages:
        question.type === 'single_choice' || question.type === 'multiple_choice'
          ? optionImages
          : question.optionImages,
      correctAnswer: question.type === 'single_choice' ? correctAnswer : question.correctAnswer,
      correctAnswers:
        question.type === 'multiple_choice' ? correctAnswers : question.correctAnswers,
      tfItems: question.type === 'true_false' ? tfItems : question.tfItems,
      tfScoringMode: question.type === 'true_false' ? tfScoringMode : question.tfScoringMode,
      tfTierPoints: question.type === 'true_false' ? tfTierPoints : question.tfTierPoints,
      acceptedAnswers:
        question.type === 'text_input'
          ? parseAcceptedShortAnswers(acceptedAnswers.join('; '))
          : question.acceptedAnswers,
      sampleAnswer:
        question.type === 'essay' ? sampleAnswer.trim() || undefined : question.sampleAnswer,
      matchingLeftLabelStyle:
        question.type === 'matching' ? matchingLeftLabelStyle : question.matchingLeftLabelStyle,
      matchingRightLabelStyle:
        question.type === 'matching' ? matchingRightLabelStyle : question.matchingRightLabelStyle,
      matchingLeftItems:
        question.type === 'matching' ? matchingLeftItems : question.matchingLeftItems,
      matchingRightItems:
        question.type === 'matching' ? matchingRightItems : question.matchingRightItems,
      matchingCorrectPairs:
        question.type === 'matching' ? matchingCorrectPairs : question.matchingCorrectPairs,
      subQuestions: sanitizedSubQuestions,
    };

    draft.inlineImages = buildQuestionInlineImagesMap(draft);
    return draft;
  };

  const handleSaveInPlace = () => {
    const updated = buildUpdatedQuestion();
    if (!updated) return;
    onSave(updated);
    setErrorMessage(null);
    setSavedSuccessToast('✓ Đã lưu câu hỏi thành công tại đây (Không thoát ra ngoài)!');
    setTimeout(() => {
      setSavedSuccessToast(null);
    }, 3000);
  };

  const handleSaveAndClose = () => {
    const updated = buildUpdatedQuestion();
    if (!updated) return;
    onSave(updated);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200 flex flex-col">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white/95 backdrop-blur-md z-10">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <span>Chỉnh sửa nội dung & Điểm câu hỏi</span>
              <span className="text-xs font-mono font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                {question.type}
              </span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Bạn có toàn quyền viết lại, sửa công thức, đổi phương án đúng hoặc xóa câu này
            </p>
          </div>
          <div className="flex items-center gap-2">
            <CopyContentButton
              compact
              label="Sao chép cả câu"
              getText={() =>
                formatQuestionForCopy({
                  ...question,
                  question: qText,
                  imageUrl: imageUrl.trim() || undefined,
                  options: question.type === 'single_choice' ? options : question.options,
                  correctAnswer: question.type === 'single_choice' ? correctAnswer : question.correctAnswer,
                  tfItems: question.type === 'true_false' ? tfItems : question.tfItems,
                  acceptedAnswers:
                    question.type === 'text_input'
                      ? acceptedAnswers.filter((a) => a.trim())
                      : question.acceptedAnswers,
                  sampleAnswer: question.type === 'essay' ? sampleAnswer : question.sampleAnswer,
                  matchingLeftItems: question.type === 'matching' ? matchingLeftItems : question.matchingLeftItems,
                  matchingRightItems: question.type === 'matching' ? matchingRightItems : question.matchingRightItems,
                  subQuestions: question.type === 'grouped' ? subQuestions : question.subQuestions,
                  explanation,
                })
              }
            />
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div ref={modalBodyRef} className="p-4 sm:p-6 space-y-5 flex-1">
          {/* Question text */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
              <label className="text-xs font-bold text-slate-700">
                Nội dung câu hỏi (Hỗ trợ KaTeX Math, Ctrl+V dán ảnh hoặc chèn ảnh tại con trỏ)
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => openCursorImageModal('qText', 'Nội dung câu hỏi')}
                  className="px-2 py-0.5 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                >
                  <ImageIcon className="w-3 h-3" />
                  <span>Chèn ảnh tại con trỏ</span>
                </button>
                <CopyContentButton compact getText={() => qText} />
                <button
                  type="button"
                  onClick={() => setPreview(!preview)}
                  className="text-xs font-medium text-blue-600 hover:text-blue-800 cursor-pointer flex items-center gap-1"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>{preview ? 'Ẩn xem trước' : 'Xem trước toàn bộ'}</span>
                </button>
              </div>
            </div>

            <MathToolbar
              containerRef={modalBodyRef}
              onInsert={(latex) => {
                setQText((prev) => {
                  const isBlock = latex.trim().startsWith('|') || latex.includes('\n');
                  return prev ? (isBlock ? `${prev}\n${latex}` : `${prev} ${latex}`) : latex;
                });
                setPreview(true);
              }}
              onInsertInlineImage={(imgId, imgSrc) =>
                setInlineImages((prev) => ({ ...prev, [imgId]: imgSrc }))
              }
            />

            <textarea
              ref={(el) => {
                fieldRefs.current.qText = el;
              }}
              rows={4}
              value={qText}
              onChange={(e) => setQText(e.target.value)}
              onPaste={(e) => void handleFieldPasteImage(e, 'qText', 'Nội dung câu hỏi')}
              className="w-full p-3 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 leading-relaxed font-mono"
              placeholder="Nhập nội dung đề bài... (đặt trỏ ở bất kỳ vị trí nào rồi chèn ảnh hoặc Ctrl+V)"
            />

            <InlineImageStrip
              content={qText}
              inlineImages={inlineImages}
              label="Ảnh chèn trong nội dung câu hỏi"
              onUpdateContent={setQText}
            />

            {/* Question Statement Image Attachment (Implicit URL, Title-only) */}
            <div className="mt-3">
              <AttachedImageBox
                imageUrl={imageUrl}
                caption={imageCaption}
                label="Hình ảnh / Đồ thị đính kèm câu hỏi (Tùy chọn)"
                onChangeImage={setImageUrl}
                onChangeCaption={setImageCaption}
                onError={setErrorMessage}
              />
            </div>

            {preview && (
              <div className="mt-3 p-3.5 bg-blue-50/50 border border-blue-200 rounded-xl text-xs space-y-2.5">
                <div className="text-[11px] font-bold text-blue-800 uppercase flex items-center gap-1">
                  <Eye className="w-3.5 h-3.5" />
                  <span>Xem trước toàn bộ các phần của câu hỏi:</span>
                </div>
                <div className="p-3 bg-white rounded-lg border border-blue-100 space-y-3">
                  <RichContentRenderer
                    content={qText || 'Chưa nhập nội dung câu hỏi.'}
                    imageUrl={imageUrl}
                    imageCaption={imageCaption}
                    inlineImages={inlineImages}
                  />

                  {(question.type === 'single_choice' || question.type === 'multiple_choice') &&
                    options.length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-slate-100">
                        {options.map((opt, idx) => {
                          const letter = String.fromCharCode(65 + idx);
                          const isCorr =
                            question.type === 'multiple_choice'
                              ? correctAnswers.includes(idx)
                              : correctAnswer === idx;
                          const optImg = optionImages[idx];
                          return (
                            <div
                              key={idx}
                              className={`p-2 rounded-lg border flex items-start gap-2 ${
                                isCorr
                                  ? 'bg-emerald-50 border-emerald-400 text-emerald-950 font-medium'
                                  : 'bg-white border-slate-200 text-slate-800'
                              }`}
                            >
                              <span
                                className={`w-5 h-5 rounded font-bold text-[11px] flex items-center justify-center shrink-0 ${
                                  isCorr
                                    ? 'bg-emerald-600 text-white'
                                    : 'bg-slate-100 text-slate-700'
                                }`}
                              >
                                {letter}
                              </span>
                              <div className="flex-1 min-w-0">
                                {opt && (
                                  <RichContentRenderer content={opt} inlineImages={inlineImages} />
                                )}
                                {optImg && (
                                  <img
                                    src={optImg}
                                    alt={`Phương án ${letter}`}
                                    className="max-h-24 rounded border border-slate-200 object-contain mt-1"
                                    referrerPolicy="no-referrer"
                                  />
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                  {question.type === 'true_false' && tfItems.length > 0 && (
                    <div className="space-y-1.5 pt-2 border-t border-slate-100">
                      <div className="text-[11px] font-semibold text-emerald-800 bg-emerald-50 px-2 py-1 rounded border border-emerald-200">
                        ⚖{' '}
                        {formatTrueFalseScoringRule({
                          ...question,
                          points,
                          tfItems,
                          tfScoringMode,
                          tfTierPoints,
                        })}
                      </div>
                      {tfItems.map((it, idx) => (
                        <div
                          key={it.id}
                          className="p-2 rounded-lg border border-slate-200 bg-slate-50/70 flex items-center justify-between gap-2"
                        >
                          <div className="flex items-start gap-1.5 flex-1">
                            <span className="font-bold text-slate-700">
                              {String.fromCharCode(97 + idx)})
                            </span>
                            <RichContentRenderer
                              content={it.statement || 'Chưa nhập ý'}
                              inlineImages={inlineImages}
                            />
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded font-bold text-[11px] ${
                              it.isCorrect
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {it.isCorrect ? 'ĐÚNG' : 'SAI'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {question.type === 'text_input' && (
                    <div className="pt-2 border-t border-slate-100">
                      <span className="font-semibold text-slate-600">Đáp án chấp nhận: </span>
                      <span className="font-mono font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        {formatAcceptedShortAnswersList(acceptedAnswers) || 'Chưa thiết lập'}
                      </span>
                    </div>
                  )}

                  {question.type === 'matching' && (
                    <div className="pt-2 border-t border-slate-100">
                      <MatchingQuestionView
                        question={{
                          ...question,
                          matchingLeftLabelStyle,
                          matchingRightLabelStyle,
                          matchingLeftItems,
                          matchingRightItems,
                          matchingCorrectPairs,
                        }}
                        mode="preview"
                        showSolutions={true}
                        hidePrompt={true}
                      />
                    </div>
                  )}

                  {question.type === 'grouped' && subQuestions.length > 0 && (
                    <div className="pt-2 border-t border-slate-100 space-y-2">
                      {subQuestions.map((sub, sIdx) => {
                        const combined = { ...inlineImages, ...(sub.inlineImages || {}) };
                        return (
                          <div
                            key={sub.id || sIdx}
                            className="p-2.5 rounded-lg bg-purple-50/40 border border-purple-200 space-y-1.5"
                          >
                            <div className="font-bold text-purple-950">
                              Câu con #{sIdx + 1} ({sub.points || 0.5}đ):
                            </div>
                            <RichContentRenderer
                              content={sub.question || 'Chưa nhập câu con.'}
                              imageUrl={sub.imageUrl}
                              imageCaption={sub.imageCaption}
                              inlineImages={combined}
                            />
                            {(sub.type || 'single_choice') === 'single_choice' && sub.options && (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                                {sub.options.map((sOpt, soIdx) => {
                                  const sLetter = String.fromCharCode(65 + soIdx);
                                  const isCorr = sub.correctAnswer === soIdx;
                                  return (
                                    <div
                                      key={soIdx}
                                      className={`p-1.5 rounded border flex items-start gap-1.5 ${
                                        isCorr
                                          ? 'bg-emerald-50 border-emerald-400 text-emerald-950 font-medium'
                                          : 'bg-white border-slate-200'
                                      }`}
                                    >
                                      <span
                                        className={`w-4 h-4 rounded text-[10px] font-bold flex items-center justify-center shrink-0 ${
                                          isCorr
                                            ? 'bg-emerald-600 text-white'
                                            : 'bg-slate-100 text-slate-700'
                                        }`}
                                      >
                                        {sLetter}
                                      </span>
                                      <div className="flex-1 min-w-0">
                                        {sOpt && (
                                          <RichContentRenderer
                                            content={sOpt}
                                            inlineImages={combined}
                                          />
                                        )}
                                        {sub.optionImages?.[soIdx] && (
                                          <img
                                            src={sub.optionImages[soIdx]}
                                            alt={`Ảnh ${sLetter}`}
                                            className="max-h-20 rounded border border-slate-200 object-contain mt-1"
                                            referrerPolicy="no-referrer"
                                          />
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                            {sub.type === 'text_input' && (
                              <div>
                                <span className="font-semibold text-slate-600">Đáp án đúng: </span>
                                <span className="font-mono font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                  {formatAcceptedShortAnswersList(sub.acceptedAnswers) ||
                                    'Chưa thiết lập'}
                                </span>
                              </div>
                            )}
                            {((sub.explanation && sub.explanation.trim()) ||
                              sub.explanationImageUrl) && (
                              <div className="p-2 bg-blue-50/70 border border-blue-200 rounded">
                                <div className="font-bold text-blue-900 text-[10px] uppercase mb-0.5">
                                  Lời giải câu con:
                                </div>
                                <RichContentRenderer
                                  content={sub.explanation || ''}
                                  imageUrl={sub.explanationImageUrl}
                                  imageCaption={sub.explanationImageCaption}
                                  inlineImages={combined}
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {question.type === 'essay' && sampleAnswer.trim() && (
                    <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg">
                      <div className="font-bold text-emerald-900 uppercase text-[10px] mb-1">
                        Đáp án tham khảo:
                      </div>
                      <RichContentRenderer content={sampleAnswer} inlineImages={inlineImages} />
                    </div>
                  )}

                  {(explanation.trim() || explanationImageUrl.trim()) && (
                    <div className="p-2.5 bg-blue-50/70 border border-blue-200 rounded-lg">
                      <div className="font-bold text-blue-900 uppercase text-[10px] mb-1">
                        Lời giải chi tiết:
                      </div>
                      <RichContentRenderer
                        content={explanation}
                        imageUrl={explanationImageUrl}
                        imageCaption={explanationImageCaption}
                        inlineImages={inlineImages}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Points & Topic */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Điểm của câu này
              </label>
              <input
                type="number"
                step="0.1"
                min="0.1"
                max="10"
                value={points}
                onChange={(e) => setPoints(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Chuyên đề / Dạng bài
              </label>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Nhập chuyên đề / dạng bài..."
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>
          </div>

          {/* Type Specific Fields */}
          {(question.type === 'single_choice' || question.type === 'multiple_choice') && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold text-slate-700">
                  {question.type === 'multiple_choice'
                    ? 'Các phương án lựa chọn (Click chữ cái để chọn các đáp án đúng):'
                    : 'Các phương án lựa chọn (Chọn nút tròn để đặt đáp án đúng):'}
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setOptions([...options, '']);
                    setOptionImages([...optionImages, undefined]);
                  }}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Thêm phương án
                </button>
              </div>

              <div className="space-y-2.5">
                {options.map((opt, idx) => {
                  const letter = String.fromCharCode(65 + idx);
                  const optImg = optionImages[idx];
                  const isImageEditing = activeOptImgEdit === idx;
                  const isCorr =
                    question.type === 'multiple_choice'
                      ? correctAnswers.includes(idx)
                      : correctAnswer === idx;

                  return (
                    <div key={idx} className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (question.type === 'multiple_choice') {
                              setCorrectAnswers((prev) =>
                                prev.includes(idx)
                                  ? prev.filter((x) => x !== idx)
                                  : [...prev, idx].sort((a, b) => a - b)
                              );
                            } else {
                              setCorrectAnswer(idx);
                            }
                          }}
                          className={`w-7 h-7 rounded-lg text-xs font-bold flex items-center justify-center shrink-0 border transition-colors cursor-pointer ${
                            isCorr
                              ? 'bg-emerald-600 text-white border-emerald-600 ring-2 ring-emerald-300'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                          title="Đặt làm đáp án đúng"
                        >
                          {letter}
                        </button>
                        <input
                          type="text"
                          value={opt}
                          onChange={(e) => {
                            const next = [...options];
                            next[idx] = e.target.value;
                            setOptions(next);
                          }}
                          placeholder={`Nội dung phương án ${letter} (nhập công thức, chữ hoặc thêm ảnh)...`}
                          className="flex-1 px-3 py-1.5 text-xs sm:text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                        />
                        <button
                          type="button"
                          onClick={() => setActiveOptImgEdit(isImageEditing ? null : idx)}
                          className={`px-2.5 py-1.5 rounded-lg border text-xs flex items-center gap-1 cursor-pointer shrink-0 ${
                            optImg
                              ? 'bg-purple-100 text-purple-700 border-purple-300 font-semibold'
                              : isImageEditing
                              ? 'bg-slate-800 text-white border-slate-800'
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                          }`}
                          title="Tải ảnh hoặc dán ảnh phương án"
                        >
                          <ImageIcon className="w-3.5 h-3.5" />
                          <span>{optImg ? 'Có ảnh' : 'Thêm ảnh'}</span>
                        </button>
                        {options.length > 2 && (
                          <button
                            type="button"
                            onClick={() => {
                              const nextOpts = options.filter((_, i) => i !== idx);
                              const nextImgs = optionImages.filter((_, i) => i !== idx);
                              setOptions(nextOpts);
                              setOptionImages(nextImgs);
                              if (correctAnswer >= nextOpts.length) setCorrectAnswer(0);
                            }}
                            className="p-1.5 text-slate-400 hover:text-rose-600 rounded transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      {/* Implicit Image Box for this option */}
                      {(isImageEditing || optImg) && (
                        <div className="pt-1 pl-9">
                          <AttachedImageBox
                            compact
                            showCaption={false}
                            imageUrl={optImg}
                            label={`Ảnh phương án ${letter}`}
                            onChangeImage={(nextUrl) => {
                              const nextImgs = [...optionImages];
                              while (nextImgs.length <= idx) nextImgs.push(undefined);
                              nextImgs[idx] = nextUrl.trim() || undefined;
                              setOptionImages(nextImgs);
                            }}
                            onError={setErrorMessage}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {question.type === 'true_false' && (
            <div>
              {/* Cơ chế gán điểm theo số ý đúng */}
              <div className="p-3 bg-emerald-50/70 rounded-xl border border-emerald-200 mb-3 space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <span className="text-xs font-bold text-emerald-950 block">
                      Cơ chế tính điểm theo số ý đúng:
                    </span>
                    <span className="text-[11px] text-emerald-700">
                      Chọn quy chuẩn của Bộ GD&ĐT 2025 hoặc tự gán điểm theo bậc
                    </span>
                  </div>
                  <div className="inline-flex rounded-lg border border-emerald-300 p-0.5 bg-white text-xs shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        const count = tfItems.length || 4;
                        const maxP = Number(points) || 1.0;
                        setTfScoringMode('standard_ministry');
                        setTfTierPoints(count === 4 ? [0.1 * maxP, 0.25 * maxP, 0.5 * maxP, 1.0 * maxP] : Array.from({ length: count }, (_, i) => Number((((i + 1) / count) * maxP).toFixed(2))));
                      }}
                      className={`px-2 py-0.5 rounded text-xs font-semibold cursor-pointer ${
                        tfScoringMode === 'standard_ministry'
                          ? 'bg-emerald-700 text-white shadow-2xs'
                          : 'text-emerald-900 hover:bg-emerald-50'
                      }`}
                    >
                      Chuẩn Bộ 2025
                    </button>
                    <button
                      type="button"
                      onClick={() => setTfScoringMode('tiered')}
                      className={`px-2 py-0.5 rounded text-xs font-semibold cursor-pointer ${
                        tfScoringMode === 'tiered'
                          ? 'bg-emerald-700 text-white shadow-2xs'
                          : 'text-emerald-900 hover:bg-emerald-50'
                      }`}
                    >
                      Tùy chỉnh bậc ý
                    </button>
                    <button
                      type="button"
                      onClick={() => setTfScoringMode('divide_equally')}
                      className={`px-2 py-0.5 rounded text-xs font-semibold cursor-pointer ${
                        tfScoringMode === 'divide_equally'
                          ? 'bg-emerald-700 text-white shadow-2xs'
                          : 'text-emerald-900 hover:bg-emerald-50'
                      }`}
                    >
                      Chia đều
                    </button>
                  </div>
                </div>

                {tfScoringMode === 'tiered' && (
                  <div className="p-2 bg-white rounded-lg border border-emerald-200 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-slate-700">
                      <span>Điểm đạt được theo số ý đúng:</span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setTfTierPoints(tfItems.length === 4 ? [0.1, 0.25, 0.5, 1.0] : [0.2, 0.4, 0.7, 1.0])}
                          className="px-1.5 py-0.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 rounded text-[10px] font-bold cursor-pointer"
                        >
                          Chuẩn Bộ
                        </button>
                        <button
                          type="button"
                          onClick={() => setTfTierPoints(tfItems.length === 4 ? [0.25, 0.5, 0.75, 1.0] : [0.2, 0.4, 0.6, 0.8])}
                          className="px-1.5 py-0.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 rounded text-[10px] font-bold cursor-pointer"
                        >
                          Bậc đều
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                      {tfItems.map((_, tIdx) => {
                        const curVal = tfTierPoints[tIdx] !== undefined ? tfTierPoints[tIdx] : 0;
                        return (
                          <div key={tIdx} className="p-1.5 bg-slate-50 border border-slate-200 rounded flex items-center justify-between text-xs">
                            <span className="font-semibold text-slate-700">Đúng {tIdx + 1} ý:</span>
                            <div className="flex items-center gap-0.5">
                              <input
                                type="number"
                                step="0.05"
                                min="0"
                                value={curVal}
                                onChange={(e) => {
                                  const nextTiers = [...tfTierPoints];
                                  while (nextTiers.length <= tIdx) nextTiers.push(0);
                                  nextTiers[tIdx] = parseFloat(e.target.value) || 0;
                                  setTfTierPoints(nextTiers);
                                }}
                                className="w-14 px-1 py-0.5 text-xs font-bold text-center bg-white border border-slate-300 rounded font-mono"
                              />
                              <span className="text-[10px] font-bold text-slate-500">đ</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold text-slate-700">
                  Các ý mệnh đề Đúng / Sai:
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setTfItems([
                      ...tfItems,
                      {
                        id: 'tf_' + Date.now(),
                        statement: '',
                        isCorrect: true,
                      },
                    ])
                  }
                  className="text-xs font-semibold text-emerald-600 hover:text-emerald-800 flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Thêm ý con
                </button>
              </div>

              <div className="space-y-2.5">
                {tfItems.map((item, idx) => {
                  const letter = String.fromCharCode(97 + idx); // a, b, c...
                  return (
                    <div key={item.id} className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-slate-700 w-5">{letter})</span>
                        <input
                          type="text"
                          value={item.statement}
                          onChange={(e) => {
                            const next = [...tfItems];
                            next[idx].statement = e.target.value;
                            setTfItems(next);
                          }}
                          placeholder={`Nội dung ý ${letter}`}
                          className="flex-1 px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                        />
                        <div className="flex items-center gap-1 bg-white p-1 border border-slate-200 rounded-lg">
                          <button
                            type="button"
                            onClick={() => {
                              const next = [...tfItems];
                              next[idx].isCorrect = true;
                              setTfItems(next);
                            }}
                            className={`px-2 py-1 text-xs font-bold rounded cursor-pointer ${
                              item.isCorrect ? 'bg-emerald-600 text-white' : 'text-slate-600'
                            }`}
                          >
                            Đúng
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const next = [...tfItems];
                              next[idx].isCorrect = false;
                              setTfItems(next);
                            }}
                            className={`px-2 py-1 text-xs font-bold rounded cursor-pointer ${
                              !item.isCorrect ? 'bg-rose-600 text-white' : 'text-slate-600'
                            }`}
                          >
                            Sai
                          </button>
                        </div>
                        {tfItems.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setTfItems(tfItems.filter((_, i) => i !== idx))}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {question.type === 'text_input' && (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Các đáp án chấp nhận (số thập phân dùng dấu phẩy &quot;,&quot;, ngăn cách bằng dấu chấm phẩy &quot;;&quot;):
              </label>
              <input
                type="text"
                value={acceptedAnswers.map((s) => formatShortAnswerDecimalComma(s)).join('; ')}
                onChange={(e) =>
                  setAcceptedAnswers(e.target.value.split(';').map((s) => s.trim()))
                }
                onBlur={(e) => setAcceptedAnswers(parseAcceptedShortAnswers(e.target.value))}
                placeholder="Ví dụ: 3,5; 7/2; -1,25"
                className="w-full px-3 py-2 text-xs sm:text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 font-mono"
              />
            </div>
          )}

          {question.type === 'matching' && (
            <MatchingQuestionEditor
              question={{
                ...question,
                matchingLeftLabelStyle,
                matchingRightLabelStyle,
                matchingLeftItems,
                matchingRightItems,
                matchingCorrectPairs,
              }}
              onChange={(fields) => {
                if (fields.matchingLeftLabelStyle !== undefined) {
                  setMatchingLeftLabelStyle(fields.matchingLeftLabelStyle);
                }
                if (fields.matchingRightLabelStyle !== undefined) {
                  setMatchingRightLabelStyle(fields.matchingRightLabelStyle);
                }
                if (fields.matchingLeftItems !== undefined) {
                  setMatchingLeftItems(fields.matchingLeftItems);
                }
                if (fields.matchingRightItems !== undefined) {
                  setMatchingRightItems(fields.matchingRightItems);
                }
                if (fields.matchingCorrectPairs !== undefined) {
                  setMatchingCorrectPairs(fields.matchingCorrectPairs);
                }
              }}
              idPrefix={question.id}
            />
          )}

          {question.type === 'grouped' && (
            <div className="space-y-4 p-4 bg-purple-50/50 rounded-xl border border-purple-200">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-xs font-bold text-purple-900 uppercase">
                    Danh sách các câu hỏi con trong chùm:
                  </label>
                  <p className="text-[11px] text-slate-500">
                    Hỗ trợ tải ảnh đề bài câu con và ảnh cho từng đáp án A, B, C, D.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const newSub: Question = {
                      id: 'sub_' + Date.now() + Math.random().toString(36).substring(2, 5),
                      type: 'single_choice',
                      points: 0.5,
                      question: '',
                      options: ['', '', '', ''],
                      correctAnswer: 0,
                      explanation: '',
                    };
                    setSubQuestions([...subQuestions, newSub]);
                  }}
                  className="text-xs font-semibold text-purple-700 hover:underline flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Thêm câu con</span>
                </button>
              </div>

              {subQuestions.map((subQ, sIdx) => (
                <div key={subQ.id} className="p-3.5 bg-white rounded-xl border border-purple-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-purple-900 flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-full bg-purple-100 text-purple-800 flex items-center justify-center text-[11px] font-bold">
                        {sIdx + 1}
                      </span>
                      <span>Câu con #{sIdx + 1}</span>
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500 font-medium">Điểm:</span>
                      <input
                        type="number"
                        step="0.25"
                        value={subQ.points}
                        onChange={(e) => {
                          const nextSubs = [...subQuestions];
                          nextSubs[sIdx] = { ...nextSubs[sIdx], points: parseFloat(e.target.value) || 0.5 };
                          setSubQuestions(nextSubs);
                        }}
                        className="w-16 px-1.5 py-0.5 text-xs border border-slate-200 rounded font-mono"
                      />
                      {subQuestions.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setSubQuestions(subQuestions.filter((_, i) => i !== sIdx))}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors cursor-pointer"
                          title="Xóa câu con này"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Sub Question Statement */}
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <label className="text-[11px] font-semibold text-slate-700">
                        Nội dung câu con (Ctrl+V hoặc chèn ảnh tại vị trí con trỏ):
                      </label>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() =>
                          openCursorImageModal('subQuestion', `Câu con #${sIdx + 1}`, sIdx)
                        }
                        className="px-2 py-0.5 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                      >
                        <ImageIcon className="w-3 h-3" />
                        <span>Chèn ảnh tại con trỏ</span>
                      </button>
                    </div>
                    <textarea
                      ref={(el) => {
                        fieldRefs.current[`subQuestion_${sIdx}`] = el;
                      }}
                      rows={2}
                      value={subQ.question}
                      onChange={(e) => {
                        const nextSubs = [...subQuestions];
                        nextSubs[sIdx] = { ...nextSubs[sIdx], question: e.target.value };
                        setSubQuestions(nextSubs);
                      }}
                      onPaste={(e) =>
                        void handleFieldPasteImage(e, 'subQuestion', `Câu con #${sIdx + 1}`, sIdx)
                      }
                      placeholder="Nội dung đề bài câu con..."
                      className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-600 font-mono"
                    />
                    <InlineImageStrip
                      content={subQ.question}
                      inlineImages={{ ...inlineImages, ...(subQ.inlineImages || {}) }}
                      label={`Ảnh chèn trong câu con #${sIdx + 1}`}
                      onUpdateContent={(nextText) => {
                        const nextSubs = [...subQuestions];
                        nextSubs[sIdx] = { ...nextSubs[sIdx], question: nextText };
                        setSubQuestions(nextSubs);
                      }}
                    />
                  </div>

                  {/* Sub Question Prompt Image (Implicit URL, Title-only) */}
                  <AttachedImageBox
                    compact
                    imageUrl={subQ.imageUrl}
                    caption={subQ.imageCaption || ''}
                    label={`Ảnh đề câu con #${sIdx + 1} (Tùy chọn)`}
                    onChangeImage={(nextUrl) => {
                      const nextSubs = [...subQuestions];
                      nextSubs[sIdx] = { ...nextSubs[sIdx], imageUrl: nextUrl };
                      setSubQuestions(nextSubs);
                    }}
                    onChangeCaption={(nextCap) => {
                      const nextSubs = [...subQuestions];
                      nextSubs[sIdx] = { ...nextSubs[sIdx], imageCaption: nextCap };
                      setSubQuestions(nextSubs);
                    }}
                    onError={setErrorMessage}
                  />

                  {/* Sub question format selector: Single choice vs Short text input */}
                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-[11px] font-bold text-slate-700">Dạng câu con:</span>
                    <div className="inline-flex rounded-lg border border-purple-200 p-0.5 bg-purple-50/60 text-xs">
                      <button
                        type="button"
                        onClick={() => {
                          const nextSubs = [...subQuestions];
                          nextSubs[sIdx] = {
                            ...nextSubs[sIdx],
                            type: 'single_choice',
                            options: nextSubs[sIdx].options && nextSubs[sIdx].options!.length > 0 ? nextSubs[sIdx].options : ['', '', '', ''],
                            correctAnswer: nextSubs[sIdx].correctAnswer ?? 0,
                          };
                          setSubQuestions(nextSubs);
                        }}
                        className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                          (subQ.type || 'single_choice') === 'single_choice'
                            ? 'bg-purple-700 text-white shadow-xs'
                            : 'text-purple-900 hover:bg-purple-100'
                        }`}
                      >
                        Trắc nghiệm (A, B, C, D)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const nextSubs = [...subQuestions];
                          nextSubs[sIdx] = {
                            ...nextSubs[sIdx],
                            type: 'text_input',
                            acceptedAnswers: nextSubs[sIdx].acceptedAnswers && nextSubs[sIdx].acceptedAnswers!.length > 0 ? nextSubs[sIdx].acceptedAnswers : [''],
                          };
                          setSubQuestions(nextSubs);
                        }}
                        className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                          subQ.type === 'text_input'
                            ? 'bg-purple-700 text-white shadow-xs'
                            : 'text-purple-900 hover:bg-purple-100'
                        }`}
                      >
                        Trả lời ngắn (Điền từ/số)
                      </button>
                    </div>
                  </div>

                  {/* Format A: Single choice options with image support */}
                  {(subQ.type || 'single_choice') === 'single_choice' && (
                    <div className="space-y-2 pt-1">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-bold text-slate-700">
                          Các phương án lựa chọn (Click nút chữ cái để chọn đáp án đúng):
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            const nextSubs = [...subQuestions];
                            const sub = { ...nextSubs[sIdx] };
                            sub.options = [...(sub.options || []), ''];
                            sub.optionImages = sub.optionImages ? [...sub.optionImages, undefined] : undefined;
                            nextSubs[sIdx] = sub;
                            setSubQuestions(nextSubs);
                          }}
                          className="text-[11px] font-semibold text-purple-700 hover:underline flex items-center gap-0.5 cursor-pointer"
                        >
                          <Plus className="w-3 h-3" /> Thêm phương án
                        </button>
                      </div>

                      <div className="space-y-2">
                        {(subQ.options || []).map((sOpt, sOptIdx) => {
                          const sLetter = String.fromCharCode(65 + sOptIdx);
                          const isCorr = subQ.correctAnswer === sOptIdx;
                          const subOptImg = subQ.optionImages?.[sOptIdx];
                          const isSubImgEditing =
                            activeSubOptImgEdit?.subIdx === sIdx &&
                            activeSubOptImgEdit?.optIdx === sOptIdx;

                          return (
                            <div key={sOptIdx} className="p-2 rounded-lg border border-slate-200 bg-slate-50/50 space-y-1.5">
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const nextSubs = [...subQuestions];
                                    nextSubs[sIdx] = { ...nextSubs[sIdx], correctAnswer: sOptIdx };
                                    setSubQuestions(nextSubs);
                                  }}
                                  className={`w-6 h-6 rounded text-xs font-bold border transition-colors cursor-pointer shrink-0 ${
                                    isCorr
                                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs ring-1 ring-emerald-300'
                                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                                  }`}
                                  title="Chọn làm đáp án đúng"
                                >
                                  {sLetter}
                                </button>

                                <input
                                  type="text"
                                  value={sOpt}
                                  onChange={(e) => {
                                    const nextSubs = [...subQuestions];
                                    const sub = { ...nextSubs[sIdx] };
                                    const opts = [...(sub.options || [])];
                                    opts[sOptIdx] = e.target.value;
                                    sub.options = opts;
                                    nextSubs[sIdx] = sub;
                                    setSubQuestions(nextSubs);
                                  }}
                                  placeholder={`Nội dung ý ${sLetter} (chữ, công thức hoặc thêm ảnh)...`}
                                  className="flex-1 px-2.5 py-1 text-xs bg-white border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-purple-600"
                                />

                                {/* Toggle option image button */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (isSubImgEditing) {
                                      setActiveSubOptImgEdit(null);
                                    } else {
                                      setActiveSubOptImgEdit({ subIdx: sIdx, optIdx: sOptIdx });
                                    }
                                  }}
                                  className={`px-2 py-1 rounded border text-[11px] flex items-center gap-1 transition-colors cursor-pointer shrink-0 ${
                                    subOptImg
                                      ? 'bg-purple-100 text-purple-700 border-purple-300 font-semibold'
                                      : isSubImgEditing
                                      ? 'bg-slate-800 text-white border-slate-800'
                                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                                  }`}
                                  title="Tải ảnh hoặc dán ảnh cho đáp án này"
                                >
                                  <ImageIcon className="w-3 h-3" />
                                  <span>{subOptImg ? 'Có ảnh' : 'Ảnh'}</span>
                                </button>

                                {(subQ.options || []).length > 2 && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const nextSubs = [...subQuestions];
                                      const sub = { ...nextSubs[sIdx] };
                                      sub.options = (sub.options || []).filter((_, i) => i !== sOptIdx);
                                      if (sub.optionImages) {
                                        sub.optionImages = sub.optionImages.filter((_, i) => i !== sOptIdx);
                                      }
                                      if (sub.correctAnswer !== undefined && sub.correctAnswer >= sub.options.length) {
                                        sub.correctAnswer = sub.options.length - 1;
                                      }
                                      nextSubs[sIdx] = sub;
                                      setSubQuestions(nextSubs);
                                    }}
                                    className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors cursor-pointer shrink-0"
                                    title="Xóa ý này"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                )}
                              </div>

                              {/* Implicit Image Box for sub option */}
                              {(isSubImgEditing || subOptImg) && (
                                <div className="pt-1 pl-7">
                                  <AttachedImageBox
                                    compact
                                    showCaption={false}
                                    imageUrl={subOptImg}
                                    label={`Ảnh đáp án ${sLetter}`}
                                    onChangeImage={(nextUrl) => {
                                      const nextSubs = [...subQuestions];
                                      const sub = { ...nextSubs[sIdx] };
                                      const imgs = sub.optionImages ? [...sub.optionImages] : [];
                                      while (imgs.length <= sOptIdx) imgs.push(undefined);
                                      imgs[sOptIdx] = nextUrl.trim() || undefined;
                                      sub.optionImages = imgs;
                                      nextSubs[sIdx] = sub;
                                      setSubQuestions(nextSubs);
                                    }}
                                    onError={setErrorMessage}
                                  />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Format B: Short answer (Trả lời ngắn) */}
                  {subQ.type === 'text_input' && (
                    <div className="p-3 bg-purple-50/70 rounded-xl border border-purple-200 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-1">
                        <label className="text-xs font-bold text-purple-950">
                          Các đáp án được chấp nhận (ngăn cách bởi dấu chấm phẩy &quot;;&quot;):
                        </label>
                        <span className="text-[11px] text-purple-700 font-medium">
                          Số thập phân dùng dấu phẩy (vd: 3,5)
                        </span>
                      </div>
                      <input
                        type="text"
                        value={(subQ.acceptedAnswers || []).map((s) => formatShortAnswerDecimalComma(s)).join('; ')}
                        onChange={(e) => {
                          const nextSubs = [...subQuestions];
                          nextSubs[sIdx] = {
                            ...nextSubs[sIdx],
                            acceptedAnswers: e.target.value.split(';').map((s) => s.trim()),
                          };
                          setSubQuestions(nextSubs);
                        }}
                        onBlur={(e) => {
                          const nextSubs = [...subQuestions];
                          nextSubs[sIdx] = {
                            ...nextSubs[sIdx],
                            acceptedAnswers: parseAcceptedShortAnswers(e.target.value),
                          };
                          setSubQuestions(nextSubs);
                        }}
                        placeholder="Ví dụ: 3,5; 7/2"
                        className="w-full px-3 py-2 text-xs font-mono bg-white border border-purple-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600"
                      />
                      <p className="text-[11px] text-slate-500">
                        * Thí sinh điền một trong các đáp án này sẽ đạt trọn vẹn điểm câu con ({subQ.points || 0.5} đ).
                      </p>
                    </div>
                  )}

                  {/* Sub-question Detailed Explanation + Images */}
                  <div className="p-2.5 bg-blue-50/40 rounded-lg border border-blue-200 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-[11px] font-bold text-blue-900">
                        Lời giải chi tiết câu con #{sIdx + 1} (Tùy chọn):
                      </label>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() =>
                          openCursorImageModal(
                            'subExplanation',
                            `Lời giải câu con #${sIdx + 1}`,
                            sIdx
                          )
                        }
                        className="px-2 py-0.5 bg-white hover:bg-purple-50 text-purple-700 border border-purple-200 rounded text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                      >
                        <ImageIcon className="w-3 h-3" />
                        <span>Chèn ảnh tại con trỏ</span>
                      </button>
                    </div>
                    <textarea
                      ref={(el) => {
                        fieldRefs.current[`subExplanation_${sIdx}`] = el;
                      }}
                      rows={2}
                      value={subQ.explanation || ''}
                      onChange={(e) => {
                        const nextSubs = [...subQuestions];
                        nextSubs[sIdx] = { ...nextSubs[sIdx], explanation: e.target.value };
                        setSubQuestions(nextSubs);
                      }}
                      onPaste={(e) =>
                        void handleFieldPasteImage(
                          e,
                          'subExplanation',
                          `Lời giải câu con #${sIdx + 1}`,
                          sIdx
                        )
                      }
                      placeholder="Nhập lời giải câu con..."
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-blue-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-600 font-mono"
                    />
                    <InlineImageStrip
                      content={subQ.explanation || ''}
                      inlineImages={{ ...inlineImages, ...(subQ.inlineImages || {}) }}
                      label={`Ảnh chèn trong lời giải câu con #${sIdx + 1}`}
                      onUpdateContent={(nextText) => {
                        const nextSubs = [...subQuestions];
                        nextSubs[sIdx] = { ...nextSubs[sIdx], explanation: nextText };
                        setSubQuestions(nextSubs);
                      }}
                    />
                    <AttachedImageBox
                      compact
                      imageUrl={subQ.explanationImageUrl}
                      caption={subQ.explanationImageCaption || ''}
                      label="Ảnh minh họa lời giải câu con (Tùy chọn)"
                      onChangeImage={(nextUrl) => {
                        const nextSubs = [...subQuestions];
                        nextSubs[sIdx] = { ...nextSubs[sIdx], explanationImageUrl: nextUrl };
                        setSubQuestions(nextSubs);
                      }}
                      onChangeCaption={(nextCap) => {
                        const nextSubs = [...subQuestions];
                        nextSubs[sIdx] = { ...nextSubs[sIdx], explanationImageCaption: nextCap };
                        setSubQuestions(nextSubs);
                      }}
                      onError={setErrorMessage}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {question.type === 'essay' && (
            <div className="p-3.5 bg-cyan-50/50 border border-cyan-200 rounded-xl space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="block text-xs font-bold text-cyan-950">
                  Đáp án tham khảo / Gợi ý chấm điểm tự luận (Tùy chọn)
                </label>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => openCursorImageModal('sampleAnswer', 'Đáp án tham khảo')}
                    className="px-2 py-0.5 bg-white hover:bg-purple-50 text-purple-700 border border-purple-200 rounded text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                  >
                    <ImageIcon className="w-3 h-3" />
                    <span>Chèn ảnh tại con trỏ</span>
                  </button>
                  <CopyContentButton compact getText={() => sampleAnswer} />
                </div>
              </div>
              <textarea
                ref={(el) => {
                  fieldRefs.current.sampleAnswer = el;
                }}
                rows={3}
                value={sampleAnswer}
                onChange={(e) => setSampleAnswer(e.target.value)}
                onPaste={(e) => void handleFieldPasteImage(e, 'sampleAnswer', 'Đáp án tham khảo')}
                placeholder="Nhập đáp án mẫu hoặc biểu điểm gợi ý..."
                className="w-full p-2.5 text-xs bg-white border border-cyan-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-600 font-mono"
              />
              <InlineImageStrip
                content={sampleAnswer}
                inlineImages={inlineImages}
                label="Ảnh chèn trong đáp án tham khảo"
                onUpdateContent={setSampleAnswer}
              />
              {sampleAnswer.trim() && (
                <div className="p-2.5 bg-white border border-cyan-200 rounded-lg text-xs">
                  <div className="text-[10px] font-bold text-cyan-800 uppercase mb-1 flex items-center gap-1">
                    <Eye className="w-3 h-3" />
                    <span>Xem trước đáp án tham khảo:</span>
                  </div>
                  <RichContentRenderer content={sampleAnswer} inlineImages={inlineImages} />
                </div>
              )}
            </div>
          )}

          {/* Explanation with cursor-inserted images + attached solution image + preview */}
          <div className="p-3.5 bg-blue-50/40 border border-blue-200/80 rounded-xl space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="block text-xs font-bold text-blue-950">
                Lời giải chi tiết (hỗ trợ công thức toán, Ctrl+V dán ảnh hoặc chèn ảnh tại vị trí con trỏ)
              </label>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => openCursorImageModal('explanation', 'Lời giải chi tiết')}
                  className="px-2.5 py-1 bg-white hover:bg-purple-50 text-purple-700 border border-purple-200 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer shadow-2xs"
                >
                  <ImageIcon className="w-3 h-3" />
                  <span>Chèn ảnh tại con trỏ</span>
                </button>
                <CopyContentButton compact getText={() => explanation} />
              </div>
            </div>
            <textarea
              ref={(el) => {
                fieldRefs.current.explanation = el;
              }}
              rows={3}
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              onPaste={(e) => void handleFieldPasteImage(e, 'explanation', 'Lời giải chi tiết')}
              placeholder="Giải thích từng bước... (đặt trỏ ở bất kỳ vị trí nào rồi chèn ảnh hoặc Ctrl+V)"
              className="w-full p-3 text-xs sm:text-sm bg-white border border-blue-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600 leading-relaxed font-mono"
            />
            <InlineImageStrip
              content={explanation}
              inlineImages={inlineImages}
              label="Ảnh chèn trong lời giải chi tiết"
              onUpdateContent={setExplanation}
            />
            <AttachedImageBox
              compact
              imageUrl={explanationImageUrl}
              caption={explanationImageCaption}
              label="Ảnh minh họa đính kèm lời giải chi tiết (Tùy chọn)"
              onChangeImage={setExplanationImageUrl}
              onChangeCaption={setExplanationImageCaption}
              onError={setErrorMessage}
            />
            {(explanation.trim() || explanationImageUrl.trim()) && (
              <div className="p-2.5 bg-white border border-blue-200 rounded-lg text-xs">
                <div className="text-[10px] font-bold text-blue-800 uppercase mb-1 flex items-center gap-1">
                  <Eye className="w-3 h-3" />
                  <span>Xem trước lời giải chi tiết:</span>
                </div>
                <RichContentRenderer
                  content={explanation}
                  imageUrl={explanationImageUrl}
                  imageCaption={explanationImageCaption}
                  inlineImages={inlineImages}
                />
              </div>
            )}
          </div>

          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium rounded-xl flex items-center justify-between">
              <span>{errorMessage}</span>
              <button 
                type="button" 
                onClick={() => setErrorMessage(null)} 
                className="text-rose-500 hover:text-rose-800 font-bold ml-2 cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between sticky bottom-0">
          {onDelete ? (
            <div>
              {!isConfirmingDelete ? (
                <button
                  type="button"
                  onClick={() => setIsConfirmingDelete(true)}
                  className="py-2 px-3 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                  title="Nhấn để chuẩn bị xóa câu hỏi này khỏi đề thi"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Xóa câu hỏi này</span>
                </button>
              ) : (
                <div className="flex items-center gap-1.5 animate-in fade-in duration-150">
                  <button
                    type="button"
                    onClick={() => {
                      onDelete(question.id);
                      onClose();
                    }}
                    className="py-2 px-3 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                    title="Xác nhận xóa vĩnh viễn câu hỏi này"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Xác nhận xóa ngay</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsConfirmingDelete(false)}
                    className="py-2 px-2.5 text-xs text-slate-600 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                  >
                    Hủy
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div />
          )}

          <div className="flex flex-wrap items-center gap-2">
            {savedSuccessToast && (
              <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg animate-in fade-in duration-200">
                {savedSuccessToast}
              </span>
            )}
            <button
              type="button"
              onClick={onClose}
              className="py-2 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
            >
              Đóng
            </button>
            <button
              type="button"
              onClick={handleSaveInPlace}
              className="py-2 px-4 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 rounded-lg transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
              title="Lưu nội dung câu hỏi này ngay tại đây mà không cần thoát tab ra ngoài"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Lưu câu hỏi (Ở lại soạn tiếp)</span>
            </button>
            <button
              type="button"
              onClick={handleSaveAndClose}
              className="py-2 px-4 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <span>Lưu & Đóng</span>
            </button>
          </div>
        </div>
      </div>

      <InlineImageTitleModal
        isOpen={Boolean(cursorImageModal?.isOpen)}
        initialImageSrc={cursorImageModal?.initialImageSrc || ''}
        targetLabel={cursorImageModal?.targetLabel}
        onConfirm={handleConfirmCursorImage}
        onClose={() => setCursorImageModal(null)}
      />
    </div>
  );
};
