import React, { useEffect, useRef, useState } from 'react';
import { Exam, Question, QuestionType, SubjectType, TrueFalseItem, TrueFalseScoringMode, ExamVisibility, ExamStatus } from '../types/exam';
import type { UnsavedNavigationGuard } from './UnsavedChangesModal';
import { 
  Plus, 
  Trash2, 
  Save, 
  FileText, 
  Code, 
  Download, 
  Upload, 
  AlertCircle, 
  CheckCircle2, 
  ArrowLeft,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Shuffle,
  BookOpen,
  HelpCircle,
  Globe,
  Lock,
  Layers,
  Calendar,
  ShieldAlert,
  X,
  Users,
  CopySlash,
  EyeClosed,
  CheckSquare,
  Clock,
  ArrowUp,
  ArrowDown,
  Copy,
  CopyPlus,
  FilePlus2,
  Edit3
} from 'lucide-react';
import {
  DEFAULT_QUESTION_TYPE_ORDER,
  QUESTION_TYPE_CLUSTER_META,
  formatAcceptedShortAnswersList,
  formatShortAnswerDecimalComma,
  formatTrueFalseScoringRule,
  normalizeQuestionTypeOrder,
  parseAcceptedShortAnswers,
  toRomanNumeral,
} from '../utils/scoring';
import { MathToolbar } from './MathToolbar';
import { RichContentRenderer } from './RichContentRenderer';
import { MatchingQuestionEditor } from './MatchingQuestionEditor';
import { MatchingQuestionView } from './MatchingQuestionView';
import { ExamPreviewModal } from './ExamPreviewModal';
import { ImportQuestionsModal, cloneQuestionWithFreshIds } from './ImportQuestionsModal';
import { createDefaultMatchingData } from '../utils/matching';
import {
  getAllClassrooms,
  getAllSubjects,
  generate8DigitExamCode,
  saveCustomExam,
  getCurrentUser,
  getVisibleClassrooms,
  syncClassAssignmentForItem,
} from '../utils/storage';
import { processImageFile } from '../utils/imageUpload';
import { uploadImageOrKeepFallback } from '../utils/courseMedia';
import { ResilientImage } from './ResilientImage';
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

interface ExamCreatorDraftPayload {
  title: string;
  examCode: string;
  randomQuestionCount: number;
  subject: SubjectType;
  isCustomSubject: boolean;
  customSubjectName: string;
  grade: string;
  durationMinutes: number;
  description: string;
  instructions: string;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  groupByQuestionType: boolean;
  questionTypeOrder: QuestionType[];
  visibility: ExamVisibility;
  assignedClassId: string;
  status: ExamStatus;
  openTime: string;
  closeTime: string;
  maxAttempts: number;
  maxTabSwitches: number;
  modeType: 'both' | 'exam_only' | 'practice_only';
  allowCopy: boolean;
  showAnswersAfterExam: boolean;
  showLiveScoreDuringExam: boolean;
  showScoreAfterExam: boolean;
  lockExitUntilTimeout: boolean;
  showOnlyStudentAnswersAfterExam: boolean;
  minSubmitMinutes: number;
  requireAccessCode: boolean;
  accessSecurityCode: string;
  teacherMode: 'normal' | 'creator' | 'grading' | 'presenting';
  isOfficialClassExam: boolean;
  preExamLockMinutes: number;
  allowExitAfterSubmit: boolean;
  activeTab: 'manual' | 'quickImport' | 'json';
  questions: Question[];
  rawText: string;
  baselineSnapshot?: string;
}

function readExamCreatorDraft(draftKey: string): ExamCreatorDraftPayload | null {
  try {
    const raw = sessionStorage.getItem(draftKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.questions)) {
      return parsed as ExamCreatorDraftPayload;
    }
  } catch {
    // ignore storage errors
  }
  return null;
}

function sanitizeQuestionByActiveType(q: Question): Question {
  const cleaned: Question = {
    id: q.id,
    type: q.type,
    points: q.points,
    question: q.question,
    imageUrl: q.imageUrl,
    imageCaption: q.imageCaption?.trim() || undefined,
    explanation: q.explanation,
    explanationImageUrl: q.explanationImageUrl?.trim() || undefined,
    explanationImageCaption: q.explanationImageCaption?.trim() || undefined,
    topic: q.topic,
    difficulty: q.difficulty,
    caseSensitive: q.caseSensitive,
  };

  if (q.type === 'single_choice' || q.type === 'multiple_choice') {
    cleaned.options = q.options;
    cleaned.optionImages = q.optionImages;
    cleaned.correctAnswer = q.type === 'single_choice' ? q.correctAnswer : undefined;
    cleaned.correctAnswers = q.type === 'multiple_choice' ? q.correctAnswers : undefined;
  } else if (q.type === 'true_false') {
    cleaned.tfItems = q.tfItems;
    cleaned.tfScoringMode = q.tfScoringMode;
    cleaned.tfTierPoints = q.tfTierPoints;
  } else if (q.type === 'text_input') {
    cleaned.acceptedAnswers = parseAcceptedShortAnswers((q.acceptedAnswers || []).join('; '));
  } else if (q.type === 'essay') {
    cleaned.sampleAnswer = q.sampleAnswer;
  } else if (q.type === 'matching') {
    cleaned.matchingLeftLabelStyle = q.matchingLeftLabelStyle;
    cleaned.matchingRightLabelStyle = q.matchingRightLabelStyle;
    cleaned.matchingLeftItems = q.matchingLeftItems;
    cleaned.matchingRightItems = q.matchingRightItems;
    cleaned.matchingCorrectPairs = q.matchingCorrectPairs;
  } else if (q.type === 'grouped') {
    cleaned.subQuestions = (q.subQuestions || []).map((sub) => {
      const normalizedSub: Question =
        sub.type === 'text_input'
          ? {
              ...sub,
              acceptedAnswers: parseAcceptedShortAnswers((sub.acceptedAnswers || []).join('; ')),
            }
          : { ...sub };
      const subMap = buildQuestionInlineImagesMap(normalizedSub);
      return {
        ...normalizedSub,
        imageCaption: normalizedSub.imageCaption?.trim() || undefined,
        explanationImageUrl: normalizedSub.explanationImageUrl?.trim() || undefined,
        explanationImageCaption: normalizedSub.explanationImageCaption?.trim() || undefined,
        inlineImages: subMap,
      };
    });
  }

  cleaned.inlineImages = buildQuestionInlineImagesMap(cleaned);
  return cleaned;
}

function genFreshQuestionId(prefix = 'q'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
}

function applyPreviousQuestionFormat(prevQ: Question, existingTarget?: Question): Question {
  const newId = existingTarget?.id || genFreshQuestionId('q');
  const next: Question = {
    id: newId,
    type: prevQ.type || 'single_choice',
    points: prevQ.points || 1.0,
    question: existingTarget?.question || '',
    imageUrl: existingTarget?.imageUrl,
    explanation: existingTarget?.explanation || '',
    topic: existingTarget?.topic || prevQ.topic || '',
    difficulty: prevQ.difficulty || 'medium',
    caseSensitive: prevQ.caseSensitive,
  };

  if (next.type === 'single_choice' || next.type === 'multiple_choice') {
    const optCount = Math.max(2, prevQ.options?.length || 4);
    next.options = Array.from({ length: optCount }, () => '');
    if (next.type === 'single_choice') {
      next.correctAnswer = 0;
    } else {
      next.correctAnswers = [];
    }
  } else if (next.type === 'true_false') {
    const count = Math.max(1, prevQ.tfItems?.length || 4);
    next.tfScoringMode = prevQ.tfScoringMode || 'standard_ministry';
    next.tfTierPoints = prevQ.tfTierPoints ? [...prevQ.tfTierPoints] : [0.1, 0.25, 0.5, 1.0];
    next.tfItems = Array.from({ length: count }, (_, i) => ({
      id: `${newId}_tf_${i}`,
      statement: '',
      isCorrect: prevQ.tfItems?.[i]?.isCorrect ?? (i % 2 === 0),
      points: prevQ.tfItems?.[i]?.points,
    }));
  } else if (next.type === 'text_input') {
    next.acceptedAnswers = [''];
  } else if (next.type === 'essay') {
    next.sampleAnswer = '';
  } else if (next.type === 'matching') {
    const leftCount = Math.max(1, prevQ.matchingLeftItems?.length || 3);
    const rightCount = Math.max(leftCount, prevQ.matchingRightItems?.length || 4);
    next.matchingLeftLabelStyle = prevQ.matchingLeftLabelStyle || 'number';
    next.matchingRightLabelStyle = prevQ.matchingRightLabelStyle || 'upper_alpha';
    next.matchingLeftItems = Array.from({ length: leftCount }, (_, i) => ({
      id: `${newId}_L_${i}`,
      content: '',
    }));
    next.matchingRightItems = Array.from({ length: rightCount }, (_, i) => ({
      id: `${newId}_R_${i}`,
      content: '',
    }));
    next.matchingCorrectPairs = {};
  } else if (next.type === 'grouped') {
    const subs = prevQ.subQuestions && prevQ.subQuestions.length > 0 ? prevQ.subQuestions : [];
    next.subQuestions = subs.length > 0
      ? subs.map((s, sIdx) => ({
          ...applyPreviousQuestionFormat(s),
          id: `${newId}_sub${sIdx}`,
        }))
      : [
          {
            id: `${newId}_sub0`,
            type: 'single_choice',
            points: 0.5,
            question: '',
            options: ['', '', '', ''],
            correctAnswer: 0,
            explanation: '',
          },
        ];
  }

  return next;
}

interface CustomExamCreatorProps {
  initialExam?: Exam | null;
  onSave: (exam: Exam) => void;
  onCancel: () => void;
  onRegisterUnsavedGuard?: (guard: UnsavedNavigationGuard | null) => void;
}

