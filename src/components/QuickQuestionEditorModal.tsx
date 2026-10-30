import React, { useState, useEffect } from 'react';
import { Question, QuestionType, TrueFalseItem } from '../types/exam';
import { X, Save, Trash2, Plus, Sparkles, Image as ImageIcon, Upload } from 'lucide-react';
import { MathToolbar } from './MathToolbar';
import { RichContentRenderer } from './RichContentRenderer';

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
  const [acceptedAnswers, setAcceptedAnswers] = useState<string[]>(
    question.acceptedAnswers ? [...question.acceptedAnswers] : ['']
  );
  const [activeOptImgEdit, setActiveOptImgEdit] = useState<number | null>(null);
  const [preview, setPreview] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  useEffect(() => {
    setQText(question.question);
    setPoints(question.points || 1.0);
    setTopic(question.topic || '');
    setExplanation(question.explanation || '');
    setOptions(question.options ? [...question.options] : []);
    setOptionImages(question.optionImages ? [...question.optionImages] : []);
    setCorrectAnswer(question.correctAnswer ?? 0);
    setTfItems(question.tfItems ? JSON.parse(JSON.stringify(question.tfItems)) : []);
    setAcceptedAnswers(question.acceptedAnswers ? [...question.acceptedAnswers] : ['']);
    setActiveOptImgEdit(null);
    setErrorMessage(null);
    setIsConfirmingDelete(false);
  }, [question]);

  const handleSave = () => {
    if (!qText.trim()) {
      setErrorMessage('Nội dung câu hỏi không được để trống!');
      return;
    }

    const updated: Question = {
      ...question,
      question: qText.trim(),
      points: Number(points) || 1.0,
      topic: topic.trim() || undefined,
      explanation: explanation.trim() || 'Xem lại kiến thức trọng tâm.',
      options: question.type === 'single_choice' ? options : question.options,
      optionImages: question.type === 'single_choice' ? optionImages : question.optionImages,
      correctAnswer: question.type === 'single_choice' ? correctAnswer : question.correctAnswer,
      tfItems: question.type === 'true_false' ? tfItems : question.tfItems,
      acceptedAnswers:
        question.type === 'text_input'
          ? acceptedAnswers.map((a) => a.trim()).filter(Boolean)
          : question.acceptedAnswers,
    };

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
              className="w-full p-3 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 leading-relaxed"
            />

            {preview && (
              <div className="mt-2 p-3 bg-blue-50/50 border border-blue-100 rounded-xl text-sm">
                <div className="text-[11px] font-bold text-blue-700 uppercase mb-1">Xem trước:</div>
                <RichContentRenderer content={qText} />
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
                                  if (file) {
                                    const reader = new FileReader();
                                    reader.onload = (ev) => {
                                      const dataUrl = ev.target?.result as string;
                                      if (dataUrl) {
                                        const nextImgs = [...optionImages];
                                        while (nextImgs.length <= idx) nextImgs.push(undefined);
                                        nextImgs[idx] = dataUrl;
                                        setOptionImages(nextImgs);
                                      }
                                    };
                                    reader.readAsDataURL(file);
                                  }
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
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold text-slate-700">
                  Các ý Đúng / Sai:
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

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="py-2 px-4 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
            >
              Đóng
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="py-2 px-5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Lưu thay đổi</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
