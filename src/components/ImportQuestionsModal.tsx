import React, { useEffect, useMemo, useState } from 'react';
import { Exam, Question, UserAccount } from '../types/exam';
import {
  X,
  Search,
  Lock,
  BookOpen,
  CheckCircle2,
  CheckSquare,
  Square,
  CopyPlus,
  Eye,
  EyeOff,
  User,
  Layers,
  AlertCircle,
} from 'lucide-react';
import { getAllExams, getAllSubjects, isCreatorOfItem } from '../utils/storage';
import { RichContentRenderer } from './RichContentRenderer';
import { MatchingQuestionView } from './MatchingQuestionView';
import {
  formatAcceptedShortAnswersList,
  formatTrueFalseScoringRule,
} from '../utils/scoring';

export function genFreshQuestionId(prefix = 'q'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
}

export function cloneQuestionWithFreshIds(src: Question, prefix = 'q'): Question {
  const newId = genFreshQuestionId(prefix);
  const cloned: Question = JSON.parse(JSON.stringify(src));
  cloned.id = newId;

  if (cloned.tfItems) {
    cloned.tfItems = cloned.tfItems.map((it, idx) => ({
      ...it,
      id: `${newId}_tf_${idx}_${Math.random().toString(36).substring(2, 4)}`,
    }));
  }

  if (cloned.matchingLeftItems || cloned.matchingRightItems) {
    const leftIdMap: Record<string, string> = {};
    const rightIdMap: Record<string, string> = {};
    cloned.matchingLeftItems = (cloned.matchingLeftItems || []).map((it, idx) => {
      const nextId = `${newId}_L_${idx}`;
      leftIdMap[it.id] = nextId;
      return { ...it, id: nextId };
    });
    cloned.matchingRightItems = (cloned.matchingRightItems || []).map((it, idx) => {
      const nextId = `${newId}_R_${idx}`;
      rightIdMap[it.id] = nextId;
      return { ...it, id: nextId };
    });
    if (cloned.matchingCorrectPairs) {
      const nextPairs: Record<string, string> = {};
      Object.entries(cloned.matchingCorrectPairs).forEach(([oldL, oldR]) => {
        const mappedL = leftIdMap[oldL] || oldL;
        const mappedR = rightIdMap[oldR] || oldR;
        nextPairs[mappedL] = mappedR;
      });
      cloned.matchingCorrectPairs = nextPairs;
    }
  }

  if (cloned.subQuestions) {
    cloned.subQuestions = cloned.subQuestions.map((sub, sIdx) =>
      cloneQuestionWithFreshIds(sub, `${newId}_sub${sIdx}`)
    );
  }

  return cloned;
}

interface ImportQuestionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentExamId?: string;
  currentUser: UserAccount | null;
  onImportQuestions: (clonedQuestions: Question[], sourceSummary: string) => void;
}

type ExamSourceFilter = 'all' | 'other_teachers' | 'mine' | 'system';

const QUESTION_TYPE_LABEL: Record<string, string> = {
  single_choice: 'Trắc nghiệm đơn',
  multiple_choice: 'Chọn nhiều đáp án',
  true_false: 'Đúng / Sai',
  text_input: 'Trả lời ngắn',
  matching: 'Ghép đôi',
  grouped: 'Câu hỏi chùm',
  essay: 'Tự luận',
};

