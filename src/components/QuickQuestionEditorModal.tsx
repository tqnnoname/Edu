import React, { useState, useEffect } from 'react';
import { Question, QuestionType, TrueFalseItem, TrueFalseScoringMode } from '../types/exam';
import { X, Save, Trash2, Plus, Sparkles, Image as ImageIcon, Upload, Eye } from 'lucide-react';
import { MathToolbar } from './MathToolbar';
import { RichContentRenderer } from './RichContentRenderer';
import { processImageFile } from '../utils/imageUpload';

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
  if (!isOpen || !question) return null;

  const [qText, setQText] = useState(question.question);
  const [imageUrl, setImageUrl] = useState(question.imageUrl || '');
  const [points, setPoints] = useState(question.points || 1.0);
  const [topic, setTopic] = useState(question.topic || '');
  const [explanation, setExplanation] = useState(question.explanation || '');
  const [options, setOptions] = useState<string[]>(question.options ? [...question.options] : []);
  const [optionImages, setOptionImages] = useState<(string | undefined)[]>(
    question.optionImages ? [...question.optionImages] : []
  );
  const [correctAnswer, setCorrectAnswer] = useState(question.correctAnswer ?? 0);
  const [tfItems, setTfItems] = useState<TrueFalseItem[]>(
    question.tfItems ? JSON.parse(JSON.stringify(question.tfItems)) : []
  );
  const [tfScoringMode, setTfScoringMode] = useState<TrueFalseScoringMode>(
    question.tfScoringMode || 'standard_ministry'
  );
  const [tfTierPoints, setTfTierPoints] = useState<number[]>(
    question.tfTierPoints || [0.1, 0.25, 0.5, 1.0]
  );
  const [acceptedAnswers, setAcceptedAnswers] = useState<string[]>(
    question.acceptedAnswers ? [...question.acceptedAnswers] : ['']
  );
  const [subQuestions, setSubQuestions] = useState<Question[]>(
    question.subQuestions ? JSON.parse(JSON.stringify(question.subQuestions)) : []
  );
  const [activeOptImgEdit, setActiveOptImgEdit] = useState<number | null>(null);
  const [activeSubOptImgEdit, setActiveSubOptImgEdit] = useState<{ subIdx: number; optIdx: number } | null>(null);
  const [preview, setPreview] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [savedSuccessToast, setSavedSuccessToast] = useState<string | null>(null);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  useEffect(() => {
    setQText(question.question);
    setImageUrl(question.imageUrl || '');
    setPoints(question.points || 1.0);
    setTopic(question.topic || '');
    setExplanation(question.explanation || '');
    setOptions(question.options ? [...question.options] : []);
    setOptionImages(question.optionImages ? [...question.optionImages] : []);
    setCorrectAnswer(question.correctAnswer ?? 0);
    setTfItems(question.tfItems ? JSON.parse(JSON.stringify(question.tfItems)) : []);
    setTfScoringMode(question.tfScoringMode || 'standard_ministry');
    setTfTierPoints(question.tfTierPoints || [0.1, 0.25, 0.5, 1.0]);
    setAcceptedAnswers(question.acceptedAnswers ? [...question.acceptedAnswers] : ['']);
    setSubQuestions(question.subQuestions ? JSON.parse(JSON.stringify(question.subQuestions)) : []);
    setActiveOptImgEdit(null);
    setActiveSubOptImgEdit(null);
    setErrorMessage(null);
    setSavedSuccessToast(null);
    setIsConfirmingDelete(false);
  }, [question]);

  const handleFileUploadMainImage = async (file: File) => {
    if (!file) return;
    try {
      const compressed = await processImageFile(file);
      setImageUrl(compressed);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Không thể tải ảnh đề bài lên!');
    }
  };

  const handleFileUploadOptionImage = async (optIdx: number, file: File) => {
    if (!file) return;
    try {
      const compressed = await processImageFile(file);
      const nextImgs = [...optionImages];
      while (nextImgs.length <= optIdx) nextImgs.push(undefined);
      nextImgs[optIdx] = compressed;
      setOptionImages(nextImgs);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Không thể tải ảnh phương án lên!');
    }
  };

  const handleFileUploadSubQImage = async (subIdx: number, file: File) => {
    if (!file) return;
    try {
      const compressed = await processImageFile(file);
      const nextSubs = [...subQuestions];
      nextSubs[subIdx] = { ...nextSubs[subIdx], imageUrl: compressed };
      setSubQuestions(nextSubs);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Không thể tải ảnh câu con lên!');
    }
  };

  const handleFileUploadSubOptImage = async (subIdx: number, optIdx: number, file: File) => {
    if (!file) return;
    try {
      const compressed = await processImageFile(file);
      const nextSubs = [...subQuestions];
      const sub = { ...nextSubs[subIdx] };
      const imgs = sub.optionImages ? [...sub.optionImages] : [];
      while (imgs.length <= optIdx) imgs.push(undefined);
      imgs[optIdx] = compressed;
      sub.optionImages = imgs;
      nextSubs[subIdx] = sub;
      setSubQuestions(nextSubs);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Không thể tải ảnh đáp án câu con lên!');
    }
  };

  const buildUpdatedQuestion = (): Question | null => {
    if (!qText.trim()) {
      setErrorMessage('Nội dung câu hỏi không được để trống!');
      return null;
    }

    return {
      ...question,
      question: qText.trim(),
      imageUrl: imageUrl.trim() || undefined,
      points: Number(points) || 1.0,
      topic: topic.trim() || undefined,
      explanation: explanation.trim() || 'Xem lại kiến thức trọng tâm.',
      options: question.type === 'single_choice' ? options : question.options,
      optionImages: question.type === 'single_choice' ? optionImages : question.optionImages,
      correctAnswer: question.type === 'single_choice' ? correctAnswer : question.correctAnswer,
      tfItems: question.type === 'true_false' ? tfItems : question.tfItems,
      tfScoringMode: question.type === 'true_false' ? tfScoringMode : question.tfScoringMode,
      tfTierPoints: question.type === 'true_false' ? tfTierPoints : question.tfTierPoints,
      acceptedAnswers:
        question.type === 'text_input'
          ? acceptedAnswers.map((a) => a.trim()).filter(Boolean)
          : question.acceptedAnswers,
      subQuestions: question.type === 'grouped' ? subQuestions : question.subQuestions,
    };
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
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-6 space-y-5 flex-1">
          {/* Question text */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-700">
                Nội dung câu hỏi (Hỗ trợ KaTeX Math $\LaTeX$)
              </label>
              <button
                type="button"
                onClick={() => setPreview(!preview)}
                className="text-xs font-medium text-blue-600 hover:text-blue-800 cursor-pointer"
              >
                {preview ? 'Ẩn xem trước' : 'Xem trước hiển thị'}
              </button>
            </div>

            <MathToolbar onInsert={(latex) => setQText((prev) => prev + latex)} />

            <textarea
              rows={4}
              value={qText}
              onChange={(e) => setQText(e.target.value)}
              className="w-full p-3 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 leading-relaxed font-mono"
              placeholder="Nhập nội dung đề bài..."
            />

            {/* Question Statement Image URL / File Upload */}
            <div className="mt-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5 text-purple-600" />
                  <span>Hình ảnh / Đồ thị câu hỏi (Tùy chọn):</span>
                </label>
                {imageUrl && (
                  <button
                    type="button"
                    onClick={() => setImageUrl('')}
                    className="text-[11px] text-rose-600 hover:underline cursor-pointer flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Xóa ảnh</span>
                  </button>
                )}
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <input
                  type="text"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="Dán link ảnh (https://...) hoặc tải từ tệp bên cạnh..."
                  className="flex-1 px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-600"
                />
                <label className="px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer shrink-0 transition-colors">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Tải ảnh từ tệp</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileUploadMainImage(file);
                      e.target.value = '';
                    }}
                  />
                </label>
              </div>

              {imageUrl && (
                <div className="mt-2.5 text-center">
                  <img
                    src={imageUrl}
                    alt="Xem trước hình đề bài"
                    className="max-h-44 rounded-lg border border-slate-200 inline-block shadow-2xs object-contain bg-white"
                    referrerPolicy="no-referrer"
                  />
                </div>
              )}
            </div>

            {preview && (
              <div className="mt-3 p-3 bg-blue-50/50 border border-blue-100 rounded-xl text-sm">
                <div className="text-[11px] font-bold text-blue-700 uppercase mb-1">Xem trước:</div>
                <RichContentRenderer content={qText} imageUrl={imageUrl} />
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
                placeholder="VD: Khảo sát hàm số, Hình không gian..."
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>
          </div>

          {/* Type Specific Fields */}
          {question.type === 'single_choice' && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold text-slate-700">
                  Các phương án lựa chọn (Chọn nút tròn để đặt đáp án đúng):
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

                  return (
                    <div key={idx} className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setCorrectAnswer(idx)}
                          className={`w-7 h-7 rounded-lg text-xs font-bold flex items-center justify-center shrink-0 border transition-colors cursor-pointer ${
                            correctAnswer === idx
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
                          placeholder={`Nội dung phương án ${letter} (nhập công thức, chữ hoặc dùng ảnh)...`}
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
                          title="Tải ảnh hoặc dán URL ảnh phương án"
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

                      {/* Image Drawer for this option */}
                      {(isImageEditing || optImg) && (
                        <div className="pt-2 pl-9 border-t border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs bg-purple-50/40 p-2 rounded-lg">
                          <div className="flex-1 flex items-center gap-2">
                            <input
                              type="text"
                              value={optImg || ''}
                              onChange={(e) => {
                                const nextImgs = [...optionImages];
                                while (nextImgs.length <= idx) nextImgs.push(undefined);
                                nextImgs[idx] = e.target.value.trim() || undefined;
                                setOptionImages(nextImgs);
                              }}
                              placeholder="Dán URL hình ảnh phương án..."
                              className="flex-1 px-2.5 py-1 text-xs bg-white border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-purple-600"
                            />
                            <label className="px-2.5 py-1 bg-white hover:bg-purple-50 text-purple-700 border border-purple-300 rounded text-xs font-semibold flex items-center gap-1 cursor-pointer shrink-0">
                              <Upload className="w-3 h-3" />
                              <span>Chọn tệp</span>
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) handleFileUploadOptionImage(idx, file);
                                  e.target.value = '';
                                }}
                              />
                            </label>
                          </div>
                          {optImg && (
                            <div className="flex items-center gap-2 shrink-0">
                              <img
                                src={optImg}
                                alt={`Phương án ${letter}`}
                                className="h-12 w-auto max-w-[100px] rounded border border-slate-300 object-contain bg-white shadow-2xs"
                                referrerPolicy="no-referrer"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const nextImgs = [...optionImages];
                                  nextImgs[idx] = undefined;
                                  setOptionImages(nextImgs);
                                }}
                                className="p-1 text-rose-600 hover:bg-rose-50 rounded cursor-pointer"
                                title="Xóa ảnh phương án"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          )}
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
                Các đáp án chấp nhận (cách nhau bởi dấu phẩy):
              </label>
              <input
                type="text"
                value={acceptedAnswers.join(', ')}
                onChange={(e) =>
                  setAcceptedAnswers(e.target.value.split(',').map((s) => s.trim()))
                }
                placeholder="VD: 5, 5.0, 10/2"
                className="w-full px-3 py-2 text-xs sm:text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>
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
                  <input
                    type="text"
                    value={subQ.question}
                    onChange={(e) => {
                      const nextSubs = [...subQuestions];
                      nextSubs[sIdx] = { ...nextSubs[sIdx], question: e.target.value };
                      setSubQuestions(nextSubs);
                    }}
                    placeholder="Nội dung đề bài câu con..."
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-600 font-mono"
                  />

                  {/* Sub Question Prompt Image */}
                  <div className="p-2.5 bg-purple-50/50 rounded-lg border border-purple-100 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-semibold text-purple-900 flex items-center gap-1">
                        <ImageIcon className="w-3 h-3 text-purple-600" />
                        <span>Ảnh đề câu con (Tùy chọn):</span>
                      </label>
                      {subQ.imageUrl && (
                        <button
                          type="button"
                          onClick={() => {
                            const nextSubs = [...subQuestions];
                            nextSubs[sIdx] = { ...nextSubs[sIdx], imageUrl: '' };
                            setSubQuestions(nextSubs);
                          }}
                          className="text-[10px] text-rose-600 hover:underline cursor-pointer flex items-center gap-0.5"
                        >
                          <Trash2 className="w-2.5 h-2.5" />
                          <span>Xóa ảnh</span>
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={subQ.imageUrl || ''}
                        onChange={(e) => {
                          const nextSubs = [...subQuestions];
                          nextSubs[sIdx] = { ...nextSubs[sIdx], imageUrl: e.target.value };
                          setSubQuestions(nextSubs);
                        }}
                        placeholder="Dán link ảnh hoặc tải tệp..."
                        className="flex-1 px-2.5 py-1 text-xs bg-white border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-purple-600"
                      />
                      <label className="px-2.5 py-1 bg-white hover:bg-purple-100 text-purple-700 border border-purple-200 rounded text-xs font-semibold flex items-center gap-1 cursor-pointer shrink-0">
                        <Upload className="w-3 h-3" />
                        <span>Tải tệp</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleFileUploadSubQImage(sIdx, file);
                            e.target.value = '';
                          }}
                        />
                      </label>
                    </div>
                    {subQ.imageUrl && (
                      <div className="pt-1 text-center">
                        <img
                          src={subQ.imageUrl}
                          alt={`Ảnh đề câu con ${sIdx + 1}`}
                          className="max-h-32 rounded border border-purple-200 inline-block shadow-2xs object-contain bg-white"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                    )}
                  </div>

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
                                  placeholder={`Nội dung ý ${sLetter} (chữ, công thức hoặc dùng ảnh)...`}
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
                                  title="Tải ảnh hoặc dán URL ảnh cho đáp án này"
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

                              {/* Drawer for sub option image */}
                              {(isSubImgEditing || subOptImg) && (
                                <div className="pt-1.5 pl-7 pr-1 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs bg-purple-50/60 p-2 rounded">
                                <div className="flex-1 flex items-center gap-1.5">
                                  <input
                                    type="text"
                                    value={subOptImg || ''}
                                    onChange={(e) => {
                                      const nextSubs = [...subQuestions];
                                      const sub = { ...nextSubs[sIdx] };
                                      const imgs = sub.optionImages ? [...sub.optionImages] : [];
                                      while (imgs.length <= sOptIdx) imgs.push(undefined);
                                      imgs[sOptIdx] = e.target.value.trim() || undefined;
                                      sub.optionImages = imgs;
                                      nextSubs[sIdx] = sub;
                                      setSubQuestions(nextSubs);
                                    }}
                                    placeholder="Dán link ảnh đáp án hoặc tải tệp..."
                                    className="flex-1 px-2 py-0.5 text-xs bg-white border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-purple-600"
                                  />
                                  <label className="px-2 py-0.5 bg-white hover:bg-purple-100 text-purple-700 border border-purple-300 rounded text-xs font-semibold flex items-center gap-1 cursor-pointer shrink-0">
                                    <Upload className="w-3 h-3" />
                                    <span>Tải tệp</span>
                                    <input
                                      type="file"
                                      accept="image/*"
                                      className="hidden"
                                      onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) handleFileUploadSubOptImage(sIdx, sOptIdx, file);
                                        e.target.value = '';
                                      }}
                                    />
                                  </label>
                                </div>

                                {subOptImg && (
                                  <div className="flex items-center gap-2 shrink-0">
                                    <img
                                      src={subOptImg}
                                      alt={`Ảnh đáp án ${sLetter}`}
                                      className="h-10 w-auto max-w-[80px] rounded border border-purple-200 object-contain bg-white shadow-2xs"
                                      referrerPolicy="no-referrer"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const nextSubs = [...subQuestions];
                                        const sub = { ...nextSubs[sIdx] };
                                        if (sub.optionImages) {
                                          sub.optionImages[sOptIdx] = undefined;
                                        }
                                        nextSubs[sIdx] = sub;
                                        setSubQuestions(nextSubs);
                                      }}
                                      className="p-1 text-rose-600 hover:bg-rose-50 rounded cursor-pointer"
                                      title="Xóa ảnh đáp án"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                )}
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
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-purple-950">
                        Các đáp án được chấp nhận (cách nhau bởi dấu phẩy):
                      </label>
                      <span className="text-[11px] text-purple-700 font-medium">
                        Tự động chuẩn hóa dấu phẩy/chấm và chữ hoa/thường
                      </span>
                    </div>
                    <input
                      type="text"
                      value={(subQ.acceptedAnswers || []).join(', ')}
                      onChange={(e) => {
                        const nextSubs = [...subQuestions];
                        nextSubs[sIdx] = {
                          ...nextSubs[sIdx],
                          acceptedAnswers: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                        };
                        setSubQuestions(nextSubs);
                      }}
                      placeholder="Ví dụ: 3.14, 22/7, pi, x=2, BaCl2"
                      className="w-full px-3 py-2 text-xs font-mono bg-white border border-purple-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600"
                    />
                    <p className="text-[11px] text-slate-500">
                      * Thí sinh điền một trong các đáp án này sẽ đạt trọn vẹn điểm câu con ({subQ.points || 0.5} đ).
                    </p>
                  </div>
                )}
                </div>
              ))}
            </div>
          )}

          {/* Explanation */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Lời giải chi tiết
            </label>
            <textarea
              rows={3}
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              placeholder="Giải thích từng bước giúp người học hiểu rõ..."
              className="w-full p-3 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 leading-relaxed"
            />
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
    </div>
  );
};