export const CustomExamCreator: React.FC<CustomExamCreatorProps> = ({
  initialExam,
  onSave,
  onCancel,
  onRegisterUnsavedGuard,
}) => {
  const isEditing = Boolean(initialExam);
  const currentUser = getCurrentUser();
  const availableClassrooms = getVisibleClassrooms(getAllClassrooms(), currentUser);
  const availableSubjects = getAllSubjects();

  const draftStorageKey = `edutest_exam_creator_draft_${initialExam?.id || 'new'}`;
  const restoredDraftRef = useRef<ExamCreatorDraftPayload | null | undefined>(undefined);
  if (restoredDraftRef.current === undefined) {
    restoredDraftRef.current = readExamCreatorDraft(draftStorageKey);
  }
  const restoredDraft = restoredDraftRef.current;

  const [title, setTitle] = useState(restoredDraft?.title ?? initialExam?.title ?? '');
  const [examCode, setExamCode] = useState<string>(
    restoredDraft?.examCode ?? initialExam?.examCode ?? generate8DigitExamCode()
  );
  const [randomQuestionCount, setRandomQuestionCount] = useState<number>(
    restoredDraft?.randomQuestionCount ?? initialExam?.randomQuestionCount ?? 0
  );
  const [savedQuestionBadgeIndex, setSavedQuestionBadgeIndex] = useState<number | null>(null);

  const [subject, setSubject] = useState<SubjectType>(
    restoredDraft?.subject ?? initialExam?.subject ?? 'math'
  );
  const [isCustomSubject, setIsCustomSubject] = useState<boolean>(() => {
    if (restoredDraft) return restoredDraft.isCustomSubject;
    if (!initialExam?.subject) return false;
    return !availableSubjects.some((s) => s.id === initialExam.subject);
  });
  const [customSubjectName, setCustomSubjectName] = useState<string>(() => {
    if (restoredDraft) return restoredDraft.customSubjectName;
    if (!initialExam?.subject) return '';
    return availableSubjects.some((s) => s.id === initialExam.subject) ? '' : initialExam.subject;
  });

  const [grade, setGrade] = useState(restoredDraft?.grade ?? initialExam?.grade ?? '');
  const [durationMinutes, setDurationMinutes] = useState(
    restoredDraft?.durationMinutes ?? initialExam?.durationMinutes ?? 45
  );
  const [description, setDescription] = useState(
    restoredDraft?.description ?? initialExam?.description ?? ''
  );
  const [instructions, setInstructions] = useState(
    restoredDraft?.instructions ?? initialExam?.instructions ?? ''
  );
  const [shuffleQuestions, setShuffleQuestions] = useState(
    restoredDraft?.shuffleQuestions ?? Boolean(initialExam?.settings?.shuffleQuestions)
  );
  const [shuffleOptions, setShuffleOptions] = useState(
    restoredDraft?.shuffleOptions ?? Boolean(initialExam?.settings?.shuffleOptions)
  );
  const [groupByQuestionType, setGroupByQuestionType] = useState(
    restoredDraft?.groupByQuestionType ?? Boolean(initialExam?.settings?.groupByQuestionType)
  );
  const [questionTypeOrder, setQuestionTypeOrder] = useState<QuestionType[]>(() =>
    restoredDraft?.questionTypeOrder ?? normalizeQuestionTypeOrder(initialExam?.settings?.questionTypeOrder)
  );

  // New features: Visibility, Status, Scheduling, Limits, Mode, Security
  const [visibility, setVisibility] = useState<ExamVisibility>(
    restoredDraft?.visibility ?? initialExam?.visibility ?? 'public'
  );
  const [assignedClassId, setAssignedClassId] = useState<string>(
    restoredDraft?.assignedClassId ?? initialExam?.assignedClassId ?? (availableClassrooms[0]?.id || '')
  );
  const [status, setStatus] = useState<ExamStatus>(
    restoredDraft?.status ?? initialExam?.status ?? 'open'
  );
  const [openTime, setOpenTime] = useState(restoredDraft?.openTime ?? initialExam?.openTime ?? '');
  const [closeTime, setCloseTime] = useState(restoredDraft?.closeTime ?? initialExam?.closeTime ?? '');
  const [maxAttempts, setMaxAttempts] = useState<number>(
    restoredDraft?.maxAttempts ?? initialExam?.maxAttempts ?? 0
  );
  const [maxTabSwitches, setMaxTabSwitches] = useState<number>(
    restoredDraft?.maxTabSwitches ?? initialExam?.maxTabSwitches ?? 0
  );

  // Mode: Exam vs Practice
  const [modeType, setModeType] = useState<'both' | 'exam_only' | 'practice_only'>(
    restoredDraft?.modeType ?? initialExam?.modeType ?? 'both'
  );

  // Anti-copy
  const [allowCopy, setAllowCopy] = useState<boolean>(
    restoredDraft?.allowCopy ?? initialExam?.allowCopy ?? initialExam?.settings?.allowCopy ?? false
  );

  // Answers & Score display toggles
  const [showAnswersAfterExam, setShowAnswersAfterExam] = useState<boolean>(
    restoredDraft?.showAnswersAfterExam ??
      initialExam?.showAnswersAfterExam ??
      initialExam?.settings?.showAnswersAfterExam ??
      true
  );
  const [showLiveScoreDuringExam, setShowLiveScoreDuringExam] = useState<boolean>(
    restoredDraft?.showLiveScoreDuringExam ??
      initialExam?.showLiveScoreDuringExam ??
      initialExam?.settings?.showLiveScoreDuringExam ??
      false
  );
  const [showScoreAfterExam, setShowScoreAfterExam] = useState<boolean>(
    restoredDraft?.showScoreAfterExam ??
      initialExam?.showScoreAfterExam ??
      initialExam?.settings?.showScoreAfterExam ??
      true
  );

  // Strict exam room controls & candidate code restrictions
  const [lockExitUntilTimeout, setLockExitUntilTimeout] = useState<boolean>(
    restoredDraft?.lockExitUntilTimeout ?? initialExam?.lockExitUntilTimeout ?? false
  );
  const [showOnlyStudentAnswersAfterExam, setShowOnlyStudentAnswersAfterExam] = useState<boolean>(
    restoredDraft?.showOnlyStudentAnswersAfterExam ?? initialExam?.showOnlyStudentAnswersAfterExam ?? false
  );
  const [minSubmitMinutes, setMinSubmitMinutes] = useState<number>(
    restoredDraft?.minSubmitMinutes ?? initialExam?.minSubmitMinutes ?? 0
  );
  const [requireAccessCode, setRequireAccessCode] = useState<boolean>(
    restoredDraft?.requireAccessCode ?? initialExam?.requireAccessCode ?? false
  );
  const [accessSecurityCode, setAccessSecurityCode] = useState<string>(
    restoredDraft?.accessSecurityCode ?? initialExam?.accessSecurityCode ?? ''
  );
  const [teacherMode, setTeacherMode] = useState<'normal' | 'creator' | 'grading' | 'presenting'>(
    restoredDraft?.teacherMode ??
      initialExam?.teacherMode ??
      (initialExam?.visibility === 'private' || initialExam?.isCreatorOnlyMode ? 'creator' : 'normal')
  );
  const [isOfficialClassExam, setIsOfficialClassExam] = useState<boolean>(
    restoredDraft?.isOfficialClassExam ?? Boolean(initialExam?.isOfficialClassExam)
  );
  const [preExamLockMinutes, setPreExamLockMinutes] = useState<number>(
    restoredDraft?.preExamLockMinutes ?? initialExam?.preExamLockMinutes ?? 5
  );
  const [allowExitAfterSubmit, setAllowExitAfterSubmit] = useState<boolean>(
    restoredDraft?.allowExitAfterSubmit ?? initialExam?.allowExitAfterSubmit ?? false
  );
  const [inPlaceSaveToast, setInPlaceSaveToast] = useState<string | null>(null);
  const [isImportQuestionsOpen, setIsImportQuestionsOpen] = useState(false);

  // Active option image editor toggle (which question index & option index is open for image editing)
  const [activeOptImgEdit, setActiveOptImgEdit] = useState<{ qIdx: number; optIdx: number } | null>(null);
  const [activeSubOptImgEdit, setActiveSubOptImgEdit] = useState<{ qIdx: number; subIdx: number; optIdx: number } | null>(null);

  const [activeTab, setActiveTab] = useState<'manual' | 'quickImport' | 'json'>(
    restoredDraft?.activeTab ?? 'manual'
  );

  // Manual questions list
  const [questions, setQuestions] = useState<Question[]>(() => {
    if (restoredDraft?.questions && restoredDraft.questions.length > 0) {
      return restoredDraft.questions;
    }
    if (initialExam?.questions && initialExam.questions.length > 0) {
      return JSON.parse(JSON.stringify(initialExam.questions));
    }
    return [
      {
        id: 'q1',
        type: 'single_choice',
        points: 1.0,
        question: '',
        options: ['', '', '', ''],
        correctAnswer: 0,
        explanation: '',
        topic: '',
        difficulty: 'easy',
      },
    ];
  });

  const [previewMap, setPreviewMap] = useState<{ [qId: string]: boolean }>({});
  const isPreviewVisible = (qId: string) => previewMap[qId] !== false;
  const [isFullPreviewOpen, setIsFullPreviewOpen] = useState(false);
  const questionCardRefs = React.useRef<{ [qId: string]: HTMLDivElement | null }>({});
  const fieldTextareaRefs = React.useRef<{ [key: string]: EditableTextElement | null }>({});
  const [cursorImageModal, setCursorImageModal] = useState<{
    isOpen: boolean;
    qIdx: number;
    subIdx?: number;
    field: 'question' | 'sampleAnswer' | 'explanation' | 'subQuestion' | 'subExplanation';
    initialImageSrc: string;
    targetEl: EditableTextElement | null;
    range: { start: number; end: number } | null;
    targetLabel: string;
  } | null>(null);
  const [jsonText, setJsonText] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [successNotice, setSuccessNotice] = useState('');

  const [rawText, setRawText] = useState(restoredDraft?.rawText ?? '');

  const handleTogglePreview = (id: string) => {
    setPreviewMap((prev) => ({ ...prev, [id]: !(prev[id] !== false) }));
  };

  const handleInsertSnippet = (qIndex: number, snippet: string) => {
    const targetQ = questions[qIndex];
    setQuestions((prev) => {
      const next = [...prev];
      const cur = next[qIndex].question;
      const isBlock = snippet.trim().startsWith('|') || snippet.includes('\n');
      next[qIndex] = {
        ...next[qIndex],
        question: cur ? (isBlock ? `${cur}\n${snippet}` : `${cur} ${snippet}`) : snippet,
      };
      return next;
    });
    if (targetQ) {
      setPreviewMap((prev) => ({ ...prev, [targetQ.id]: true }));
    }
  };

  // Add empty manual question
  const handleAddQuestion = (type: QuestionType = 'single_choice') => {
    const newId = genFreshQuestionId('q');
    let newQ: Question = {
      id: newId,
      type,
      points: 1.0,
      question: '',
      explanation: '',
      topic: 'Tổng quát',
      difficulty: 'medium',
    };

    if (type === 'single_choice') {
      newQ.options = ['', '', '', ''];
      newQ.correctAnswer = 0;
    } else if (type === 'true_false') {
      newQ.tfScoringMode = 'standard_ministry';
      newQ.tfTierPoints = [0.1, 0.25, 0.5, 1.0];
      newQ.tfItems = [
        { id: newId + '_a', statement: '', isCorrect: true },
        { id: newId + '_b', statement: '', isCorrect: false },
        { id: newId + '_c', statement: '', isCorrect: true },
        { id: newId + '_d', statement: '', isCorrect: false },
      ];
    } else if (type === 'text_input') {
      newQ.acceptedAnswers = [''];
    } else if (type === 'essay') {
      newQ.sampleAnswer = '';
    } else if (type === 'matching') {
      Object.assign(newQ, createDefaultMatchingData(newId));
    } else if (type === 'grouped') {
      newQ.subQuestions = [
        {
          id: newId + '_sub1',
          type: 'single_choice',
          points: 0.5,
          question: '',
          options: ['', '', '', ''],
          correctAnswer: 0,
          explanation: '',
        },
      ];
    }

    setQuestions([...questions, newQ]);
  };

  // Tạo bản sao cho câu hỏi (chèn ngay bên dưới câu gốc)
  const handleDuplicateQuestion = (qIdx: number) => {
    const source = questions[qIdx];
    if (!source) return;
    const cloned = cloneQuestionWithFreshIds(source);
    setQuestions((prev) => {
      const next = [...prev];
      next.splice(qIdx + 1, 0, cloned);
      return next;
    });
    setSuccessNotice(`✓ Đã tạo bản sao Câu ${qIdx + 1} thành Câu ${qIdx + 2}!`);
    setTimeout(() => setSuccessNotice(''), 3000);
  };

  // Copy định dạng của câu hỏi ngay trước đó áp dụng cho câu hiện tại (hoặc thêm câu mới giống câu cuối)
  const handleCopyFormatFromPrevious = (qIdx: number) => {
    if (qIdx <= 0 || !questions[qIdx - 1]) return;
    const prevQ = questions[qIdx - 1];
    const currentQ = questions[qIdx];
    const formatted = applyPreviousQuestionFormat(prevQ, currentQ);
    setQuestions((prev) => {
      const next = [...prev];
      next[qIdx] = formatted;
      return next;
    });
    setSuccessNotice(`✓ Đã sao chép định dạng từ Câu ${qIdx} sang Câu ${qIdx + 1}!`);
    setTimeout(() => setSuccessNotice(''), 3000);
  };

  const handleAddQuestionWithLastFormat = () => {
    if (questions.length === 0) {
      handleAddQuestion('single_choice');
      return;
    }
    const lastQ = questions[questions.length - 1];
    const nextQ = applyPreviousQuestionFormat(lastQ);
    setQuestions((prev) => [...prev, nextQ]);
    setSuccessNotice(`✓ Đã thêm Câu ${questions.length + 1} theo đúng định dạng Câu ${questions.length}!`);
    setTimeout(() => setSuccessNotice(''), 3000);
  };

  const handleUpdateQuestion = (index: number, updated: Partial<Question>) => {
    setQuestions((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...updated };
      return next;
    });
  };

  // Options helpers for single_choice
  const handleAddOption = (qIdx: number) => {
    const q = questions[qIdx];
    const opts = [...(q.options || []), ''];
    const imgs = q.optionImages ? [...q.optionImages, undefined] : undefined;
    handleUpdateQuestion(qIdx, { options: opts, optionImages: imgs });
  };

  const handleRemoveOption = (qIdx: number, optIdx: number) => {
    const q = questions[qIdx];
    if ((q.options || []).length <= 2) {
      setErrorMessage('Câu trắc nghiệm cần có ít nhất 2 phương án lựa chọn (A, B)!');
      return;
    }
    setErrorMessage('');
    const opts = (q.options || []).filter((_, i) => i !== optIdx);
    const imgs = q.optionImages ? q.optionImages.filter((_, i) => i !== optIdx) : undefined;
    let corr = q.correctAnswer || 0;
    if (corr >= opts.length) corr = opts.length - 1;
    handleUpdateQuestion(qIdx, { options: opts, optionImages: imgs, correctAnswer: corr });
  };

  const handleUpdateOption = (qIndex: number, optIndex: number, value: string) => {
    setQuestions((prev) => {
      const next = [...prev];
      const opts = [...(next[qIndex].options || [])];
      opts[optIndex] = value;
      next[qIndex] = { ...next[qIndex], options: opts };
      return next;
    });
  };

  const handleUpdateOptionImage = (qIndex: number, optIndex: number, url: string) => {
    setQuestions((prev) => {
      const next = [...prev];
      const q = { ...next[qIndex] };
      const imgs = q.optionImages ? [...q.optionImages] : [];
      while (imgs.length <= optIndex) {
        imgs.push(undefined);
      }
      imgs[optIndex] = url.trim() || undefined;
      q.optionImages = imgs;
      next[qIndex] = q;
      return next;
    });
  };

  useEffect(() => {
    questions.forEach((q) => {
      registerImplicitImagesMap(q.inlineImages);
      (q.subQuestions || []).forEach((sub) => registerImplicitImagesMap(sub.inlineImages));
    });
  }, [questions]);

  const appendInlineImageToQuestion = (qIndex: number, imgId: string, imgSrc: string) => {
    setQuestions((prev) => {
      const next = [...prev];
      const cur = next[qIndex];
      if (!cur) return prev;
      next[qIndex] = {
        ...cur,
        inlineImages: { ...(cur.inlineImages || {}), [imgId]: imgSrc },
      };
      return next;
    });
  };

  const openCursorImageModalForField = (
    qIdx: number,
    field: 'question' | 'sampleAnswer' | 'explanation' | 'subQuestion' | 'subExplanation',
    targetLabel: string,
    subIdx?: number,
    initialImageSrc: string = ''
  ) => {
    const key = subIdx !== undefined ? `${qIdx}_${subIdx}_${field}` : `${qIdx}_${field}`;
    const targetEl = fieldTextareaRefs.current[key] || null;
    const range = targetEl
      ? {
          start:
            typeof targetEl.selectionStart === 'number'
              ? targetEl.selectionStart
              : targetEl.value.length,
          end:
            typeof targetEl.selectionEnd === 'number'
              ? targetEl.selectionEnd
              : targetEl.value.length,
        }
      : null;
    setCursorImageModal({
      isOpen: true,
      qIdx,
      subIdx,
      field,
      initialImageSrc,
      targetEl,
      range,
      targetLabel,
    });
  };

  const handleTextareaPasteImage = async (
    e: React.ClipboardEvent<HTMLTextAreaElement | HTMLInputElement>,
    qIdx: number,
    field: 'question' | 'sampleAnswer' | 'explanation' | 'subQuestion' | 'subExplanation',
    targetLabel: string,
    subIdx?: number
  ) => {
    const pastedFile = extractImageFileFromClipboardEvent(e);
    if (!pastedFile) return;
    e.preventDefault();
    const el = e.currentTarget;
    const range = {
      start: typeof el.selectionStart === 'number' ? el.selectionStart : el.value.length,
      end: typeof el.selectionEnd === 'number' ? el.selectionEnd : el.value.length,
    };
    try {
      const compressed = await processImageFile(pastedFile, 1200, 0.85);
      const uploadedUrl = await uploadImageOrKeepFallback(compressed, pastedFile.name || 'exam_paste.png');
      setCursorImageModal({
        isOpen: true,
        qIdx,
        subIdx,
        field,
        initialImageSrc: uploadedUrl,
        targetEl: el,
        range,
        targetLabel,
      });
    } catch (err: any) {
      setErrorMessage(err?.message || 'Không thể xử lý ảnh vừa dán.');
    }
  };

  const handleConfirmCursorImageModal = (imageSrc: string, title: string) => {
    if (!cursorImageModal) return;
    const { qIdx, subIdx, field, targetEl, range } = cursorImageModal;
    const imgId = registerImplicitImage(imageSrc);
    const token = formatInlineImageToken(imgId, title);
    appendInlineImageToQuestion(qIdx, imgId, imageSrc);

    if (subIdx !== undefined) {
      setQuestions((prev) => {
        const next = [...prev];
        const q = next[qIdx];
        if (!q?.subQuestions?.[subIdx]) return prev;
        const subs = [...q.subQuestions];
        subs[subIdx] = {
          ...subs[subIdx],
          inlineImages: { ...(subs[subIdx].inlineImages || {}), [imgId]: imageSrc },
        };
        next[qIdx] = { ...q, subQuestions: subs };
        return next;
      });
    }

    if (targetEl && insertTextAtEditableElement(targetEl, token, range)) {
      setCursorImageModal(null);
      return;
    }

    setQuestions((prev) => {
      const next = [...prev];
      const q = next[qIdx];
      if (!q) return prev;
      if (field === 'question') {
        next[qIdx] = { ...q, question: q.question ? `${q.question}\n${token}` : token };
      } else if (field === 'sampleAnswer') {
        next[qIdx] = { ...q, sampleAnswer: q.sampleAnswer ? `${q.sampleAnswer}\n${token}` : token };
      } else if (field === 'explanation') {
        next[qIdx] = { ...q, explanation: q.explanation ? `${q.explanation}\n${token}` : token };
      } else if (subIdx !== undefined && q.subQuestions?.[subIdx]) {
        const subs = [...q.subQuestions];
        const sub = subs[subIdx];
        if (field === 'subQuestion') {
          subs[subIdx] = { ...sub, question: sub.question ? `${sub.question}\n${token}` : token };
        } else if (field === 'subExplanation') {
          subs[subIdx] = {
            ...sub,
            explanation: sub.explanation ? `${sub.explanation}\n${token}` : token,
          };
        }
        next[qIdx] = { ...q, subQuestions: subs };
      }
      return next;
    });
    setCursorImageModal(null);
  };

  const handleUpdateSubOptionImage = (qIdx: number, subIdx: number, optIdx: number, url: string) => {
    const nextSubs = [...(questions[qIdx].subQuestions || [])];
    const sub = { ...nextSubs[subIdx] };
    const imgs = sub.optionImages ? [...sub.optionImages] : [];
    while (imgs.length <= optIdx) {
      imgs.push(undefined);
    }
    imgs[optIdx] = url.trim() || undefined;
    sub.optionImages = imgs;
    nextSubs[subIdx] = sub;
    handleUpdateQuestion(qIdx, { subQuestions: nextSubs });
  };

  // True/False helpers
  const handleAddTfItem = (qIdx: number) => {
    const q = questions[qIdx];
    const items = [
      ...(q.tfItems || []),
      {
        id: 'tf_' + Date.now() + Math.random().toString(36).substring(2, 4),
        statement: '',
        isCorrect: true,
      },
    ];
    handleUpdateQuestion(qIdx, { tfItems: items });
  };

  const handleRemoveTfItem = (qIdx: number, itemIdx: number) => {
    const q = questions[qIdx];
    if ((q.tfItems || []).length <= 1) {
      setErrorMessage('Câu trắc nghiệm Đúng/Sai cần có ít nhất 1 ý mệnh đề!');
      return;
    }
    setErrorMessage('');
    const items = (q.tfItems || []).filter((_, i) => i !== itemIdx);
    handleUpdateQuestion(qIdx, { tfItems: items });
  };

  const handleUpdateTfItem = (qIdx: number, itemIdx: number, updated: Partial<TrueFalseItem>) => {
    const q = questions[qIdx];
    const items = [...(q.tfItems || [])];
    items[itemIdx] = { ...items[itemIdx], ...updated };
    handleUpdateQuestion(qIdx, { tfItems: items });
  };

  // Subquestions helpers for grouped
  const handleAddSubQuestion = (qIdx: number) => {
    const q = questions[qIdx];
    const subId = 'sub_' + Date.now();
    const subs = [
      ...(q.subQuestions || []),
      {
        id: subId,
        type: 'single_choice' as QuestionType,
        points: 0.5,
        question: '',
        options: ['', '', '', ''],
        correctAnswer: 0,
        explanation: '',
      },
    ];
    handleUpdateQuestion(qIdx, { subQuestions: subs });
  };

  const handleRemoveSubQuestion = (qIdx: number, subIdx: number) => {
    const q = questions[qIdx];
    const subs = (q.subQuestions || []).filter((_, i) => i !== subIdx);
    handleUpdateQuestion(qIdx, { subQuestions: subs });
  };

  const handleDeleteQuestion = (index: number) => {
    if (questions.length <= 1) {
      // If only 1 question remains, reset it to blank rather than blocking
      setQuestions([
        {
          id: 'q_' + Date.now(),
          type: 'single_choice',
          points: 1.0,
          question: '',
          options: ['', '', '', ''],
          correctAnswer: 0,
          explanation: '',
        },
      ]);
      setErrorMessage('Đã xóa trắng nội dung câu hỏi.');
      return;
    }
    setErrorMessage('');
    setQuestions(questions.filter((_, idx) => idx !== index));
  };

  // Parse raw text
  const handleParseRawText = () => {
    try {
      const text = rawText.trim();
      if (!text) {
        setErrorMessage('Vui lòng nhập văn bản đề thi để phân tích!');
        return;
      }

      const blocks = text.split(/(?=Câu\s+\d+[\s:.-])/gi).filter((b) => b.trim());
      const parsed: Question[] = [];

      for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i].trim();
        const newId = 'q_imp_' + Date.now() + '_' + i;

        // Check if True/False pattern (e.g. contains a) b) c) and "Đáp án: a: Đ, b: S")
        const isTf = /[a-d]\)\s/i.test(block) && /đáp\s*án\s*[:=\-]?\s*[a-d]\s*[:=\-]/i.test(block);

        if (isTf) {
          const qTextMatch = block.match(/^(?:Câu\s+\d+[\s:.-]+)([\s\S]*?)(?=[a-d]\))/i);
          const qText = qTextMatch ? qTextMatch[1].trim() : 'Xét tính Đúng/Sai của các mệnh đề sau:';

          const tfLines = block.match(/[a-d]\)\s*([^\n]+)/gi) || [];
          const tfItems: TrueFalseItem[] = tfLines.map((line, lIdx) => {
            const letter = line[0].toLowerCase();
            const statement = line.replace(/^[a-d]\)\s*/i, '').trim();
            const ansRegex = new RegExp(`${letter}\\s*[:=\\-]\\s*([đds])`, 'i');
            const match = block.match(ansRegex);
            const isCorrect = match ? ['đ', 'd', 't', 'true'].includes(match[1].toLowerCase()) : true;
            return {
              id: `${newId}_${letter}`,
              statement,
              isCorrect,
            };
          });

          parsed.push({
            id: newId,
            type: 'true_false',
            points: 1.0,
            question: qText,
            tfItems,
            explanation: 'Xem lại lý thuyết và các mệnh đề.',
            topic: 'Đúng / Sai',
            difficulty: 'medium',
          });
        } else {
          // Standard Single Choice
          const qMatch = block.match(/^(?:Câu\s+\d+[\s:.-]+)([\s\S]*?)(?=(?:[A-D]\.|\bĐáp án:))/i);
          const qText = qMatch ? qMatch[1].trim() : block.split('\n')[0].replace(/^Câu\s+\d+[\s:.-]*/i, '').trim();

          const optA = block.match(/[A][\s.:)\-]+([^\n]+)/i)?.[1]?.trim() || 'Phương án A';
          const optB = block.match(/[B][\s.:)\-]+([^\n]+)/i)?.[1]?.trim() || 'Phương án B';
          const optC = block.match(/[C][\s.:)\-]+([^\n]+)/i)?.[1]?.trim() || 'Phương án C';
          const optD = block.match(/[D][\s.:)\-]+([^\n]+)/i)?.[1]?.trim() || 'Phương án D';

          const ansMatch = block.match(/Đáp\s*án\s*[:=\-]?\s*([A-D])/i);
          let correctIdx = 0;
          if (ansMatch) {
            const letter = ansMatch[1].toUpperCase();
            if (letter === 'B') correctIdx = 1;
            else if (letter === 'C') correctIdx = 2;
            else if (letter === 'D') correctIdx = 3;
          }

          const expMatch = block.match(/(?:Lời giải|Giải thích|HD|Hướng dẫn giải)\s*[:=\-]?\s*([\s\S]*)$/i);
          const explanation = expMatch ? expMatch[1].trim() : 'Xem lại kiến thức trọng tâm.';

          parsed.push({
            id: newId,
            type: 'single_choice',
            points: 1.0,
            question: qText || `Câu hỏi ${i + 1}`,
            options: [optA, optB, optC, optD],
            correctAnswer: correctIdx,
            explanation,
            topic: 'Trắc nghiệm đơn',
            difficulty: 'medium',
          });
        }
      }

      if (parsed.length === 0) {
        setErrorMessage('Không nhận diện được câu hỏi nào. Vui lòng kiểm tra lại định dạng!');
        return;
      }

      setQuestions(parsed);
      setActiveTab('manual');
      setErrorMessage('');
      setSuccessNotice(`Đã nạp thành công ${parsed.length} câu hỏi vào đề!`);
      setTimeout(() => setSuccessNotice(''), 4000);
    } catch (err) {
      setErrorMessage('Lỗi khi phân tích: ' + String(err));
    }
  };

  const handleFinalSave = (stayInEditor: boolean = false): boolean => {
    if (!title.trim()) {
      setErrorMessage('Vui lòng nhập tên đề thi!');
      return false;
    }
    if (questions.length === 0) {
      setErrorMessage('Đề thi phải có ít nhất 1 câu hỏi!');
      return false;
    }

    // Calculate total points
    const totalPts = questions.reduce((acc, q) => acc + (q.points || 1.0), 0);
    const finalSubject = isCustomSubject ? (customSubjectName.trim() || 'Tổng hợp') : subject;
    const chosenClass = availableClassrooms.find((c) => c.id === assignedClassId);

    if (visibility === 'class' && !chosenClass) {
      setErrorMessage('Bạn chưa có lớp học nào để gán đề thi! Hãy tạo lớp học trong mục Lớp học hoặc chọn phạm vi hiển thị khác.');
      return false;
    }

    const sanitizedQuestions = questions.map((q) => sanitizeQuestionByActiveType(q));

      const newExam: Exam = {
      id: initialExam?.id || ('custom-' + Date.now()),
      title: title.trim(),
      subject: finalSubject,
      grade,
      durationMinutes: Number(durationMinutes) || 45,
      description: description.trim() || `Đề thi trắc nghiệm gồm ${sanitizedQuestions.length} câu hỏi.`,
      instructions: instructions.trim(),
      settings: {
        shuffleQuestions,
        shuffleOptions,
        groupByQuestionType,
        questionTypeOrder: groupByQuestionType ? questionTypeOrder : undefined,
        allowCopy,
        showAnswersAfterExam,
        showLiveScoreDuringExam,
        showScoreAfterExam,
      },
      questions: sanitizedQuestions,
      totalQuestions: sanitizedQuestions.length,
      totalPoints: Number(totalPts.toFixed(2)),
      createdAt: initialExam?.createdAt || new Date().toISOString().split('T')[0],
      isCustom: true,
      creatorId: initialExam?.creatorId || currentUser?.id,
      creatorEmail: initialExam?.creatorEmail || currentUser?.email,
      creatorName: initialExam?.creatorName || currentUser?.fullName,
      visibility,
      assignedClassId: visibility === 'class' ? assignedClassId : undefined,
      assignedClassName: visibility === 'class' ? (chosenClass?.name || 'Lớp riêng') : undefined,
      status,
      openTime: openTime ? openTime : undefined,
      closeTime: closeTime ? closeTime : undefined,
      modeType,
      maxAttempts: maxAttempts > 0 ? Number(maxAttempts) : undefined,
      maxTabSwitches: maxTabSwitches > 0 ? Number(maxTabSwitches) : undefined,
      allowCopy,
      showAnswersAfterExam,
      showOnlyStudentAnswersAfterExam,
      showLiveScoreDuringExam,
      showScoreAfterExam,
      lockExitUntilTimeout,
      minSubmitMinutes: Number(minSubmitMinutes) > 0 ? Number(minSubmitMinutes) : undefined,
      requireAccessCode,
      accessSecurityCode: requireAccessCode
        ? accessSecurityCode.trim() || Math.floor(100000 + Math.random() * 900000).toString()
        : undefined,
      examCode: examCode.trim() || generate8DigitExamCode(),
      randomQuestionCount: Number(randomQuestionCount) > 0 ? Number(randomQuestionCount) : undefined,
      teacherMode,
      isCreatorOnlyMode: teacherMode === 'creator' || visibility === 'private',
      isOfficialClassExam: visibility === 'class' ? isOfficialClassExam : false,
      preExamLockMinutes:
        visibility === 'class' && isOfficialClassExam
          ? Math.max(0, Number(preExamLockMinutes) || 0)
          : undefined,
      allowExitAfterSubmit:
        visibility === 'class' && isOfficialClassExam ? allowExitAfterSubmit : undefined,
    };

    if (newExam.visibility === 'class' && newExam.assignedClassId) {
      syncClassAssignmentForItem('exam', newExam.id, newExam.visibility, newExam.assignedClassId);
    }

    savedSnapshotRef.current = currentSnapshot;
    try {
      sessionStorage.removeItem(draftStorageKey);
    } catch {
      // ignore storage errors
    }
    if (stayInEditor) {
      saveCustomExam(newExam);
      const timeStr = new Date().toLocaleTimeString('vi-VN');
      setInPlaceSaveToast(`✓ Đã lưu đề thi thành công tại đây lúc ${timeStr}!`);
      setTimeout(() => setInPlaceSaveToast(null), 3500);
    } else {
      onSave(newExam);
    }
    return true;
  };

  const buildDraftExamObject = (): Exam => {
    const totalPts = questions.reduce((acc, q) => acc + (q.points || 1.0), 0);
    const finalSubject = isCustomSubject ? (customSubjectName.trim() || 'Tổng hợp') : subject;
    const chosenClass = availableClassrooms.find((c) => c.id === assignedClassId);
    const sanitizedQuestions = questions.map((q) => sanitizeQuestionByActiveType(q));

    return {
      id: initialExam?.id || ('draft-preview-' + Date.now()),
      title: title.trim() || 'Đề thi xem trước (Bản đang soạn)',
      subject: finalSubject,
      grade,
      durationMinutes: Number(durationMinutes) || 45,
      description: description.trim() || `Đề thi gồm ${sanitizedQuestions.length} câu hỏi.`,
      instructions: instructions.trim(),
      settings: {
        shuffleQuestions,
        shuffleOptions,
        groupByQuestionType,
        questionTypeOrder: groupByQuestionType ? questionTypeOrder : undefined,
        allowCopy,
        showAnswersAfterExam,
        showLiveScoreDuringExam,
        showScoreAfterExam,
      },
      questions: sanitizedQuestions,
      totalQuestions: sanitizedQuestions.length,
      totalPoints: Number(totalPts.toFixed(2)),
      createdAt: initialExam?.createdAt || new Date().toISOString().split('T')[0],
      isCustom: true,
      creatorId: initialExam?.creatorId || currentUser?.id,
      creatorEmail: initialExam?.creatorEmail || currentUser?.email,
      creatorName: initialExam?.creatorName || currentUser?.fullName,
      visibility,
      assignedClassId: visibility === 'class' ? assignedClassId : undefined,
      assignedClassName: visibility === 'class' ? (chosenClass?.name || 'Lớp riêng') : undefined,
      status,
      openTime: openTime ? openTime : undefined,
      closeTime: closeTime ? closeTime : undefined,
      modeType,
      maxAttempts: maxAttempts > 0 ? Number(maxAttempts) : undefined,
      maxTabSwitches: maxTabSwitches > 0 ? Number(maxTabSwitches) : undefined,
      allowCopy,
      showAnswersAfterExam,
      showOnlyStudentAnswersAfterExam,
      showLiveScoreDuringExam,
      showScoreAfterExam,
      lockExitUntilTimeout,
      minSubmitMinutes: Number(minSubmitMinutes) > 0 ? Number(minSubmitMinutes) : undefined,
      requireAccessCode,
      accessSecurityCode: requireAccessCode
        ? accessSecurityCode.trim() || Math.floor(100000 + Math.random() * 900000).toString()
        : undefined,
      examCode: examCode.trim() || generate8DigitExamCode(),
      randomQuestionCount: Number(randomQuestionCount) > 0 ? Number(randomQuestionCount) : undefined,
      teacherMode,
      isCreatorOnlyMode: teacherMode === 'creator' || visibility === 'private',
      isOfficialClassExam: visibility === 'class' ? isOfficialClassExam : false,
      preExamLockMinutes:
        visibility === 'class' && isOfficialClassExam
          ? Math.max(0, Number(preExamLockMinutes) || 0)
          : undefined,
      allowExitAfterSubmit:
        visibility === 'class' && isOfficialClassExam ? allowExitAfterSubmit : undefined,
    };
  };

  const currentSnapshot = JSON.stringify({
    title,
    subject,
    customSubjectName,
    grade,
    durationMinutes,
    description,
    instructions,
    shuffleQuestions,
    shuffleOptions,
    groupByQuestionType,
    questionTypeOrder,
    visibility,
    assignedClassId,
    status,
    openTime,
    closeTime,
    maxAttempts,
    maxTabSwitches,
    modeType,
    allowCopy,
    showAnswersAfterExam,
    showLiveScoreDuringExam,
    showScoreAfterExam,
    lockExitUntilTimeout,
    showOnlyStudentAnswersAfterExam,
    minSubmitMinutes,
    requireAccessCode,
    accessSecurityCode,
    teacherMode,
    isOfficialClassExam,
    preExamLockMinutes,
    allowExitAfterSubmit,
    randomQuestionCount,
    rawText,
    questions,
  });

  const savedSnapshotRef = useRef<string>(
    restoredDraft?.baselineSnapshot ?? currentSnapshot
  );
  const latestSnapshotRef = useRef<string>(currentSnapshot);
  latestSnapshotRef.current = currentSnapshot;
  const lastInitialExamIdRef = useRef<string | undefined>(initialExam?.id);

  const saveHandlerRef = useRef<() => boolean>(() => false);
  saveHandlerRef.current = () => handleFinalSave(true);

  useEffect(() => {
    if (lastInitialExamIdRef.current !== initialExam?.id) {
      lastInitialExamIdRef.current = initialExam?.id;
      savedSnapshotRef.current = latestSnapshotRef.current;
    }
  }, [initialExam?.id]);

  // Bảo toàn bản nháp khi re-render hoặc đổi chế độ tạm thời
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        if (latestSnapshotRef.current === savedSnapshotRef.current) {
          sessionStorage.removeItem(draftStorageKey);
          return;
        }
        const payload: ExamCreatorDraftPayload = {
          title,
          examCode,
          randomQuestionCount,
          subject,
          isCustomSubject,
          customSubjectName,
          grade,
          durationMinutes,
          description,
          instructions,
          shuffleQuestions,
          shuffleOptions,
          groupByQuestionType,
          questionTypeOrder,
          visibility,
          assignedClassId,
          status,
          openTime,
          closeTime,
          maxAttempts,
          maxTabSwitches,
          modeType,
          allowCopy,
          showAnswersAfterExam,
          showLiveScoreDuringExam,
          showScoreAfterExam,
          lockExitUntilTimeout,
          showOnlyStudentAnswersAfterExam,
          minSubmitMinutes,
          requireAccessCode,
          accessSecurityCode,
          teacherMode,
          isOfficialClassExam,
          preExamLockMinutes,
          allowExitAfterSubmit,
          activeTab,
          questions,
          rawText,
          baselineSnapshot: savedSnapshotRef.current,
        };
        sessionStorage.setItem(draftStorageKey, JSON.stringify(payload));
      } catch {
        // ignore quota errors
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [
    draftStorageKey,
    currentSnapshot,
    isCustomSubject,
    examCode,
    activeTab,
    rawText,
    title,
    randomQuestionCount,
    subject,
    customSubjectName,
    grade,
    durationMinutes,
    description,
    instructions,
    shuffleQuestions,
    shuffleOptions,
    groupByQuestionType,
    questionTypeOrder,
    visibility,
    assignedClassId,
    status,
    openTime,
    closeTime,
    maxAttempts,
    maxTabSwitches,
    modeType,
    allowCopy,
    showAnswersAfterExam,
    showLiveScoreDuringExam,
    showScoreAfterExam,
    lockExitUntilTimeout,
    showOnlyStudentAnswersAfterExam,
    minSubmitMinutes,
    requireAccessCode,
    accessSecurityCode,
    teacherMode,
    isOfficialClassExam,
    preExamLockMinutes,
    allowExitAfterSubmit,
    questions,
  ]);

  useEffect(() => {
    if (!onRegisterUnsavedGuard) return;
    onRegisterUnsavedGuard({
      title: isEditing ? 'Chưa lưu chỉnh sửa đề thi' : 'Đề thi đang soạn chưa được lưu',
      message:
        'Bạn đang soạn thảo nội dung đề thi. Bạn có muốn lưu lại đề thi trước khi chuyển sang mục khác không?',
      isDirty: () => latestSnapshotRef.current !== savedSnapshotRef.current,
      saveAndExit: () => saveHandlerRef.current(),
      discardChanges: () => {
        try {
          sessionStorage.removeItem(draftStorageKey);
        } catch {
          // ignore
        }
      },
    });
    return () => {
      onRegisterUnsavedGuard(null);
    };
  }, [onRegisterUnsavedGuard, isEditing, draftStorageKey]);

  const totalCalculatedPoints = questions.reduce((acc, q) => acc + (q.points || 1.0), 0);

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 sm:px-6 font-sans">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-6 border-b border-slate-200 mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={onCancel}
            className="p-2 text-slate-500 hover:text-slate-900 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            title="Quay lại"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <span>{isEditing ? 'Chỉnh sửa đề thi & câu hỏi' : 'Soạn thảo đề thi mới'}</span>
              {isEditing && (
                <span className="text-xs font-mono font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                  Chế độ sửa
                </span>
              )}
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              {isEditing
                ? 'Bạn có toàn quyền viết thêm, sửa đổi nội dung, công thức, đáp án hoặc xóa bớt câu hỏi.'
                : 'Hỗ trợ trắc nghiệm đơn, Đúng/Sai từng ý, trả lời ngắn, ghép đôi, câu hỏi chùm và tự luận soạn thảo'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setIsFullPreviewOpen(true)}
            className="py-2.5 px-4 text-xs sm:text-sm font-semibold text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
            title="Xem trước toàn bộ đề thi kèm đáp án và lời giải chi tiết"
          >
            <Eye className="w-4 h-4 text-blue-600" />
            <span>Xem trước toàn bộ đề ({questions.length} câu)</span>
          </button>

          <button
            onClick={() => handleFinalSave(false)}
            className="py-2.5 px-5 text-xs sm:text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>{isEditing ? 'Lưu thay đổi đề thi' : 'Lưu & Xuất bản đề thi'}</span>
          </button>
        </div>
      </div>

      {/* Notices */}
      {errorMessage && (
        <div className="mb-6 p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs sm:text-sm flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}
      {successNotice && (
        <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs sm:text-sm flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
          <span>{successNotice}</span>
        </div>
      )}

      {/* General Settings Card */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
            Thông tin chung & Cài đặt phòng thi
          </h2>
          <div className="text-xs font-mono font-bold text-blue-700 bg-blue-50 px-3 py-1 rounded-md border border-blue-200">
            Tổng điểm đề: {totalCalculatedPoints.toFixed(2)} điểm
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Tiêu đề đề thi <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Nhập tiêu đề đề thi..."
              className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-slate-700">
                Môn học <span className="text-rose-500">*</span>
              </label>
              <button
                type="button"
                onClick={() => setIsCustomSubject(!isCustomSubject)}
                className="text-[11px] font-bold text-blue-600 hover:underline cursor-pointer"
              >
                {isCustomSubject ? '← Chọn từ danh mục môn có sẵn' : '+ Tự nhập tên môn học'}
              </button>
            </div>

            {isCustomSubject ? (
              <input
                type="text"
                value={customSubjectName}
                onChange={(e) => setCustomSubjectName(e.target.value)}
                placeholder="Nhập tên môn học mới..."
                className="w-full px-3.5 py-2 text-sm bg-white border border-blue-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            ) : (
              <select
                value={subject}
                onChange={(e) => setSubject(e.target.value as SubjectType)}
                className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
              >
                {availableSubjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Khối lớp / Đối tượng
            </label>
            <input
              type="text"
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              placeholder="Nhập khối lớp hoặc đối tượng dự thi..."
              className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Thời gian làm bài (Phút)
            </label>
            <input
              type="number"
              min="5"
              max="180"
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(Number(e.target.value))}
              className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Mô tả ngắn
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Nhập mô tả ngắn về đề thi..."
              className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>

          {/* 8-Digit Exam Code (Mã số đề thi 8 chữ số) */}
          <div className="bg-blue-50/60 p-3.5 rounded-xl border border-blue-200">
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-bold text-blue-950 uppercase tracking-wide flex items-center gap-1">
                <span>Mã số đề thi (gồm 8 chữ số)</span>
                <span className="text-rose-500">*</span>
              </label>
              <button
                type="button"
                onClick={() => setExamCode(generate8DigitExamCode())}
                className="text-[11px] font-semibold text-blue-700 hover:text-blue-900 bg-white border border-blue-200 px-2 py-0.5 rounded flex items-center gap-1 transition-colors cursor-pointer"
                title="Tạo mã 8 số ngẫu nhiên mới"
              >
                <Shuffle className="w-3 h-3" />
                <span>Tạo mã mới</span>
              </button>
            </div>
            <input
              type="text"
              maxLength={8}
              value={examCode}
              onChange={(e) => setExamCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
              placeholder="Nhập mã đề gồm 8 chữ số..."
              className="w-full px-3 py-2 text-sm font-mono font-bold tracking-widest text-slate-900 bg-white border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            <p className="text-[11px] text-blue-800/80 mt-1">
              Thí sinh sẽ nhập mã 8 số này và họ tên để đăng nhập vào làm bài thi.
            </p>
          </div>

          {/* Random Question Sampler Count */}
          <div className="bg-purple-50/60 p-3.5 rounded-xl border border-purple-200">
            <label className="block text-xs font-bold text-purple-950 uppercase tracking-wide mb-1 flex items-center gap-1">
              <Shuffle className="w-3.5 h-3.5 text-purple-600" />
              <span>Số câu bốc ngẫu nhiên (Ngân hàng đề)</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                max={questions.length || 100}
                value={randomQuestionCount}
                onChange={(e) => setRandomQuestionCount(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-full px-3 py-2 text-sm font-mono font-bold text-slate-900 bg-white border border-purple-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600"
              />
              <span className="text-xs text-purple-900 font-medium whitespace-nowrap">
                / {questions.length} câu
              </span>
            </div>
            <p className="text-[11px] text-purple-800/80 mt-1">
              {randomQuestionCount > 0
                ? `Hệ thống sẽ chỉ bốc ngẫu nhiên đúng ${randomQuestionCount} câu khi thí sinh làm bài.`
                : 'Để 0 nếu muốn thí sinh thi toàn bộ tất cả các câu hỏi.'}
            </p>
          </div>

          {/* Instructions Box */}
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-blue-600" />
              <span>Hướng dẫn làm bài thi (Hiển thị cho thí sinh trước và trong khi thi):</span>
            </label>
            <textarea
              rows={2}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Ghi rõ quy chế thi, lưu ý điền số thập phân, quy định chấm điểm..."
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 leading-relaxed"
            />
          </div>

          {/* Shuffle & Cluster-by-Type Checkboxes */}
          <div className="md:col-span-2 pt-3 border-t border-slate-100 space-y-3">
            <div className="flex flex-wrap items-center gap-6">
              <label className="flex items-center gap-2 text-xs font-medium text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={shuffleQuestions}
                  onChange={(e) => setShuffleQuestions(e.target.checked)}
                  className="w-4 h-4 text-slate-900 rounded border-slate-300 focus:ring-slate-900"
                />
                <span className="flex items-center gap-1">
                  <Shuffle className="w-3.5 h-3.5 text-slate-500" />
                  {groupByQuestionType
                    ? 'Đảo thứ tự câu hỏi (chỉ tráo đổi bên trong từng cụm dạng câu)'
                    : 'Đảo ngẫu nhiên thứ tự câu hỏi khi thí sinh vào thi'}
                </span>
              </label>

              <label className="flex items-center gap-2 text-xs font-medium text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={shuffleOptions}
                  onChange={(e) => setShuffleOptions(e.target.checked)}
                  className="w-4 h-4 text-slate-900 rounded border-slate-300 focus:ring-slate-900"
                />
                <span className="flex items-center gap-1">
                  <Shuffle className="w-3.5 h-3.5 text-slate-500" />
                  Đảo ngẫu nhiên thứ tự các phương án lựa chọn (A, B, C, D...)
                </span>
              </label>
            </div>

            {/* Group By Question Type Cluster Option */}
            <div className={`p-3.5 rounded-xl border transition-colors ${
              groupByQuestionType
                ? 'bg-indigo-50/70 border-indigo-300'
                : 'bg-slate-50/70 border-slate-200'
            }`}>
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={groupByQuestionType}
                  onChange={(e) => setGroupByQuestionType(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 rounded border-slate-300 mt-0.5 focus:ring-indigo-600"
                />
                <div>
                  <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Chế độ chia mỗi dạng câu hỏi thành từng cụm (Phần I, II, III...)</span>
                  </span>
                  <p className="text-[11px] text-slate-600 mt-0.5 leading-snug">
                    Thứ tự các cụm dạng câu hỏi luôn giữ cố định. Nếu bật Đảo câu hỏi, hệ thống chỉ tráo đổi các câu hỏi ở bên trong từng cụm với nhau.
                  </p>
                </div>
              </label>

              {groupByQuestionType && (
                <div className="mt-3 pt-3 border-t border-indigo-200/80 space-y-2">
                  <div className="text-[11px] font-bold text-indigo-950 uppercase tracking-wide flex items-center justify-between">
                    <span>Thứ tự cố định của các cụm dạng câu hỏi:</span>
                    <button
                      type="button"
                      onClick={() => setQuestionTypeOrder([...DEFAULT_QUESTION_TYPE_ORDER])}
                      className="text-[11px] font-medium text-indigo-700 hover:underline normal-case cursor-pointer"
                    >
                      Khôi phục thứ tự mặc định
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {(() => {
                      let partNum = 0;
                      return questionTypeOrder.map((qType, orderIdx) => {
                        const count = questions.filter((q) => (q.type || 'single_choice') === qType).length;
                        if (count > 0) partNum += 1;
                        const meta = QUESTION_TYPE_CLUSTER_META[qType];
                        const moveCluster = (dir: -1 | 1) => {
                          const targetIdx = orderIdx + dir;
                          if (targetIdx < 0 || targetIdx >= questionTypeOrder.length) return;
                          const next = [...questionTypeOrder];
                          [next[orderIdx], next[targetIdx]] = [next[targetIdx], next[orderIdx]];
                          setQuestionTypeOrder(next);
                        };
                        return (
                          <div
                            key={qType}
                            className={`flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg border text-xs ${
                              count > 0
                                ? 'bg-white border-indigo-200 text-slate-900 shadow-2xs'
                                : 'bg-slate-100/70 border-slate-200 text-slate-400'
                            }`}
                          >
                            <div className="min-w-0">
                              <div className="font-bold truncate flex items-center gap-1.5">
                                {count > 0 && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-indigo-100 text-indigo-800 shrink-0">
                                    Phần {toRomanNumeral(partNum)}
                                  </span>
                                )}
                                <span className="truncate">{meta.shortLabel}</span>
                              </div>
                              <div className="text-[10px] font-mono mt-0.5">
                                {count} câu trong đề
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                disabled={orderIdx === 0}
                                onClick={() => moveCluster(-1)}
                                className="p-1 rounded border border-slate-200 bg-white hover:bg-indigo-50 disabled:opacity-30 cursor-pointer"
                                title="Đưa cụm này lên trước"
                              >
                                <ArrowUp className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                disabled={orderIdx === questionTypeOrder.length - 1}
                                onClick={() => moveCluster(1)}
                                className="p-1 rounded border border-slate-200 bg-white hover:bg-indigo-50 disabled:opacity-30 cursor-pointer"
                                title="Đưa cụm này xuống sau"
                              >
                                <ArrowDown className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Visibility & Status Section */}
          <div className="md:col-span-2 pt-4 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Visibility */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-blue-600" />
                <span>Phạm vi hiển thị & Phân quyền truy cập:</span>
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => setVisibility('public')}
                  className={`p-2.5 rounded-lg border text-left transition-colors cursor-pointer ${
                    visibility === 'public'
                      ? 'bg-blue-50/80 border-blue-500 text-blue-950 font-bold ring-1 ring-blue-500'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-1 text-xs">
                    <Globe className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                    <span>Công khai web</span>
                  </div>
                  <p className="text-[10px] text-slate-500 font-normal mt-1 leading-tight">
                    Mọi người đều thấy và tự do thi/luyện tập
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setVisibility('class')}
                  className={`p-2.5 rounded-lg border text-left transition-colors cursor-pointer ${
                    visibility === 'class'
                      ? 'bg-blue-50/80 border-blue-600 text-blue-950 font-bold ring-1 ring-blue-500'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-1 text-xs">
                    <Users className="w-3.5 h-3.5 text-blue-700 shrink-0" />
                    <span>Giới hạn trong Lớp</span>
                  </div>
                  <p className="text-[10px] text-slate-500 font-normal mt-1 leading-tight">
                    Chỉ thành viên lớp được chọn, người ra đề &amp; QTV tối cao nhìn thấy
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setVisibility('private')}
                  className={`p-2.5 rounded-lg border text-left transition-colors cursor-pointer ${
                    visibility === 'private'
                      ? 'bg-rose-50/80 border-rose-500 text-rose-950 font-bold ring-1 ring-rose-500'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-1 text-xs">
                    <Lock className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                    <span>Người ra đề (Riêng tư)</span>
                  </div>
                  <p className="text-[10px] text-slate-500 font-normal mt-1 leading-tight">
                    Chỉ người ra đề và Quản trị viên tối cao nhìn thấy
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setVisibility('exam_only')}
                  className={`p-2.5 rounded-lg border text-left transition-colors cursor-pointer ${
                    visibility === 'exam_only'
                      ? 'bg-purple-50/80 border-purple-500 text-purple-950 font-bold ring-1 ring-purple-500'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-1 text-xs">
                    <Layers className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                    <span>Giới hạn kỳ thi</span>
                  </div>
                  <p className="text-[10px] text-slate-500 font-normal mt-1 leading-tight">
                    Chỉ làm trong tổ hợp thi
                  </p>
                </button>
              </div>

              {/* Classroom Selector if Class Visibility */}
              {visibility === 'class' && (
                <div className="mt-2.5 space-y-2.5">
                  <div className="p-3 bg-blue-50/60 rounded-lg border border-blue-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="font-semibold text-blue-900 flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-blue-700" />
                      <span>Chọn Lớp học được phép xem và làm bài thi:</span>
                    </div>
                    {availableClassrooms.length === 0 ? (
                      <span className="text-xs font-semibold text-rose-600">
                        Bạn chưa tạo lớp học nào. Hãy tạo lớp trong mục Lớp học trước.
                      </span>
                    ) : (
                      <select
                        value={assignedClassId}
                        onChange={(e) => setAssignedClassId(e.target.value)}
                        className="px-3 py-1.5 text-xs bg-white border border-blue-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-600 font-semibold text-slate-900"
                      >
                        {availableClassrooms.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({c.grade} - {c.students?.length || 0} HS)
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  {/* Official Class Exam Navigation Lockdown Controls */}
                  <div className="p-3.5 bg-rose-50/60 rounded-xl border border-rose-200 text-xs space-y-2.5">
                    <div className="flex items-start gap-2.5">
                      <input
                        type="checkbox"
                        id="chk_officialClassExam"
                        checked={isOfficialClassExam}
                        onChange={(e) => setIsOfficialClassExam(e.target.checked)}
                        className="w-4 h-4 text-rose-600 rounded border-slate-300 mt-0.5 focus:ring-rose-600"
                      />
                      <div>
                        <label
                          htmlFor="chk_officialClassExam"
                          className="font-bold text-rose-950 flex items-center gap-1.5 cursor-pointer"
                        >
                          <Lock className="w-3.5 h-3.5 text-rose-600" />
                          <span>Đánh dấu Kỳ thi chính thức của lớp (Khóa phòng Toàn màn hình)</span>
                        </label>
                        <p className="text-[11px] text-rose-900/80 mt-0.5 leading-snug">
                          Chỉ áp dụng cho học sinh đã tham gia lớp này: tự động bật chế độ Toàn màn hình (ẩn tab trình duyệt Chrome/Cốc Cốc & thanh Taskbar), khóa phím tắt/điều hướng từ phòng chờ đến khi hết giờ đóng đề.
                        </p>
                      </div>
                    </div>

                    {isOfficialClassExam && (
                      <div className="pl-6 space-y-2 pt-1 border-t border-rose-200/70">
                        {(!openTime || !closeTime) && (
                          <div className="p-2 bg-amber-50 border border-amber-300 rounded-lg text-[11px] font-semibold text-amber-900 flex items-center gap-1.5">
                            <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            <span>Vui lòng đặt đủ Thời gian mở đề và Thời gian đóng đề bên dưới để kích hoạt khóa phòng thi chính thức.</span>
                          </div>
                        )}
                        <div className="flex flex-wrap items-center gap-3">
                          <label className="font-semibold text-rose-950">
                            Khóa điều hướng trước giờ mở đề:
                          </label>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              min={0}
                              max={60}
                              value={preExamLockMinutes}
                              onChange={(e) => setPreExamLockMinutes(Math.max(0, Number(e.target.value)))}
                              className="w-20 px-2.5 py-1 bg-white border border-rose-300 rounded-lg text-xs font-bold text-rose-950"
                            />
                            <span className="text-rose-900 font-medium">phút</span>
                          </div>
                        </div>
                        <label className="flex items-center gap-2 cursor-pointer text-[11px] font-semibold text-rose-950">
                          <input
                            type="checkbox"
                            checked={allowExitAfterSubmit}
                            onChange={(e) => setAllowExitAfterSubmit(e.target.checked)}
                            className="w-3.5 h-3.5 text-rose-600 rounded border-slate-300"
                          />
                          <span>Cho phép học sinh rời chế độ khóa sau khi đã nộp bài xong</span>
                        </label>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Teacher Special Mode Selector (Syncs immediately with class/student hiding rule) */}
              <div className="mt-2.5 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-slate-800 flex items-center gap-1.5">
                    <ShieldAlert className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Trạng thái chế độ Giáo viên cho đề này:</span>
                  </span>
                  {teacherMode === 'creator' && (
                    <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-800 text-[10px] font-bold">
                      Đang ẩn hoàn toàn với Học sinh
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  {[
                    { id: 'normal', label: 'Bình thường' },
                    { id: 'creator', label: 'Người ra đề (Ẩn HS)' },
                    { id: 'grading', label: 'Đang chấm điểm' },
                    { id: 'presenting', label: 'Trình chiếu công bố' },
                  ].map((tm) => (
                    <button
                      key={tm.id}
                      type="button"
                      onClick={() => {
                        const mode = tm.id as 'normal' | 'creator' | 'grading' | 'presenting';
                        setTeacherMode(mode);
                        if (isEditing && initialExam) {
                          const synced: Exam = {
                            ...initialExam,
                            teacherMode: mode,
                            isCreatorOnlyMode: mode === 'creator' || visibility === 'private',
                          };
                          saveCustomExam(synced);
                        }
                      }}
                      className={`px-2 py-1.5 rounded-lg border text-[11px] font-semibold transition-colors cursor-pointer ${
                        teacherMode === tm.id
                          ? tm.id === 'creator'
                            ? 'bg-rose-600 text-white border-rose-600 shadow-2xs'
                            : tm.id === 'grading'
                            ? 'bg-amber-500 text-white border-amber-500 shadow-2xs'
                            : tm.id === 'presenting'
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                            : 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {tm.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Exam Status */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                <span>Trạng thái đề thi:</span>
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { key: 'open', label: 'Đang mở', desc: 'Thí sinh vào thi ngay' },
                  { key: 'scheduled', label: 'Đã lên lịch', desc: 'Mở theo giờ đặt trước' },
                  { key: 'draft', label: 'Bản nháp', desc: 'Chưa công bố' },
                  { key: 'closed', label: 'Đã đóng', desc: 'Khóa không nhận bài' },
                ].map((st) => (
                  <button
                    key={st.key}
                    type="button"
                    onClick={() => setStatus(st.key as ExamStatus)}
                    className={`p-2 rounded-lg border text-left transition-colors cursor-pointer ${
                      status === st.key
                        ? 'bg-indigo-50 border-indigo-600 text-indigo-950 font-bold ring-1 ring-indigo-500'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="text-xs">{st.label}</div>
                    <div className="text-[10px] text-slate-500 font-normal truncate mt-0.5">{st.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Mode selection: Exam vs Practice */}
            <div className="md:col-span-2 pt-2 border-t border-slate-100">
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Chế độ cho phép thí sinh: Đề thi thật hay Luyện tập?
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                {[
                  { id: 'both', label: 'Cho phép cả Đề thi & Luyện tập', desc: 'Thí sinh tự do chọn vào thi tính giờ hoặc luyện tập có giải thích' },
                  { id: 'exam_only', label: 'Chỉ Đề thi chính thức', desc: 'Bắt buộc tính giờ, nghiêm ngặt, ẩn nút luyện tập tự do' },
                  { id: 'practice_only', label: 'Chỉ Luyện tập tự do', desc: 'Chỉ cho phép ôn luyện, xem gợi ý giải thích từng câu' },
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setModeType(m.id as any)}
                    className={`p-3 rounded-lg border text-left transition-all cursor-pointer ${
                      modeType === m.id
                        ? 'bg-blue-50 border-blue-600 text-blue-950 font-bold ring-1 ring-blue-500 shadow-2xs'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="text-xs">{m.label}</div>
                    <div className="text-[10px] text-slate-500 font-normal mt-0.5 leading-snug">{m.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Open & Close Timers */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center justify-between">
                <span>Thời gian mở đề (Tùy chọn):</span>
                {openTime && (
                  <button
                    type="button"
                    onClick={() => setOpenTime('')}
                    className="text-[11px] text-rose-600 hover:underline cursor-pointer"
                  >
                    Xóa giờ mở
                  </button>
                )}
              </label>
              <input
                type="datetime-local"
                value={openTime}
                onChange={(e) => setOpenTime(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600 font-mono"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Thí sinh không thể bắt đầu làm bài trước thời điểm này.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center justify-between">
                <span>Thời gian đóng đề (Hạn chót):</span>
                {closeTime && (
                  <button
                    type="button"
                    onClick={() => setCloseTime('')}
                    className="text-[11px] text-rose-600 hover:underline cursor-pointer"
                  >
                    Xóa giờ đóng
                  </button>
                )}
              </label>
              <input
                type="datetime-local"
                value={closeTime}
                onChange={(e) => setCloseTime(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600 font-mono"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Sau thời điểm này, đề sẽ tự động khóa và không nhận bài nộp mới.
              </p>
            </div>

            {/* Attempt Limits & Anti-cheat Tab Switches */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Giới hạn số lần làm đề của thí sinh:
              </label>
              <select
                value={maxAttempts}
                onChange={(e) => setMaxAttempts(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
              >
                <option value={0}>Không giới hạn số lần làm (Tự do ôn tập)</option>
                <option value={1}>Chỉ làm 1 lần duy nhất (Thi chính thức)</option>
                <option value={2}>Tối đa 2 lần</option>
                <option value={3}>Tối đa 3 lần</option>
                <option value={5}>Tối đa 5 lần</option>
              </select>
              <p className="text-[11px] text-slate-500 mt-1">
                Hệ thống sẽ khóa nút vào thi khi thí sinh đã làm đủ số lần quy định.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5 text-rose-800">
                <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
                <span>Giới hạn số lần thoát ra khỏi đề (Chống gian lận):</span>
              </label>
              <select
                value={maxTabSwitches}
                onChange={(e) => setMaxTabSwitches(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs bg-white border border-rose-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-600 font-medium text-rose-900"
              >
                <option value={0}>Tắt giám sát thoát trang</option>
                <option value={1}>Thoát trang 1 lần: Tự động thu & nộp bài ngay lập tức</option>
                <option value={2}>Thoát trang 2 lần: Tự động thu & nộp bài (1 lần nhắc nhở)</option>
                <option value={3}>Thoát trang 3 lần: Tự động thu & nộp bài (2 lần nhắc nhở)</option>
                <option value={5}>Thoát trang 5 lần: Tự động thu & nộp bài</option>
              </select>
              <p className="text-[11px] text-slate-500 mt-1">
                Khi thí sinh rời màn hình, đổi tab hoặc thu nhỏ trình duyệt quá số lần, hệ thống sẽ tự động thu bài.
              </p>
            </div>

            {/* Anti-Copy and Result Visibility Controls */}
            <div className="md:col-span-2 pt-3 border-t border-slate-100 space-y-3">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                Bảo mật chống sao chép & Cài đặt Hiển thị Kết quả
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                {/* Anti Copy Switch */}
                <div className="p-3 rounded-lg border border-slate-200 bg-slate-50 flex items-start gap-3">
                  <input
                    type="checkbox"
                    id="chk_allowCopy"
                    checked={!allowCopy}
                    onChange={(e) => setAllowCopy(!e.target.checked)}
                    className="w-4 h-4 text-rose-600 rounded border-slate-300 mt-0.5 focus:ring-rose-600"
                  />
                  <div>
                    <label htmlFor="chk_allowCopy" className="font-bold text-slate-900 flex items-center gap-1.5 cursor-pointer">
                      <CopySlash className="w-3.5 h-3.5 text-rose-600" />
                      <span>Khóa tính năng Sao chép (Chống copy câu hỏi)</span>
                    </label>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-tight">
                      Khi bật: Vô hiệu hóa bôi đen văn bản, khóa chuột phải và chặn phím tắt Ctrl+C / Cmd+C trong phòng thi.
                    </p>
                  </div>
                </div>

                {/* Show Answers after exam */}
                <div className="p-3 rounded-lg border border-slate-200 bg-slate-50 flex items-start gap-3">
                  <input
                    type="checkbox"
                    id="chk_showAnswers"
                    checked={showAnswersAfterExam}
                    onChange={(e) => setShowAnswersAfterExam(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded border-slate-300 mt-0.5 focus:ring-blue-600"
                  />
                  <div>
                    <label htmlFor="chk_showAnswers" className="font-bold text-slate-900 flex items-center gap-1.5 cursor-pointer">
                      <Eye className="w-3.5 h-3.5 text-blue-600" />
                      <span>Hiện đáp án & lời giải chi tiết sau thi</span>
                    </label>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-tight">
                      Nếu tắt: Thí sinh sau khi nộp bài sẽ không thấy đáp án chi tiết và lời giải (tránh lộ đề cho ca thi sau).
                    </p>
                  </div>
                </div>

                {/* Show Live Score during exam */}
                <div className="p-3 rounded-lg border border-slate-200 bg-slate-50 flex items-start gap-3">
                  <input
                    type="checkbox"
                    id="chk_liveScore"
                    checked={showLiveScoreDuringExam}
                    onChange={(e) => setShowLiveScoreDuringExam(e.target.checked)}
                    className="w-4 h-4 text-amber-600 rounded border-slate-300 mt-0.5 focus:ring-amber-600"
                  />
                  <div>
                    <label htmlFor="chk_liveScore" className="font-bold text-slate-900 flex items-center gap-1.5 cursor-pointer">
                      <span>Hiện điểm khi thi giữa chừng</span>
                    </label>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-tight">
                      Hiển thị thanh điểm tích lũy trực tiếp ngay trong khi thí sinh đang làm bài thi (phù hợp ôn luyện).
                    </p>
                  </div>
                </div>

                {/* Show Score after exam */}
                <div className="p-3 rounded-lg border border-slate-200 bg-slate-50 flex items-start gap-3">
                  <input
                    type="checkbox"
                    id="chk_scoreAfter"
                    checked={showScoreAfterExam}
                    onChange={(e) => setShowScoreAfterExam(e.target.checked)}
                    className="w-4 h-4 text-emerald-600 rounded border-slate-300 mt-0.5 focus:ring-emerald-600"
                  />
                  <div>
                    <label htmlFor="chk_scoreAfter" className="font-bold text-slate-900 flex items-center gap-1.5 cursor-pointer">
                      <span>Hiện điểm số sau khi kết thúc bài thi</span>
                    </label>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-tight">
                      Nếu tắt: Ẩn bảng điểm sau khi nộp bài, chỉ hiển thị thông báo đã nộp bài thành công (chờ giáo viên công bố).
                    </p>
                  </div>
                </div>

                {/* Lock exit until timeout */}
                <div className="p-3 rounded-lg border border-purple-200 bg-purple-50/50 flex items-start gap-3">
                  <input
                    type="checkbox"
                    id="chk_lockExit"
                    checked={lockExitUntilTimeout}
                    onChange={(e) => setLockExitUntilTimeout(e.target.checked)}
                    className="w-4 h-4 text-purple-600 rounded border-slate-300 mt-0.5 focus:ring-purple-600"
                  />
                  <div>
                    <label htmlFor="chk_lockExit" className="font-bold text-purple-950 flex items-center gap-1.5 cursor-pointer">
                      <Lock className="w-3.5 h-3.5 text-purple-600" />
                      <span>Khóa phòng Toàn màn hình đến khi hết giờ</span>
                    </label>
                    <p className="text-[11px] text-purple-900/80 mt-0.5 leading-tight">
                      Khi bật: Bắt buộc Toàn màn hình ẩn thanh tab (Chrome, Cốc Cốc...) & thanh Taskbar máy tính, khóa phím Esc/phím tắt trình duyệt và chặn thoát phòng thi đến hết giờ.
                    </p>
                  </div>
                </div>

                {/* Show only student answers after exam */}
                <div className="p-3 rounded-lg border border-cyan-200 bg-cyan-50/50 flex items-start gap-3">
                  <input
                    type="checkbox"
                    id="chk_onlyStudentAnswers"
                    checked={showOnlyStudentAnswersAfterExam}
                    onChange={(e) => setShowOnlyStudentAnswersAfterExam(e.target.checked)}
                    className="w-4 h-4 text-cyan-600 rounded border-slate-300 mt-0.5 focus:ring-cyan-600"
                  />
                  <div>
                    <label htmlFor="chk_onlyStudentAnswers" className="font-bold text-cyan-950 flex items-center gap-1.5 cursor-pointer">
                      <Eye className="w-3.5 h-3.5 text-cyan-700" />
                      <span>Sau khi thi chỉ xem câu trả lời đã làm (Ẩn đáp án)</span>
                    </label>
                    <p className="text-[11px] text-cyan-900/80 mt-0.5 leading-tight">
                      Thí sinh xem lại bài nộp chỉ thấy phương án mình đã chọn hoặc đã nhập, giấu hoàn toàn đáp án chuẩn và lời giải.
                    </p>
                  </div>
                </div>

                {/* Min submit duration */}
                <div className="p-3 rounded-lg border border-indigo-200 bg-indigo-50/50 flex flex-col justify-between gap-1.5">
                  <label className="font-bold text-indigo-950 flex items-center gap-1.5 text-xs">
                    <Clock className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Giới hạn thời gian nộp bài sau (phút):</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      max={durationMinutes}
                      value={minSubmitMinutes}
                      onChange={(e) => setMinSubmitMinutes(Math.max(0, Number(e.target.value)))}
                      placeholder="0 = đúng hết giờ mới nộp"
                      className="w-24 px-2.5 py-1 text-xs bg-white border border-indigo-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-600 font-bold"
                    />
                    <span className="text-[11px] text-indigo-900">
                      {minSubmitMinutes > 0
                        ? `Chỉ được nộp sau khi làm tối thiểu ${minSubmitMinutes} phút`
                        : 'Mặc định (0): Phải làm đúng hết giờ mới được nộp (không nộp sớm)'}
                    </span>
                  </div>
                </div>

                {/* Require candidate access security code */}
                <div className="p-3 rounded-lg border border-amber-200 bg-amber-50/50 flex flex-col justify-between gap-2">
                  <div className="flex items-start gap-2.5">
                    <input
                      type="checkbox"
                      id="chk_requireAccessCode"
                      checked={requireAccessCode}
                      onChange={(e) => {
                        setRequireAccessCode(e.target.checked);
                        if (e.target.checked && !accessSecurityCode) {
                          setAccessSecurityCode(Math.floor(100000 + Math.random() * 900000).toString());
                        }
                      }}
                      className="w-4 h-4 text-amber-600 rounded border-slate-300 mt-0.5 focus:ring-amber-600"
                    />
                    <div>
                      <label htmlFor="chk_requireAccessCode" className="font-bold text-amber-950 flex items-center gap-1 cursor-pointer">
                        <Lock className="w-3.5 h-3.5 text-amber-700" />
                        <span>Chỉ thí sinh có mã cung cấp mới được làm đề</span>
                      </label>
                      <p className="text-[11px] text-amber-900/80 mt-0.5 leading-tight">
                        Thí sinh phải nhập đúng Mã bảo mật phòng thi do giáo viên cấp mới được bắt đầu làm bài.
                      </p>
                    </div>
                  </div>

                  {requireAccessCode && (
                    <div className="flex items-center gap-2 pl-6">
                      <span className="text-[11px] font-semibold text-amber-950 shrink-0">Mã bảo mật cấp cho HS:</span>
                      <input
                        type="text"
                        value={accessSecurityCode}
                        onChange={(e) => setAccessSecurityCode(e.target.value)}
                        placeholder="Nhập mã bảo mật hoặc PIN..."
                        className="px-2.5 py-1 text-xs bg-white border border-amber-300 rounded font-mono font-bold text-amber-950 w-36 uppercase tracking-wider"
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mode Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-1 p-1 bg-slate-200/60 rounded-xl max-w-fit text-xs font-medium">
          <button
            onClick={() => setActiveTab('manual')}
            className={`py-2 px-4 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'manual'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Danh sách câu hỏi ({questions.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('quickImport')}
            className={`py-2 px-4 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'quickImport'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Upload className="w-4 h-4 text-blue-600" />
            <span>Nhập nhanh từ văn bản</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => setIsImportQuestionsOpen(true)}
          className="py-2 px-4 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
          title="Xem và chọn câu hỏi từ các đề đã có của giáo viên khác hoặc của bạn (chỉ sao chép, không sửa đề gốc)"
        >
          <CopyPlus className="w-4 h-4 text-blue-600" />
          <span>Lấy câu hỏi từ đề khác</span>
        </button>
      </div>

      {/* Tab 1: Manual Questions List */}
      {activeTab === 'manual' && (
        <div className="space-y-6">
          {questions.map((q, qIdx) => (
            <div
              key={q.id || qIdx}
              ref={(el) => {
                questionCardRefs.current[q.id] = el;
              }}
              className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs relative"
            >
              {/* Question Item Header */}
              <div className="flex flex-wrap items-center justify-between pb-3 border-b border-slate-100 mb-4 gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold text-slate-900">
                    Câu {qIdx + 1}
                  </span>

                  {/* Question Type Selector */}
                  <select
                    value={q.type}
                    onChange={(e) => {
                      const newType = e.target.value as QuestionType;
                      const matchingDefaults =
                        newType === 'matching' && (!q.matchingLeftItems || !q.matchingRightItems)
                          ? createDefaultMatchingData(q.id)
                          : {};
                      // Bảo toàn dữ liệu các dạng khác đã nhập phòng trường hợp đổi nhầm dạng câu hỏi
                      handleUpdateQuestion(qIdx, {
                        type: newType,
                        options: newType === 'single_choice' ? (q.options || ['', '', '', '']) : q.options,
                        correctAnswer: newType === 'single_choice' ? (q.correctAnswer ?? 0) : q.correctAnswer,
                        tfItems: newType === 'true_false' ? (q.tfItems || [
                          { id: q.id + '_a', statement: '', isCorrect: true },
                          { id: q.id + '_b', statement: '', isCorrect: false },
                        ]) : q.tfItems,
                        acceptedAnswers: newType === 'text_input' ? (q.acceptedAnswers || ['']) : q.acceptedAnswers,
                        sampleAnswer: newType === 'essay' ? (q.sampleAnswer ?? '') : q.sampleAnswer,
                        subQuestions: newType === 'grouped' ? (q.subQuestions || []) : q.subQuestions,
                        ...matchingDefaults,
                      });
                    }}
                    className="px-2.5 py-1 text-xs font-semibold bg-slate-100 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-slate-900"
                  >
                    <option value="single_choice">Dạng 1: Trắc nghiệm 1 đáp án</option>
                    <option value="true_false">Dạng 2: Trắc nghiệm Đúng / Sai từng ý</option>
                    <option value="text_input">Dạng 3: Trả lời ngắn / Nhập ô văn bản</option>
                    <option value="matching">Dạng 4: Ghép đôi hai cột (Tự chọn nhãn & nhiễu)</option>
                    <option value="grouped">Dạng 5: Câu hỏi chùm (Đọc hiểu / Bối cảnh)</option>
                    <option value="essay">Dạng 6: Tự luận / Soạn thảo văn bản (Có công thức)</option>
                  </select>

                  {/* Points Input for Question */}
                  <div className="flex items-center gap-1 text-xs">
                    <span className="text-slate-500 font-medium">Điểm câu:</span>
                    <input
                      type="number"
                      step="0.25"
                      min="0.1"
                      value={q.points}
                      onChange={(e) => handleUpdateQuestion(qIdx, { points: parseFloat(e.target.value) || 1.0 })}
                      className="w-16 px-2 py-0.5 font-mono text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 rounded focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  {qIdx > 0 && (
                    <button
                      type="button"
                      onClick={() => handleCopyFormatFromPrevious(qIdx)}
                      className="px-2.5 py-1 text-xs rounded-md border bg-indigo-50 text-indigo-800 border-indigo-200 hover:bg-indigo-100 flex items-center gap-1 transition-colors cursor-pointer"
                      title={`Sao chép dạng câu, thang điểm và số ý/phương án từ Câu ${qIdx} sang Câu ${qIdx + 1}`}
                    >
                      <FilePlus2 className="w-3.5 h-3.5" />
                      <span>Copy định dạng câu {qIdx}</span>
                    </button>
                  )}

                  <CopyContentButton
                    compact
                    label="Sao chép cả câu"
                    getText={() => formatQuestionForCopy(q, qIdx + 1)}
                    title="Sao chép đầy đủ nội dung, đáp án và lời giải của câu này"
                  />

                  <button
                    type="button"
                    onClick={() => handleDuplicateQuestion(qIdx)}
                    className="px-2.5 py-1 text-xs rounded-md border bg-slate-50 text-slate-800 border-slate-200 hover:bg-slate-100 flex items-center gap-1 transition-colors cursor-pointer"
                    title="Nhân bản câu hỏi này (bao gồm cả đáp án & công thức) thành một câu mới ngay bên dưới"
                  >
                    <Copy className="w-3.5 h-3.5 text-slate-600" />
                    <span>Tạo bản sao</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSavedQuestionBadgeIndex(qIdx);
                      setSuccessNotice(`✓ Đã lưu câu hỏi #${qIdx + 1} tại chỗ thành công (không thoát ra ngoài)!`);
                      setTimeout(() => {
                        setSavedQuestionBadgeIndex(null);
                        setSuccessNotice('');
                      }, 2500);
                    }}
                    className={`px-2.5 py-1 text-xs rounded-md border flex items-center gap-1 transition-all cursor-pointer ${
                      savedQuestionBadgeIndex === qIdx
                        ? 'bg-emerald-600 text-white border-emerald-600 font-bold shadow-xs'
                        : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                    }`}
                    title="Lưu câu hỏi này tại chỗ, không thoát ra ngoài"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{savedQuestionBadgeIndex === qIdx ? '✓ Đã lưu câu!' : 'Lưu câu này'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleTogglePreview(q.id)}
                    className={`px-2.5 py-1 text-xs rounded-md border flex items-center gap-1 transition-colors cursor-pointer ${
                      isPreviewVisible(q.id)
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                    title="Xem trước kết quả hiển thị (gồm toàn bộ đáp án & lời giải)"
                  >
                    {isPreviewVisible(q.id) ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    <span>{isPreviewVisible(q.id) ? 'Ẩn xem trước' : 'Xem trước'}</span>
                  </button>

                  <input
                    type="text"
                    value={q.topic || ''}
                    onChange={(e) => handleUpdateQuestion(qIdx, { topic: e.target.value })}
                    placeholder="Nhập chuyên đề..."
                    className="px-2.5 py-1 text-xs border border-slate-200 rounded-md bg-slate-50 focus:outline-none focus:ring-1 focus:ring-slate-900 w-32"
                  />

                  <button
                    onClick={() => handleDeleteQuestion(qIdx)}
                    className="p-1 text-slate-400 hover:text-rose-600 transition-colors rounded cursor-pointer"
                    title="Xóa câu hỏi này"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Math & Table Toolbar — chèn ngay tại vị trí con trỏ của ô đang nhập trong câu này */}
              <MathToolbar
                getContainerEl={() => questionCardRefs.current[q.id] || null}
                onInsert={(snippet) => handleInsertSnippet(qIdx, snippet)}
                onInsertInlineImage={(imgId, imgSrc) => appendInlineImageToQuestion(qIdx, imgId, imgSrc)}
              />

              {/* Question Statement */}
              <div className="mb-4">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                  <label className="block text-xs font-semibold text-slate-700">
                    {q.type === 'grouped'
                      ? 'Đoạn văn bối cảnh chung / Dữ kiện dùng chung (có thể Ctrl+V hoặc chèn ảnh tại vị trí con trỏ):'
                      : 'Nội dung câu hỏi (hỗ trợ $x^2$, bảng biến thiên, Ctrl+V dán ảnh hoặc chèn ảnh tại vị trí con trỏ):'}
                  </label>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() =>
                        openCursorImageModalForField(qIdx, 'question', `Nội dung Câu ${qIdx + 1}`)
                      }
                      className="px-2 py-0.5 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <ImageIcon className="w-3 h-3" />
                      <span>Chèn ảnh tại con trỏ</span>
                    </button>
                    <CopyContentButton compact getText={() => q.question} />
                  </div>
                </div>
                <textarea
                  ref={(el) => {
                    fieldTextareaRefs.current[`${qIdx}_question`] = el;
                  }}
                  rows={q.type === 'grouped' ? 4 : 2}
                  value={q.question}
                  onChange={(e) => handleUpdateQuestion(qIdx, { question: e.target.value })}
                  onPaste={(e) =>
                    void handleTextareaPasteImage(e, qIdx, 'question', `Nội dung Câu ${qIdx + 1}`)
                  }
                  placeholder="Nhập nội dung đề bài... (đặt con trỏ ở bất kỳ vị trí nào rồi bấm 'Chèn ảnh tại con trỏ' hoặc Ctrl+V để chèn ảnh)"
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 font-mono"
                />
                <InlineImageStrip
                  content={q.question}
                  inlineImages={q.inlineImages}
                  label="Ảnh chèn trong nội dung câu hỏi"
                  onUpdateContent={(nextText) => handleUpdateQuestion(qIdx, { question: nextText })}
                />
              </div>

              {/* Attached Image Box (Implicit address, Title-only) */}
              <div className="mb-4">
                <AttachedImageBox
                  imageUrl={q.imageUrl}
                  caption={q.imageCaption || ''}
                  label="Hình ảnh / Đồ thị đính kèm đề bài (Tùy chọn)"
                  onChangeImage={(nextUrl) => handleUpdateQuestion(qIdx, { imageUrl: nextUrl })}
                  onChangeCaption={(nextCap) => handleUpdateQuestion(qIdx, { imageCaption: nextCap })}
                  onError={setErrorMessage}
                />
              </div>

              {/* Live Preview (Always reflects ALL parts of the question) */}
              {isPreviewVisible(q.id) && (
                <div className="mb-4 p-4 bg-blue-50/50 border border-blue-200 rounded-xl">
                  <div className="text-xs font-bold text-blue-800 uppercase tracking-wide mb-2 flex items-center justify-between flex-wrap gap-1">
                    <span className="flex items-center gap-1">
                      <Eye className="w-3.5 h-3.5" />
                      Xem trước đầy đủ câu hỏi #{qIdx + 1}:
                    </span>
                    <span className="text-[11px] font-normal text-blue-600">
                      Hiển thị trực tiếp công thức toán, hình ảnh, đáp án & lời giải
                    </span>
                  </div>
                  <div className="p-3 bg-white rounded-lg border border-blue-100 space-y-3">
                    <RichContentRenderer
                      content={q.question || 'Chưa nhập nội dung.'}
                      imageUrl={q.imageUrl}
                      imageCaption={q.imageCaption}
                      inlineImages={q.inlineImages}
                    />

                    {/* Preview options for single_choice / multiple_choice */}
                    {(q.type === 'single_choice' || q.type === 'multiple_choice') && q.options && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-slate-100">
                        {q.options.map((opt, optIdx) => {
                          const letter = String.fromCharCode(65 + optIdx);
                          const isCorrect =
                            q.type === 'multiple_choice'
                              ? (q.correctAnswers || []).includes(optIdx)
                              : q.correctAnswer === optIdx;
                          const optImg = q.optionImages?.[optIdx];

                          return (
                            <div
                              key={optIdx}
                              className={`p-2.5 rounded-lg border text-xs flex items-start gap-2 ${
                                isCorrect
                                  ? 'bg-emerald-50 border-emerald-400 font-medium text-emerald-950'
                                  : 'bg-white border-slate-200 text-slate-800'
                              }`}
                            >
                              <span
                                className={`w-5 h-5 rounded font-bold text-xs flex items-center justify-center shrink-0 border ${
                                  isCorrect
                                    ? 'bg-emerald-600 text-white border-emerald-600'
                                    : 'bg-slate-100 text-slate-700 border-slate-200'
                                }`}
                              >
                                {letter}
                              </span>
                              <div className="flex-1">
                                {opt && (
                                  <RichContentRenderer content={opt} inlineImages={q.inlineImages} />
                                )}
                                {optImg && (
                                  <div className="mt-1">
                                    <ResilientImage
                                      src={optImg}
                                      alt={`Phương án ${letter}`}
                                      className="max-h-28 max-w-full rounded border border-slate-200 object-contain"
                                    />
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Preview for true_false */}
                    {q.type === 'true_false' && q.tfItems && (
                      <div className="space-y-1.5 pt-2 border-t border-slate-100">
                        <div className="text-[11px] font-semibold text-emerald-800 bg-emerald-50 px-2 py-1 rounded border border-emerald-200">
                          ⚖ {formatTrueFalseScoringRule(q)}
                        </div>
                        {q.tfItems.map((it, itIdx) => (
                          <div
                            key={it.id}
                            className="p-2 rounded-lg border border-slate-200 bg-slate-50/70 text-xs flex items-center justify-between gap-2"
                          >
                            <div className="flex items-start gap-1.5 flex-1">
                              <span className="font-bold text-slate-700">
                                {String.fromCharCode(97 + itIdx)})
                              </span>
                              <RichContentRenderer
                                content={it.statement || 'Chưa nhập ý'}
                                inlineImages={q.inlineImages}
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

                    {/* Preview for text_input */}
                    {q.type === 'text_input' && (
                      <div className="pt-2 border-t border-slate-100 text-xs">
                        <span className="font-semibold text-slate-600">Đáp án chấp nhận: </span>
                        <span className="font-mono font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          {formatAcceptedShortAnswersList(q.acceptedAnswers) || 'Chưa thiết lập'}
                        </span>
                      </div>
                    )}

                    {/* Preview for matching */}
                    {q.type === 'matching' && (
                      <div className="pt-2 border-t border-slate-100">
                        <MatchingQuestionView
                          question={q}
                          mode="preview"
                          showSolutions={true}
                          hidePrompt={true}
                        />
                      </div>
                    )}

                    {/* Preview for grouped subQuestions */}
                    {q.type === 'grouped' && (q.subQuestions || []).length > 0 && (
                      <div className="pt-2 border-t border-slate-100 space-y-2.5">
                        <div className="text-[11px] font-bold text-purple-900 uppercase">
                          Các câu con trong chùm ({q.subQuestions!.length} câu):
                        </div>
                        {q.subQuestions!.map((sub, sIdx) => {
                          const combinedMap = {
                            ...(q.inlineImages || {}),
                            ...(sub.inlineImages || {}),
                          };
                          return (
                            <div
                              key={sub.id || sIdx}
                              className="p-2.5 rounded-lg bg-purple-50/40 border border-purple-200 space-y-2 text-xs"
                            >
                              <div className="font-bold text-purple-950">
                                Câu {qIdx + 1}.{sIdx + 1} ({sub.points || 0.5} điểm):
                              </div>
                              <RichContentRenderer
                                content={sub.question || 'Chưa nhập nội dung câu con.'}
                                imageUrl={sub.imageUrl}
                                imageCaption={sub.imageCaption}
                                inlineImages={combinedMap}
                              />
                              {(sub.type || 'single_choice') === 'single_choice' && sub.options && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                                  {sub.options.map((sOpt, soIdx) => {
                                    const sLetter = String.fromCharCode(65 + soIdx);
                                    const isCorr = sub.correctAnswer === soIdx;
                                    const sOptImg = sub.optionImages?.[soIdx];
                                    return (
                                      <div
                                        key={soIdx}
                                        className={`p-2 rounded border flex items-start gap-1.5 ${
                                          isCorr
                                            ? 'bg-emerald-50 border-emerald-400 text-emerald-950 font-medium'
                                            : 'bg-white border-slate-200 text-slate-800'
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
                                              inlineImages={combinedMap}
                                            />
                                          )}
                                          {sOptImg && (
                                            <ResilientImage
                                              src={sOptImg}
                                              alt={`Phương án ${sLetter}`}
                                              className="max-h-20 max-w-full rounded border border-slate-200 object-contain mt-1"
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
                                <div className="p-2 bg-blue-50/70 border border-blue-200 rounded-md">
                                  <div className="font-bold text-blue-900 uppercase text-[10px] mb-1">
                                    Lời giải câu con:
                                  </div>
                                  <RichContentRenderer
                                    content={sub.explanation || ''}
                                    imageUrl={sub.explanationImageUrl}
                                    imageCaption={sub.explanationImageCaption}
                                    inlineImages={combinedMap}
                                  />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Preview for essay */}
                    {q.type === 'essay' && (
                      <div className="pt-2 border-t border-slate-100 space-y-2 text-xs">
                        <div className="text-slate-500 italic">
                          [Học sinh soạn thảo tự luận trực tuyến có thanh công thức toán học]
                        </div>
                        {q.sampleAnswer && q.sampleAnswer.trim() && (
                          <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg">
                            <div className="font-bold text-emerald-900 uppercase text-[10px] mb-1">
                              Đáp án tham khảo / Thang chấm:
                            </div>
                            <RichContentRenderer
                              content={q.sampleAnswer}
                              inlineImages={q.inlineImages}
                            />
                          </div>
                        )}
                      </div>
                    )}

                    {/* Preview solution/explanation */}
                    {((q.explanation && q.explanation.trim()) || q.explanationImageUrl) && (
                      <div className="p-2.5 bg-blue-50/70 border border-blue-200 rounded-lg text-xs">
                        <div className="font-bold text-blue-900 uppercase text-[10px] mb-1">
                          Lời giải chi tiết:
                        </div>
                        <RichContentRenderer
                          content={q.explanation || ''}
                          imageUrl={q.explanationImageUrl}
                          imageCaption={q.explanationImageCaption}
                          inlineImages={q.inlineImages}
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* --- DẠNG 1: Single choice / Multiple choice Options Editor --- */}
              {(q.type === 'single_choice' || q.type === 'multiple_choice') && (
                <div className="space-y-3 mb-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-xs font-semibold text-slate-700">
                        {q.type === 'multiple_choice'
                          ? 'Các phương án lựa chọn (Click chữ cái để bật/tắt các đáp án đúng):'
                          : 'Các phương án lựa chọn (Click nút chữ cái để chọn đáp án đúng):'}
                      </label>
                      <p className="text-[11px] text-slate-500">
                        Giáo viên có thể nhập chữ/công thức toán hoặc đính kèm ảnh phương án (địa chỉ ảnh được lưu ngầm).
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAddOption(qIdx)}
                      className="text-xs font-semibold text-blue-700 hover:underline flex items-center gap-1 cursor-pointer shrink-0"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Thêm phương án</span>
                    </button>
                  </div>

                  {(q.options || []).map((opt, optIdx) => {
                    const letter = String.fromCharCode(65 + optIdx);
                    const isCorrect =
                      q.type === 'multiple_choice'
                        ? (q.correctAnswers || []).includes(optIdx)
                        : q.correctAnswer === optIdx;
                    const optImg = q.optionImages?.[optIdx];
                    const isImageEditing =
                      activeOptImgEdit?.qIdx === qIdx && activeOptImgEdit?.optIdx === optIdx;

                    return (
                      <div key={optIdx} className="p-2.5 rounded-lg border border-slate-200 bg-white space-y-2">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              if (q.type === 'multiple_choice') {
                                const cur = q.correctAnswers || [];
                                const nextArr = cur.includes(optIdx)
                                  ? cur.filter((x) => x !== optIdx)
                                  : [...cur, optIdx].sort((a, b) => a - b);
                                handleUpdateQuestion(qIdx, { correctAnswers: nextArr });
                              } else {
                                handleUpdateQuestion(qIdx, { correctAnswer: optIdx });
                              }
                            }}
                            className={`w-7 h-7 rounded-lg font-bold text-xs flex items-center justify-center shrink-0 border transition-colors cursor-pointer ${
                              isCorrect
                                ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs ring-2 ring-emerald-300'
                                : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                            }`}
                            title="Đặt làm đáp án đúng"
                          >
                            {letter}
                          </button>

                          <input
                            type="text"
                            value={opt}
                            onChange={(e) => handleUpdateOption(qIdx, optIdx, e.target.value)}
                            placeholder={`Phương án ${letter} (nhập công thức, chữ hoặc thêm ảnh bên phải)...`}
                            className={`flex-1 px-3 py-1.5 text-xs bg-white border rounded-lg focus:outline-none ${
                              isCorrect
                                ? 'border-emerald-400 ring-1 ring-emerald-300'
                                : 'border-slate-200 focus:ring-2 focus:ring-slate-900'
                            }`}
                          />

                          {/* Image Attachment Toggle Button */}
                          <button
                            type="button"
                            onClick={() => {
                              if (isImageEditing) {
                                setActiveOptImgEdit(null);
                              } else {
                                setActiveOptImgEdit({ qIdx, optIdx });
                              }
                            }}
                            className={`px-2.5 py-1.5 rounded-lg border text-xs flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 ${
                              optImg
                                ? 'bg-purple-50 text-purple-700 border-purple-300 font-semibold'
                                : isImageEditing
                                ? 'bg-slate-800 text-white border-slate-800'
                                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                            }`}
                            title="Tải ảnh hoặc dán ảnh phương án"
                          >
                            <ImageIcon className="w-3.5 h-3.5" />
                            <span>{optImg ? 'Có ảnh' : 'Thêm ảnh'}</span>
                          </button>

                          {(q.options || []).length > 2 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveOption(qIdx, optIdx)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 rounded transition-colors cursor-pointer shrink-0"
                              title="Xóa phương án này"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>

                        {/* Clean Implicit Image Attachment Drawer */}
                        {(isImageEditing || optImg) && (
                          <div className="pt-1 pl-9 pr-1">
                            <AttachedImageBox
                              compact
                              showCaption={false}
                              imageUrl={optImg}
                              label={`Ảnh minh họa phương án ${letter}`}
                              onChangeImage={(nextUrl) => handleUpdateOptionImage(qIdx, optIdx, nextUrl)}
                              onError={setErrorMessage}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* --- DẠNG 2: True/False Sub-items Editor --- */}
              {q.type === 'true_false' && (
                <div className="space-y-4 mb-4">
                  {/* Chế độ chấm điểm câu Đúng / Sai */}
                  <div className="p-3.5 bg-emerald-50/60 rounded-xl border border-emerald-200 space-y-2.5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <span className="text-xs font-bold text-emerald-900 block">
                          Cơ chế gán điểm theo số ý đúng (Quy chế chấm điểm Đúng / Sai):
                        </span>
                        <span className="text-[11px] text-emerald-700">
                          Chọn quy chế chấm chuẩn của Bộ GD&ĐT hoặc tự thiết lập điểm thưởng khi học sinh đúng 1 ý, 2 ý, 3 ý...
                        </span>
                      </div>
                      <div className="inline-flex rounded-lg border border-emerald-300 p-0.5 bg-white text-xs shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            const count = (q.tfItems || []).length || 4;
                            const maxP = q.points || 1.0;
                            const standardTiers = count === 4 
                              ? [0.1 * maxP, 0.25 * maxP, 0.5 * maxP, 1.0 * maxP]
                              : Array.from({ length: count }, (_, i) => Number((((i + 1) / count) * maxP).toFixed(2)));
                            handleUpdateQuestion(qIdx, { 
                              tfScoringMode: 'standard_ministry',
                              tfTierPoints: standardTiers
                            });
                          }}
                          className={`px-2.5 py-1 rounded text-xs font-semibold cursor-pointer transition-colors ${
                            (q.tfScoringMode || 'standard_ministry') === 'standard_ministry'
                              ? 'bg-emerald-700 text-white shadow-2xs'
                              : 'text-emerald-900 hover:bg-emerald-50'
                          }`}
                        >
                          Chuẩn Bộ GD&ĐT 2025
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const count = (q.tfItems || []).length || 4;
                            const maxP = q.points || 1.0;
                            const existingTiers = q.tfTierPoints && q.tfTierPoints.length === count 
                              ? q.tfTierPoints 
                              : Array.from({ length: count }, (_, i) => Number((((i + 1) * 0.25)).toFixed(2)));
                            handleUpdateQuestion(qIdx, { 
                              tfScoringMode: 'tiered',
                              tfTierPoints: existingTiers
                            });
                          }}
                          className={`px-2.5 py-1 rounded text-xs font-semibold cursor-pointer transition-colors ${
                            q.tfScoringMode === 'tiered'
                              ? 'bg-emerald-700 text-white shadow-2xs'
                              : 'text-emerald-900 hover:bg-emerald-50'
                          }`}
                        >
                          Tùy chỉnh bậc số ý
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            handleUpdateQuestion(qIdx, { tfScoringMode: 'divide_equally' });
                          }}
                          className={`px-2.5 py-1 rounded text-xs font-semibold cursor-pointer transition-colors ${
                            q.tfScoringMode === 'divide_equally'
                              ? 'bg-emerald-700 text-white shadow-2xs'
                              : 'text-emerald-900 hover:bg-emerald-50'
                          }`}
                        >
                          Chia đều điểm
                        </button>
                      </div>
                    </div>

                    {/* Hiển thị chi tiết bảng điểm theo từng bậc */}
                    {q.tfScoringMode === 'tiered' && (
                      <div className="p-2.5 bg-white rounded-lg border border-emerald-200 mt-2 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold text-slate-700">
                            Cài đặt điểm nhận được tương ứng với số ý trả lời đúng:
                          </span>
                          <div className="flex items-center gap-1.5 text-[10px]">
                            <span className="text-slate-500">Mẫu nhanh:</span>
                            <button
                              type="button"
                              onClick={() => {
                                const count = (q.tfItems || []).length || 4;
                                handleUpdateQuestion(qIdx, { 
                                  tfTierPoints: count === 4 ? [0.1, 0.25, 0.5, 1.0] : [0.2, 0.4, 0.7, 1.0]
                                });
                              }}
                              className="px-2 py-0.5 rounded bg-emerald-100 hover:bg-emerald-200 text-emerald-800 font-semibold cursor-pointer"
                            >
                              Chuẩn Bộ (0.1 - 0.25 - 0.5 - 1.0)
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const count = (q.tfItems || []).length || 4;
                                handleUpdateQuestion(qIdx, { 
                                  tfTierPoints: count === 4 ? [0.25, 0.5, 0.75, 1.0] : [0.2, 0.4, 0.6, 0.8]
                                });
                              }}
                              className="px-2 py-0.5 rounded bg-emerald-100 hover:bg-emerald-200 text-emerald-800 font-semibold cursor-pointer"
                            >
                              Bậc đều (0.25 - 0.5 - 0.75 - 1.0)
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                          {(q.tfItems || []).map((_, tIdx) => {
                            const curTiers = q.tfTierPoints || [0.1, 0.25, 0.5, 1.0];
                            const curVal = curTiers[tIdx] !== undefined ? curTiers[tIdx] : 0;
                            return (
                              <div key={tIdx} className="p-2 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between gap-1.5">
                                <span className="text-xs font-semibold text-slate-700 whitespace-nowrap">
                                  Đúng {tIdx + 1} ý:
                                </span>
                                <div className="flex items-center gap-1">
                                  <input
                                    type="number"
                                    step="0.05"
                                    min="0"
                                    value={curVal}
                                    onChange={(e) => {
                                      const nextTiers = [...(q.tfTierPoints || [0.1, 0.25, 0.5, 1.0])];
                                      while (nextTiers.length <= tIdx) nextTiers.push(0);
                                      nextTiers[tIdx] = parseFloat(e.target.value) || 0;
                                      handleUpdateQuestion(qIdx, { tfTierPoints: nextTiers });
                                    }}
                                    className="w-16 px-1.5 py-1 text-xs font-bold text-center bg-white border border-slate-300 rounded focus:ring-1 focus:ring-emerald-600 focus:outline-none font-mono"
                                  />
                                  <span className="text-[11px] text-slate-500 font-bold">đ</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {(!q.tfScoringMode || q.tfScoringMode === 'standard_ministry') && (
                      <div className="text-[11px] text-emerald-800 bg-white/80 p-2 rounded border border-emerald-200/60 flex items-center justify-between flex-wrap gap-2">
                        <span>
                          ★ <strong>Quy chế Bộ GD&ĐT 2025:</strong> Thí sinh chỉ đúng 1 ý được <strong>{(0.1 * (q.points || 1.0)).toFixed(2)}đ</strong> (10%), đúng 2 ý được <strong>{(0.25 * (q.points || 1.0)).toFixed(2)}đ</strong> (25%), đúng 3 ý được <strong>{(0.5 * (q.points || 1.0)).toFixed(2)}đ</strong> (50%), đúng cả 4 ý được tối đa <strong>{(q.points || 1.0).toFixed(2)}đ</strong> (100%).
                        </span>
                      </div>
                    )}

                    {q.tfScoringMode === 'divide_equally' && (
                      <div className="text-[11px] text-slate-600 bg-white/80 p-2 rounded border border-slate-200">
                        Mỗi ý mệnh đề có giá trị điểm bằng nhau = <strong>{((q.points || 1.0) / ((q.tfItems || []).length || 1)).toFixed(2)} điểm/ý</strong>.
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-xs font-semibold text-slate-700">
                        Danh sách các ý mệnh đề (Chọn ĐÚNG hoặc SAI):
                      </label>
                      <div className="text-[11px] text-slate-500">
                        * Tích chọn đáp án ĐÚNG hoặc SAI cho từng ý bên dưới.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAddTfItem(qIdx)}
                      className="text-xs font-semibold text-emerald-700 hover:underline flex items-center gap-1 cursor-pointer shrink-0"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Thêm ý mệnh đề</span>
                    </button>
                  </div>

                  {(q.tfItems || []).map((item, itemIdx) => {
                    const letter = String.fromCharCode(97 + itemIdx);
                    return (
                      <div
                        key={item.id}
                        className="p-3 rounded-lg border border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center gap-2.5"
                      >
                        <span className="font-bold text-xs text-slate-800 w-5">{letter})</span>
                        <input
                          type="text"
                          value={item.statement}
                          onChange={(e) => handleUpdateTfItem(qIdx, itemIdx, { statement: e.target.value })}
                          placeholder={`Nội dung ý ${letter}...`}
                          className="flex-1 px-3 py-1.5 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900"
                        />

                        {/* Điểm từng ý */}
                        <div className="flex items-center gap-1 text-xs shrink-0">
                          <span className="text-slate-500">Điểm ý:</span>
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            placeholder="Chia đều"
                            value={item.points !== undefined ? item.points : ''}
                            onChange={(e) => {
                              const val = e.target.value === '' ? undefined : parseFloat(e.target.value);
                              handleUpdateTfItem(qIdx, itemIdx, { points: val });
                            }}
                            className="w-18 px-2 py-1 text-xs bg-white border border-slate-200 rounded font-mono"
                          />
                        </div>

                        {/* Đúng / Sai selector */}
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleUpdateTfItem(qIdx, itemIdx, { isCorrect: true })}
                            className={`px-3 py-1 text-xs font-bold rounded border transition-colors cursor-pointer ${
                              item.isCorrect
                                ? 'bg-emerald-600 text-white border-emerald-600'
                                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            ĐÚNG
                          </button>
                          <button
                            type="button"
                            onClick={() => handleUpdateTfItem(qIdx, itemIdx, { isCorrect: false })}
                            className={`px-3 py-1 text-xs font-bold rounded border transition-colors cursor-pointer ${
                              !item.isCorrect
                                ? 'bg-rose-600 text-white border-rose-600'
                                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            SAI
                          </button>
                          {(q.tfItems || []).length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveTfItem(qIdx, itemIdx)}
                              className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors cursor-pointer ml-1"
                              title="Xóa ý này"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* --- DẠNG 3: Text Input Editor --- */}
              {q.type === 'text_input' && (
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 mb-4 space-y-2">
                  <label className="block text-xs font-semibold text-slate-700">
                    Các đáp án được chấp nhận (viết số thập phân bằng dấu phẩy &quot;,&quot;, ngăn cách các đáp án đúng bằng dấu chấm phẩy &quot;;&quot;):
                  </label>
                  <input
                    type="text"
                    value={(q.acceptedAnswers || []).map((s) => formatShortAnswerDecimalComma(s)).join('; ')}
                    onChange={(e) => {
                      const list = e.target.value.split(';').map((s) => s.trim());
                      handleUpdateQuestion(qIdx, { acceptedAnswers: list });
                    }}
                    onBlur={(e) => {
                      const list = parseAcceptedShortAnswers(e.target.value);
                      handleUpdateQuestion(qIdx, { acceptedAnswers: list });
                    }}
                    placeholder="Ví dụ: 3,5; 7/2; -1,25"
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 font-mono"
                  />
                  <div className="text-[11px] text-slate-500">
                    Mẹo: Số thập phân viết dưới dạng dấu phẩy (vd: 3,5). Ngăn cách nhiều đáp án đúng bằng dấu chấm phẩy &quot;;&quot;.
                  </div>
                </div>
              )}

              {/* --- DẠNG 4: Matching Two-Column Editor --- */}
              {q.type === 'matching' && (
                <div className="mb-4">
                  <MatchingQuestionEditor
                    question={q}
                    onChange={(fields) => handleUpdateQuestion(qIdx, fields)}
                    idPrefix={q.id}
                  />
                </div>
              )}

              {/* --- DẠNG 5: Grouped Subquestions Editor --- */}
              {q.type === 'grouped' && (
                <div className="space-y-4 mb-4 p-4 bg-purple-50/40 rounded-xl border border-purple-200">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-purple-900 uppercase">
                      Danh sách các câu hỏi con trong chùm:
                    </label>
                    <button
                      type="button"
                      onClick={() => handleAddSubQuestion(qIdx)}
                      className="text-xs font-semibold text-purple-700 hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Thêm câu con</span>
                    </button>
                  </div>

                  {(q.subQuestions || []).map((subQ, sIdx) => (
                    <div key={subQ.id} className="p-3.5 bg-white rounded-xl border border-purple-200 shadow-2xs space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-purple-900 flex items-center gap-1.5">
                          <span className="w-5 h-5 rounded-full bg-purple-100 text-purple-800 flex items-center justify-center text-[11px] font-bold">
                            {sIdx + 1}
                          </span>
                          <span>Câu con {qIdx + 1}.{sIdx + 1}</span>
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-500 font-medium">Điểm:</span>
                          <input
                            type="number"
                            step="0.25"
                            value={subQ.points}
                            onChange={(e) => {
                              const nextSubs = [...(q.subQuestions || [])];
                              nextSubs[sIdx].points = parseFloat(e.target.value) || 0.5;
                              handleUpdateQuestion(qIdx, { subQuestions: nextSubs });
                            }}
                            className="w-16 px-2 py-0.5 text-xs border border-slate-200 rounded font-mono"
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveSubQuestion(qIdx, sIdx)}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors cursor-pointer"
                            title="Xóa câu con này"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Sub question statement text */}
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <label className="text-[11px] font-semibold text-slate-700">
                            Nội dung câu con (hỗ trợ $công thức$ và chèn ảnh tại vị trí con trỏ):
                          </label>
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() =>
                              openCursorImageModalForField(
                                qIdx,
                                'subQuestion',
                                `Câu con ${qIdx + 1}.${sIdx + 1}`,
                                sIdx
                              )
                            }
                            className="px-2 py-0.5 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                          >
                            <ImageIcon className="w-3 h-3" />
                            <span>Chèn ảnh tại con trỏ</span>
                          </button>
                        </div>
                        <textarea
                          ref={(el) => {
                            fieldTextareaRefs.current[`${qIdx}_${sIdx}_subQuestion`] = el;
                          }}
                          rows={2}
                          value={subQ.question}
                          onChange={(e) => {
                            const nextSubs = [...(q.subQuestions || [])];
                            nextSubs[sIdx] = { ...nextSubs[sIdx], question: e.target.value };
                            handleUpdateQuestion(qIdx, { subQuestions: nextSubs });
                          }}
                          onPaste={(e) =>
                            void handleTextareaPasteImage(
                              e,
                              qIdx,
                              'subQuestion',
                              `Câu con ${qIdx + 1}.${sIdx + 1}`,
                              sIdx
                            )
                          }
                          placeholder="Nội dung câu hỏi con..."
                          className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-600 font-mono"
                        />
                        <InlineImageStrip
                          content={subQ.question}
                          inlineImages={{ ...(q.inlineImages || {}), ...(subQ.inlineImages || {}) }}
                          label={`Ảnh chèn trong câu con ${qIdx + 1}.${sIdx + 1}`}
                          onUpdateContent={(nextText) => {
                            const nextSubs = [...(q.subQuestions || [])];
                            nextSubs[sIdx] = { ...nextSubs[sIdx], question: nextText };
                            handleUpdateQuestion(qIdx, { subQuestions: nextSubs });
                          }}
                        />
                      </div>

                      {/* Sub question prompt image upload (implicit URL, title-only) */}
                      <AttachedImageBox
                        compact
                        imageUrl={subQ.imageUrl}
                        caption={subQ.imageCaption || ''}
                        label={`Ảnh đề bài câu con ${qIdx + 1}.${sIdx + 1} (Tùy chọn)`}
                        onChangeImage={(nextUrl) => {
                          const nextSubs = [...(q.subQuestions || [])];
                          nextSubs[sIdx] = { ...nextSubs[sIdx], imageUrl: nextUrl };
                          handleUpdateQuestion(qIdx, { subQuestions: nextSubs });
                        }}
                        onChangeCaption={(nextCap) => {
                          const nextSubs = [...(q.subQuestions || [])];
                          nextSubs[sIdx] = { ...nextSubs[sIdx], imageCaption: nextCap };
                          handleUpdateQuestion(qIdx, { subQuestions: nextSubs });
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
                              const nextSubs = [...(q.subQuestions || [])];
                              nextSubs[sIdx] = {
                                ...nextSubs[sIdx],
                                type: 'single_choice',
                                options: nextSubs[sIdx].options && nextSubs[sIdx].options!.length > 0 ? nextSubs[sIdx].options : ['', '', '', ''],
                                correctAnswer: nextSubs[sIdx].correctAnswer ?? 0,
                              };
                              handleUpdateQuestion(qIdx, { subQuestions: nextSubs });
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
                              const nextSubs = [...(q.subQuestions || [])];
                              nextSubs[sIdx] = {
                                ...nextSubs[sIdx],
                                type: 'text_input',
                                acceptedAnswers: nextSubs[sIdx].acceptedAnswers && nextSubs[sIdx].acceptedAnswers!.length > 0 ? nextSubs[sIdx].acceptedAnswers : [''],
                              };
                              handleUpdateQuestion(qIdx, { subQuestions: nextSubs });
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
                                const nextSubs = [...(q.subQuestions || [])];
                                const sub = { ...nextSubs[sIdx] };
                                sub.options = [...(sub.options || []), ''];
                                sub.optionImages = sub.optionImages ? [...sub.optionImages, undefined] : undefined;
                                nextSubs[sIdx] = sub;
                                handleUpdateQuestion(qIdx, { subQuestions: nextSubs });
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
                                activeSubOptImgEdit?.qIdx === qIdx &&
                                activeSubOptImgEdit?.subIdx === sIdx &&
                                activeSubOptImgEdit?.optIdx === sOptIdx;

                              return (
                                <div key={sOptIdx} className="p-2 rounded-lg border border-slate-200 bg-slate-50/50 space-y-1.5">
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const nextSubs = [...(q.subQuestions || [])];
                                        nextSubs[sIdx].correctAnswer = sOptIdx;
                                        handleUpdateQuestion(qIdx, { subQuestions: nextSubs });
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
                                        const nextSubs = [...(q.subQuestions || [])];
                                        nextSubs[sIdx].options![sOptIdx] = e.target.value;
                                        handleUpdateQuestion(qIdx, { subQuestions: nextSubs });
                                      }}
                                      placeholder={`Nội dung ý ${sLetter} (chữ, công thức hoặc thêm ảnh)...`}
                                      className="flex-1 px-2.5 py-1 text-xs bg-white border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-purple-600"
                                    />

                                    {/* Sub Option Image Toggle Button */}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (isSubImgEditing) {
                                          setActiveSubOptImgEdit(null);
                                        } else {
                                          setActiveSubOptImgEdit({ qIdx, subIdx: sIdx, optIdx: sOptIdx });
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
                                          const nextSubs = [...(q.subQuestions || [])];
                                          const sub = { ...nextSubs[sIdx] };
                                          sub.options = (sub.options || []).filter((_, i) => i !== sOptIdx);
                                          if (sub.optionImages) {
                                            sub.optionImages = sub.optionImages.filter((_, i) => i !== sOptIdx);
                                          }
                                          if (sub.correctAnswer !== undefined && sub.correctAnswer >= sub.options.length) {
                                            sub.correctAnswer = sub.options.length - 1;
                                          }
                                          nextSubs[sIdx] = sub;
                                          handleUpdateQuestion(qIdx, { subQuestions: nextSubs });
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
                                    <div className="pt-1 pl-7 pr-1">
                                      <AttachedImageBox
                                        compact
                                        showCaption={false}
                                        imageUrl={subOptImg}
                                        label={`Ảnh đáp án ${sLetter}`}
                                        onChangeImage={(nextUrl) =>
                                          handleUpdateSubOptionImage(qIdx, sIdx, sOptIdx, nextUrl)
                                        }
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
                              const nextSubs = [...(q.subQuestions || [])];
                              nextSubs[sIdx] = {
                                ...nextSubs[sIdx],
                                acceptedAnswers: e.target.value.split(';').map((s) => s.trim()),
                              };
                              handleUpdateQuestion(qIdx, { subQuestions: nextSubs });
                            }}
                            onBlur={(e) => {
                              const nextSubs = [...(q.subQuestions || [])];
                              nextSubs[sIdx] = {
                                ...nextSubs[sIdx],
                                acceptedAnswers: parseAcceptedShortAnswers(e.target.value),
                              };
                              handleUpdateQuestion(qIdx, { subQuestions: nextSubs });
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
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <label className="text-[11px] font-bold text-blue-900">
                            Lời giải chi tiết câu con {qIdx + 1}.{sIdx + 1} (Tùy chọn):
                          </label>
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() =>
                              openCursorImageModalForField(
                                qIdx,
                                'subExplanation',
                                `Lời giải câu con ${qIdx + 1}.${sIdx + 1}`,
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
                            fieldTextareaRefs.current[`${qIdx}_${sIdx}_subExplanation`] = el;
                          }}
                          rows={2}
                          value={subQ.explanation || ''}
                          onChange={(e) => {
                            const nextSubs = [...(q.subQuestions || [])];
                            nextSubs[sIdx] = { ...nextSubs[sIdx], explanation: e.target.value };
                            handleUpdateQuestion(qIdx, { subQuestions: nextSubs });
                          }}
                          onPaste={(e) =>
                            void handleTextareaPasteImage(
                              e,
                              qIdx,
                              'subExplanation',
                              `Lời giải câu con ${qIdx + 1}.${sIdx + 1}`,
                              sIdx
                            )
                          }
                          placeholder="Nhập lời giải câu con (Ctrl+V hoặc chèn ảnh tại vị trí con trỏ)..."
                          className="w-full px-2.5 py-1.5 text-xs bg-white border border-blue-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-600 font-mono"
                        />
                        <InlineImageStrip
                          content={subQ.explanation || ''}
                          inlineImages={{ ...(q.inlineImages || {}), ...(subQ.inlineImages || {}) }}
                          label="Ảnh chèn trong lời giải câu con"
                          onUpdateContent={(nextText) => {
                            const nextSubs = [...(q.subQuestions || [])];
                            nextSubs[sIdx] = { ...nextSubs[sIdx], explanation: nextText };
                            handleUpdateQuestion(qIdx, { subQuestions: nextSubs });
                          }}
                        />
                        <AttachedImageBox
                          compact
                          imageUrl={subQ.explanationImageUrl}
                          caption={subQ.explanationImageCaption || ''}
                          label="Ảnh minh họa đính kèm lời giải câu con (Tùy chọn)"
                          onChangeImage={(nextUrl) => {
                            const nextSubs = [...(q.subQuestions || [])];
                            nextSubs[sIdx] = { ...nextSubs[sIdx], explanationImageUrl: nextUrl };
                            handleUpdateQuestion(qIdx, { subQuestions: nextSubs });
                          }}
                          onChangeCaption={(nextCap) => {
                            const nextSubs = [...(q.subQuestions || [])];
                            nextSubs[sIdx] = { ...nextSubs[sIdx], explanationImageCaption: nextCap };
                            handleUpdateQuestion(qIdx, { subQuestions: nextSubs });
                          }}
                          onError={setErrorMessage}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* --- DẠNG 6: Essay / Online Written Editor --- */}
              {q.type === 'essay' && (
                <div className="p-4 bg-cyan-50/50 rounded-xl border border-cyan-200 mb-4 space-y-2.5">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <label className="text-xs font-bold text-cyan-950 flex items-center gap-1.5">
                      <Edit3 className="w-3.5 h-3.5 text-cyan-700" />
                      <span>Cài đặt câu Tự luận / Soạn thảo văn bản trực tuyến</span>
                    </label>
                    <span className="text-[11px] text-cyan-800">
                      Thí sinh có khung soạn thảo + thanh công thức Toán đầy đủ
                    </span>
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                      <label className="block text-xs font-semibold text-slate-700">
                        Đáp án tham khảo / Biểu điểm gợi ý (Tùy chọn — hỗ trợ chèn công thức & ảnh tại con trỏ):
                      </label>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() =>
                            openCursorImageModalForField(
                              qIdx,
                              'sampleAnswer',
                              `Đáp án tham khảo Câu ${qIdx + 1}`
                            )
                          }
                          className="px-2 py-0.5 bg-white hover:bg-purple-50 text-purple-700 border border-purple-200 rounded text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                        >
                          <ImageIcon className="w-3 h-3" />
                          <span>Chèn ảnh tại con trỏ</span>
                        </button>
                        <CopyContentButton compact getText={() => q.sampleAnswer || ''} />
                      </div>
                    </div>
                    <textarea
                      ref={(el) => {
                        fieldTextareaRefs.current[`${qIdx}_sampleAnswer`] = el;
                      }}
                      rows={3}
                      value={q.sampleAnswer || ''}
                      onChange={(e) => handleUpdateQuestion(qIdx, { sampleAnswer: e.target.value })}
                      onPaste={(e) =>
                        void handleTextareaPasteImage(
                          e,
                          qIdx,
                          'sampleAnswer',
                          `Đáp án tham khảo Câu ${qIdx + 1}`
                        )
                      }
                      placeholder="Nhập bài giải mẫu hoặc các ý cần đạt để học sinh đối chiếu sau khi thi..."
                      className="w-full px-3 py-2 text-xs font-mono bg-white border border-cyan-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-600"
                    />
                    <InlineImageStrip
                      content={q.sampleAnswer || ''}
                      inlineImages={q.inlineImages}
                      label="Ảnh chèn trong đáp án tham khảo"
                      onUpdateContent={(nextText) =>
                        handleUpdateQuestion(qIdx, { sampleAnswer: nextText })
                      }
                    />
                    {q.sampleAnswer && q.sampleAnswer.trim() && (
                      <div className="mt-2 p-2.5 bg-white border border-cyan-200 rounded-lg text-xs">
                        <div className="text-[10px] font-bold text-cyan-800 uppercase mb-1 flex items-center gap-1">
                          <Eye className="w-3 h-3" />
                          <span>Xem trước đáp án tham khảo:</span>
                        </div>
                        <RichContentRenderer
                          content={q.sampleAnswer}
                          inlineImages={q.inlineImages}
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Explanation Input + Cursor-Inserted Images + Attached Solution Image + Live Preview */}
              <div className="p-3.5 bg-blue-50/40 border border-blue-200/80 rounded-xl space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="block text-xs font-bold text-blue-950">
                    Lời giải thích chi tiết (hỗ trợ công thức toán, Ctrl+V dán ảnh hoặc chèn ảnh tại vị trí con trỏ):
                  </label>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() =>
                        openCursorImageModalForField(
                          qIdx,
                          'explanation',
                          `Lời giải chi tiết Câu ${qIdx + 1}`
                        )
                      }
                      className="px-2.5 py-1 bg-white hover:bg-purple-50 text-purple-700 border border-purple-200 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer shadow-2xs"
                    >
                      <ImageIcon className="w-3 h-3" />
                      <span>Chèn ảnh tại con trỏ</span>
                    </button>
                    <CopyContentButton compact getText={() => q.explanation || ''} />
                  </div>
                </div>
                <textarea
                  ref={(el) => {
                    fieldTextareaRefs.current[`${qIdx}_explanation`] = el;
                  }}
                  rows={3}
                  value={q.explanation}
                  onChange={(e) => handleUpdateQuestion(qIdx, { explanation: e.target.value })}
                  onPaste={(e) =>
                    void handleTextareaPasteImage(
                      e,
                      qIdx,
                      'explanation',
                      `Lời giải chi tiết Câu ${qIdx + 1}`
                    )
                  }
                  placeholder="Nhập lời giải chi tiết... (đặt con trỏ tại bất kỳ đâu rồi bấm 'Chèn ảnh tại con trỏ' hoặc Ctrl+V để chèn ảnh minh họa)"
                  className="w-full px-3 py-2 text-xs text-slate-800 bg-white border border-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 font-mono"
                />
                <InlineImageStrip
                  content={q.explanation}
                  inlineImages={q.inlineImages}
                  label="Ảnh chèn trong lời giải chi tiết"
                  onUpdateContent={(nextText) =>
                    handleUpdateQuestion(qIdx, { explanation: nextText })
                  }
                />
                <AttachedImageBox
                  compact
                  imageUrl={q.explanationImageUrl}
                  caption={q.explanationImageCaption || ''}
                  label="Ảnh minh họa đính kèm lời giải chi tiết (Tùy chọn)"
                  onChangeImage={(nextUrl) =>
                    handleUpdateQuestion(qIdx, { explanationImageUrl: nextUrl })
                  }
                  onChangeCaption={(nextCap) =>
                    handleUpdateQuestion(qIdx, { explanationImageCaption: nextCap })
                  }
                  onError={setErrorMessage}
                />
                {((q.explanation && q.explanation.trim()) || q.explanationImageUrl) && (
                  <div className="p-2.5 bg-white border border-blue-200 rounded-lg text-xs">
                    <div className="text-[10px] font-bold text-blue-800 uppercase mb-1 flex items-center gap-1">
                      <Eye className="w-3 h-3" />
                      <span>Xem trước lời giải chi tiết:</span>
                    </div>
                    <RichContentRenderer
                      content={q.explanation || ''}
                      imageUrl={q.explanationImageUrl}
                      imageCaption={q.explanationImageCaption}
                      inlineImages={q.inlineImages}
                    />
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Add Question Buttons per type */}
          <div className="flex flex-wrap items-center gap-2 pt-2">
            {questions.length > 0 && (
              <button
                type="button"
                onClick={handleAddQuestionWithLastFormat}
                className="py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer"
                title="Thêm ngay 1 câu mới có cùng dạng, thang điểm và cấu trúc với câu cuối cùng"
              >
                <FilePlus2 className="w-4 h-4" />
                <span>+ Thêm câu giống định dạng câu cuối</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => handleAddQuestion('single_choice')}
              className="py-2.5 px-4 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl text-xs font-semibold text-slate-800 flex items-center gap-1.5 shadow-2xs cursor-pointer"
            >
              <Plus className="w-4 h-4 text-blue-600" />
              <span>+ Thêm câu Trắc nghiệm 1 đáp án</span>
            </button>
            <button
              type="button"
              onClick={() => handleAddQuestion('true_false')}
              className="py-2.5 px-4 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl text-xs font-semibold text-slate-800 flex items-center gap-1.5 shadow-2xs cursor-pointer"
            >
              <Plus className="w-4 h-4 text-emerald-600" />
              <span>+ Thêm câu Trắc nghiệm Đúng / Sai</span>
            </button>
            <button
              type="button"
              onClick={() => handleAddQuestion('text_input')}
              className="py-2.5 px-4 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl text-xs font-semibold text-slate-800 flex items-center gap-1.5 shadow-2xs cursor-pointer"
            >
              <Plus className="w-4 h-4 text-amber-600" />
              <span>+ Thêm câu Trả lời ngắn</span>
            </button>
            <button
              type="button"
              onClick={() => handleAddQuestion('matching')}
              className="py-2.5 px-4 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl text-xs font-semibold text-slate-800 flex items-center gap-1.5 shadow-2xs cursor-pointer"
            >
              <Plus className="w-4 h-4 text-indigo-600" />
              <span>+ Thêm câu Ghép đôi (2 cột)</span>
            </button>
            <button
              type="button"
              onClick={() => handleAddQuestion('grouped')}
              className="py-2.5 px-4 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl text-xs font-semibold text-slate-800 flex items-center gap-1.5 shadow-2xs cursor-pointer"
            >
              <Plus className="w-4 h-4 text-purple-600" />
              <span>+ Thêm câu hỏi chùm (Đọc hiểu)</span>
            </button>
            <button
              type="button"
              onClick={() => handleAddQuestion('essay')}
              className="py-2.5 px-4 bg-white border border-slate-200 hover:bg-cyan-50 rounded-xl text-xs font-semibold text-slate-800 flex items-center gap-1.5 shadow-2xs cursor-pointer"
            >
              <Plus className="w-4 h-4 text-cyan-700" />
              <span>+ Thêm câu Tự luận (Soạn thảo)</span>
            </button>
            <button
              type="button"
              onClick={() => setIsImportQuestionsOpen(true)}
              className="py-2.5 px-4 bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded-xl text-xs font-bold text-blue-800 flex items-center gap-1.5 shadow-2xs cursor-pointer"
            >
              <CopyPlus className="w-4 h-4 text-blue-600" />
              <span>+ Lấy câu hỏi từ đề khác</span>
            </button>
          </div>
        </div>
      )}

      {/* Tab 2: Quick Import from Text */}
      {activeTab === 'quickImport' && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100 mb-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Nhập đề tự động từ văn bản (Word / PDF / Ghi chú)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Hỗ trợ cả trắc nghiệm chọn phương án (A, B, C, D) và trắc nghiệm Đúng / Sai theo từng ý (a, b, c, d)
              </p>
            </div>
            <CopyContentButton compact getText={() => rawText} />
          </div>

          <textarea
            rows={14}
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            className="w-full p-4 font-mono text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600 mb-4 leading-relaxed"
          />

          <div className="flex justify-between items-center">
            <span className="text-xs text-slate-500">
              Mẹo: Hệ thống tự động phân loại trắc nghiệm đơn hoặc trắc nghiệm đúng sai theo ý.
            </span>
            <button
              onClick={handleParseRawText}
              className="py-2.5 px-5 text-xs sm:text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              <span>Phân tích & nạp vào đề</span>
            </button>
          </div>
        </div>
      )}

      {/* Bottom Sticky Action Bar */}
      <div className="sticky bottom-4 z-30 mt-8 p-4 bg-white/95 backdrop-blur-md rounded-2xl border border-slate-300 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => handleFinalSave(true)}
            className="py-2.5 px-4 text-xs sm:text-sm font-semibold text-slate-900 bg-amber-400 hover:bg-amber-300 rounded-xl transition-all flex items-center gap-2 shadow-xs cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>Lưu đề thi tại đây (Không thoát tab)</span>
          </button>

          {inPlaceSaveToast && (
            <span className="text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg animate-in fade-in">
              {inPlaceSaveToast}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={() => setIsFullPreviewOpen(true)}
            className="py-2.5 px-4 text-xs sm:text-sm font-semibold text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Eye className="w-4 h-4 text-blue-600" />
            <span>Xem trước toàn bộ câu hỏi</span>
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="py-2.5 px-4 text-xs sm:text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
          >
            Hủy & Quay lại
          </button>
          <button
            type="button"
            onClick={() => handleFinalSave(false)}
            className="py-2.5 px-5 text-xs sm:text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-colors flex items-center gap-2 shadow-md cursor-pointer"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>{isEditing ? 'Lưu thay đổi đề thi' : 'Lưu & Xuất bản đề thi'}</span>
          </button>
        </div>
      </div>

      {/* Full Draft Exam Preview Modal (Shows Prompts, Answers, Solutions) */}
      <ExamPreviewModal
        isOpen={isFullPreviewOpen}
        exam={isFullPreviewOpen ? buildDraftExamObject() : null}
        userRole="teacher"
        isTaking={false}
        onClose={() => setIsFullPreviewOpen(false)}
      />

      {/* Import Questions from Other Teachers' Exams (Read-Only Clones) */}
      <ImportQuestionsModal
        isOpen={isImportQuestionsOpen}
        onClose={() => setIsImportQuestionsOpen(false)}
        currentExamId={initialExam?.id}
        currentUser={currentUser}
        onImportQuestions={(clonedQuestions) => {
          setQuestions((prev) => [...prev, ...clonedQuestions]);
          setActiveTab('manual');
          setErrorMessage('');
          setSuccessNotice(
            `✓ Đã thêm ${clonedQuestions.length} câu hỏi (bản sao độc lập) vào đề thi đang soạn!`
          );
          setTimeout(() => setSuccessNotice(''), 4000);
        }}
      />

      {/* Cursor-Aware Image Title Modal for Prompt / Explanation / SubQuestions */}
      <InlineImageTitleModal
        isOpen={Boolean(cursorImageModal?.isOpen)}
        initialImageSrc={cursorImageModal?.initialImageSrc || ''}
        targetLabel={cursorImageModal?.targetLabel}
        onConfirm={handleConfirmCursorImageModal}
        onClose={() => setCursorImageModal(null)}
      />
    </div>
  );
};