export const ImportQuestionsModal: React.FC<ImportQuestionsModalProps> = ({
  isOpen,
  onClose,
  currentExamId,
  currentUser,
  onImportQuestions,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState<ExamSourceFilter>('all');
  const [selectedExamId, setSelectedExamId] = useState<string>('');
  const [selectedMap, setSelectedMap] = useState<{ [key: string]: Question }>({});
  const [showAnswers, setShowAnswers] = useState(true);

  const subjects = useMemo(() => (isOpen ? getAllSubjects() : []), [isOpen]);

  const classifyExamSource = (ex: Exam): 'mine' | 'other_teachers' | 'system' => {
    const hasExplicitCreator = Boolean(ex.creatorId || ex.creatorEmail || ex.isCustom);
    if (!hasExplicitCreator) return 'system';
    if (isCreatorOfItem(ex, currentUser)) return 'mine';
    return 'other_teachers';
  };

  const accessibleExams = useMemo(() => {
    if (!isOpen) return [];
    return getAllExams().filter((ex) => {
      if (currentExamId && ex.id === currentExamId) return false;
      if (!ex.questions || ex.questions.length === 0) return false;
      if (isCreatorOfItem(ex, currentUser)) return true;
      const vis = ex.visibility || 'public';
      return vis === 'public' && ex.status !== 'draft';
    });
  }, [isOpen, currentExamId, currentUser]);

  const filteredExams = useMemo(() => {
    const qLower = searchTerm.trim().toLowerCase();
    return accessibleExams.filter((ex) => {
      const src = classifyExamSource(ex);
      if (sourceFilter !== 'all' && src !== sourceFilter) return false;
      if (subjectFilter !== 'all' && ex.subject !== subjectFilter) return false;
      if (!qLower) return true;
      const inMeta =
        ex.title.toLowerCase().includes(qLower) ||
        (ex.creatorName || '').toLowerCase().includes(qLower) ||
        (ex.creatorEmail || '').toLowerCase().includes(qLower) ||
        (ex.grade || '').toLowerCase().includes(qLower);
      if (inMeta) return true;
      return ex.questions.some((q) => (q.question || '').toLowerCase().includes(qLower));
    });
  }, [accessibleExams, sourceFilter, subjectFilter, searchTerm, currentUser]);

  useEffect(() => {
    if (!isOpen) return;
    if (filteredExams.length > 0 && !filteredExams.some((e) => e.id === selectedExamId)) {
      setSelectedExamId(filteredExams[0].id);
    } else if (filteredExams.length === 0) {
      setSelectedExamId('');
    }
  }, [isOpen, filteredExams, selectedExamId]);

  useEffect(() => {
    if (!isOpen) {
      setSelectedMap({});
      setSearchTerm('');
      setSubjectFilter('all');
      setSourceFilter('all');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const activeExam = filteredExams.find((e) => e.id === selectedExamId) || filteredExams[0] || null;
  const activeSource = activeExam ? classifyExamSource(activeExam) : 'system';
  const activeExamQuestions = activeExam?.questions || [];

  const getKey = (examId: string, qId: string, qIdx: number) => `${examId}::${qId || qIdx}`;

  const selectedCount = Object.keys(selectedMap).length;
  const selectedInActiveExamCount = activeExam
    ? activeExamQuestions.filter((q, idx) => Boolean(selectedMap[getKey(activeExam.id, q.id, idx)])).length
    : 0;
  const allInActiveSelected =
    activeExamQuestions.length > 0 && selectedInActiveExamCount === activeExamQuestions.length;

  const toggleQuestion = (examId: string, q: Question, idx: number) => {
    const key = getKey(examId, q.id, idx);
    setSelectedMap((prev) => {
      const next = { ...prev };
      if (next[key]) {
        delete next[key];
      } else {
        next[key] = q;
      }
      return next;
    });
  };

  const toggleAllInActiveExam = () => {
    if (!activeExam) return;
    setSelectedMap((prev) => {
      const next = { ...prev };
      if (allInActiveSelected) {
        activeExamQuestions.forEach((q, idx) => {
          delete next[getKey(activeExam.id, q.id, idx)];
        });
      } else {
        activeExamQuestions.forEach((q, idx) => {
          next[getKey(activeExam.id, q.id, idx)] = q;
        });
      }
      return next;
    });
  };

  const handleConfirmImport = () => {
    const picked = Object.values(selectedMap);
    if (picked.length === 0) return;
    const cloned = picked.map((q) => cloneQuestionWithFreshIds(q, 'imp'));
    onImportQuestions(cloned, `${cloned.length} câu hỏi từ kho đề`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 font-sans">
      <div className="bg-white rounded-2xl max-w-6xl w-full h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between gap-4 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-blue-300 font-semibold mb-0.5">
              <CopyPlus className="w-4 h-4" />
              <span>Kho câu hỏi liên kết · Sao chép độc lập (Không chỉnh sửa đề gốc)</span>
            </div>
            <h2 className="text-base sm:text-lg font-extrabold truncate">
              Lấy câu hỏi từ các đề thi đã có của giáo viên khác & hệ thống
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white cursor-pointer shrink-0"
            title="Đóng cửa sổ"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter Toolbar */}
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[240px]">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Tìm tên đề, tên giáo viên hoặc nội dung câu..."
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <select
              value={subjectFilter}
              onChange={(e) => setSubjectFilter(e.target.value)}
              className="px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg font-medium text-slate-700"
            >
              <option value="all">Tất cả môn học</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>

            <div className="inline-flex p-0.5 bg-slate-200/80 rounded-lg text-xs">
              {(
                [
                  { id: 'all', label: 'Tất cả' },
                  { id: 'other_teachers', label: 'Đề GV khác' },
                  { id: 'mine', label: 'Đề của tôi' },
                  { id: 'system', label: 'Đề mẫu' },
                ] as { id: ExamSourceFilter; label: string }[]
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSourceFilter(tab.id)}
                  className={`px-2.5 py-1 rounded-md font-semibold cursor-pointer transition-colors whitespace-nowrap ${
                    sourceFilter === tab.id
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowAnswers((v) => !v)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border flex items-center gap-1.5 cursor-pointer shrink-0 ${
              showAnswers
                ? 'bg-emerald-600 text-white border-emerald-600'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
            }`}
          >
            {showAnswers ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            <span>{showAnswers ? 'Đang hiện đáp án' : 'Đang ẩn đáp án'}</span>
          </button>
        </div>

        {/* Main Split Pane */}
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12">
          {/* Left Pane: Exam List */}
          <div className="lg:col-span-4 border-b lg:border-b-0 lg:border-r border-slate-200 overflow-y-auto p-3 space-y-2 bg-slate-50/50 max-h-56 lg:max-h-none">
            {filteredExams.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500 space-y-2">
                <BookOpen className="w-8 h-8 text-slate-300 mx-auto" />
                <div>Không tìm thấy đề thi phù hợp trong kho.</div>
              </div>
            ) : (
              filteredExams.map((ex) => {
                const src = classifyExamSource(ex);
                const isActive = activeExam?.id === ex.id;
                const pickedInThis = ex.questions.filter((q, idx) =>
                  Boolean(selectedMap[getKey(ex.id, q.id, idx)])
                ).length;

                return (
                  <button
                    key={ex.id}
                    type="button"
                    onClick={() => setSelectedExamId(ex.id)}
                    className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer space-y-1.5 ${
                      isActive
                        ? 'bg-blue-50 border-blue-400 shadow-2xs'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs font-bold text-slate-900 line-clamp-2 leading-snug">
                        {ex.title}
                      </span>
                      {pickedInThis > 0 && (
                        <span className="px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-bold shrink-0">
                          +{pickedInThis}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                      <span className="inline-flex items-center gap-1 font-medium text-slate-700">
                        {src === 'other_teachers' ? (
                          <Lock className="w-3 h-3 text-amber-600 shrink-0" />
                        ) : (
                          <User className="w-3 h-3 text-slate-400 shrink-0" />
                        )}
                        <span className="truncate max-w-[150px]">
                          {src === 'system'
                            ? 'Hệ thống EduTest'
                            : src === 'mine'
                            ? 'Đề của bạn'
                            : ex.creatorName || ex.creatorEmail || 'Giáo viên khác'}
                        </span>
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono">{ex.questions.length} câu</span>
                      {ex.grade && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{ex.grade}</span>
                        </>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Right Pane: Question Selection */}
          <div className="lg:col-span-8 flex flex-col min-h-0 bg-white">
            {activeExam ? (
              <>
                <div className="px-5 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-white shrink-0">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-bold text-slate-900 truncate">
                        {activeExam.title}
                      </h3>
                      {activeSource === 'other_teachers' && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                          <Lock className="w-3 h-3" />
                          <span>Đề GV khác · Chỉ đọc (không thể sửa đề gốc)</span>
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Tác giả:{' '}
                      <strong className="text-slate-700">
                        {activeSource === 'system'
                          ? 'Hệ thống EduTest'
                          : activeExam.creatorName || activeExam.creatorEmail || 'Giáo viên'}
                      </strong>{' '}
                      · Đã chọn {selectedInActiveExamCount}/{activeExamQuestions.length} câu trong đề này
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={toggleAllInActiveExam}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border flex items-center gap-1.5 cursor-pointer shrink-0 ${
                      allInActiveSelected
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-slate-50 text-slate-800 border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    {allInActiveSelected ? (
                      <CheckSquare className="w-3.5 h-3.5" />
                    ) : (
                      <Square className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {allInActiveSelected ? 'Bỏ chọn tất cả đề này' : 'Chọn tất cả câu trong đề'}
                    </span>
                  </button>
                </div>

                {activeSource === 'other_teachers' && (
                  <div className="mx-5 mt-3 p-2.5 rounded-xl bg-amber-50/70 border border-amber-200 text-[11px] text-amber-900 flex items-center gap-2 shrink-0">
                    <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
                    <span>
                      Bạn chỉ có quyền xem và lấy câu hỏi sang đề thi của mình. Đề thi gốc của giáo viên{' '}
                      <strong>{activeExam.creatorName || activeExam.creatorEmail || 'khác'}</strong> luôn được bảo vệ và không bị thay đổi.
                    </span>
                  </div>
                )}

                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                  {activeExamQuestions.map((q, idx) => {
                    const key = getKey(activeExam.id, q.id, idx);
                    const isChecked = Boolean(selectedMap[key]);
                    return (
                      <div
                        key={key}
                        onClick={() => toggleQuestion(activeExam.id, q, idx)}
                        className={`p-4 rounded-xl border transition-all cursor-pointer space-y-2.5 ${
                          isChecked
                            ? 'bg-blue-50/60 border-blue-400 ring-1 ring-blue-300'
                            : 'bg-white border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`w-5 h-5 rounded flex items-center justify-center border shrink-0 ${
                                isChecked
                                  ? 'bg-blue-600 border-blue-600 text-white'
                                  : 'bg-white border-slate-300 text-transparent'
                              }`}
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            </span>
                            <span className="text-xs font-bold text-slate-900">Câu {idx + 1}</span>
                            <span className="text-[11px] text-slate-500">
                              · {QUESTION_TYPE_LABEL[q.type] || q.type} · {q.points || 1} điểm
                            </span>
                          </div>
                          <span className="text-[11px] font-semibold text-blue-700">
                            {isChecked ? 'Đã chọn' : 'Nhấp để chọn'}
                          </span>
                        </div>

                        <div className="text-sm text-slate-900">
                          <RichContentRenderer content={q.question} imageUrl={q.imageUrl} />
                        </div>

                        {(q.type === 'single_choice' || q.type === 'multiple_choice') && q.options && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
                            {q.options.map((opt, oIdx) => {
                              const letter = String.fromCharCode(65 + oIdx);
                              const isCorrect =
                                q.type === 'multiple_choice'
                                  ? (q.correctAnswers || []).includes(oIdx)
                                  : q.correctAnswer === oIdx;
                              return (
                                <div
                                  key={oIdx}
                                  className={`p-2 rounded-lg border text-xs flex items-start gap-2 ${
                                    showAnswers && isCorrect
                                      ? 'bg-emerald-50 border-emerald-300 text-emerald-950 font-semibold'
                                      : 'bg-slate-50 border-slate-200 text-slate-700'
                                  }`}
                                >
                                  <span className="font-bold shrink-0">{letter}.</span>
                                  <div className="flex-1 min-w-0">
                                    <RichContentRenderer content={opt} />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {q.type === 'true_false' && q.tfItems && (
                          <div className="space-y-1 pt-1">
                            <div className="text-[11px] text-emerald-700 font-medium">
                              {formatTrueFalseScoringRule(q)}
                            </div>
                            {q.tfItems.map((it, itIdx) => (
                              <div
                                key={it.id}
                                className="p-2 rounded-lg border border-slate-200 bg-slate-50 text-xs flex items-center justify-between gap-2"
                              >
                                <div className="flex items-start gap-1.5 flex-1">
                                  <span className="font-bold">{String.fromCharCode(97 + itIdx)})</span>
                                  <RichContentRenderer content={it.statement} />
                                </div>
                                {showAnswers && (
                                  <span
                                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                                      it.isCorrect
                                        ? 'bg-emerald-100 text-emerald-800'
                                        : 'bg-rose-100 text-rose-800'
                                    }`}
                                  >
                                    {it.isCorrect ? 'ĐÚNG' : 'SAI'}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        {q.type === 'text_input' && showAnswers && q.acceptedAnswers && (
                          <div className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg">
                            Đáp án: <strong>{formatAcceptedShortAnswersList(q.acceptedAnswers)}</strong>
                          </div>
                        )}

                        {q.type === 'matching' && (
                          <div onClick={(e) => e.stopPropagation()}>
                            <MatchingQuestionView
                              question={q}
                              mode="preview"
                              showSolutions={showAnswers}
                              hidePrompt={true}
                            />
                          </div>
                        )}

                        {q.type === 'grouped' && q.subQuestions && (
                          <div className="pl-3 border-l-2 border-purple-200 space-y-2 text-xs">
                            <div className="font-semibold text-purple-800 flex items-center gap-1">
                              <Layers className="w-3.5 h-3.5" />
                              <span>Bao gồm {q.subQuestions.length} câu hỏi nhỏ bên trong</span>
                            </div>
                          </div>
                        )}

                        {q.type === 'essay' && showAnswers && q.sampleAnswer && (
                          <div className="text-xs text-emerald-900 bg-emerald-50 border border-emerald-200 p-2.5 rounded-lg">
                            <strong>Gợi ý đáp án:</strong>{' '}
                            <RichContentRenderer content={q.sampleAnswer} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400 text-xs space-y-2">
                <BookOpen className="w-10 h-10 text-slate-300" />
                <span>Chọn một đề thi ở danh sách bên trái để xem và lấy câu hỏi.</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-600">
            Đã chọn tổng cộng{' '}
            <strong className="text-slate-900 font-mono text-sm">{selectedCount}</strong> câu hỏi từ kho đề
            {selectedCount > 0 && (
              <button
                type="button"
                onClick={() => setSelectedMap({})}
                className="ml-3 text-rose-600 hover:underline font-semibold cursor-pointer"
              >
                Bỏ chọn hết
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 text-xs font-semibold cursor-pointer"
            >
              Đóng
            </button>
            <button
              type="button"
              disabled={selectedCount === 0}
              onClick={handleConfirmImport}
              className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors ${
                selectedCount > 0
                  ? 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer shadow-xs'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              <CopyPlus className="w-4 h-4" />
              <span>Nhập {selectedCount} câu vào đề đang soạn</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
