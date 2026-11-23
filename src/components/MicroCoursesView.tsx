import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  MicroCourse,
  CourseChapter,
  CourseLesson,
  CourseAttachment,
  LessonBlock,
  LessonBlockType,
  Exam,
  UserRole,
  Question,
  TrueFalseItem,
  Classroom,
  ExamVisibility,
  ExamStatus,
  MatchingItem,
  MatchingLabelStyle,
} from '../types/exam';
import {
  GraduationCap,
  BookOpen,
  Play,
  Plus,
  Clock,
  Award,
  CheckCircle2,
  Trash2,
  Edit3,
  ChevronRight,
  ChevronDown,
  FileText,
  Lightbulb,
  Sparkles,
  Check,
  X,
  HelpCircle,
  Send,
  Layers,
  ArrowRight,
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  Zap,
  BookmarkCheck,
  Image as ImageIcon,
  Upload,
  Download,
  Globe,
  Users,
  Lock,
  AlertCircle,
  Package,
  Eye,
  EyeOff,
  Calendar,
  Paperclip,
  Link2,
  ExternalLink,
} from 'lucide-react';
import {
  saveCourse,
  deleteCourse,
  getCurrentUser,
  MASTER_ADMIN_EMAIL,
  getStudentCourseProgress,
  markBlockCompleted,
  markLessonCompleted,
  recordInteractiveAnswer,
  setStudentCourseLocation,
  calculateCourseProgressPercentage,
  syncCourseScormState,
  getCourseTrackingUnits,
  canShowInPublicLibrary,
  canUserAccessProtectedItem,
  isCreatorOfItem,
  isMasterAdminUser,
  getAllClassrooms,
  getVisibleClassrooms,
  isItemScheduleOpen,
  formatVietnameseDateTime,
} from '../utils/storage';
import { matchChapterAndLessonBySlug } from '../utils/urlRouter';
import { processImageFile } from '../utils/imageUpload';
import { insertTextAtEditableElement } from '../utils/cursorInsert';
import { downloadCourseAsScorm12Zip } from '../utils/scormExport';
import { RichContentRenderer } from './RichContentRenderer';
import { MathToolbar } from './MathToolbar';
import { ConfirmModal } from './ConfirmModal';
import { CopyContentButton } from './CopyContentButton';
import { MatchingQuestionView } from './MatchingQuestionView';
import { MatchingQuestionEditor } from './MatchingQuestionEditor';
import { createDefaultMatchingData } from '../utils/matching';
import {
  gradeQuestion,
  formatTrueFalseScoringRule,
  formatAcceptedShortAnswersList,
  parseAcceptedShortAnswers,
} from '../utils/scoring';

const MAX_COURSE_SINGLE_FILE_BYTES = 700 * 1024; // 700 KB mỗi tệp đính kèm trực tiếp để đảm bảo đồng bộ Cloud Firestore (< 1MB/doc)
const MAX_COURSE_DOC_TOTAL_CHARS = 940 * 1024;
const COURSE_FILE_ACCEPT =
  '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.csv,.rtf,.odt,.ods,.odp,.zip,.rar,.7z,image/*,audio/*,video/*';

function readCourseFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error(`Không thể đọc tệp "${file.name}"`));
    reader.readAsDataURL(file);
  });
}

function formatCourseFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return 'Liên kết';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function getCourseAttachmentBadge(att: CourseAttachment): {
  ext: string;
  label: string;
  colorClass: string;
} {
  const nameLower = (att.name || '').toLowerCase();
  const mimeLower = (att.mimeType || '').toLowerCase();
  if (att.url && !att.dataUrl) {
    if (nameLower.endsWith('.pdf')) {
      return { ext: 'PDF', label: 'Link PDF', colorClass: 'bg-rose-100 text-rose-800 border-rose-200' };
    }
    return { ext: 'LINK', label: 'Liên kết ngoài', colorClass: 'bg-blue-100 text-blue-800 border-blue-200' };
  }
  if (mimeLower.includes('pdf') || nameLower.endsWith('.pdf')) {
    return { ext: 'PDF', label: 'Tài liệu PDF', colorClass: 'bg-rose-100 text-rose-800 border-rose-200' };
  }
  if (mimeLower.includes('word') || nameLower.endsWith('.doc') || nameLower.endsWith('.docx') || nameLower.endsWith('.odt')) {
    return { ext: 'DOC', label: 'Văn bản Word', colorClass: 'bg-blue-100 text-blue-800 border-blue-200' };
  }
  if (mimeLower.includes('presentation') || mimeLower.includes('powerpoint') || nameLower.endsWith('.ppt') || nameLower.endsWith('.pptx') || nameLower.endsWith('.odp')) {
    return { ext: 'PPT', label: 'Bài giảng Slide', colorClass: 'bg-amber-100 text-amber-800 border-amber-200' };
  }
  if (mimeLower.includes('sheet') || mimeLower.includes('excel') || nameLower.endsWith('.xls') || nameLower.endsWith('.xlsx') || nameLower.endsWith('.csv') || nameLower.endsWith('.ods')) {
    return { ext: 'XLS', label: 'Bảng tính Excel/CSV', colorClass: 'bg-emerald-100 text-emerald-800 border-emerald-200' };
  }
  if (mimeLower.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)$/i.test(nameLower)) {
    return { ext: 'IMG', label: 'Hình ảnh', colorClass: 'bg-purple-100 text-purple-800 border-purple-200' };
  }
  if (mimeLower.startsWith('audio/') || /\.(mp3|wav|ogg|m4a)$/i.test(nameLower)) {
    return { ext: 'MP3', label: 'Âm thanh', colorClass: 'bg-indigo-100 text-indigo-800 border-indigo-200' };
  }
  if (mimeLower.startsWith('video/') || /\.(mp4|webm|mov)$/i.test(nameLower)) {
    return { ext: 'MP4', label: 'Video', colorClass: 'bg-cyan-100 text-cyan-800 border-cyan-200' };
  }
  if (/\.(zip|rar|7z)$/i.test(nameLower)) {
    return { ext: 'ZIP', label: 'Tệp nén', colorClass: 'bg-slate-200 text-slate-800 border-slate-300' };
  }
  return { ext: 'FILE', label: 'Tệp tài liệu', colorClass: 'bg-slate-100 text-slate-700 border-slate-200' };
}

function getCourseAttachmentPreviewKind(att: CourseAttachment): 'pdf' | 'image' | 'text' | 'none' {
  const nameLower = (att.name || '').toLowerCase();
  const mimeLower = (att.mimeType || '').toLowerCase();
  const src = att.dataUrl || att.url || '';
  if (!src) return 'none';
  if (mimeLower.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(nameLower)) {
    return 'image';
  }
  if (mimeLower.includes('pdf') || nameLower.endsWith('.pdf')) {
    return 'pdf';
  }
  if (
    att.dataUrl &&
    (mimeLower.startsWith('text/') || nameLower.endsWith('.txt') || nameLower.endsWith('.csv'))
  ) {
    return 'text';
  }
  return 'none';
}

function decodeBase64DataUrlText(dataUrl?: string): string {
  if (!dataUrl || !dataUrl.includes(',')) return '';
  try {
    const b64 = dataUrl.split(',')[1] || '';
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return '';
  }
}

function extractInlineMarkdownImages(markdown: string): { fullMatch: string; alt: string; src: string }[] {
  if (!markdown) return [];
  const results: { fullMatch: string; alt: string; src: string }[] = [];
  const regex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(markdown)) !== null) {
    results.push({ fullMatch: m[0], alt: m[1] || 'Hình minh họa', src: m[2] });
  }
  return results;
}

import type { UnsavedNavigationGuard } from './UnsavedChangesModal';

interface MicroCoursesViewProps {
  courses: MicroCourse[];
  allExams: Exam[];
  classrooms?: Classroom[];
  initialCourseId?: string;
  initialChapterSlug?: string;
  initialLessonSlug?: string;
  userRole: UserRole;
  onRefreshCourses: () => void;
  onStartExam: (exam: Exam, mode: 'exam' | 'practice') => void;
  onCourseLocationChange?: (
    course: MicroCourse | null,
    chapter: CourseChapter | null,
    lesson: CourseLesson | null
  ) => void;
  onRegisterUnsavedGuard?: (guard: UnsavedNavigationGuard | null) => void;
}

export const MicroCoursesView: React.FC<MicroCoursesViewProps> = ({
  courses,
  allExams,
  classrooms,
  initialCourseId,
  initialChapterSlug,
  initialLessonSlug,
  userRole,
  onRefreshCourses,
  onStartExam,
  onCourseLocationChange,
  onRegisterUnsavedGuard,
}) => {
  const currentUser = getCurrentUser();
  const currentUserId = currentUser?.id || 'guest_user';
  const isTeacher =
    userRole === 'teacher' &&
    Boolean(
      currentUser &&
        (currentUser.role === 'teacher' ||
          currentUser.email.toLowerCase() === MASTER_ADMIN_EMAIL.toLowerCase())
    );

  const allClassrooms = classrooms || getAllClassrooms();
  const teacherOwnClassrooms = useMemo(
    () => getVisibleClassrooms(allClassrooms, currentUser),
    [allClassrooms, currentUser]
  );

  // Strict visibility isolation:
  // - Public feed shows public courses + creator's own courses (when in teacher mode)
  // - Plus allow opening a class-assigned course if navigated directly from an enrolled classroom
  const visibleCourses = useMemo(() => {
    return courses.filter((c) => {
      if (canShowInPublicLibrary(c, currentUser, userRole, allClassrooms)) return true;
      if (initialCourseId && c.id === initialCourseId) {
        return canUserAccessProtectedItem(c, currentUser, userRole, allClassrooms).allowed;
      }
      return false;
    });
  }, [courses, currentUser, userRole, initialCourseId, allClassrooms]);

  const [selectedCourseId, setSelectedCourseId] = useState<string>(
    initialCourseId || visibleCourses[0]?.id || ''
  );

  useEffect(() => {
    if (initialCourseId && visibleCourses.some((c) => c.id === initialCourseId)) {
      setSelectedCourseId(initialCourseId);
    } else if (!visibleCourses.some((c) => c.id === selectedCourseId)) {
      setSelectedCourseId(visibleCourses[0]?.id || '');
    }
  }, [initialCourseId, visibleCourses, selectedCourseId]);

  const currentCourse =
    visibleCourses.find((c) => c.id === selectedCourseId) || visibleCourses[0];

  const canManageCourse = (course?: MicroCourse | null) =>
    Boolean(isTeacher && course && (isCreatorOfItem(course, currentUser) || isMasterAdminUser(currentUser)));
  const canManageCurrent = canManageCourse(currentCourse);

  // Live schedule tick for course open/close boundaries
  const [scheduleNowTick, setScheduleNowTick] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setScheduleNowTick(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  const courseSchedule = useMemo(() => {
    void scheduleNowTick;
    return currentCourse ? isItemScheduleOpen(currentCourse, 'course') : null;
  }, [currentCourse, scheduleNowTick]);

  const isCourseBlockedBySchedule = Boolean(
    currentCourse && !canManageCurrent && courseSchedule && !courseSchedule.isOpen
  );

  // Selected Chapter, Lesson and active Block
  const [activeChapterId, setActiveChapterId] = useState<string>('');
  const [activeLessonId, setActiveLessonId] = useState<string>('');
  const [activeBlockIndex, setActiveBlockIndex] = useState<number>(0);
  const [expandedChapterIds, setExpandedChapterIds] = useState<{ [id: string]: boolean }>({});

  // Student Course Progress State
  const [progress, setProgress] = useState(() =>
    currentCourse
      ? syncCourseScormState(
          currentCourse,
          getStudentCourseProgress(currentCourse.id, currentUserId)
        )
      : null
  );

  // Interactive Question State inside lesson
  const [checkpointAnswers, setCheckpointAnswers] = useState<{ [blockId: string]: any }>({});
  const [checkpointResults, setCheckpointResults] = useState<{
    [blockId: string]: { isCorrect: boolean; earned: number; max: number; explanation: string };
  }>({});

  // Feedback toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Confirm delete modal
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  // Course Preview Modal State
  const [isCoursePreviewOpen, setIsCoursePreviewOpen] = useState(false);
  const [coursePreviewTab, setCoursePreviewTab] = useState<'full_syllabus' | 'lesson_sim'>(
    'full_syllabus'
  );
  const [coursePreviewShowAnswers, setCoursePreviewShowAnswers] = useState(false);
  const [previewLessonId, setPreviewLessonId] = useState<string>('');

  // --- Modals for Creator Management ---
  const [isCourseModalOpen, setIsCourseModalOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Partial<MicroCourse> | null>(null);
  const [courseModalError, setCourseModalError] = useState<string | null>(null);

  const [isChapterModalOpen, setIsChapterModalOpen] = useState(false);
  const [editingChapter, setEditingChapter] = useState<{
    id?: string;
    title: string;
    description: string;
    order: number;
    chapterExamId?: string;
  } | null>(null);

  const [isLessonModalOpen, setIsLessonModalOpen] = useState(false);
  const [targetChapterIdForLesson, setTargetChapterIdForLesson] = useState<string>('');
  const [originalChapterIdForLesson, setOriginalChapterIdForLesson] = useState<string>('');
  const [editingLesson, setEditingLesson] = useState<Partial<CourseLesson> | null>(null);
  const [lessonFileUrl, setLessonFileUrl] = useState('');
  const [lessonFileName, setLessonFileName] = useState('');
  const [lessonModalError, setLessonModalError] = useState<string | null>(null);

  // Block Add/Edit Modal State
  const blockModalBodyRef = useRef<HTMLDivElement>(null);
  const theoryTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [isBlockModalOpen, setIsBlockModalOpen] = useState(false);
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [insertAtIndex, setInsertAtIndex] = useState<number | null>(null);
  const [blockModalError, setBlockModalError] = useState<string | null>(null);

  const [blockType, setBlockType] = useState<LessonBlockType>('theory');
  const [blockTitle, setBlockTitle] = useState('');
  const [blockContent, setBlockContent] = useState('');
  const [blockCalloutType, setBlockCalloutType] = useState<
    'formula' | 'tip' | 'warning' | 'info'
  >('formula');
  const [blockImageUrl, setBlockImageUrl] = useState('');
  const [blockCaption, setBlockCaption] = useState('');
  const [showTheoryImageUrlBar, setShowTheoryImageUrlBar] = useState(false);
  const [theoryImageUrl, setTheoryImageUrl] = useState('');
  const [theoryImageCaption, setTheoryImageCaption] = useState('');
  const [blockAttachments, setBlockAttachments] = useState<CourseAttachment[]>([]);
  const [blockFileUrl, setBlockFileUrl] = useState('');
  const [blockFileName, setBlockFileName] = useState('');
  const [previewingAttachment, setPreviewingAttachment] = useState<CourseAttachment | null>(null);

  // Checkpoint question editor state
  const [cpType, setCpType] = useState<
    'single_choice' | 'multiple_choice' | 'true_false' | 'text_input' | 'matching'
  >('single_choice');
  const [cpQuestion, setCpQuestion] = useState('');
  const [cpQuestionImageUrl, setCpQuestionImageUrl] = useState('');
  const [cpOptions, setCpOptions] = useState<string[]>(['', '', '', '']);
  const [cpCorrectSingle, setCpCorrectSingle] = useState(0);
  const [cpCorrectMulti, setCpCorrectMulti] = useState<number[]>([0]);
  const [cpTfItems, setCpTfItems] = useState<TrueFalseItem[]>([
    { id: 'tf_1', statement: '', isCorrect: true },
    { id: 'tf_2', statement: '', isCorrect: false },
    { id: 'tf_3', statement: '', isCorrect: true },
    { id: 'tf_4', statement: '', isCorrect: false },
  ]);
  const [cpAcceptedAnswersText, setCpAcceptedAnswersText] = useState('');
  const [cpMatchingData, setCpMatchingData] = useState<{
    matchingLeftLabelStyle: MatchingLabelStyle;
    matchingRightLabelStyle: MatchingLabelStyle;
    matchingLeftItems: MatchingItem[];
    matchingRightItems: MatchingItem[];
    matchingCorrectPairs: { [leftId: string]: string };
  }>(() => createDefaultMatchingData('cp_m'));
  const [cpPoints, setCpPoints] = useState<number>(1.0);
  const [cpExplanation, setCpExplanation] = useState('');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3200);
  };

  // Extract all lessons from chapters or fallback lessons
  const allLessons = useMemo(() => {
    const list: { chapter: CourseChapter | null; lesson: CourseLesson }[] = [];
    if (currentCourse?.chapters && currentCourse.chapters.length > 0) {
      currentCourse.chapters.forEach((chap) => {
        (chap.lessons || []).forEach((les) => list.push({ chapter: chap, lesson: les }));
      });
    } else if (currentCourse?.lessons) {
      currentCourse.lessons.forEach((les) => list.push({ chapter: null, lesson: les }));
    }
    return list;
  }, [currentCourse]);

  // Helper kiểm tra hoàn thành từng block chặt chẽ
  const isBlockCompletedForProgress = (
    block: LessonBlock,
    prog: typeof progress
  ): boolean => {
    if (!prog) return false;
    if (block.type === 'question') {
      const savedAns = prog.interactiveAnswers?.[block.id];
      if (savedAns) return savedAns.isCorrect === true;
      return Boolean(prog.completedBlockIds?.includes(block.id));
    }
    return Boolean(prog.completedBlockIds?.includes(block.id));
  };

  // Xác định bài học cao nhất đã mở khóa cho học sinh (bài chưa hoàn thành đầu tiên)
  const maxUnlockedLessonIndex = useMemo(() => {
    if (allLessons.length === 0) return -1;
    if (canManageCurrent) return allLessons.length - 1;
    const firstIncomplete = allLessons.findIndex(
      (item) => !progress?.completedLessonIds.includes(item.lesson.id)
    );
    return firstIncomplete === -1 ? allLessons.length - 1 : firstIncomplete;
  }, [allLessons, canManageCurrent, progress?.completedLessonIds]);

  const isLessonLockedAt = (lessonIdx: number): boolean => {
    if (canManageCurrent) return false;
    if (maxUnlockedLessonIndex < 0) return false;
    return lessonIdx > maxUnlockedLessonIndex;
  };

  const appliedUrlRouteKeyRef = useRef<string>('');
  const lastSyncedCourseUserRef = useRef<string>('');

  // Sync current chapter, lesson, restored interactive answers, and resume location
  useEffect(() => {
    if (!currentCourse) {
      lastSyncedCourseUserRef.current = '';
      setProgress(null);
      setActiveLessonId('');
      setActiveBlockIndex(0);
      setCheckpointAnswers({});
      setCheckpointResults({});
      return;
    }

    const courseUserKey = `${currentCourse.id}::${currentUserId}`;
    const isSameCourseAndUser = lastSyncedCourseUserRef.current === courseUserKey;
    lastSyncedCourseUserRef.current = courseUserKey;

    const synced = syncCourseScormState(
      currentCourse,
      getStudentCourseProgress(currentCourse.id, currentUserId)
    );
    setProgress(synced);

    // Khôi phục đáp án và kết quả các câu hỏi tương tác đã lưu
    const restoredAnswers: { [blockId: string]: any } = {};
    const restoredResults: {
      [blockId: string]: { isCorrect: boolean; earned: number; max: number; explanation: string };
    } = {};

    allLessons.forEach(({ lesson }) => {
      (lesson.blocks || []).forEach((blk) => {
        if (blk.type === 'question' && blk.question) {
          const saved = synced.interactiveAnswers?.[blk.id];
          if (saved) {
            restoredAnswers[blk.id] = saved.selectedAnswer;
            const graded = gradeQuestion(blk.question, saved.selectedAnswer);
            restoredResults[blk.id] = {
              isCorrect: saved.isCorrect === true && graded.isFullyCorrect,
              earned: graded.earnedPoints,
              max: graded.maxPoints,
              explanation: blk.question.explanation || 'Xem lại lý thuyết ở trên.',
            };
          }
        }
      });
    });

    if (isSameCourseAndUser) {
      // Giữ nguyên đáp án/nội dung đang chọn dở khi component re-render hoặc cập nhật URL trong cùng khóa
      setCheckpointAnswers((prev) => ({ ...restoredAnswers, ...prev }));
      setCheckpointResults((prev) => ({ ...restoredResults, ...prev }));
    } else {
      setCheckpointAnswers(restoredAnswers);
      setCheckpointResults(restoredResults);
    }

    const firstIncomplete = allLessons.findIndex(
      (item) => !synced.completedLessonIds.includes(item.lesson.id)
    );
    const maxAllowedIdx =
      canManageCurrent || firstIncomplete === -1
        ? allLessons.length - 1
        : firstIncomplete;

    let chosenIndex = -1;
    const urlRouteKey = `${initialChapterSlug || ''}::${initialLessonSlug || ''}`;
    const hasNewUrlNavigation =
      Boolean(initialChapterSlug || initialLessonSlug) && appliedUrlRouteKeyRef.current !== urlRouteKey;

    // Ưu tiên route từ URL nếu có và chưa được áp dụng cho điều hướng hiện tại
    if (hasNewUrlNavigation) {
      appliedUrlRouteKeyRef.current = urlRouteKey;
      const matched = matchChapterAndLessonBySlug(
        currentCourse,
        initialChapterSlug,
        initialLessonSlug
      );
      if (matched.lessonId) {
        const idx = allLessons.findIndex((x) => x.lesson.id === matched.lessonId);
        if (idx !== -1) {
          if (canManageCurrent || idx <= maxAllowedIdx) {
            chosenIndex = idx;
          } else {
            chosenIndex = Math.max(0, maxAllowedIdx);
          }
        }
      }
    }

    // Nếu đã chọn bài hợp lệ trong cùng khóa và không có điều hướng URL mới -> giữ nguyên vị trí block đang xem/soạn
    if (isSameCourseAndUser && !hasNewUrlNavigation && activeLessonId) {
      const stillExists = allLessons.some((x) => x.lesson.id === activeLessonId);
      if (stillExists) {
        return;
      }
    }

    // Nếu chưa có từ URL hoặc bài đang chọn không thuộc khóa này -> khôi phục tiến độ đang học dở
    if (chosenIndex === -1) {
      const existingIdx = activeLessonId
        ? allLessons.findIndex((x) => x.lesson.id === activeLessonId)
        : -1;
      if (existingIdx !== -1 && (canManageCurrent || existingIdx <= maxAllowedIdx)) {
        chosenIndex = existingIdx;
      } else if (synced.currentLessonId) {
        const savedIdx = allLessons.findIndex((x) => x.lesson.id === synced.currentLessonId);
        if (savedIdx !== -1 && (canManageCurrent || savedIdx <= maxAllowedIdx)) {
          chosenIndex = savedIdx;
        }
      }
    }

    if (chosenIndex === -1 && allLessons.length > 0) {
      chosenIndex = Math.max(0, Math.min(allLessons.length - 1, maxAllowedIdx));
    }

    if (chosenIndex >= 0 && allLessons[chosenIndex]) {
      const target = allLessons[chosenIndex];
      setActiveLessonId(target.lesson.id);
      if (target.chapter) {
        setActiveChapterId(target.chapter.id);
        setExpandedChapterIds((prev) => ({ ...prev, [target.chapter!.id]: true }));
      }
      const blocks = target.lesson.blocks || [];
      const firstIncompleteBlk = blocks.findIndex(
        (b) => !isBlockCompletedForProgress(b, synced)
      );
      const maxBlkIdx =
        canManageCurrent || firstIncompleteBlk === -1
          ? Math.max(0, blocks.length - 1)
          : firstIncompleteBlk;
      const savedBlkId = synced.currentBlockIdsByLesson?.[target.lesson.id];
      const savedBlkIdx = savedBlkId
        ? blocks.findIndex((b) => b.id === savedBlkId)
        : -1;
      const nextBlkIdx =
        savedBlkIdx >= 0 && savedBlkIdx <= maxBlkIdx ? savedBlkIdx : maxBlkIdx;
      setActiveBlockIndex(Math.max(0, nextBlkIdx));
    } else {
      setActiveLessonId('');
      setActiveBlockIndex(0);
    }
  }, [selectedCourseId, currentCourse?.id, currentUserId, initialChapterSlug, initialLessonSlug]);

  const activeLessonEntry =
    allLessons.find((item) => item.lesson.id === activeLessonId) || allLessons[0];
  const activeLessonItem = activeLessonEntry?.lesson;
  const activeChapterItem = activeLessonEntry?.chapter;

  const activeLessonBlocks = activeLessonItem?.blocks || [];
  const maxUnlockedBlockIndex = useMemo(() => {
    if (activeLessonBlocks.length === 0) return -1;
    if (canManageCurrent) return activeLessonBlocks.length - 1;
    const firstIncompleteBlk = activeLessonBlocks.findIndex(
      (b) => !isBlockCompletedForProgress(b, progress)
    );
    return firstIncompleteBlk === -1
      ? activeLessonBlocks.length - 1
      : firstIncompleteBlk;
  }, [activeLessonBlocks, canManageCurrent, progress]);

  const safeActiveBlockIndex =
    activeLessonBlocks.length > 0
      ? Math.max(0, Math.min(activeBlockIndex, activeLessonBlocks.length - 1))
      : 0;
  const activeBlockItem =
    activeLessonBlocks.length > 0 ? activeLessonBlocks[safeActiveBlockIndex] : undefined;

  // Đồng bộ URL khi người dùng thay đổi khóa học / chương / bài học
  useEffect(() => {
    onCourseLocationChange?.(
      currentCourse || null,
      activeChapterItem || null,
      activeLessonItem || null
    );
  }, [currentCourse?.id, activeChapterItem?.id, activeLessonItem?.id]);

  const currentLessonIndex = allLessons.findIndex(
    (item) => item.lesson.id === activeLessonItem?.id
  );
  const prevLessonItem = currentLessonIndex > 0 ? allLessons[currentLessonIndex - 1] : null;
  const nextLessonItem =
    currentLessonIndex >= 0 && currentLessonIndex < allLessons.length - 1
      ? allLessons[currentLessonIndex + 1]
      : null;

  const lessonTopRef = useRef<HTMLDivElement | null>(null);
  const blockBottomSentinelRef = useRef<HTMLDivElement | null>(null);
  const lessonBottomSentinelRef = useRef<HTMLDivElement | null>(null);
  const prevScrollResetKeyRef = useRef<string>('');
  const scrollAutoReadyAtRef = useRef<number>(0);

  const activeScrollResetKey =
    currentCourse && activeLessonItem
      ? `${currentCourse.id}::${activeLessonItem.id}::${
          canManageCurrent ? 'manage' : activeBlockItem?.id || 'empty'
        }`
      : '';
  const isActiveLessonDone = Boolean(
    activeLessonItem && progress?.completedLessonIds.includes(activeLessonItem.id)
  );
  const isCurrentBlockDone = Boolean(
    activeBlockItem && isBlockCompletedForProgress(activeBlockItem, progress)
  );

  // Cuộn về đầu trang bài học/block mỗi khi chuyển sang bài học hoặc block khác
  useEffect(() => {
    if (!activeScrollResetKey) return;
    const prev = prevScrollResetKeyRef.current;
    prevScrollResetKeyRef.current = activeScrollResetKey;
    scrollAutoReadyAtRef.current = Date.now() + 450;
    if (prev && prev !== activeScrollResetKey && lessonTopRef.current) {
      lessonTopRef.current.scrollIntoView({ behavior: 'auto', block: 'start' });
    }
  }, [activeScrollResetKey]);

  // Kiểm tra lướt xuống cuối block lý thuyết/hình ảnh/ghi nhớ (hoặc cuối trang nếu bài không có block)
  useEffect(() => {
    if (!currentCourse || !activeLessonItem || isCourseBlockedBySchedule || canManageCurrent) {
      return;
    }

    const courseSnapshot = currentCourse;
    const lessonId = activeLessonItem.id;
    const lessonTitle = activeLessonItem.title;
    const chapId = activeChapterItem?.id;

    // Trường hợp bài học có các blocks -> theo dõi cuộn cuối block hiện tại (trừ block question phải làm đúng mới qua)
    if (activeLessonBlocks.length > 0) {
      if (!activeBlockItem || activeBlockItem.type === 'question' || isCurrentBlockDone) {
        return;
      }

      const blockId = activeBlockItem.id;
      const blockLabel = activeBlockItem.title || `Phần #${safeActiveBlockIndex + 1}`;
      const isLastBlock = safeActiveBlockIndex === activeLessonBlocks.length - 1;
      let triggered = false;

      const tryCompleteBlock = () => {
        if (triggered) return;
        if (Date.now() < scrollAutoReadyAtRef.current) return;
        const el = blockBottomSentinelRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        if (rect.top <= window.innerHeight + 36) {
          triggered = true;
          const updated = markBlockCompleted(
            courseSnapshot,
            currentUserId,
            blockId,
            lessonId,
            chapId,
            true
          );
          setProgress(updated);
          if (isLastBlock && updated.completedLessonIds.includes(lessonId)) {
            showToast(
              `✓ Đã hoàn thành toàn bộ bài "${lessonTitle}"! Bài học tiếp theo đã được mở khóa.`
            );
          } else {
            showToast(`✓ Đã đọc xong "${blockLabel}"! Bạn có thể chuyển sang block tiếp theo.`);
          }
        }
      };

      let observer: IntersectionObserver | null = null;
      if (typeof IntersectionObserver !== 'undefined' && blockBottomSentinelRef.current) {
        observer = new IntersectionObserver(
          (entries) => {
            if (entries.some((entry) => entry.isIntersecting)) {
              tryCompleteBlock();
            }
          },
          { threshold: 0.1 }
        );
        observer.observe(blockBottomSentinelRef.current);
      }

      const handleScrollOrResize = () => tryCompleteBlock();
      window.addEventListener('scroll', handleScrollOrResize, { passive: true });
      window.addEventListener('resize', handleScrollOrResize, { passive: true });
      const settleTimer = setTimeout(() => tryCompleteBlock(), 600);

      return () => {
        if (observer) observer.disconnect();
        window.removeEventListener('scroll', handleScrollOrResize);
        window.removeEventListener('resize', handleScrollOrResize);
        clearTimeout(settleTimer);
      };
    }

    // Trường hợp bài học chưa có block nào -> lướt xuống cuối trang hoàn thành bài
    if (isActiveLessonDone) return;
    let triggered = false;

    const tryAutoCompleteLesson = () => {
      if (triggered) return;
      if (Date.now() < scrollAutoReadyAtRef.current) return;
      const el = lessonBottomSentinelRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (rect.top <= window.innerHeight + 36) {
        triggered = true;
        const updated = markLessonCompleted(courseSnapshot.id, currentUserId, lessonId, true);
        setProgress(updated);
        showToast(`✓ Đã học xong bài "${lessonTitle}"!`);
      }
    };

    let observer: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== 'undefined' && lessonBottomSentinelRef.current) {
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            tryAutoCompleteLesson();
          }
        },
        { threshold: 0.1 }
      );
      observer.observe(lessonBottomSentinelRef.current);
    }

    const handleScrollOrResize = () => tryAutoCompleteLesson();
    window.addEventListener('scroll', handleScrollOrResize, { passive: true });
    window.addEventListener('resize', handleScrollOrResize, { passive: true });
    const settleTimer = setTimeout(() => tryAutoCompleteLesson(), 600);

    return () => {
      if (observer) observer.disconnect();
      window.removeEventListener('scroll', handleScrollOrResize);
      window.removeEventListener('resize', handleScrollOrResize);
      clearTimeout(settleTimer);
    };
  }, [
    currentCourse?.id,
    activeLessonItem?.id,
    activeBlockItem?.id,
    activeBlockItem?.type,
    activeLessonBlocks.length,
    safeActiveBlockIndex,
    currentUserId,
    isCourseBlockedBySchedule,
    canManageCurrent,
    isCurrentBlockDone,
    isActiveLessonDone,
  ]);

  const handleSelectLesson = (lessonId: string, chapterId?: string) => {
    if (!currentCourse) return;
    const targetIdx = allLessons.findIndex((item) => item.lesson.id === lessonId);
    if (targetIdx === -1) return;

    if (isLessonLockedAt(targetIdx)) {
      const blockingLesson = allLessons[maxUnlockedLessonIndex]?.lesson;
      showToast(
        `Bài học này đang bị khóa! Hãy hoàn thành "${blockingLesson?.title || 'bài học trước'}" trước.`
      );
      return;
    }

    const targetLesson = allLessons[targetIdx].lesson;
    const blocks = targetLesson.blocks || [];
    const firstIncompleteBlk = blocks.findIndex(
      (b) => !isBlockCompletedForProgress(b, progress)
    );
    const maxBlkIdx =
      canManageCurrent || firstIncompleteBlk === -1
        ? Math.max(0, blocks.length - 1)
        : firstIncompleteBlk;
    const savedBlkId = progress?.currentBlockIdsByLesson?.[lessonId];
    const savedBlkIdx = savedBlkId ? blocks.findIndex((b) => b.id === savedBlkId) : -1;
    const nextBlkIdx =
      savedBlkIdx >= 0 && savedBlkIdx <= maxBlkIdx ? savedBlkIdx : Math.max(0, maxBlkIdx);

    setActiveLessonId(lessonId);
    if (chapterId) setActiveChapterId(chapterId);
    setActiveBlockIndex(nextBlkIdx);

    const updatedLoc = setStudentCourseLocation(
      currentCourse,
      currentUserId,
      chapterId,
      lessonId,
      blocks[nextBlkIdx]?.id
    );
    setProgress(updatedLoc);
  };

  const handleSelectBlock = (targetBlockIdx: number) => {
    if (!currentCourse || !activeLessonItem) return;
    if (targetBlockIdx < 0 || targetBlockIdx >= activeLessonBlocks.length) return;
    if (!canManageCurrent && targetBlockIdx > maxUnlockedBlockIndex) {
      showToast('Hãy hoàn thành block hiện tại trước khi chuyển sang block tiếp theo!');
      return;
    }
    setActiveBlockIndex(targetBlockIdx);
    const updatedLoc = setStudentCourseLocation(
      currentCourse,
      currentUserId,
      activeChapterItem?.id,
      activeLessonItem.id,
      activeLessonBlocks[targetBlockIdx]?.id
    );
    setProgress(updatedLoc);
  };

  const toggleChapter = (chapId: string) => {
    setExpandedChapterIds((prev) => ({
      ...prev,
      [chapId]: !(prev[chapId] ?? true),
    }));
  };

  // Grade interactive checkpoint question & record SCORM completion
  const handleGradeCheckpoint = (block: LessonBlock) => {
    if (!block.question || !currentCourse) return;
    const userAns = checkpointAnswers[block.id];
    const result = gradeQuestion(block.question, userAns);
    const isPassed = result.isFullyCorrect;

    setCheckpointResults((prev) => ({
      ...prev,
      [block.id]: {
        isCorrect: isPassed,
        earned: result.earnedPoints,
        max: result.maxPoints,
        explanation: block.question?.explanation || 'Xem lại lý thuyết ở trên.',
      },
    }));

    const updatedProgress = recordInteractiveAnswer(
      currentCourse.id,
      currentUserId,
      block.id,
      userAns,
      isPassed,
      activeLessonItem?.id,
      activeChapterItem?.id
    );
    setProgress(updatedProgress);

    if (isPassed) {
      if (activeLessonItem && updatedProgress.completedLessonIds.includes(activeLessonItem.id)) {
        showToast(
          `✓ Chính xác (+${result.earnedPoints}đ)! Bạn đã hoàn thành bài "${activeLessonItem.title}" và mở khóa bài tiếp theo.`
        );
      } else {
        showToast(
          `✓ Chính xác (+${result.earnedPoints}đ)! Block tiếp theo đã được mở khóa.`
        );
      }
    } else {
      showToast(
        'Chưa đúng hết! Hãy làm đúng toàn bộ câu hỏi trong block này để mở khóa tiếp.'
      );
    }
  };

  // Helper upload image via file input
  const handleUploadImage = async (
    file: File,
    onResult: (dataUrl: string) => void
  ) => {
    try {
      const compressed = await processImageFile(file, 1200, 0.85);
      onResult(compressed);
    } catch (err: any) {
      setBlockModalError(err?.message || 'Không thể tải tệp ảnh lên.');
    }
  };

  // Helper insert image markdown directly at cursor position in theory/callout textarea
  const insertInlineImageIntoTheory = (src: string, captionText?: string) => {
    const cleanSrc = src.trim();
    if (!cleanSrc) return;
    const alt = (captionText || 'Hình minh họa').replace(/[\[\]]/g, '').trim() || 'Hình minh họa';
    const snippet = `\n![${alt}](${cleanSrc})\n`;
    const inserted = insertTextAtEditableElement(theoryTextareaRef.current, snippet);
    if (!inserted) {
      setBlockContent((prev) => {
        const trimmed = prev.replace(/\s+$/, '');
        return trimmed ? `${trimmed}\n\n![${alt}](${cleanSrc})\n` : `![${alt}](${cleanSrc})`;
      });
    }
    setBlockModalError(null);
  };

  // Helper upload multi-format files into course lesson or file block (respecting Firestore 1MB cap)
  const handleUploadCourseFiles = async (
    files: FileList | null,
    existingAttachments: CourseAttachment[],
    onAdd: (added: CourseAttachment[]) => void,
    onError: (msg: string) => void
  ) => {
    if (!files || files.length === 0) return;
    onError('');
    const added: CourseAttachment[] = [];
    const currentEstimatedSize = currentCourse ? JSON.stringify(currentCourse).length : 0;
    let runningBytes = currentEstimatedSize;

    for (const file of Array.from(files)) {
      if (file.size > MAX_COURSE_SINGLE_FILE_BYTES) {
        onError(
          `Tệp "${file.name}" (${formatCourseFileSize(file.size)}) vượt quá giới hạn 700 KB/tệp khi lưu trực tiếp. Vui lòng nén nhẹ tệp hoặc dùng tùy chọn "Dán link tài liệu ngoài (Google Drive / OneDrive)".`
        );
        continue;
      }
      try {
        let dataUrl = '';
        if (file.type.startsWith('image/')) {
          dataUrl = await processImageFile(file, 1400, 0.85);
        } else {
          dataUrl = await readCourseFileAsDataUrl(file);
        }
        if (runningBytes + dataUrl.length > MAX_COURSE_DOC_TOTAL_CHARS) {
          onError(
            `Tổng dung lượng tệp nhúng trong khóa học sắp chạm ngưỡng 1 MB của Cloud Firestore. Vui lòng dùng "Dán link tài liệu ngoài (Google Drive / OneDrive)" cho các tệp bổ sung.`
          );
          break;
        }
        runningBytes += dataUrl.length;
        added.push({
          id: `catt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name: file.name,
          mimeType: file.type || 'application/octet-stream',
          sizeBytes: file.size,
          dataUrl,
          uploadedAt: new Date().toISOString(),
          uploadedBy: currentUser?.fullName || currentUser?.email,
        });
      } catch (err: any) {
        onError(err?.message || `Không thể đọc tệp "${file.name}".`);
      }
    }

    if (added.length > 0) {
      onAdd([...existingAttachments, ...added]);
      showToast(`✓ Đã thêm ${added.length} tệp tài liệu!`);
    }
  };

  const handleAddExternalAttachmentLink = (
    rawUrl: string,
    rawName: string,
    existingAttachments: CourseAttachment[],
    onAdd: (next: CourseAttachment[]) => void,
    onError: (msg: string) => void,
    resetInputs: () => void
  ) => {
    const cleanUrl = rawUrl.trim();
    if (!cleanUrl || !/^https?:\/\//i.test(cleanUrl)) {
      onError('Vui lòng nhập đường dẫn URL hợp lệ bắt đầu bằng http:// hoặc https://');
      return;
    }
    let fallbackName = 'Tài liệu liên kết';
    try {
      const parsed = new URL(cleanUrl);
      const lastSeg = parsed.pathname.split('/').filter(Boolean).pop();
      fallbackName = lastSeg ? decodeURIComponent(lastSeg).slice(0, 80) : parsed.hostname;
    } catch {
      // ignore
    }
    const cleanName = rawName.trim() || fallbackName;
    const isPdf = cleanUrl.toLowerCase().includes('.pdf') || cleanName.toLowerCase().endsWith('.pdf');
    onAdd([
      ...existingAttachments,
      {
        id: `catt_link_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: cleanName,
        mimeType: isPdf ? 'application/pdf' : 'text/uri-list',
        url: cleanUrl,
        uploadedAt: new Date().toISOString(),
        uploadedBy: currentUser?.fullName || currentUser?.email,
      },
    ]);
    onError('');
    resetInputs();
    showToast('✓ Đã đính kèm liên kết tài liệu!');
  };

  // Save new or edited course
  const handleSaveCourse = (): boolean => {
    if (!editingCourse || !editingCourse.title?.trim()) {
      setCourseModalError('Vui lòng nhập tên khóa học!');
      return false;
    }

    const vis: ExamVisibility = editingCourse.visibility || 'public';
    let chosenClassId: string | undefined = undefined;
    let chosenClassName: string | undefined = undefined;

    if (vis === 'class') {
      const cls = teacherOwnClassrooms.find(
        (c) => c.id === (editingCourse.assignedClassId || teacherOwnClassrooms[0]?.id)
      );
      if (!cls) {
        setCourseModalError('Bạn chưa có lớp học nào để gán khóa học. Hãy tạo lớp trước hoặc chọn phạm vi khác.');
        return false;
      }
      chosenClassId = cls.id;
      chosenClassName = cls.name;
    }

    const toSave: MicroCourse = {
      id: editingCourse.id || 'course_' + Date.now(),
      title: editingCourse.title.trim(),
      subject: editingCourse.subject || 'math',
      grade: editingCourse.grade || 'Lớp 12',
      description: editingCourse.description || '',
      instructor: editingCourse.instructor || currentUser?.fullName || 'Giáo viên phụ trách',
      chapters: editingCourse.chapters || [],
      lessons: editingCourse.lessons || [],
      finalExamId: editingCourse.finalExamId || undefined,
      finalExamTitle: allExams.find((e) => e.id === editingCourse.finalExamId)?.title,
      status: editingCourse.status || 'open',
      openTime: editingCourse.openTime || undefined,
      closeTime: editingCourse.closeTime || undefined,
      visibility: vis,
      assignedClassId: chosenClassId,
      assignedClassName: chosenClassName,
      creatorId: editingCourse.creatorId || currentUser?.id,
      creatorEmail: editingCourse.creatorEmail || currentUser?.email,
      creatorName: editingCourse.creatorName || currentUser?.fullName,
      isScormEnabled: editingCourse.isScormEnabled ?? true,
      scormVersion: '1.2',
      createdAt: editingCourse.createdAt || new Date().toISOString().split('T')[0],
    };

    saveCourse(toSave);
    onRefreshCourses();
    setSelectedCourseId(toSave.id);
    setIsCourseModalOpen(false);
    setEditingCourse(null);
    setCourseModalError(null);
    showToast('✓ Đã lưu thông tin khóa học & cấu hình SCORM!');
    return true;
  };

  // Delete current course
  const handleRequestDeleteCourse = (course: MicroCourse) => {
    if (!canManageCourse(course)) return;
    setConfirmState({
      isOpen: true,
      title: 'Xác nhận xóa khóa học',
      message: `Bạn có chắc chắn muốn xóa vĩnh viễn khóa học "${course.title}" cùng toàn bộ chương và bài học bên trong không?`,
      onConfirm: () => {
        deleteCourse(course.id);
        onRefreshCourses();
        const remaining = visibleCourses.filter((c) => c.id !== course.id);
        setSelectedCourseId(remaining[0]?.id || '');
        showToast(`✓ Đã xóa khóa học "${course.title}".`);
      },
    });
  };

  // Save Chapter
  const handleSaveChapter = (): boolean => {
    if (!editingChapter || !editingChapter.title.trim() || !currentCourse || !canManageCurrent) {
      showToast('Vui lòng nhập tên chương học trước khi lưu!');
      return false;
    }
    const existingChapters = currentCourse.chapters || [];
    let updatedChapters: CourseChapter[];

    if (editingChapter.id) {
      updatedChapters = existingChapters.map((ch) =>
        ch.id === editingChapter.id
          ? {
              ...ch,
              title: editingChapter.title.trim(),
              description: editingChapter.description.trim(),
              order: editingChapter.order,
              chapterExamId: editingChapter.chapterExamId || undefined,
              chapterExamTitle: allExams.find((e) => e.id === editingChapter.chapterExamId)?.title,
            }
          : ch
      );
    } else {
      const newChap: CourseChapter = {
        id: 'chap_' + Date.now(),
        title: editingChapter.title.trim(),
        description: editingChapter.description.trim(),
        order: existingChapters.length + 1,
        lessons: [],
        chapterExamId: editingChapter.chapterExamId || undefined,
        chapterExamTitle: allExams.find((e) => e.id === editingChapter.chapterExamId)?.title,
      };
      updatedChapters = [...existingChapters, newChap];
      setExpandedChapterIds((prev) => ({ ...prev, [newChap.id]: true }));
    }

    saveCourse({ ...currentCourse, chapters: updatedChapters });
    onRefreshCourses();
    setIsChapterModalOpen(false);
    setEditingChapter(null);
    showToast('✓ Đã lưu chương học!');
    return true;
  };

  // Delete Chapter
  const handleRequestDeleteChapter = (chap: CourseChapter) => {
    if (!currentCourse || !canManageCurrent) return;
    setConfirmState({
      isOpen: true,
      title: 'Xóa chương học',
      message: `Bạn có chắc muốn xóa chương "${chap.title}" và ${chap.lessons.length} bài học trong chương này không?`,
      onConfirm: () => {
        const updatedChapters = (currentCourse.chapters || []).filter((c) => c.id !== chap.id);
        saveCourse({ ...currentCourse, chapters: updatedChapters });
        onRefreshCourses();
        showToast(`✓ Đã xóa chương "${chap.title}".`);
      },
    });
  };

  // Save Lesson (cũng hỗ trợ chuyển bài học sang chương khác khi chỉnh sửa)
  const handleSaveLesson = (): boolean => {
    if (!editingLesson || !editingLesson.title?.trim() || !currentCourse || !canManageCurrent) {
      showToast('Vui lòng nhập tên bài học trước khi lưu!');
      return false;
    }
    const chapters = [...(currentCourse.chapters || [])];
    const targetChapIdx = chapters.findIndex((c) => c.id === targetChapterIdForLesson);
    if (targetChapIdx === -1) return false;

    const updatedPracticeTitle = allExams.find(
      (e) => e.id === editingLesson.practiceExamId
    )?.title;

    if (editingLesson.id) {
      const sourceChapId = originalChapterIdForLesson || targetChapterIdForLesson;
      const isMovingChapter = sourceChapId !== targetChapterIdForLesson;

      if (isMovingChapter) {
        const sourceChapIdx = chapters.findIndex((c) => c.id === sourceChapId);
        const existingLesson =
          sourceChapIdx !== -1
            ? chapters[sourceChapIdx].lessons.find((l) => l.id === editingLesson.id)
            : undefined;
        const movedLesson: CourseLesson = {
          ...(existingLesson || { id: editingLesson.id, blocks: [] }),
          ...editingLesson,
          title: editingLesson.title!.trim(),
          attachments: editingLesson.attachments || [],
          practiceExamId: editingLesson.practiceExamId || undefined,
          practiceExamTitle: updatedPracticeTitle,
        } as CourseLesson;

        const nextChapters = chapters.map((ch) => {
          if (ch.id === sourceChapId) {
            return { ...ch, lessons: ch.lessons.filter((l) => l.id !== editingLesson.id) };
          }
          if (ch.id === targetChapterIdForLesson) {
            return { ...ch, lessons: [...ch.lessons, movedLesson] };
          }
          return ch;
        });

        saveCourse({ ...currentCourse, chapters: nextChapters });
        setActiveChapterId(targetChapterIdForLesson);
        setActiveLessonId(movedLesson.id);
      } else {
        const targetChap = chapters[targetChapIdx];
        const updatedLessons = targetChap.lessons.map((les) =>
          les.id === editingLesson.id
            ? ({
                ...les,
                ...editingLesson,
                title: editingLesson.title!.trim(),
                attachments: editingLesson.attachments || [],
                practiceExamId: editingLesson.practiceExamId || undefined,
                practiceExamTitle: updatedPracticeTitle,
              } as CourseLesson)
            : les
        );
        chapters[targetChapIdx] = { ...targetChap, lessons: updatedLessons };
        saveCourse({ ...currentCourse, chapters });
      }
    } else {
      const targetChap = chapters[targetChapIdx];
      const newLes: CourseLesson = {
        id: 'les_' + Date.now(),
        title: editingLesson.title!.trim(),
        durationMinutes: editingLesson.durationMinutes || 25,
        summary: editingLesson.summary || '',
        attachments: editingLesson.attachments || [],
        practiceExamId: editingLesson.practiceExamId || undefined,
        practiceExamTitle: updatedPracticeTitle,
        blocks: [],
      };
      chapters[targetChapIdx] = { ...targetChap, lessons: [...targetChap.lessons, newLes] };
      saveCourse({ ...currentCourse, chapters });
      setActiveLessonId(newLes.id);
      setActiveChapterId(targetChap.id);
    }

    onRefreshCourses();
    setIsLessonModalOpen(false);
    setEditingLesson(null);
    setLessonModalError(null);
    setLessonFileUrl('');
    setLessonFileName('');
    setOriginalChapterIdForLesson('');
    showToast('✓ Đã lưu bài học vào chương!');
    return true;
  };

  // Delete Lesson
  const handleRequestDeleteLesson = (chapId: string, lesson: CourseLesson) => {
    if (!currentCourse || !canManageCurrent) return;
    setConfirmState({
      isOpen: true,
      title: 'Xóa bài học',
      message: `Bạn có chắc chắn muốn xóa bài học "${lesson.title}" không?`,
      onConfirm: () => {
        const updatedChapters = (currentCourse.chapters || []).map((c) =>
          c.id === chapId
            ? { ...c, lessons: c.lessons.filter((l) => l.id !== lesson.id) }
            : c
        );
        saveCourse({ ...currentCourse, chapters: updatedChapters });
        onRefreshCourses();
        if (activeLessonId === lesson.id) {
          setActiveLessonId('');
        }
        showToast(`✓ Đã xóa bài học "${lesson.title}".`);
      },
    });
  };

  // Open Block Modal for Add (at index or end) or Edit
  const openCreateBlockModal = (
    preferredType: LessonBlockType = 'theory',
    atIndex: number | null = null
  ) => {
    setEditingBlockId(null);
    setInsertAtIndex(atIndex);
    setBlockModalError(null);
    setBlockType(preferredType);
    setBlockTitle('');
    setBlockContent('');
    setBlockCalloutType('formula');
    setBlockImageUrl('');
    setBlockCaption('');
    setShowTheoryImageUrlBar(false);
    setTheoryImageUrl('');
    setTheoryImageCaption('');
    setBlockAttachments([]);
    setBlockFileUrl('');
    setBlockFileName('');
    setCpType('single_choice');
    setCpQuestion('');
    setCpQuestionImageUrl('');
    setCpOptions(['', '', '', '']);
    setCpCorrectSingle(0);
    setCpCorrectMulti([0]);
    setCpTfItems([
      { id: 'tf_' + Date.now() + '_1', statement: '', isCorrect: true },
      { id: 'tf_' + Date.now() + '_2', statement: '', isCorrect: false },
      { id: 'tf_' + Date.now() + '_3', statement: '', isCorrect: true },
      { id: 'tf_' + Date.now() + '_4', statement: '', isCorrect: false },
    ]);
    setCpAcceptedAnswersText('');
    setCpMatchingData(createDefaultMatchingData('cp_' + Date.now()));
    setCpPoints(1.0);
    setCpExplanation('');
    setIsBlockModalOpen(true);
  };

  const openEditBlockModal = (block: LessonBlock) => {
    setEditingBlockId(block.id);
    setInsertAtIndex(null);
    setBlockModalError(null);
    setBlockType(block.type);
    setBlockTitle(block.title || '');
    setBlockContent(block.contentMarkdown || '');
    setBlockCalloutType(block.calloutType || 'formula');
    setBlockImageUrl(block.imageUrl || '');
    setBlockCaption(block.caption || '');
    setShowTheoryImageUrlBar(false);
    setTheoryImageUrl('');
    setTheoryImageCaption('');
    setBlockAttachments(block.attachments ? [...block.attachments] : []);
    setBlockFileUrl('');
    setBlockFileName('');

    if (block.type === 'question' && block.question) {
      const q = block.question;
      setCpType(
        q.type === 'grouped'
          ? 'single_choice'
          : (q.type as
              | 'single_choice'
              | 'multiple_choice'
              | 'true_false'
              | 'text_input'
              | 'matching')
      );
      setCpQuestion(q.question || '');
      setCpQuestionImageUrl(q.imageUrl || '');
      setCpPoints(q.points || 1.0);
      setCpExplanation(q.explanation || '');
      setCpOptions(
        q.options && q.options.length > 0 ? [...q.options] : ['', '', '', '']
      );
      setCpCorrectSingle(q.correctAnswer ?? 0);
      setCpCorrectMulti(q.correctAnswers || [0]);
      setCpTfItems(
        q.tfItems && q.tfItems.length > 0
          ? JSON.parse(JSON.stringify(q.tfItems))
          : [
              { id: 'tf_1', statement: '', isCorrect: true },
              { id: 'tf_2', statement: '', isCorrect: false },
            ]
      );
      setCpAcceptedAnswersText(formatAcceptedShortAnswersList(q.acceptedAnswers));
      if (q.type === 'matching') {
        setCpMatchingData({
          matchingLeftLabelStyle: q.matchingLeftLabelStyle || 'number',
          matchingRightLabelStyle: q.matchingRightLabelStyle || 'upper_alpha',
          matchingLeftItems: JSON.parse(JSON.stringify(q.matchingLeftItems || [])),
          matchingRightItems: JSON.parse(JSON.stringify(q.matchingRightItems || [])),
          matchingCorrectPairs: { ...(q.matchingCorrectPairs || {}) },
        });
      } else {
        setCpMatchingData(createDefaultMatchingData('cp_' + Date.now()));
      }
    }

    setIsBlockModalOpen(true);
  };

  const handleSaveBlock = (): boolean => {
    if (!activeLessonItem || !currentCourse || !activeChapterItem || !canManageCurrent) return false;
    setBlockModalError(null);

    let builtBlock: LessonBlock;

    if (blockType === 'theory') {
      if (!blockContent.trim() && !blockImageUrl.trim()) {
        setBlockModalError('Vui lòng nhập nội dung lý thuyết hoặc chèn hình ảnh minh họa!');
        return false;
      }
      builtBlock = {
        id: editingBlockId || 'blk_' + Date.now(),
        type: 'theory',
        title: blockTitle.trim() || undefined,
        contentMarkdown: blockContent.trim(),
        imageUrl: blockImageUrl.trim() || undefined,
      };
    } else if (blockType === 'callout') {
      if (!blockContent.trim() && !blockImageUrl.trim()) {
        setBlockModalError('Vui lòng nhập nội dung ghi chú / công thức!');
        return false;
      }
      builtBlock = {
        id: editingBlockId || 'blk_' + Date.now(),
        type: 'callout',
        title: blockTitle.trim() || 'Ghi nhớ trọng tâm',
        calloutType: blockCalloutType,
        contentMarkdown: blockContent.trim(),
        imageUrl: blockImageUrl.trim() || undefined,
      };
    } else if (blockType === 'image') {
      if (!blockImageUrl.trim()) {
        setBlockModalError('Vui lòng tải ảnh từ máy tính hoặc dán đường dẫn URL hình ảnh!');
        return false;
      }
      builtBlock = {
        id: editingBlockId || 'blk_' + Date.now(),
        type: 'image',
        title: blockTitle.trim() || undefined,
        imageUrl: blockImageUrl.trim(),
        caption: blockCaption.trim() || undefined,
      };
    } else if (blockType === 'file') {
      if (blockAttachments.length === 0) {
        setBlockModalError('Vui lòng tải lên ít nhất 1 tệp tài liệu (PDF, Word, PPT, Excel...) hoặc dán link tài liệu!');
        return false;
      }
      builtBlock = {
        id: editingBlockId || 'blk_' + Date.now(),
        type: 'file',
        title: blockTitle.trim() || 'Tài liệu học tập đính kèm',
        contentMarkdown: blockContent.trim() || undefined,
        attachments: blockAttachments,
      };
    } else {
      if (!cpQuestion.trim()) {
        setBlockModalError('Vui lòng nhập nội dung câu hỏi tương tác!');
        return false;
      }
      const q: Question = {
        id: 'cp_q_' + Date.now(),
        type: cpType,
        points: Number(cpPoints) || 1.0,
        question: cpQuestion.trim(),
        imageUrl: cpQuestionImageUrl.trim() || undefined,
        explanation: cpExplanation.trim() || 'Xem lại phần lý thuyết ngay phía trên.',
      };

      if (cpType === 'single_choice') {
        const cleanOpts = cpOptions.map((o) => o.trim()).filter(Boolean);
        if (cleanOpts.length < 2) {
          setBlockModalError('Vui lòng nhập ít nhất 2 phương án trả lời!');
          return false;
        }
        q.options = cleanOpts;
        q.correctAnswer = Math.min(cpCorrectSingle, cleanOpts.length - 1);
      } else if (cpType === 'multiple_choice') {
        const cleanOpts = cpOptions.map((o) => o.trim()).filter(Boolean);
        if (cleanOpts.length < 2) {
          setBlockModalError('Vui lòng nhập ít nhất 2 phương án trả lời!');
          return false;
        }
        q.options = cleanOpts;
        q.correctAnswers = cpCorrectMulti.filter((idx) => idx < cleanOpts.length);
        if (q.correctAnswers.length === 0) q.correctAnswers = [0];
      } else if (cpType === 'true_false') {
        const validItems = cpTfItems.filter((it) => it.statement.trim());
        if (validItems.length === 0) {
          setBlockModalError('Vui lòng nhập ít nhất 1 mệnh đề Đúng/Sai!');
          return false;
        }
        q.tfScoringMode = 'standard_ministry';
        q.tfTierPoints = [0.1, 0.25, 0.5, 1.0];
        q.tfItems = validItems;
      } else if (cpType === 'text_input') {
        const answers = parseAcceptedShortAnswers(cpAcceptedAnswersText);
        if (answers.length === 0) {
          setBlockModalError('Vui lòng nhập ít nhất 1 đáp án chấp nhận (số thập phân dùng dấu phẩy ",", ngăn cách bởi dấu chấm phẩy ";").');
          return false;
        }
        q.acceptedAnswers = answers;
      } else if (cpType === 'matching') {
        const validLeft = cpMatchingData.matchingLeftItems.filter(
          (it) => it.content.trim() || Boolean(it.imageUrl?.trim())
        );
        const validRight = cpMatchingData.matchingRightItems.filter(
          (it) => it.content.trim() || Boolean(it.imageUrl?.trim())
        );
        if (validLeft.length < 1) {
          setBlockModalError('Vui lòng nhập ít nhất 1 ý ở cột trái cho câu hỏi ghép đôi.');
          return false;
        }
        if (validRight.length < validLeft.length) {
          setBlockModalError(
            `Số ý cột phải (${validRight.length}) phải lớn hơn hoặc bằng số ý cột trái (${validLeft.length})!`
          );
          return false;
        }
        const rightIds = new Set(validRight.map((r) => r.id));
        const hasMissingPair = validLeft.some(
          (l) => !cpMatchingData.matchingCorrectPairs[l.id] || !rightIds.has(cpMatchingData.matchingCorrectPairs[l.id])
        );
        if (hasMissingPair) {
          setBlockModalError('Vui lòng chọn đầy đủ đáp án đúng cột phải cho từng ý cột trái!');
          return false;
        }
        q.matchingLeftLabelStyle = cpMatchingData.matchingLeftLabelStyle;
        q.matchingRightLabelStyle = cpMatchingData.matchingRightLabelStyle;
        q.matchingLeftItems = validLeft;
        q.matchingRightItems = validRight;
        q.matchingCorrectPairs = validLeft.reduce<{ [leftId: string]: string }>((acc, l) => {
          acc[l.id] = cpMatchingData.matchingCorrectPairs[l.id];
          return acc;
        }, {});
      }

      builtBlock = {
        id: editingBlockId || 'blk_' + Date.now(),
        type: 'question',
        title: blockTitle.trim() || 'Câu hỏi tương tác giữa bài',
        question: q,
      };
    }

    const updatedChapters = (currentCourse.chapters || []).map((ch) => {
      if (ch.id !== activeChapterItem.id) return ch;
      return {
        ...ch,
        lessons: ch.lessons.map((les) => {
          if (les.id !== activeLessonItem.id) return les;
          const existingBlocks = [...(les.blocks || [])];
          if (editingBlockId) {
            return {
              ...les,
              blocks: existingBlocks.map((b) => (b.id === editingBlockId ? builtBlock : b)),
            };
          }
          if (insertAtIndex !== null && insertAtIndex >= 0 && insertAtIndex <= existingBlocks.length) {
            existingBlocks.splice(insertAtIndex, 0, builtBlock);
          } else {
            existingBlocks.push(builtBlock);
          }
          return { ...les, blocks: existingBlocks };
        }),
      };
    });

    const blockDraftKey = `edutest_course_block_draft_${currentCourse.id}`;
    saveCourse({ ...currentCourse, chapters: updatedChapters });
    onRefreshCourses();
    try {
      sessionStorage.removeItem(blockDraftKey);
    } catch {
      // ignore storage errors
    }
    setIsBlockModalOpen(false);
    setEditingBlockId(null);
    setInsertAtIndex(null);
    showToast(editingBlockId ? '✓ Đã cập nhật nội dung bài học!' : '✓ Đã chèn nội dung vào bài học!');
    return true;
  };

  const courseBlockDraftKey = `edutest_course_block_draft_${currentCourse?.id || 'none'}`;
  const restoredCourseBlockDraftForRef = useRef<string>('');

  const clearBlockModalDraft = () => {
    try {
      sessionStorage.removeItem(courseBlockDraftKey);
    } catch {
      // ignore storage errors
    }
  };

  const handleCloseBlockModalExplicitly = () => {
    clearBlockModalDraft();
    setIsBlockModalOpen(false);
  };

  // Khôi phục bản nháp khối bài giảng nếu component vừa bị remount khi đổi chế độ
  useEffect(() => {
    if (!currentCourse?.id || !canManageCurrent || isBlockModalOpen) return;
    if (restoredCourseBlockDraftForRef.current === currentCourse.id) return;
    restoredCourseBlockDraftForRef.current = currentCourse.id;
    try {
      const raw = sessionStorage.getItem(courseBlockDraftKey);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (!d || typeof d !== 'object') return;
      if (d.activeLessonId) setActiveLessonId(d.activeLessonId);
      if (d.activeChapterId) setActiveChapterId(d.activeChapterId);
      setEditingBlockId(d.editingBlockId ?? null);
      setInsertAtIndex(d.insertAtIndex ?? null);
      setBlockType(d.blockType || 'theory');
      setBlockTitle(d.blockTitle || '');
      setBlockContent(d.blockContent || '');
      setBlockCalloutType(d.blockCalloutType || 'formula');
      setBlockImageUrl(d.blockImageUrl || '');
      setBlockCaption(d.blockCaption || '');
      if (Array.isArray(d.blockAttachments)) setBlockAttachments(d.blockAttachments);
      if (d.cpType) setCpType(d.cpType);
      setCpQuestion(d.cpQuestion || '');
      setCpQuestionImageUrl(d.cpQuestionImageUrl || '');
      if (Array.isArray(d.cpOptions)) setCpOptions(d.cpOptions);
      if (typeof d.cpCorrectSingle === 'number') setCpCorrectSingle(d.cpCorrectSingle);
      if (Array.isArray(d.cpCorrectMulti)) setCpCorrectMulti(d.cpCorrectMulti);
      if (Array.isArray(d.cpTfItems)) setCpTfItems(d.cpTfItems);
      if (typeof d.cpAcceptedAnswersText === 'string') setCpAcceptedAnswersText(d.cpAcceptedAnswersText);
      if (d.cpMatchingData) setCpMatchingData(d.cpMatchingData);
      if (typeof d.cpPoints === 'number') setCpPoints(d.cpPoints);
      if (typeof d.cpExplanation === 'string') setCpExplanation(d.cpExplanation);
      setIsBlockModalOpen(true);
    } catch {
      // ignore parse errors
    }
  }, [currentCourse?.id, canManageCurrent, courseBlockDraftKey, isBlockModalOpen]);

  // Tự động bảo toàn bản nháp khi đang mở khung soạn thảo khối nội dung
  useEffect(() => {
    if (!isBlockModalOpen || !currentCourse?.id || !canManageCurrent) return;
    const timer = setTimeout(() => {
      try {
        const hasAnyDraft = Boolean(
          editingBlockId ||
            blockTitle.trim() ||
            blockContent.trim() ||
            blockImageUrl.trim() ||
            blockCaption.trim() ||
            blockAttachments.length > 0 ||
            cpQuestion.trim() ||
            cpExplanation.trim()
        );
        if (!hasAnyDraft) {
          sessionStorage.removeItem(courseBlockDraftKey);
          return;
        }
        sessionStorage.setItem(
          courseBlockDraftKey,
          JSON.stringify({
            activeChapterId: activeChapterItem?.id || activeChapterId,
            activeLessonId: activeLessonItem?.id || activeLessonId,
            editingBlockId,
            insertAtIndex,
            blockType,
            blockTitle,
            blockContent,
            blockCalloutType,
            blockImageUrl,
            blockCaption,
            blockAttachments,
            cpType,
            cpQuestion,
            cpQuestionImageUrl,
            cpOptions,
            cpCorrectSingle,
            cpCorrectMulti,
            cpTfItems,
            cpAcceptedAnswersText,
            cpMatchingData,
            cpPoints,
            cpExplanation,
          })
        );
      } catch {
        // ignore quota errors
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [
    isBlockModalOpen,
    currentCourse?.id,
    canManageCurrent,
    courseBlockDraftKey,
    activeChapterId,
    activeLessonId,
    activeChapterItem?.id,
    activeLessonItem?.id,
    editingBlockId,
    insertAtIndex,
    blockType,
    blockTitle,
    blockContent,
    blockCalloutType,
    blockImageUrl,
    blockCaption,
    blockAttachments,
    cpType,
    cpQuestion,
    cpQuestionImageUrl,
    cpOptions,
    cpCorrectSingle,
    cpCorrectMulti,
    cpTfItems,
    cpAcceptedAnswersText,
    cpMatchingData,
    cpPoints,
    cpExplanation,
  ]);

  const courseDirtyStateRef = useRef<{ isDirty: () => boolean; saveAndExit: () => boolean }>({
    isDirty: () => false,
    saveAndExit: () => false,
  });
  courseDirtyStateRef.current = {
    isDirty: () => {
      if (isCourseModalOpen && editingCourse) {
        return Boolean(editingCourse.id || editingCourse.title?.trim() || editingCourse.description?.trim());
      }
      if (isChapterModalOpen && editingChapter) {
        return Boolean(editingChapter.id || editingChapter.title?.trim() || editingChapter.description?.trim());
      }
      if (isLessonModalOpen && editingLesson) {
        return Boolean(
          editingLesson.id ||
            editingLesson.title?.trim() ||
            editingLesson.summary?.trim() ||
            (editingLesson.attachments?.length || 0) > 0
        );
      }
      if (isBlockModalOpen) {
        return Boolean(
          editingBlockId ||
            blockTitle.trim() ||
            blockContent.trim() ||
            blockImageUrl.trim() ||
            blockAttachments.length > 0 ||
            cpQuestion.trim()
        );
      }
      return false;
    },
    saveAndExit: () => {
      if (isBlockModalOpen) return handleSaveBlock();
      if (isLessonModalOpen) return handleSaveLesson();
      if (isChapterModalOpen) return handleSaveChapter();
      if (isCourseModalOpen) return handleSaveCourse();
      return true;
    },
  };

  useEffect(() => {
    if (!onRegisterUnsavedGuard) return;
    onRegisterUnsavedGuard({
      title: 'Nội dung khóa học đang soạn chưa được lưu',
      message:
        'Bạn đang tạo hoặc bổ sung nội dung khóa học/bài giảng. Bạn có muốn lưu lại dữ liệu trước khi chuyển sang tab khác không?',
      isDirty: () => courseDirtyStateRef.current.isDirty(),
      saveAndExit: () => courseDirtyStateRef.current.saveAndExit(),
      discardChanges: () => {
        clearBlockModalDraft();
      },
    });
    return () => {
      onRegisterUnsavedGuard(null);
    };
  }, [onRegisterUnsavedGuard]);

  // Delete or Reorder block
  const handleRequestDeleteBlock = (block: LessonBlock) => {
    if (!currentCourse || !activeChapterItem || !activeLessonItem || !canManageCurrent) return;
    setConfirmState({
      isOpen: true,
      title: 'Xóa khối nội dung',
      message: `Bạn có chắc muốn xóa phần "${block.title || 'nội dung này'}" khỏi bài học không?`,
      onConfirm: () => {
        const updatedChapters = (currentCourse.chapters || []).map((ch) => {
          if (ch.id !== activeChapterItem.id) return ch;
          return {
            ...ch,
            lessons: ch.lessons.map((les) =>
              les.id === activeLessonItem.id
                ? { ...les, blocks: (les.blocks || []).filter((b) => b.id !== block.id) }
                : les
            ),
          };
        });
        saveCourse({ ...currentCourse, chapters: updatedChapters });
        onRefreshCourses();
        showToast('✓ Đã xóa khối nội dung khỏi bài học.');
      },
    });
  };

  const handleMoveChapter = (chapIndex: number, direction: 'up' | 'down') => {
    if (!currentCourse || !canManageCurrent) return;
    const chapters = [...(currentCourse.chapters || [])];
    const targetIdx = direction === 'up' ? chapIndex - 1 : chapIndex + 1;
    if (targetIdx < 0 || targetIdx >= chapters.length) return;
    const temp = chapters[chapIndex];
    chapters[chapIndex] = chapters[targetIdx];
    chapters[targetIdx] = temp;

    const reordered = chapters.map((ch, idx) => ({ ...ch, order: idx + 1 }));
    saveCourse({ ...currentCourse, chapters: reordered });
    onRefreshCourses();
    showToast(`✓ Đã chuyển "${temp.title}" ${direction === 'up' ? 'lên trên' : 'xuống dưới'}.`);
  };

  const handleMoveLesson = (chapId: string, lessonIndex: number, direction: 'up' | 'down') => {
    if (!currentCourse || !canManageCurrent) return;
    const chapters = [...(currentCourse.chapters || [])];
    const chapIdx = chapters.findIndex((c) => c.id === chapId);
    if (chapIdx === -1) return;
    const lessons = [...(chapters[chapIdx].lessons || [])];
    const targetIdx = direction === 'up' ? lessonIndex - 1 : lessonIndex + 1;
    if (targetIdx < 0 || targetIdx >= lessons.length) return;
    const movedTitle = lessons[lessonIndex].title;
    const temp = lessons[lessonIndex];
    lessons[lessonIndex] = lessons[targetIdx];
    lessons[targetIdx] = temp;

    chapters[chapIdx] = { ...chapters[chapIdx], lessons };
    saveCourse({ ...currentCourse, chapters });
    onRefreshCourses();
    showToast(`✓ Đã chuyển bài "${movedTitle}" ${direction === 'up' ? 'lên trên' : 'xuống dưới'}.`);
  };

  const handleMoveBlock = (index: number, direction: 'up' | 'down') => {
    if (!currentCourse || !activeLessonItem || !canManageCurrent) return;
    const blocks = [...(activeLessonItem.blocks || [])];
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= blocks.length) return;
    const temp = blocks[index];
    blocks[index] = blocks[targetIdx];
    blocks[targetIdx] = temp;

    if (activeChapterItem && currentCourse.chapters && currentCourse.chapters.length > 0) {
      const updatedChapters = currentCourse.chapters.map((ch) => {
        if (ch.id !== activeChapterItem.id) return ch;
        return {
          ...ch,
          lessons: ch.lessons.map((les) =>
            les.id === activeLessonItem.id ? { ...les, blocks } : les
          ),
        };
      });
      saveCourse({ ...currentCourse, chapters: updatedChapters });
    } else if (currentCourse.lessons && currentCourse.lessons.length > 0) {
      const updatedFlat = currentCourse.lessons.map((les) =>
        les.id === activeLessonItem.id ? { ...les, blocks } : les
      );
      saveCourse({ ...currentCourse, lessons: updatedFlat });
    }
    onRefreshCourses();
  };

  // SCORM & Progress stats
  const trackingUnits = currentCourse ? getCourseTrackingUnits(currentCourse) : [];
  const completedUnitsCount =
    progress && currentCourse
      ? trackingUnits.filter((u) => progress.completedBlockIds?.includes(u.unitId)).length
      : 0;
  const progressPct =
    progress && currentCourse ? calculateCourseProgressPercentage(currentCourse, progress) : 0;
  const completedLessonsCount = allLessons.filter((item) =>
    progress?.completedLessonIds.includes(item.lesson.id)
  ).length;
  const answeredCheckpointsCount = progress
    ? Object.keys(progress.interactiveAnswers || {}).length
    : 0;
  const scormStatusLabel =
    progress?.scormData?.lessonStatus === 'passed'
      ? 'Passed (Đạt chuẩn SCORM)'
      : progress?.scormData?.lessonStatus === 'completed'
      ? 'Completed (Hoàn thành 100%)'
      : progress?.scormData?.lessonStatus === 'incomplete'
      ? 'Incomplete (Đang học)'
      : 'Not Attempted (Chưa bắt đầu)';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 font-sans">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-xl flex items-center gap-2 text-xs font-semibold animate-in fade-in border border-slate-700">
          <Sparkles className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Main Course Hero & Progress Card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs mb-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="px-2.5 py-1 text-xs font-bold rounded-md bg-purple-50 text-purple-800 border border-purple-200 flex items-center gap-1.5">
                <GraduationCap className="w-3.5 h-3.5" />
                <span>Hệ Thống Khóa Học & Gói SCORM 1.2</span>
              </span>
              <span className="text-xs text-slate-500">
                {visibleCourses.length} Khóa học hiển thị
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Khóa Học Chuyên Sâu · Lý Thuyết, Ảnh & Câu Hỏi Tương Tác
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 mt-1 max-w-2xl leading-relaxed">
              Học theo từng chương & bài học, hỗ trợ <strong>chèn hình ảnh</strong>,{' '}
              <strong>công thức KaTeX</strong>, <strong>câu hỏi tương tác giữa bài</strong> và{' '}
              <strong>tính tiến độ chuẩn SCORM 1.2</strong> (học tới đâu cập nhật tiến độ tới đó).
            </p>
          </div>

          {isTeacher && (
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              <button
                type="button"
                onClick={() => {
                  setCourseModalError(null);
                  setEditingCourse({
                    title: '',
                    subject: 'math',
                    grade: '',
                    description: '',
                    instructor: currentUser?.fullName || '',
                    status: 'open',
                    openTime: '',
                    closeTime: '',
                    visibility: 'public',
                    isScormEnabled: true,
                    scormVersion: '1.2',
                    chapters: [],
                    lessons: [],
                  });
                  setIsCourseModalOpen(true);
                }}
                className="px-4 py-2.5 text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white rounded-xl transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Thêm khóa học mới</span>
              </button>
            </div>
          )}
        </div>

        {/* Course Selection Tabs */}
        {visibleCourses.length === 0 ? (
          <div className="pt-6 text-center py-8 bg-slate-50 rounded-xl border border-dashed border-slate-200 mt-4">
            <GraduationCap className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <h3 className="text-sm font-bold text-slate-800">
              Chưa có khóa học công khai hoặc khóa học nào của bạn
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              {isTeacher
                ? 'Hãy nhấn "Thêm khóa học mới" để bắt đầu soạn chương trình học với lý thuyết, hình ảnh, câu hỏi giữa bài và gói SCORM 1.2.'
                : 'Khóa học riêng tư hoặc nội bộ lớp học chỉ hiển thị với người tạo và thành viên trong lớp.'}
            </p>
          </div>
        ) : (
          <div className="pt-4 flex items-center gap-2 overflow-x-auto pb-1">
            {visibleCourses.map((c) => {
              const isSelected = c.id === currentCourse?.id;
              const chapCount = c.chapters?.length || 0;
              const lesCount = c.chapters
                ? c.chapters.reduce((sum, ch) => sum + ch.lessons.length, 0)
                : c.lessons?.length || 0;
              const tabSched = isItemScheduleOpen(c, 'course');

              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedCourseId(c.id)}
                  className={`px-4 py-2.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-2 cursor-pointer border ${
                    isSelected
                      ? 'bg-purple-700 text-white border-purple-700 shadow-xs ring-2 ring-purple-200'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <BookOpen
                    className={`w-3.5 h-3.5 ${isSelected ? 'text-white' : 'text-purple-600'}`}
                  />
                  <span>{c.title}</span>
                  {!tabSched.isOpen && (
                    <Lock className={`w-3 h-3 ${isSelected ? 'text-amber-300' : 'text-amber-600'}`} />
                  )}
                  {c.visibility === 'private' && (
                    <Lock className={`w-3 h-3 ${isSelected ? 'text-amber-300' : 'text-rose-600'}`} />
                  )}
                  {c.visibility === 'class' && (
                    <Users className={`w-3 h-3 ${isSelected ? 'text-blue-200' : 'text-blue-600'}`} />
                  )}
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-bold ${
                      isSelected ? 'bg-purple-800 text-purple-100' : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {chapCount > 0 ? `${chapCount} chương` : `${lesCount} bài`}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* --- COURSE CONTROL & SCORM PROGRESS BAR --- */}
        {currentCourse && (
          <div className="mt-5 space-y-4">
            {/* Creator Action Strip + Visibility Badge + Schedule Metadata + SCORM Export */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-100">
              <div className="flex flex-wrap items-center gap-2.5 text-xs text-slate-600">
                <span className="font-semibold text-slate-800 flex items-center gap-1">
                  {currentCourse.visibility === 'private' ? (
                    <>
                      <Lock className="w-3.5 h-3.5 text-rose-600" />
                      <span>Riêng tư</span>
                    </>
                  ) : currentCourse.visibility === 'class' ? (
                    <>
                      <Users className="w-3.5 h-3.5 text-blue-600" />
                      <span>Lớp: {currentCourse.assignedClassName || 'Lớp riêng'}</span>
                    </>
                  ) : (
                    <>
                      <Globe className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Công khai</span>
                    </>
                  )}
                </span>

                <span aria-hidden="true">·</span>

                <span
                  className={`font-semibold inline-flex items-center gap-1 ${
                    courseSchedule?.isOpen ? 'text-emerald-700' : 'text-rose-700'
                  }`}
                >
                  {courseSchedule?.isOpen ? (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  ) : (
                    <Lock className="w-3.5 h-3.5" />
                  )}
                  <span>{courseSchedule?.statusLabel || 'Đang mở'}</span>
                </span>

                {(currentCourse.openTime || currentCourse.closeTime) && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-1 text-slate-600 tabular-nums">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      <span>
                        {currentCourse.openTime
                          ? `Mở ${formatVietnameseDateTime(currentCourse.openTime)}`
                          : 'Mở ngay'}
                        {' – '}
                        {currentCourse.closeTime
                          ? `Đóng ${formatVietnameseDateTime(currentCourse.closeTime)}`
                          : 'Không giới hạn'}
                      </span>
                    </span>
                  </>
                )}

                <span aria-hidden="true">·</span>

                <span className="font-mono text-indigo-800 flex items-center gap-1">
                  <Package className="w-3.5 h-3.5" />
                  <span>SCORM {currentCourse.scormVersion || '1.2'}</span>
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {!isCourseBlockedBySchedule && (
                  <button
                    type="button"
                    onClick={() => {
                      setCoursePreviewShowAnswers(false);
                      setCoursePreviewTab('full_syllabus');
                      setPreviewLessonId(activeLessonItem?.id || allLessons[0]?.lesson.id || '');
                      setIsCoursePreviewOpen(true);
                    }}
                    className="px-3 py-1.5 text-xs font-bold bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 rounded-xl flex items-center gap-1.5 cursor-pointer transition-colors"
                    title="Xem trước toàn bộ nội dung, công thức, ảnh và bài học trong khóa"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Xem trước khóa học</span>
                  </button>
                )}

                {canManageCurrent && (
                  <>
                    <button
                      type="button"
                      onClick={() => downloadCourseAsScorm12Zip(currentCourse)}
                      className="px-3 py-1.5 text-xs font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 rounded-xl flex items-center gap-1.5 cursor-pointer"
                      title="Tải xuống gói chuẩn SCORM 1.2 (.zip) gồm imsmanifest.xml"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Xuất gói SCORM (.zip)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCourseModalError(null);
                        setEditingCourse({ ...currentCourse });
                        setIsCourseModalOpen(true);
                      }}
                      className="px-3 py-1.5 text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl flex items-center gap-1 cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Sửa khóa học</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRequestDeleteCourse(currentCourse)}
                      className="px-3 py-1.5 text-xs font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Xóa khóa học</span>
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Progress Card */}
            <div className="bg-gradient-to-r from-purple-50/70 via-emerald-50/50 to-blue-50/70 p-4 rounded-xl border border-purple-100">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
                <div className="flex items-center gap-2.5">
                  <span className="p-2 rounded-lg bg-emerald-600 text-white">
                    <BookmarkCheck className="w-4 h-4" />
                  </span>
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">
                      Tiến độ học tập trực tiếp (SCORM Tracking):
                    </span>
                    <span className="text-[11px] text-slate-600">
                      Đã hoàn thành{' '}
                      <strong className="text-slate-900">
                        {completedUnitsCount}/{trackingUnits.length}
                      </strong>{' '}
                      phần nội dung · {completedLessonsCount}/{allLessons.length} bài ·{' '}
                      {answeredCheckpointsCount} câu tương tác
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 self-end sm:self-center">
                  <span className="text-[11px] font-mono font-bold text-indigo-800 bg-indigo-100 px-2.5 py-1 rounded-full border border-indigo-200">
                    {scormStatusLabel}
                  </span>
                  <span className="text-xs font-extrabold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full border border-emerald-200 font-mono">
                    {progressPct}% Hoàn thành
                  </span>
                </div>
              </div>

              <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full transition-all duration-500 ease-out shadow-xs"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {currentCourse && isCourseBlockedBySchedule && (
        <div className="bg-white rounded-2xl border border-amber-200 p-8 sm:p-10 text-center space-y-4 shadow-xs">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto">
            <Lock className="w-7 h-7 text-amber-700" />
          </div>
          <div className="space-y-1.5 max-w-lg mx-auto">
            <div className="text-xs font-bold text-amber-800 uppercase tracking-wider">
              {courseSchedule?.statusLabel || 'Khóa học tạm khóa'}
            </div>
            <h3 className="text-lg font-extrabold text-slate-900">{currentCourse.title}</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              {courseSchedule?.reason || 'Khóa học hiện không trong thời gian mở học.'}
            </p>
          </div>
          {(currentCourse.openTime || currentCourse.closeTime) && (
            <div className="inline-flex flex-wrap items-center justify-center gap-3 px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 tabular-nums">
              {currentCourse.openTime && (
                <span>
                  Thời gian mở: <strong>{formatVietnameseDateTime(currentCourse.openTime)}</strong>
                </span>
              )}
              {currentCourse.openTime && currentCourse.closeTime && (
                <span aria-hidden="true">·</span>
              )}
              {currentCourse.closeTime && (
                <span>
                  Thời gian đóng: <strong>{formatVietnameseDateTime(currentCourse.closeTime)}</strong>
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {currentCourse && !isCourseBlockedBySchedule && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* LEFT COLUMN: CHAPTERS & LESSONS ACCORDION */}
          <div className="lg:col-span-4 space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-purple-600" />
                  <span>Hệ thống Chương & Bài</span>
                </h3>
                {canManageCurrent && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingChapter({
                        title: '',
                        description: '',
                        order: (currentCourse.chapters?.length || 0) + 1,
                      });
                      setIsChapterModalOpen(true);
                    }}
                    className="px-2.5 py-1 text-[11px] font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-lg border border-purple-200 flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Thêm chương</span>
                  </button>
                )}
              </div>

              {(!currentCourse.chapters || currentCourse.chapters.length === 0) && (
                <div className="p-4 text-center text-xs text-slate-400 italic">
                  Chưa có chương học nào được thiết lập.
                </div>
              )}

              {(currentCourse.chapters || []).map((chap, chapIdx) => {
                const isExpanded = expandedChapterIds[chap.id] ?? true;
                const chapLessons = chap.lessons || [];
                const completedInChap = chapLessons.filter((l) =>
                  progress?.completedLessonIds.includes(l.id)
                ).length;
                const chapterExam = allExams.find((e) => e.id === chap.chapterExamId);

                return (
                  <div
                    key={chap.id}
                    className="rounded-xl border border-slate-200 overflow-hidden bg-slate-50/50"
                  >
                    {/* Chapter Header */}
                    <div
                      onClick={() => toggleChapter(chap.id)}
                      className="p-3 bg-white hover:bg-purple-50/30 transition-colors flex items-center justify-between cursor-pointer border-b border-slate-100"
                    >
                      <div className="flex items-start gap-2 min-w-0 flex-1">
                        <span className="w-5 h-5 rounded bg-purple-100 text-purple-800 text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                          {chapIdx + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <h4 className="text-xs font-bold text-slate-900 leading-snug line-clamp-1">
                            {chap.title}
                          </h4>
                          <span className="text-[10px] text-slate-500 font-mono">
                            {completedInChap}/{chapLessons.length} bài xong
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-0.5 shrink-0 ml-2">
                        {canManageCurrent && (
                          <>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleMoveChapter(chapIdx, 'up');
                              }}
                              disabled={chapIdx === 0}
                              className="p-1 text-slate-400 hover:text-slate-900 rounded disabled:opacity-25 cursor-pointer"
                              title="Chuyển chương lên"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleMoveChapter(chapIdx, 'down');
                              }}
                              disabled={chapIdx === (currentCourse.chapters?.length || 0) - 1}
                              className="p-1 text-slate-400 hover:text-slate-900 rounded disabled:opacity-25 cursor-pointer"
                              title="Chuyển chương xuống"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingChapter({
                                  id: chap.id,
                                  title: chap.title,
                                  description: chap.description || '',
                                  order: chap.order,
                                  chapterExamId: chap.chapterExamId,
                                });
                                setIsChapterModalOpen(true);
                              }}
                              className="p-1 text-slate-400 hover:text-purple-700 rounded cursor-pointer"
                              title="Sửa chương này"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRequestDeleteChapter(chap);
                              }}
                              className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                              title="Xóa chương này"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-slate-400" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-slate-400" />
                        )}
                      </div>
                    </div>

                    {/* Lessons inside chapter */}
                    {isExpanded && (
                      <div className="p-2 space-y-1.5 bg-slate-50">
                        {chapLessons.map((lesson, lessonIdx) => {
                          const flatIdx = allLessons.findIndex((item) => item.lesson.id === lesson.id);
                          const isLocked = isLessonLockedAt(flatIdx);
                          const isActive = lesson.id === activeLessonItem?.id;
                          const isCompleted = progress?.completedLessonIds.includes(lesson.id);

                          return (
                            <div
                              key={lesson.id}
                              onClick={() => handleSelectLesson(lesson.id, chap.id)}
                              title={
                                isLocked
                                  ? 'Hãy hoàn thành các bài học trước đó để mở khóa bài này'
                                  : lesson.title
                              }
                              className={`p-2.5 rounded-lg border transition-all flex items-center justify-between gap-2 ${
                                isLocked
                                  ? 'bg-slate-100/80 text-slate-400 border-slate-200 cursor-not-allowed opacity-75'
                                  : isActive
                                  ? 'bg-purple-600 text-white border-purple-600 shadow-xs cursor-pointer'
                                  : 'bg-white text-slate-800 border-slate-200 hover:border-purple-300 cursor-pointer'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <span
                                  className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
                                    isLocked
                                      ? 'text-amber-600'
                                      : isCompleted
                                      ? isActive
                                        ? 'text-emerald-300'
                                        : 'text-emerald-600'
                                      : isActive
                                      ? 'text-purple-300'
                                      : 'text-slate-300'
                                  }`}
                                >
                                  {isLocked ? (
                                    <Lock className="w-3.5 h-3.5" />
                                  ) : (
                                    <CheckCircle2 className="w-4 h-4 fill-current" />
                                  )}
                                </span>
                                <span className="text-xs font-semibold truncate">
                                  {lesson.title}
                                </span>
                              </div>

                              <div className="flex items-center gap-1 shrink-0">
                                {lesson.durationMinutes && (
                                  <span
                                    className={`text-[10px] font-mono ${
                                      isActive ? 'text-purple-200' : 'text-slate-400'
                                    }`}
                                  >
                                    {lesson.durationMinutes}p
                                  </span>
                                )}
                                {canManageCurrent && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleMoveLesson(chap.id, lessonIdx, 'up');
                                      }}
                                      disabled={lessonIdx === 0}
                                      className={`p-0.5 rounded disabled:opacity-25 cursor-pointer ${
                                        isActive
                                          ? 'text-purple-200 hover:text-white'
                                          : 'text-slate-400 hover:text-slate-800'
                                      }`}
                                      title="Chuyển bài học lên"
                                    >
                                      <ArrowUp className="w-3 h-3" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleMoveLesson(chap.id, lessonIdx, 'down');
                                      }}
                                      disabled={lessonIdx === chapLessons.length - 1}
                                      className={`p-0.5 rounded disabled:opacity-25 cursor-pointer ${
                                        isActive
                                          ? 'text-purple-200 hover:text-white'
                                          : 'text-slate-400 hover:text-slate-800'
                                      }`}
                                      title="Chuyển bài học xuống"
                                    >
                                      <ArrowDown className="w-3 h-3" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setOriginalChapterIdForLesson(chap.id);
                                        setTargetChapterIdForLesson(chap.id);
                                        setEditingLesson({ ...lesson });
                                        setIsLessonModalOpen(true);
                                      }}
                                      className={`p-1 rounded cursor-pointer ${
                                        isActive
                                          ? 'text-purple-200 hover:text-white'
                                          : 'text-slate-400 hover:text-purple-700'
                                      }`}
                                      title="Sửa bài học"
                                    >
                                      <Edit3 className="w-3 h-3" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleRequestDeleteLesson(chap.id, lesson);
                                      }}
                                      className={`p-1 rounded cursor-pointer ${
                                        isActive
                                          ? 'text-purple-200 hover:text-rose-200'
                                          : 'text-slate-400 hover:text-rose-600'
                                      }`}
                                      title="Xóa bài học"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          );
                        })}

                        {/* Chapter Test Exam Launcher */}
                        {chapterExam && (
                          <div className="mt-2 p-2.5 rounded-lg bg-amber-50/70 border border-amber-200 flex items-center justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <span className="text-[10px] font-extrabold uppercase text-amber-800 block">
                                ★ Đề kiểm tra chương:
                              </span>
                              <span className="text-xs font-bold text-slate-900 truncate block">
                                {chapterExam.title}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => onStartExam(chapterExam, 'exam')}
                              className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded text-[11px] font-bold flex items-center gap-1 cursor-pointer shrink-0 shadow-2xs"
                            >
                              <Play className="w-3 h-3 fill-current" />
                              <span>Làm bài</span>
                            </button>
                          </div>
                        )}

                        {canManageCurrent && (
                          <button
                            type="button"
                            onClick={() => {
                              setOriginalChapterIdForLesson(chap.id);
                              setTargetChapterIdForLesson(chap.id);
                              setLessonModalError(null);
                              setLessonFileUrl('');
                              setLessonFileName('');
                              setEditingLesson({
                                title: '',
                                durationMinutes: 25,
                                summary: '',
                                attachments: [],
                              });
                              setIsLessonModalOpen(true);
                            }}
                            className="w-full py-1.5 text-[11px] text-purple-700 hover:bg-purple-100 rounded-lg border border-dashed border-purple-300 flex items-center justify-center gap-1 font-semibold cursor-pointer mt-1"
                          >
                            <Plus className="w-3 h-3" />
                            <span>Thêm bài học vào chương này</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Course Final Exam Card */}
            {currentCourse.finalExamId &&
              (() => {
                const finalExam = allExams.find((e) => e.id === currentCourse.finalExamId);
                if (!finalExam) return null;
                return (
                  <div className="bg-gradient-to-br from-slate-900 to-purple-950 text-white p-5 rounded-2xl shadow-sm space-y-3 border border-slate-800">
                    <div className="flex items-center gap-2 text-amber-400 text-xs font-bold uppercase tracking-wider">
                      <Award className="w-4 h-4" />
                      <span>Bài thi Tổng kết Khóa học</span>
                    </div>
                    <h4 className="text-sm font-bold text-white">
                      {currentCourse.finalExamTitle || finalExam.title}
                    </h4>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      Đánh giá toàn diện kiến thức tất cả các chương. Làm bài để ghi điểm xếp hạng vào hồ sơ học sinh.
                    </p>
                    <button
                      type="button"
                      onClick={() => onStartExam(finalExam, 'exam')}
                      className="w-full py-2 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Bắt đầu thi Tổng kết ({finalExam.durationMinutes} phút)</span>
                    </button>
                  </div>
                );
              })()}
          </div>

          {/* RIGHT COLUMN: ACTIVE LESSON CONTENT & INTERACTIVE CHECKPOINTS */}
          <div className="lg:col-span-8 space-y-6">
            {activeLessonItem ? (
              <div
                ref={lessonTopRef}
                className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-6"
              >
                {/* Lesson Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                  <div>
                    <div className="flex items-center gap-2 text-xs text-purple-700 font-bold uppercase tracking-wide mb-1">
                      {activeChapterItem && <span>{activeChapterItem.title}</span>}
                      {activeChapterItem && <span>·</span>}
                      <span className="flex items-center gap-1 text-slate-500 font-normal">
                        <Clock className="w-3.5 h-3.5" />
                        {activeLessonItem.durationMinutes || 25} phút
                      </span>
                    </div>
                    <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900">
                      {activeLessonItem.title}
                    </h2>
                  </div>

                  {/* Read-only block/lesson completion indicator & creator insert control */}
                  <div className="flex flex-wrap items-center gap-3 shrink-0">
                    <span
                      className={`text-xs font-semibold flex items-center gap-1.5 ${
                        isActiveLessonDone ? 'text-emerald-700' : 'text-slate-600'
                      }`}
                    >
                      {isActiveLessonDone ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          <span>Đã hoàn thành bài học này</span>
                        </>
                      ) : activeLessonBlocks.length > 0 && !canManageCurrent ? (
                        <>
                          <Clock className="w-3.5 h-3.5 text-purple-600" />
                          <span>
                            Block {safeActiveBlockIndex + 1}/{activeLessonBlocks.length} ·{' '}
                            {activeBlockItem?.type === 'question'
                              ? 'Làm đúng câu hỏi để qua block'
                              : 'Đọc đến cuối block để qua tiếp'}
                          </span>
                        </>
                      ) : (
                        <>
                          <ArrowDown className="w-3.5 h-3.5 text-slate-400" />
                          <span>Cuộn xuống cuối trang để hoàn thành</span>
                        </>
                      )}
                    </span>

                    {canManageCurrent && (
                      <button
                        type="button"
                        onClick={() => openCreateBlockModal('theory', null)}
                        className="px-3.5 py-2 text-xs font-bold bg-purple-700 hover:bg-purple-800 text-white rounded-xl flex items-center gap-1.5 cursor-pointer shadow-xs"
                        title="Chèn khối lý thuyết, ảnh minh họa hoặc câu hỏi tương tác"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Chèn nội dung</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Lesson Summary */}
                {activeLessonItem.summary && (
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 leading-relaxed italic">
                    <strong>Mục tiêu bài học:</strong> {activeLessonItem.summary}
                  </div>
                )}

                {/* Student Sequential Block Stepper Bar */}
                {!canManageCurrent && activeLessonBlocks.length > 0 && (
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between text-[11px] font-bold text-slate-700">
                      <span>Tiến trình từng phần (Block) trong bài học:</span>
                      <span className="font-mono text-purple-700">
                        {
                          activeLessonBlocks.filter((b) =>
                            isBlockCompletedForProgress(b, progress)
                          ).length
                        }
                        /{activeLessonBlocks.length} block xong
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {activeLessonBlocks.map((blk, idx) => {
                        const done = isBlockCompletedForProgress(blk, progress);
                        const locked = idx > maxUnlockedBlockIndex;
                        const active = idx === safeActiveBlockIndex;
                        return (
                          <button
                            key={blk.id}
                            type="button"
                            onClick={() => handleSelectBlock(idx)}
                            disabled={locked}
                            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border flex items-center gap-1.5 transition-all ${
                              active
                                ? 'bg-purple-700 text-white border-purple-700 shadow-xs cursor-pointer'
                                : done
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100 cursor-pointer'
                                : locked
                                ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                                : 'bg-white text-slate-700 border-slate-300 hover:border-purple-400 cursor-pointer'
                            }`}
                          >
                            {locked ? (
                              <Lock className="w-3 h-3" />
                            ) : done ? (
                              <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                            ) : (
                              <span className="w-3.5 h-3.5 rounded-full bg-current/15 flex items-center justify-center text-[10px]">
                                {idx + 1}
                              </span>
                            )}
                            <span>
                              Block {idx + 1}
                              {blk.type === 'question' ? ' · Câu hỏi' : ''}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* --- LESSON BLOCKS (THEORY + IMAGES + INTERACTIVE CHECKPOINTS) --- */}
                <div className="space-y-4">
                  {(!activeLessonItem.blocks || activeLessonItem.blocks.length === 0) && (
                    <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200 space-y-3">
                      <BookOpen className="w-8 h-8 text-slate-300 mx-auto" />
                      <div className="text-sm font-semibold text-slate-600">
                        Bài học này chưa có khối nội dung nào.
                      </div>
                      {canManageCurrent && (
                        <div className="flex flex-wrap justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => openCreateBlockModal('theory', 0)}
                            className="px-3 py-1.5 bg-purple-700 text-white text-xs font-bold rounded-lg cursor-pointer inline-flex items-center gap-1"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Thêm Lý thuyết</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => openCreateBlockModal('image', 0)}
                            className="px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-lg cursor-pointer inline-flex items-center gap-1"
                          >
                            <ImageIcon className="w-3.5 h-3.5" />
                            <span>Chèn Hình ảnh</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => openCreateBlockModal('file', 0)}
                            className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-lg cursor-pointer inline-flex items-center gap-1"
                          >
                            <Paperclip className="w-3.5 h-3.5" />
                            <span>Chèn Tài liệu / File</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => openCreateBlockModal('question', 0)}
                            className="px-3 py-1.5 bg-emerald-600 text-white text-xs font-bold rounded-lg cursor-pointer inline-flex items-center gap-1"
                          >
                            <HelpCircle className="w-3.5 h-3.5" />
                            <span>Chèn Câu hỏi</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {(canManageCurrent
                    ? activeLessonBlocks
                    : activeBlockItem
                    ? [activeBlockItem]
                    : []
                  ).map((block) => {
                    const bIdx = activeLessonBlocks.findIndex((b) => b.id === block.id);
                    const isBlockDone = isBlockCompletedForProgress(block, progress);
                    const totalBlocks = activeLessonBlocks.length;

                    return (
                      <React.Fragment key={block.id}>
                        {/* Creator Block Toolbar + Content Container */}
                        <div
                          className={`rounded-2xl border p-4 sm:p-5 transition-all space-y-3 ${
                            block.type === 'question'
                              ? 'border-2 border-purple-300 bg-gradient-to-br from-purple-50/40 to-slate-50 shadow-xs'
                              : block.type === 'callout'
                              ? block.calloutType === 'formula'
                                ? 'bg-purple-50/70 border-purple-200'
                                : block.calloutType === 'tip'
                                ? 'bg-amber-50/70 border-amber-200'
                                : 'bg-blue-50/70 border-blue-200'
                              : block.type === 'image'
                              ? 'bg-slate-50/60 border-slate-200'
                              : block.type === 'file'
                              ? 'bg-indigo-50/35 border-indigo-200'
                              : isBlockDone
                              ? 'bg-emerald-50/20 border-emerald-200'
                              : 'bg-white border-slate-200'
                          }`}
                        >
                          {/* Creator action header on every block */}
                          {canManageCurrent && (
                            <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200/70 text-[11px]">
                              <span className="font-mono font-bold text-slate-500">
                                Phần #{bIdx + 1} ·{' '}
                                {block.type === 'theory'
                                  ? 'Lý thuyết'
                                  : block.type === 'image'
                                  ? 'Hình ảnh minh họa'
                                  : block.type === 'file'
                                  ? 'Tài liệu / Tệp đính kèm'
                                  : block.type === 'callout'
                                  ? 'Hộp ghi nhớ'
                                  : 'Câu hỏi tương tác'}
                              </span>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleMoveBlock(bIdx, 'up')}
                                  disabled={bIdx === 0}
                                  className="p-1 text-slate-500 hover:text-slate-900 hover:bg-white rounded disabled:opacity-30 cursor-pointer"
                                  title="Di chuyển lên"
                                >
                                  <ArrowUp className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleMoveBlock(bIdx, 'down')}
                                  disabled={bIdx === totalBlocks - 1}
                                  className="p-1 text-slate-500 hover:text-slate-900 hover:bg-white rounded disabled:opacity-30 cursor-pointer"
                                  title="Di chuyển xuống"
                                >
                                  <ArrowDown className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openEditBlockModal(block)}
                                  className="px-2 py-1 text-blue-700 bg-blue-50 hover:bg-blue-100 rounded font-bold flex items-center gap-1 cursor-pointer"
                                  title="Sửa phần nội dung này"
                                >
                                  <Edit3 className="w-3 h-3" />
                                  <span>Sửa</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRequestDeleteBlock(block)}
                                  className="px-2 py-1 text-rose-700 bg-rose-50 hover:bg-rose-100 rounded font-bold flex items-center gap-1 cursor-pointer"
                                  title="Xóa phần nội dung này"
                                >
                                  <Trash2 className="w-3 h-3" />
                                  <span>Xóa</span>
                                </button>
                              </div>
                            </div>
                          )}

                          {/* BLOCK TYPE 1: THEORY */}
                          {block.type === 'theory' && (
                            <div className="space-y-3">
                              {block.title && (
                                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                                  <span className="w-2 h-2 rounded-full bg-purple-600" />
                                  <span>{block.title}</span>
                                </h3>
                              )}
                              <div className="text-sm text-slate-800 leading-relaxed space-y-2">
                                <RichContentRenderer
                                  content={block.contentMarkdown || ''}
                                  imageUrl={block.imageUrl}
                                />
                              </div>
                            </div>
                          )}

                          {/* BLOCK TYPE 2: CALLOUT / FORMULA BOX */}
                          {block.type === 'callout' && (
                            <div className="space-y-2">
                              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-purple-900">
                                <Zap className="w-4 h-4 text-purple-700" />
                                <span>{block.title || 'Công thức quan trọng'}</span>
                              </div>
                              <div className="text-sm">
                                <RichContentRenderer
                                  content={block.contentMarkdown || ''}
                                  imageUrl={block.imageUrl}
                                />
                              </div>
                            </div>
                          )}

                          {/* BLOCK TYPE 3: IMAGE */}
                          {block.type === 'image' && (
                            <div className="space-y-2.5 text-center">
                              {block.title && (
                                <h4 className="text-sm font-bold text-slate-900 text-left flex items-center gap-1.5">
                                  <ImageIcon className="w-4 h-4 text-blue-600" />
                                  <span>{block.title}</span>
                                </h4>
                              )}
                              {block.imageUrl && (
                                <img
                                  src={block.imageUrl}
                                  alt={block.caption || block.title || 'Hình ảnh bài giảng'}
                                  className="max-h-96 mx-auto rounded-xl border border-slate-200 object-contain shadow-2xs bg-white"
                                />
                              )}
                              {block.caption && (
                                <p className="text-xs text-slate-600 italic">{block.caption}</p>
                              )}
                            </div>
                          )}

                          {/* BLOCK TYPE 3b: FILE ATTACHMENTS (PDF, DOC, PPT, EXCEL, AUDIO, VIDEO, LINKS) */}
                          {block.type === 'file' && (
                            <div className="space-y-3">
                              <div className="flex items-center justify-between gap-2">
                                <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                                  <Paperclip className="w-4 h-4 text-indigo-600 shrink-0" />
                                  <span>{block.title || 'Tài liệu học tập đính kèm'}</span>
                                </h4>
                                <span className="text-[11px] font-mono text-indigo-700">
                                  {(block.attachments || []).length} tệp
                                </span>
                              </div>
                              {block.contentMarkdown && (
                                <div className="text-xs sm:text-sm text-slate-700 leading-relaxed">
                                  <RichContentRenderer content={block.contentMarkdown} />
                                </div>
                              )}
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                {(block.attachments || []).map((att) => {
                                  const badge = getCourseAttachmentBadge(att);
                                  const previewKind = getCourseAttachmentPreviewKind(att);
                                  const href = att.dataUrl || att.url || '#';
                                  return (
                                    <div
                                      key={att.id}
                                      className="p-3 rounded-xl bg-white border border-slate-200 flex items-center justify-between gap-3 shadow-2xs"
                                    >
                                      <div className="flex items-center gap-2.5 min-w-0">
                                        <span
                                          className={`px-2 py-1 rounded-lg text-[10px] font-extrabold border shrink-0 ${badge.colorClass}`}
                                        >
                                          {badge.ext}
                                        </span>
                                        <div className="min-w-0">
                                          <div className="text-xs font-bold text-slate-900 truncate">
                                            {att.name}
                                          </div>
                                          <div className="text-[11px] text-slate-500">
                                            {badge.label} · {formatCourseFileSize(att.sizeBytes)}
                                          </div>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-1.5 shrink-0">
                                        {previewKind !== 'none' && (
                                          <button
                                            type="button"
                                            onClick={() => setPreviewingAttachment(att)}
                                            className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                                            title="Xem trước tài liệu ngay trên trang"
                                          >
                                            <Eye className="w-3.5 h-3.5" />
                                            <span>Xem</span>
                                          </button>
                                        )}
                                        {att.dataUrl ? (
                                          <a
                                            href={href}
                                            download={att.name}
                                            className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold flex items-center gap-1"
                                          >
                                            <Download className="w-3.5 h-3.5" />
                                            <span>Tải về</span>
                                          </a>
                                        ) : (
                                          <a
                                            href={href}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold flex items-center gap-1"
                                          >
                                            <ExternalLink className="w-3.5 h-3.5" />
                                            <span>Mở link</span>
                                          </a>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* BLOCK TYPE 4: INTERACTIVE CHECKPOINT QUESTION */}
                          {block.type === 'question' &&
                            block.question &&
                            (() => {
                              const q = block.question;
                              const userChoice = checkpointAnswers[block.id];
                              const evalResult = checkpointResults[block.id];

                              return (
                                <div className="space-y-4">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="px-2.5 py-1 text-xs font-extrabold rounded-lg bg-purple-700 text-white flex items-center gap-1.5 shadow-2xs">
                                      <HelpCircle className="w-3.5 h-3.5" />
                                      <span>{block.title || 'Câu hỏi tương tác giữa bài'}</span>
                                    </span>
                                    <span className="text-xs font-mono font-bold text-purple-800 bg-purple-100 px-2 py-0.5 rounded border border-purple-200">
                                      {q.points || 1.0} điểm
                                    </span>
                                  </div>

                                  <div className="text-sm font-semibold text-slate-900 leading-relaxed">
                                    <RichContentRenderer content={q.question} imageUrl={q.imageUrl} />
                                  </div>

                                  {/* Single choice */}
                                  {q.type === 'single_choice' && (
                                    <div className="space-y-2">
                                      {(q.options || []).map((opt, optIdx) => {
                                        const letter = String.fromCharCode(65 + optIdx);
                                        const isSelected = userChoice === optIdx;

                                        return (
                                          <div
                                            key={optIdx}
                                            onClick={() =>
                                              setCheckpointAnswers((prev) => ({
                                                ...prev,
                                                [block.id]: optIdx,
                                              }))
                                            }
                                            className={`p-3 rounded-xl border text-xs sm:text-sm font-medium transition-all flex items-center gap-3 cursor-pointer ${
                                              isSelected
                                                ? 'bg-purple-700 text-white border-purple-700 shadow-xs'
                                                : 'bg-white text-slate-800 border-slate-200 hover:border-purple-300'
                                            }`}
                                          >
                                            <span
                                              className={`w-6 h-6 rounded-md font-bold text-xs flex items-center justify-center shrink-0 border ${
                                                isSelected
                                                  ? 'bg-purple-800 text-white border-purple-800'
                                                  : 'bg-slate-100 text-slate-700 border-slate-200'
                                              }`}
                                            >
                                              {letter}
                                            </span>
                                            <div className="flex-1">
                                              <RichContentRenderer content={opt} />
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}

                                  {/* Multiple choice */}
                                  {q.type === 'multiple_choice' && (
                                    <div className="space-y-2">
                                      <div className="text-[11px] text-purple-700 font-semibold italic">
                                        * Có thể chọn nhiều phương án đúng
                                      </div>
                                      {(q.options || []).map((opt, optIdx) => {
                                        const letter = String.fromCharCode(65 + optIdx);
                                        const selectedArr: number[] = Array.isArray(userChoice)
                                          ? userChoice
                                          : [];
                                        const isSelected = selectedArr.includes(optIdx);

                                        return (
                                          <div
                                            key={optIdx}
                                            onClick={() => {
                                              const nextArr = isSelected
                                                ? selectedArr.filter((x) => x !== optIdx)
                                                : [...selectedArr, optIdx];
                                              setCheckpointAnswers((prev) => ({
                                                ...prev,
                                                [block.id]: nextArr,
                                              }));
                                            }}
                                            className={`p-3 rounded-xl border text-xs sm:text-sm font-medium transition-all flex items-center gap-3 cursor-pointer ${
                                              isSelected
                                                ? 'bg-purple-700 text-white border-purple-700 shadow-xs'
                                                : 'bg-white text-slate-800 border-slate-200 hover:border-purple-300'
                                            }`}
                                          >
                                            <span
                                              className={`w-6 h-6 rounded-md font-bold text-xs flex items-center justify-center shrink-0 border ${
                                                isSelected
                                                  ? 'bg-purple-800 text-white border-purple-800'
                                                  : 'bg-slate-100 text-slate-700 border-slate-200'
                                              }`}
                                            >
                                              {isSelected ? '✓' : letter}
                                            </span>
                                            <div className="flex-1">
                                              <RichContentRenderer content={opt} />
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}

                                  {/* True / False */}
                                  {q.type === 'true_false' && (
                                    <div className="space-y-3">
                                      <div className="text-xs text-slate-500 italic">
                                        * {formatTrueFalseScoringRule(q)}
                                      </div>
                                      {(q.tfItems || []).map((item, itemIdx) => {
                                        const letter = String.fromCharCode(97 + itemIdx);
                                        const currentMap =
                                          (userChoice as { [id: string]: boolean }) || {};
                                        const itemChoice = currentMap[item.id];

                                        return (
                                          <div
                                            key={item.id}
                                            className="p-3 bg-white border border-slate-200 rounded-xl flex items-center justify-between gap-3 text-xs sm:text-sm"
                                          >
                                            <div className="flex items-start gap-2 flex-1">
                                              <span className="font-bold text-slate-700 shrink-0">
                                                {letter})
                                              </span>
                                              <RichContentRenderer content={item.statement} />
                                            </div>
                                            <div className="flex items-center gap-1.5 shrink-0">
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  const nextMap = {
                                                    ...currentMap,
                                                    [item.id]: true,
                                                  };
                                                  setCheckpointAnswers((prev) => ({
                                                    ...prev,
                                                    [block.id]: nextMap,
                                                  }));
                                                }}
                                                className={`px-2.5 py-1 text-xs font-bold rounded cursor-pointer border ${
                                                  itemChoice === true
                                                    ? 'bg-emerald-600 text-white border-emerald-600'
                                                    : 'bg-slate-50 text-slate-700 border-slate-200'
                                                }`}
                                              >
                                                ĐÚNG
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  const nextMap = {
                                                    ...currentMap,
                                                    [item.id]: false,
                                                  };
                                                  setCheckpointAnswers((prev) => ({
                                                    ...prev,
                                                    [block.id]: nextMap,
                                                  }));
                                                }}
                                                className={`px-2.5 py-1 text-xs font-bold rounded cursor-pointer border ${
                                                  itemChoice === false
                                                    ? 'bg-rose-600 text-white border-rose-600'
                                                    : 'bg-slate-50 text-slate-700 border-slate-200'
                                                }`}
                                              >
                                                SAI
                                              </button>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}

                                  {/* Short text input */}
                                  {q.type === 'text_input' && (
                                    <div className="flex items-center gap-2">
                                      <input
                                        type="text"
                                        value={(userChoice as string) || ''}
                                        onChange={(e) =>
                                          setCheckpointAnswers((prev) => ({
                                            ...prev,
                                            [block.id]: e.target.value,
                                          }))
                                        }
                                        placeholder="Nhập câu trả lời của bạn..."
                                        className="flex-1 px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-600"
                                      />
                                    </div>
                                  )}

                                  {/* Matching two columns */}
                                  {q.type === 'matching' && (
                                    <MatchingQuestionView
                                      question={q}
                                      mode="taking"
                                      hidePrompt={true}
                                      userAnswer={
                                        userChoice &&
                                        typeof userChoice === 'object' &&
                                        !Array.isArray(userChoice)
                                          ? (userChoice as { [leftId: string]: string })
                                          : {}
                                      }
                                      onChange={(updatedMap) =>
                                        setCheckpointAnswers((prev) => ({
                                          ...prev,
                                          [block.id]: updatedMap,
                                        }))
                                      }
                                    />
                                  )}

                                  <div className="flex items-center justify-between pt-1">
                                    <button
                                      type="button"
                                      onClick={() => handleGradeCheckpoint(block)}
                                      className="px-4 py-2 bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer"
                                    >
                                      <Send className="w-3.5 h-3.5" />
                                      <span>Kiểm tra đáp án</span>
                                    </button>

                                    {evalResult && (
                                      <span
                                        className={`text-xs font-bold px-3 py-1 rounded-lg border ${
                                          evalResult.isCorrect
                                            ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                            : 'bg-rose-100 text-rose-800 border-rose-300'
                                        }`}
                                      >
                                        {evalResult.isCorrect
                                          ? `✓ Chính xác (${evalResult.earned}/${evalResult.max}đ)`
                                          : `✗ Chưa đúng (${evalResult.earned}/${evalResult.max}đ)`}
                                      </span>
                                    )}
                                  </div>

                                  {evalResult && (
                                    <div className="p-3.5 rounded-xl bg-purple-50 border border-purple-200 text-xs space-y-1.5">
                                      <div className="font-bold text-purple-900 flex items-center gap-1">
                                        <Sparkles className="w-3.5 h-3.5 text-purple-700" />
                                        <span>Lời giải & Hướng dẫn phương pháp:</span>
                                      </div>
                                      <div className="text-slate-800 leading-relaxed">
                                        <RichContentRenderer content={evalResult.explanation} />
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })()}

                          {/* Block Bottom Scroll Sentinel & Student Gate Footer */}
                          {!canManageCurrent && block.type !== 'question' && (
                            <div ref={blockBottomSentinelRef} className="h-1 w-full" aria-hidden="true" />
                          )}

                          <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                            <span className="text-slate-400 font-mono">
                              Block #{bIdx + 1}/{totalBlocks}
                            </span>
                            {isBlockDone ? (
                              <span className="font-semibold text-emerald-700 flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Đã hoàn thành block này</span>
                              </span>
                            ) : !canManageCurrent ? (
                              <span className="font-medium text-amber-700 flex items-center gap-1">
                                <Lock className="w-3 h-3" />
                                <span>
                                  {block.type === 'question'
                                    ? 'Trả lời đúng 100% và bấm Kiểm tra đáp án để hoàn thành block'
                                    : 'Cuộn xuống cuối nội dung block để hoàn thành'}
                                </span>
                              </span>
                            ) : null}
                          </div>

                          {/* Student Block-to-Block Step Navigation */}
                          {!canManageCurrent && totalBlocks > 0 && (
                            <div className="pt-2 flex flex-wrap items-center justify-between gap-2">
                              {bIdx > 0 ? (
                                <button
                                  type="button"
                                  onClick={() => handleSelectBlock(bIdx - 1)}
                                  className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                                >
                                  <ArrowLeft className="w-3.5 h-3.5" />
                                  <span>Block trước</span>
                                </button>
                              ) : (
                                <div />
                              )}

                              {bIdx < totalBlocks - 1 && (
                                <button
                                  type="button"
                                  disabled={!isBlockDone}
                                  onClick={() => handleSelectBlock(bIdx + 1)}
                                  className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ml-auto ${
                                    isBlockDone
                                      ? 'bg-purple-700 hover:bg-purple-800 text-white shadow-xs cursor-pointer'
                                      : 'bg-slate-200 text-slate-500 cursor-not-allowed'
                                  }`}
                                >
                                  {!isBlockDone && <Lock className="w-3.5 h-3.5" />}
                                  <span>Chuyển sang Block {bIdx + 2}</span>
                                  <ArrowRight className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Creator Quick Insert Between Theory Blocks */}
                        {canManageCurrent && (
                          <div className="flex items-center justify-center gap-2 py-1 opacity-75 hover:opacity-100 transition-opacity">
                            <div className="flex-1 h-px bg-dashed border-t border-dashed border-slate-200" />
                            <span className="text-[10px] font-bold text-slate-400 uppercase">
                              Chèn vào vị trí này:
                            </span>
                            <button
                              type="button"
                              onClick={() => openCreateBlockModal('theory', bIdx + 1)}
                              className="px-2 py-1 rounded-md bg-slate-100 hover:bg-purple-100 text-slate-700 hover:text-purple-800 text-[10px] font-bold cursor-pointer"
                            >
                              + Lý thuyết
                            </button>
                            <button
                              type="button"
                              onClick={() => openCreateBlockModal('image', bIdx + 1)}
                              className="px-2 py-1 rounded-md bg-slate-100 hover:bg-blue-100 text-slate-700 hover:text-blue-800 text-[10px] font-bold cursor-pointer"
                            >
                              + Ảnh
                            </button>
                            <button
                              type="button"
                              onClick={() => openCreateBlockModal('file', bIdx + 1)}
                              className="px-2 py-1 rounded-md bg-slate-100 hover:bg-indigo-100 text-slate-700 hover:text-indigo-800 text-[10px] font-bold cursor-pointer"
                            >
                              + Tài liệu / File
                            </button>
                            <button
                              type="button"
                              onClick={() => openCreateBlockModal('question', bIdx + 1)}
                              className="px-2 py-1 rounded-md bg-slate-100 hover:bg-emerald-100 text-slate-700 hover:text-emerald-800 text-[10px] font-bold cursor-pointer"
                            >
                              + Câu hỏi giữa bài
                            </button>
                            <div className="flex-1 h-px border-t border-dashed border-slate-200" />
                          </div>
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>

                {/* --- LESSON LEVEL ATTACHMENTS (PDF / WORD / PPT / EXCEL / LINKS) --- */}
                {activeLessonItem.attachments && activeLessonItem.attachments.length > 0 && (
                  <div className="p-4 sm:p-5 rounded-2xl bg-indigo-50/45 border border-indigo-200 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-indigo-900">
                        <Paperclip className="w-4 h-4 text-indigo-600" />
                        <span>Tài liệu đính kèm bài học ({activeLessonItem.attachments.length} tệp)</span>
                      </div>
                      <span className="text-[11px] text-indigo-700">
                        Hỗ trợ xem trực tiếp PDF/Ảnh hoặc tải về máy
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {activeLessonItem.attachments.map((att) => {
                        const badge = getCourseAttachmentBadge(att);
                        const previewKind = getCourseAttachmentPreviewKind(att);
                        const href = att.dataUrl || att.url || '#';
                        return (
                          <div
                            key={att.id}
                            className="p-3 rounded-xl bg-white border border-indigo-100 flex items-center justify-between gap-3 shadow-2xs"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span
                                className={`px-2 py-1 rounded-lg text-[10px] font-extrabold border shrink-0 ${badge.colorClass}`}
                              >
                                {badge.ext}
                              </span>
                              <div className="min-w-0">
                                <div className="text-xs font-bold text-slate-900 truncate">
                                  {att.name}
                                </div>
                                <div className="text-[11px] text-slate-500">
                                  {badge.label} · {formatCourseFileSize(att.sizeBytes)}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {previewKind !== 'none' && (
                                <button
                                  type="button"
                                  onClick={() => setPreviewingAttachment(att)}
                                  className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  <span>Xem</span>
                                </button>
                              )}
                              {att.dataUrl ? (
                                <a
                                  href={href}
                                  download={att.name}
                                  className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold flex items-center gap-1"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                  <span>Tải về</span>
                                </a>
                              ) : (
                                <a
                                  href={href}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold flex items-center gap-1"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                  <span>Mở link</span>
                                </a>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* --- PRACTICE EXAM FOR THIS LESSON --- */}
                {activeLessonItem.practiceExamId &&
                  (() => {
                    const pExam = allExams.find((e) => e.id === activeLessonItem.practiceExamId);
                    if (!pExam) return null;
                    return (
                      <div className="p-5 rounded-2xl bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 space-y-3">
                        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-800">
                          <FileText className="w-4 h-4" />
                          <span>Đề thi luyện tập củng cố bài học:</span>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div>
                            <h4 className="text-sm font-bold text-slate-900">{pExam.title}</h4>
                            <span className="text-xs text-slate-500 font-mono">
                              {pExam.questions.length} câu hỏi · {pExam.durationMinutes} phút ·{' '}
                              {pExam.totalPoints || 10}đ
                            </span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => onStartExam(pExam, 'practice')}
                              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl text-xs flex items-center gap-1 shadow-2xs cursor-pointer"
                            >
                              <Lightbulb className="w-3.5 h-3.5" />
                              <span>Luyện tập ngay</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => onStartExam(pExam, 'exam')}
                              className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs flex items-center gap-1 shadow-2xs cursor-pointer"
                            >
                              <Play className="w-3.5 h-3.5 fill-current" />
                              <span>Thi thử</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                {/* --- BOTTOM PREV / NEXT LESSON NAVIGATION --- */}
                <div className="pt-6 border-t border-slate-100 flex flex-wrap items-center justify-between gap-4">
                  {prevLessonItem ? (
                    <button
                      type="button"
                      onClick={() =>
                        handleSelectLesson(
                          prevLessonItem.lesson.id,
                          prevLessonItem.chapter?.id
                        )
                      }
                      className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl flex items-center gap-1.5 cursor-pointer"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Bài trước</span>
                    </button>
                  ) : (
                    <div />
                  )}

                  {nextLessonItem && (() => {
                    const canGoNextLesson = canManageCurrent || isActiveLessonDone;
                    return (
                      <button
                        type="button"
                        disabled={!canGoNextLesson}
                        onClick={() =>
                          handleSelectLesson(
                            nextLessonItem.lesson.id,
                            nextLessonItem.chapter?.id
                          )
                        }
                        title={
                          canGoNextLesson
                            ? `Chuyển sang ${nextLessonItem.lesson.title}`
                            : 'Hãy hoàn thành tất cả các block trong bài học này để mở khóa bài tiếp theo'
                        }
                        className={`px-4 py-2 text-xs font-bold rounded-xl flex items-center gap-1.5 ml-auto transition-all ${
                          canGoNextLesson
                            ? 'bg-purple-700 hover:bg-purple-800 text-white cursor-pointer shadow-xs'
                            : 'bg-slate-200 text-slate-500 cursor-not-allowed'
                        }`}
                      >
                        {!canGoNextLesson && <Lock className="w-3.5 h-3.5" />}
                        <span>
                          {canGoNextLesson
                            ? 'Bài kế tiếp'
                            : 'Hoàn thành bài này để mở Bài kế tiếp'}
                        </span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    );
                  })()}
                </div>

                {/* Scroll-to-bottom completion sentinel for empty-block lessons */}
                <div ref={lessonBottomSentinelRef} className="h-2 w-full" aria-hidden="true" />
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400 space-y-2">
                <BookOpen className="w-10 h-10 mx-auto text-slate-300" />
                <div className="text-sm font-semibold text-slate-600">
                  Chọn một bài học từ danh sách chương bên trái (hoặc thêm chương & bài mới) để bắt đầu.
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- MODAL 1: ADD / EDIT COURSE --- */}
      {isCourseModalOpen && editingCourse && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">
                {editingCourse.id ? 'Chỉnh sửa khóa học' : 'Tạo khóa học mới'}
              </h3>
              <button
                onClick={() => setIsCourseModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {courseModalError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{courseModalError}</span>
              </div>
            )}

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Tên khóa học <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={editingCourse.title || ''}
                  onChange={(e) => setEditingCourse({ ...editingCourse, title: e.target.value })}
                  placeholder="Nhập tên khóa học..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-semibold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Môn học:</label>
                  <select
                    value={editingCourse.subject || 'math'}
                    onChange={(e) => setEditingCourse({ ...editingCourse, subject: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  >
                    <option value="math">Toán học</option>
                    <option value="english">Tiếng Anh</option>
                    <option value="physics">Vật lý</option>
                    <option value="chemistry">Hóa học</option>
                    <option value="biology">Sinh học</option>
                    <option value="it">Tin học</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Khối lớp:</label>
                  <input
                    type="text"
                    value={editingCourse.grade || ''}
                    onChange={(e) => setEditingCourse({ ...editingCourse, grade: e.target.value })}
                    placeholder="Nhập khối lớp..."
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Phạm vi hiển thị khóa học:
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'public', label: 'Công khai web', icon: Globe },
                    { id: 'class', label: 'Trong lớp học', icon: Users },
                    { id: 'private', label: 'Riêng tư (Người ra đề & QTV)', icon: Lock },
                  ].map((opt) => {
                    const Icon = opt.icon;
                    const active = (editingCourse.visibility || 'public') === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() =>
                          setEditingCourse({
                            ...editingCourse,
                            visibility: opt.id as ExamVisibility,
                            assignedClassId:
                              opt.id === 'class'
                                ? editingCourse.assignedClassId || teacherOwnClassrooms[0]?.id
                                : undefined,
                          })
                        }
                        className={`p-2 rounded-lg border font-bold flex items-center justify-center gap-1 cursor-pointer ${
                          active
                            ? 'bg-purple-700 text-white border-purple-700'
                            : 'bg-slate-50 text-slate-700 border-slate-200'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        <span>{opt.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {editingCourse.visibility === 'class' && (
                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    Chọn lớp học được phép học khóa này:
                  </label>
                  {teacherOwnClassrooms.length === 0 ? (
                    <div className="text-rose-600 font-semibold">
                      Bạn chưa tạo lớp học nào. Hãy tạo lớp trước trong mục Lớp học.
                    </div>
                  ) : (
                    <select
                      value={editingCourse.assignedClassId || teacherOwnClassrooms[0]?.id || ''}
                      onChange={(e) =>
                        setEditingCourse({ ...editingCourse, assignedClassId: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-blue-300 rounded-lg font-semibold bg-blue-50/40"
                    >
                      {teacherOwnClassrooms.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.grade})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              <div className="p-3 rounded-xl bg-indigo-50/70 border border-indigo-200 flex items-center justify-between">
                <div>
                  <div className="font-bold text-indigo-950">Chế độ Gói SCORM 1.2</div>
                  <div className="text-[11px] text-indigo-800">
                    Theo dõi tiến độ từng phần (học tới đâu tính tới đó) & hỗ trợ xuất .zip SCORM 1.2
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={editingCourse.isScormEnabled ?? true}
                  onChange={(e) =>
                    setEditingCourse({ ...editingCourse, isScormEnabled: e.target.checked })
                  }
                  className="w-4 h-4 text-indigo-600 rounded"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Giảng viên / Phụ trách:</label>
                <input
                  type="text"
                  value={editingCourse.instructor || ''}
                  onChange={(e) =>
                    setEditingCourse({ ...editingCourse, instructor: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Mô tả khóa học:</label>
                <textarea
                  rows={2}
                  value={editingCourse.description || ''}
                  onChange={(e) =>
                    setEditingCourse({ ...editingCourse, description: e.target.value })
                  }
                  placeholder="Mục tiêu, đối tượng học sinh và lộ trình..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Đề thi Tổng kết Khóa (Tùy chọn):
                </label>
                <select
                  value={editingCourse.finalExamId || ''}
                  onChange={(e) =>
                    setEditingCourse({ ...editingCourse, finalExamId: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                >
                  <option value="">-- Không gán đề thi tổng kết --</option>
                  {allExams
                    .filter((ex) => canShowInPublicLibrary(ex, currentUser, userRole, allClassrooms))
                    .map((ex) => (
                      <option key={ex.id} value={ex.id}>
                        {ex.title} ({ex.questions.length} câu)
                      </option>
                    ))}
                </select>
              </div>

              {/* Course Open / Close Schedule */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-purple-700" />
                    <span>Thời hạn mở / đóng khóa học</span>
                  </span>
                  <select
                    value={editingCourse.status || 'open'}
                    onChange={(e) =>
                      setEditingCourse({
                        ...editingCourse,
                        status: e.target.value as ExamStatus,
                      })
                    }
                    className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-semibold"
                  >
                    <option value="open">Đang mở</option>
                    <option value="scheduled">Theo lịch hẹn</option>
                    <option value="closed">Đã đóng</option>
                    <option value="draft">Bản nháp (Tạm ẩn)</option>
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="font-semibold text-slate-700">Thời gian mở:</label>
                      {editingCourse.openTime && (
                        <button
                          type="button"
                          onClick={() => setEditingCourse({ ...editingCourse, openTime: '' })}
                          className="text-[11px] text-rose-600 hover:underline cursor-pointer"
                        >
                          Xóa giờ mở
                        </button>
                      )}
                    </div>
                    <input
                      type="datetime-local"
                      value={editingCourse.openTime || ''}
                      onChange={(e) =>
                        setEditingCourse({ ...editingCourse, openTime: e.target.value })
                      }
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg font-mono text-xs"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="font-semibold text-slate-700">Thời gian đóng:</label>
                      {editingCourse.closeTime && (
                        <button
                          type="button"
                          onClick={() => setEditingCourse({ ...editingCourse, closeTime: '' })}
                          className="text-[11px] text-rose-600 hover:underline cursor-pointer"
                        >
                          Xóa giờ đóng
                        </button>
                      )}
                    </div>
                    <input
                      type="datetime-local"
                      value={editingCourse.closeTime || ''}
                      onChange={(e) =>
                        setEditingCourse({ ...editingCourse, closeTime: e.target.value })
                      }
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg font-mono text-xs"
                    />
                  </div>
                </div>
                <p className="text-[11px] text-slate-500">
                  Học sinh chỉ có thể vào học khóa học trong khoảng thời gian đã thiết lập. Để trống nếu mở tự do.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100">
              {editingCourse.id && currentCourse && editingCourse.id === currentCourse.id ? (
                <button
                  type="button"
                  onClick={() => {
                    setIsCourseModalOpen(false);
                    setCoursePreviewShowAnswers(false);
                    setCoursePreviewTab('full_syllabus');
                    setPreviewLessonId(activeLessonItem?.id || allLessons[0]?.lesson.id || '');
                    setIsCoursePreviewOpen(true);
                  }}
                  className="px-3.5 py-2 bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Xem trước khóa học</span>
                </button>
              ) : (
                <div />
              )}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsCourseModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={handleSaveCourse}
                  className="px-4 py-2 bg-purple-700 text-white rounded-xl text-xs font-bold cursor-pointer"
                >
                  Lưu khóa học
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL 2: ADD / EDIT CHAPTER --- */}
      {isChapterModalOpen && editingChapter && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">
                {editingChapter.id ? 'Sửa thông tin Chương' : 'Thêm Chương mới vào khóa học'}
              </h3>
              <button
                onClick={() => setIsChapterModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Tên chương:</label>
                <input
                  type="text"
                  value={editingChapter.title}
                  onChange={(e) =>
                    setEditingChapter({ ...editingChapter, title: e.target.value })
                  }
                  placeholder="Nhập tên chương..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-semibold"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Mô tả ngắn gọn:</label>
                <textarea
                  rows={2}
                  value={editingChapter.description}
                  onChange={(e) =>
                    setEditingChapter({ ...editingChapter, description: e.target.value })
                  }
                  placeholder="Tóm tắt trọng tâm chương..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Đề kiểm tra định kỳ Chương:
                </label>
                <select
                  value={editingChapter.chapterExamId || ''}
                  onChange={(e) =>
                    setEditingChapter({ ...editingChapter, chapterExamId: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                >
                  <option value="">-- Chưa gán đề kiểm tra --</option>
                  {allExams
                    .filter((ex) => canShowInPublicLibrary(ex, currentUser, userRole, allClassrooms))
                    .map((ex) => (
                      <option key={ex.id} value={ex.id}>
                        {ex.title} ({ex.questions.length} câu)
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsChapterModalOpen(false)}
                className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleSaveChapter}
                className="px-4 py-2 bg-purple-700 text-white rounded-xl text-xs font-bold cursor-pointer"
              >
                Lưu Chương
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL 3: ADD / EDIT LESSON --- */}
      {isLessonModalOpen && editingLesson && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">
                {editingLesson.id ? 'Chỉnh sửa bài học' : 'Thêm bài học vào Chương'}
              </h3>
              <button
                onClick={() => setIsLessonModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              {editingLesson.id && (currentCourse?.chapters?.length || 0) > 1 && (
                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    Thuộc chương (có thể chuyển bài sang chương khác):
                  </label>
                  <select
                    value={targetChapterIdForLesson}
                    onChange={(e) => setTargetChapterIdForLesson(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg font-semibold bg-white"
                  >
                    {(currentCourse?.chapters || []).map((ch, idx) => (
                      <option key={ch.id} value={ch.id}>
                        Chương {idx + 1}: {ch.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="font-bold text-slate-700 block mb-1">Tiêu đề bài học:</label>
                <input
                  type="text"
                  value={editingLesson.title || ''}
                  onChange={(e) =>
                    setEditingLesson({ ...editingLesson, title: e.target.value })
                  }
                  placeholder="Nhập tiêu đề bài học..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-semibold"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Thời lượng học (phút):
                </label>
                <input
                  type="number"
                  value={editingLesson.durationMinutes || 25}
                  onChange={(e) =>
                    setEditingLesson({
                      ...editingLesson,
                      durationMinutes: parseInt(e.target.value) || 25,
                    })
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <label className="font-bold text-slate-700 block">
                    Tóm lược bài học / Mục tiêu:
                  </label>
                  <CopyContentButton compact getText={() => editingLesson.summary || ''} />
                </div>
                <textarea
                  rows={2}
                  value={editingLesson.summary || ''}
                  onChange={(e) =>
                    setEditingLesson({ ...editingLesson, summary: e.target.value })
                  }
                  placeholder="Những kiến thức cần nắm sau khi học xong bài này..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Đề luyện tập kèm theo bài học:
                </label>
                <select
                  value={editingLesson.practiceExamId || ''}
                  onChange={(e) =>
                    setEditingLesson({ ...editingLesson, practiceExamId: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                >
                  <option value="">-- Không đính kèm đề thi --</option>
                  {allExams
                    .filter((ex) => canShowInPublicLibrary(ex, currentUser, userRole, allClassrooms))
                    .map((ex) => (
                      <option key={ex.id} value={ex.id}>
                        {ex.title} ({ex.questions.length} câu)
                      </option>
                    ))}
                </select>
              </div>

              {/* Multi-format Lesson Attachments */}
              <div className="p-3.5 rounded-xl bg-indigo-50/50 border border-indigo-200 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="font-bold text-indigo-950 flex items-center gap-1.5">
                    <Paperclip className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Tài liệu đính kèm bài học (PDF, Word, PPT, Excel, ZIP, Link...)</span>
                  </label>
                  <label className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold flex items-center gap-1 cursor-pointer">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Tải nhiều tệp</span>
                    <input
                      type="file"
                      multiple
                      accept={COURSE_FILE_ACCEPT}
                      className="hidden"
                      onChange={(e) => {
                        void handleUploadCourseFiles(
                          e.target.files,
                          editingLesson.attachments || [],
                          (next) => setEditingLesson((prev) => (prev ? { ...prev, attachments: next } : prev)),
                          (msg) => setLessonModalError(msg || null)
                        );
                        e.target.value = '';
                      }}
                    />
                  </label>
                </div>

                {lessonModalError && (
                  <div className="p-2 bg-rose-50 border border-rose-200 rounded-lg text-[11px] text-rose-800">
                    {lessonModalError}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-1.5">
                  <input
                    type="text"
                    value={lessonFileName}
                    onChange={(e) => setLessonFileName(e.target.value)}
                    placeholder="Tên tài liệu (tùy chọn)"
                    className="sm:col-span-4 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                  />
                  <input
                    type="text"
                    value={lessonFileUrl}
                    onChange={(e) => setLessonFileUrl(e.target.value)}
                    placeholder="Hoặc dán Link Drive / OneDrive / PDF URL (https://...)"
                    className="sm:col-span-6 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      handleAddExternalAttachmentLink(
                        lessonFileUrl,
                        lessonFileName,
                        editingLesson.attachments || [],
                        (next) => setEditingLesson((prev) => (prev ? { ...prev, attachments: next } : prev)),
                        (msg) => setLessonModalError(msg || null),
                        () => {
                          setLessonFileUrl('');
                          setLessonFileName('');
                        }
                      )
                    }
                    className="sm:col-span-2 px-2.5 py-1.5 bg-white hover:bg-indigo-100 text-indigo-800 border border-indigo-200 rounded-lg font-bold text-xs cursor-pointer"
                  >
                    + Link
                  </button>
                </div>

                {(editingLesson.attachments || []).length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    {(editingLesson.attachments || []).map((att) => {
                      const badge = getCourseAttachmentBadge(att);
                      return (
                        <div
                          key={att.id}
                          className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 flex items-center justify-between gap-2"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${badge.colorClass}`}>
                              {badge.ext}
                            </span>
                            <span className="truncate font-semibold text-slate-800">{att.name}</span>
                            <span className="text-[10px] text-slate-400 shrink-0">
                              {formatCourseFileSize(att.sizeBytes)}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              setEditingLesson((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      attachments: (prev.attachments || []).filter((x) => x.id !== att.id),
                                    }
                                  : prev
                              )
                            }
                            className="p-1 text-rose-600 hover:bg-rose-50 rounded cursor-pointer shrink-0"
                            title="Xóa tệp này"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsLessonModalOpen(false)}
                className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleSaveLesson}
                className="px-4 py-2 bg-purple-700 text-white rounded-xl text-xs font-bold cursor-pointer"
              >
                Lưu bài học
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL 4: INSERT OR EDIT CONTENT BLOCK (THEORY / IMAGE / QUESTION / CALLOUT) --- */}
      {isBlockModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div
            ref={blockModalBodyRef}
            className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">
                {editingBlockId
                  ? `Chỉnh sửa nội dung trong: ${activeLessonItem?.title}`
                  : `Chèn khối nội dung vào: ${activeLessonItem?.title}`}
              </h3>
              <button
                onClick={handleCloseBlockModalExplicitly}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {blockModalError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{blockModalError}</span>
              </div>
            )}

            {/* Block Type Picker */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {[
                { id: 'theory', label: 'Lý thuyết', icon: BookOpen },
                { id: 'image', label: 'Hình ảnh', icon: ImageIcon },
                { id: 'file', label: 'Tài liệu / File', icon: Paperclip },
                { id: 'question', label: 'Câu hỏi giữa bài', icon: HelpCircle },
                { id: 'callout', label: 'Ghi nhớ / Công thức', icon: Zap },
              ].map((t) => {
                const Icon = t.icon;
                const active = blockType === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setBlockType(t.id as LessonBlockType)}
                    className={`p-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 cursor-pointer transition-all ${
                      active
                        ? 'bg-purple-700 text-white border-purple-700 shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="text-center leading-tight">{t.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Tiêu đề khối (Tùy chọn):
                </label>
                <input
                  type="text"
                  value={blockTitle}
                  onChange={(e) => setBlockTitle(e.target.value)}
                  placeholder="Nhập tiêu đề khối nội dung..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                />
              </div>

              {/* Form for Theory & Callout (includes inline cursor image insertion!) */}
              {(blockType === 'theory' || blockType === 'callout') && (
                <div className="space-y-2.5">
                  {blockType === 'callout' && (
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-700">Kiểu hộp:</span>
                      {(['formula', 'tip', 'warning', 'info'] as const).map((ct) => (
                        <button
                          key={ct}
                          type="button"
                          onClick={() => setBlockCalloutType(ct)}
                          className={`px-2.5 py-1 rounded-lg border font-bold cursor-pointer ${
                            blockCalloutType === ct
                              ? 'bg-purple-700 text-white border-purple-700'
                              : 'bg-white text-slate-600 border-slate-200'
                          }`}
                        >
                          {ct === 'formula'
                            ? 'Công thức'
                            : ct === 'tip'
                            ? 'Mẹo nhanh'
                            : ct === 'warning'
                            ? 'Lưu ý'
                            : 'Thông tin'}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="font-bold text-slate-700">
                      Nội dung (Hỗ trợ KaTeX Math $\LaTeX$ & Chèn ảnh giữa lý thuyết):
                    </label>
                    <div className="flex items-center gap-2 flex-wrap">
                      <label
                        className="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-bold flex items-center gap-1 cursor-pointer"
                        title="Đặt con trỏ vào dòng lý thuyết muốn chèn rồi chọn ảnh"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>Chèn ảnh tại con trỏ</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) {
                              handleUploadImage(f, (url) => {
                                insertInlineImageIntoTheory(url);
                                showToast('✓ Đã chèn ảnh vào ngay vị trí con trỏ trong lý thuyết!');
                              });
                            }
                            e.target.value = '';
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowTheoryImageUrlBar((v) => !v)}
                        className={`px-2.5 py-1 rounded-lg border font-bold flex items-center gap-1 cursor-pointer ${
                          showTheoryImageUrlBar
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <Link2 className="w-3.5 h-3.5" />
                        <span>URL ảnh</span>
                      </button>
                      <CopyContentButton compact getText={() => blockContent} />
                      <MathToolbar
                        containerRef={blockModalBodyRef}
                        onInsert={(latex) => {
                          if (!insertTextAtEditableElement(theoryTextareaRef.current, latex)) {
                            setBlockContent((prev) => {
                              const isBlock = latex.trim().startsWith('|') || latex.includes('\n');
                              return prev ? (isBlock ? `${prev}\n${latex}` : `${prev} ${latex}`) : latex;
                            });
                          }
                        }}
                      />
                    </div>
                  </div>

                  {showTheoryImageUrlBar && (
                    <div className="p-2.5 rounded-xl bg-blue-50/70 border border-blue-200 grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                      <input
                        type="text"
                        value={theoryImageUrl}
                        onChange={(e) => setTheoryImageUrl(e.target.value)}
                        placeholder="Dán URL hình ảnh (https://...)..."
                        className="sm:col-span-6 px-2.5 py-1.5 bg-white border border-blue-200 rounded-lg text-xs font-mono"
                      />
                      <input
                        type="text"
                        value={theoryImageCaption}
                        onChange={(e) => setTheoryImageCaption(e.target.value)}
                        placeholder="Chú thích ảnh (tùy chọn)..."
                        className="sm:col-span-4 px-2.5 py-1.5 bg-white border border-blue-200 rounded-lg text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (!theoryImageUrl.trim()) return;
                          insertInlineImageIntoTheory(theoryImageUrl, theoryImageCaption);
                          setTheoryImageUrl('');
                          setTheoryImageCaption('');
                          setShowTheoryImageUrlBar(false);
                          showToast('✓ Đã chèn URL ảnh vào vị trí con trỏ!');
                        }}
                        className="sm:col-span-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-xs cursor-pointer"
                      >
                        Chèn ảnh
                      </button>
                    </div>
                  )}

                  <textarea
                    ref={theoryTextareaRef}
                    rows={7}
                    value={blockContent}
                    onChange={(e) => setBlockContent(e.target.value)}
                    placeholder="Nhập nội dung lý thuyết, Markdown, công thức $y = \sqrt{x^2+1}$... Đặt con trỏ vào dòng bất kỳ và bấm 'Chèn ảnh tại con trỏ' để chèn ảnh xen giữa các đoạn."
                    className="w-full p-3 border border-slate-200 rounded-xl font-mono text-sm leading-relaxed"
                  />

                  {(() => {
                    const inlineImgs = extractInlineMarkdownImages(blockContent);
                    if (inlineImgs.length === 0) return null;
                    return (
                      <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                        <div className="text-[11px] font-bold text-slate-700 flex items-center justify-between">
                          <span>Ảnh đã chèn xen giữa lý thuyết ({inlineImgs.length} ảnh):</span>
                          <span className="text-[10px] font-normal text-slate-500">
                            Có thể di chuyển dòng `![...]` hoặc bấm Gỡ để xóa nhanh
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {inlineImgs.map((im, idx) => (
                            <div
                              key={`${im.alt}_${idx}`}
                              className="p-1.5 bg-white border border-slate-200 rounded-lg flex items-center gap-2 max-w-[230px]"
                            >
                              <img
                                src={im.src}
                                alt={im.alt}
                                className="w-10 h-10 object-cover rounded border border-slate-100 shrink-0"
                                referrerPolicy="no-referrer"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="text-[10px] font-bold text-slate-800 truncate">
                                  #{idx + 1}: {im.alt}
                                </div>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setBlockContent((prev) =>
                                      prev.replace(im.fullMatch, '').replace(/\n{3,}/g, '\n\n').trim()
                                    )
                                  }
                                  className="text-[10px] font-bold text-rose-600 hover:underline cursor-pointer"
                                >
                                  Gỡ ảnh này
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  {blockContent.trim() && (
                    <div className="p-3 bg-blue-50/50 border border-blue-200 rounded-xl">
                      <div className="text-[11px] font-bold text-blue-800 uppercase mb-1.5">
                        Xem trước công thức & nội dung (Hiển thị trực tiếp):
                      </div>
                      <div className="p-2.5 bg-white rounded-lg border border-blue-100 text-sm">
                        <RichContentRenderer content={blockContent} imageUrl={blockImageUrl || undefined} />
                      </div>
                    </div>
                  )}

                  {blockImageUrl && (
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between gap-3">
                      <img
                        src={blockImageUrl}
                        alt="Preview"
                        className="h-16 w-24 object-cover rounded-lg border border-slate-200 bg-white"
                      />
                      <span className="text-[11px] text-slate-600 flex-1 truncate">
                        Ảnh minh họa đính kèm bên dưới lý thuyết
                      </span>
                      <button
                        type="button"
                        onClick={() => setBlockImageUrl('')}
                        className="px-2 py-1 text-rose-600 hover:bg-rose-50 rounded font-bold cursor-pointer"
                      >
                        Gỡ ảnh
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Form for Dedicated Image Block */}
              {blockType === 'image' && (
                <div className="space-y-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="font-bold text-slate-700">
                      Tải ảnh từ máy tính hoặc dán URL ảnh:
                    </label>
                    <label className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold flex items-center gap-1.5 cursor-pointer">
                      <Upload className="w-3.5 h-3.5" />
                      <span>Chọn ảnh từ máy</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleUploadImage(f, (url) => setBlockImageUrl(url));
                          e.target.value = '';
                        }}
                      />
                    </label>
                  </div>

                  <input
                    type="text"
                    value={blockImageUrl}
                    onChange={(e) => setBlockImageUrl(e.target.value)}
                    placeholder="https://... hoặc tải ảnh trực tiếp bằng nút bên trên"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono text-xs"
                  />

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">
                      Chú thích ảnh (Caption):
                    </label>
                    <input
                      type="text"
                      value={blockCaption}
                      onChange={(e) => setBlockCaption(e.target.value)}
                      placeholder="Nhập chú thích ảnh..."
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                    />
                  </div>

                  {blockImageUrl && (
                    <div className="p-3 bg-white rounded-xl border border-slate-200 text-center space-y-1.5">
                      <div className="text-[11px] font-bold text-blue-800 uppercase text-left">
                        Xem trước hình ảnh hiển thị:
                      </div>
                      <img
                        src={blockImageUrl}
                        alt={blockCaption || 'Preview'}
                        className="max-h-56 mx-auto rounded-lg object-contain border border-slate-100"
                      />
                      {blockCaption.trim() && (
                        <div className="text-xs italic text-slate-600">
                          <RichContentRenderer content={blockCaption} />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Form for Multi-Format Document / File Block */}
              {blockType === 'file' && (
                <div className="space-y-3 p-4 bg-indigo-50/40 rounded-xl border border-indigo-200">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="font-bold text-indigo-950">
                        Tải lên nhiều định dạng tệp tài liệu (PDF, Word, PPT, Excel, ZIP, Audio, Video...)
                      </div>
                      <div className="text-[11px] text-indigo-700 mt-0.5">
                        Hỗ trợ tải trực tiếp từ máy (&le; 700 KB/tệp) hoặc dán đường dẫn Google Drive / OneDrive cho tệp lớn.
                      </div>
                    </div>
                    <label className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold flex items-center gap-1.5 cursor-pointer shrink-0">
                      <Upload className="w-3.5 h-3.5" />
                      <span>Chọn nhiều tệp</span>
                      <input
                        type="file"
                        multiple
                        accept={COURSE_FILE_ACCEPT}
                        className="hidden"
                        onChange={(e) => {
                          void handleUploadCourseFiles(
                            e.target.files,
                            blockAttachments,
                            (next) => setBlockAttachments(next),
                            (msg) => setBlockModalError(msg || null)
                          );
                          e.target.value = '';
                        }}
                      />
                    </label>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                    <input
                      type="text"
                      value={blockFileName}
                      onChange={(e) => setBlockFileName(e.target.value)}
                      placeholder="Tên tài liệu (vd: Đề cương PDF)..."
                      className="sm:col-span-4 px-2.5 py-2 bg-white border border-indigo-200 rounded-lg text-xs"
                    />
                    <input
                      type="text"
                      value={blockFileUrl}
                      onChange={(e) => setBlockFileUrl(e.target.value)}
                      placeholder="Hoặc dán Link Google Drive / OneDrive / PDF URL (https://...)"
                      className="sm:col-span-6 px-2.5 py-2 bg-white border border-indigo-200 rounded-lg text-xs font-mono"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        handleAddExternalAttachmentLink(
                          blockFileUrl,
                          blockFileName,
                          blockAttachments,
                          (next) => setBlockAttachments(next),
                          (msg) => setBlockModalError(msg || null),
                          () => {
                            setBlockFileUrl('');
                            setBlockFileName('');
                          }
                        )
                      }
                      className="sm:col-span-2 px-3 py-2 bg-white hover:bg-indigo-100 text-indigo-800 border border-indigo-300 rounded-lg font-bold text-xs cursor-pointer"
                    >
                      + Thêm Link
                    </button>
                  </div>

                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <label className="font-bold text-slate-700 block">
                        Ghi chú / Hướng dẫn đọc tài liệu (Tùy chọn):
                      </label>
                      <CopyContentButton compact getText={() => blockContent} />
                    </div>
                    <textarea
                      rows={2}
                      value={blockContent}
                      onChange={(e) => setBlockContent(e.target.value)}
                      placeholder="Ghi chú cho học sinh về tài liệu này..."
                      className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-xs"
                    />
                  </div>

                  {blockAttachments.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="text-[11px] font-bold text-indigo-900">
                        Danh sách tệp trong khối ({blockAttachments.length}):
                      </div>
                      {blockAttachments.map((att) => {
                        const badge = getCourseAttachmentBadge(att);
                        return (
                          <div
                            key={att.id}
                            className="px-3 py-2 rounded-lg bg-white border border-slate-200 flex items-center justify-between gap-2"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${badge.colorClass}`}>
                                {badge.ext}
                              </span>
                              <span className="font-bold text-slate-800 truncate">{att.name}</span>
                              <span className="text-[11px] text-slate-400 shrink-0">
                                {formatCourseFileSize(att.sizeBytes)}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                setBlockAttachments((prev) => prev.filter((x) => x.id !== att.id))
                              }
                              className="p-1 text-rose-600 hover:bg-rose-50 rounded cursor-pointer shrink-0"
                              title="Xóa tệp"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Form for Question Checkpoint */}
              {blockType === 'question' && (
                <div className="space-y-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">
                        Dạng câu hỏi tương tác:
                      </label>
                      <select
                        value={cpType}
                        onChange={(e: any) => setCpType(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-semibold"
                      >
                        <option value="single_choice">Trắc nghiệm 1 đáp án (A, B, C, D)</option>
                        <option value="multiple_choice">Chọn nhiều đáp án đúng</option>
                        <option value="true_false">Mệnh đề Đúng / Sai</option>
                        <option value="text_input">Trả lời ngắn (Điền số / từ)</option>
                        <option value="matching">Ghép đôi hai cột (Tự chọn nhãn & ý nhiễu)</option>
                      </select>
                    </div>
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Điểm câu hỏi:</label>
                      <input
                        type="number"
                        step="0.25"
                        min="0.25"
                        value={cpPoints}
                        onChange={(e) => setCpPoints(parseFloat(e.target.value) || 1.0)}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-mono font-bold"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                      <label className="font-bold text-slate-700">Nội dung câu hỏi (KaTeX):</label>
                      <div className="flex items-center gap-2">
                        <CopyContentButton compact getText={() => cpQuestion} />
                        <label className="px-2 py-1 rounded bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-bold flex items-center gap-1 cursor-pointer">
                          <Upload className="w-3 h-3" />
                          <span>Đính kèm ảnh cho câu hỏi</span>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) handleUploadImage(f, (url) => setCpQuestionImageUrl(url));
                              e.target.value = '';
                            }}
                          />
                        </label>
                      </div>
                    </div>
                    <MathToolbar
                      containerRef={blockModalBodyRef}
                      onInsert={(latex) =>
                        setCpQuestion((prev) => {
                          const isBlock = latex.trim().startsWith('|') || latex.includes('\n');
                          return prev ? (isBlock ? `${prev}\n${latex}` : `${prev} ${latex}`) : latex;
                        })
                      }
                    />
                    <textarea
                      rows={3}
                      value={cpQuestion}
                      onChange={(e) => setCpQuestion(e.target.value)}
                      placeholder="Nhập đề bài tương tác giữa bài..."
                      className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-sm font-mono"
                    />
                    {cpQuestion.trim() && (
                      <div className="mt-2 p-2.5 bg-blue-50/60 border border-blue-200 rounded-lg text-sm">
                        <div className="text-[11px] font-bold text-blue-800 uppercase mb-1">
                          Xem trước câu hỏi (KaTeX):
                        </div>
                        <div className="p-2 bg-white rounded border border-blue-100">
                          <RichContentRenderer content={cpQuestion} />
                        </div>
                      </div>
                    )}
                    {cpQuestionImageUrl && (
                      <div className="mt-2 flex items-center gap-3 p-2 bg-white rounded-lg border border-slate-200">
                        <img
                          src={cpQuestionImageUrl}
                          alt="Question"
                          className="h-14 w-20 object-cover rounded"
                        />
                        <button
                          type="button"
                          onClick={() => setCpQuestionImageUrl('')}
                          className="text-rose-600 font-bold ml-auto cursor-pointer"
                        >
                          Xóa ảnh
                        </button>
                      </div>
                    )}
                  </div>

                  {(cpType === 'single_choice' || cpType === 'multiple_choice') && (
                    <div className="space-y-2">
                      <label className="font-bold text-slate-700 block">
                        Các phương án & chọn đáp án đúng{' '}
                        {cpType === 'multiple_choice' ? '(nhấp chọn nhiều chữ cái)' : '(nhấp chọn 1 chữ cái)'}:
                      </label>
                      {cpOptions.map((opt, oIdx) => {
                        const letter = String.fromCharCode(65 + oIdx);
                        const isChecked =
                          cpType === 'single_choice'
                            ? cpCorrectSingle === oIdx
                            : cpCorrectMulti.includes(oIdx);

                        return (
                          <div key={oIdx} className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                if (cpType === 'single_choice') {
                                  setCpCorrectSingle(oIdx);
                                } else {
                                  setCpCorrectMulti((prev) =>
                                    prev.includes(oIdx)
                                      ? prev.filter((x) => x !== oIdx)
                                      : [...prev, oIdx]
                                  );
                                }
                              }}
                              className={`w-7 h-7 rounded text-xs font-bold border cursor-pointer shrink-0 ${
                                isChecked
                                  ? 'bg-emerald-600 text-white border-emerald-600'
                                  : 'bg-white text-slate-700 border-slate-300'
                              }`}
                            >
                              {letter}
                            </button>
                            <input
                              type="text"
                              value={opt}
                              onChange={(e) => {
                                const next = [...cpOptions];
                                next[oIdx] = e.target.value;
                                setCpOptions(next);
                              }}
                              placeholder={`Nội dung phương án ${letter}...`}
                              className="flex-1 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {cpType === 'true_false' && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="font-bold text-slate-700">Các mệnh đề Đúng / Sai:</label>
                        <button
                          type="button"
                          onClick={() =>
                            setCpTfItems([
                              ...cpTfItems,
                              { id: 'tf_' + Date.now(), statement: '', isCorrect: true },
                            ])
                          }
                          className="text-purple-700 font-bold cursor-pointer"
                        >
                          + Thêm ý
                        </button>
                      </div>
                      {cpTfItems.map((it, idx) => (
                        <div key={it.id} className="flex items-center gap-2">
                          <span className="font-bold w-5">{String.fromCharCode(97 + idx)})</span>
                          <input
                            type="text"
                            value={it.statement}
                            onChange={(e) => {
                              const next = [...cpTfItems];
                              next[idx] = { ...next[idx], statement: e.target.value };
                              setCpTfItems(next);
                            }}
                            placeholder="Nội dung mệnh đề..."
                            className="flex-1 px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const next = [...cpTfItems];
                              next[idx] = { ...next[idx], isCorrect: !next[idx].isCorrect };
                              setCpTfItems(next);
                            }}
                            className={`px-2.5 py-1 rounded font-bold cursor-pointer ${
                              it.isCorrect
                                ? 'bg-emerald-600 text-white'
                                : 'bg-rose-600 text-white'
                            }`}
                          >
                            {it.isCorrect ? 'Đúng' : 'Sai'}
                          </button>
                          {cpTfItems.length > 1 && (
                            <button
                              type="button"
                              onClick={() =>
                                setCpTfItems(cpTfItems.filter((_, i) => i !== idx))
                              }
                              className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {cpType === 'text_input' && (
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">
                        Các đáp án được chấp nhận (số thập phân dùng dấu phẩy &quot;,&quot;, ngăn cách bởi dấu chấm phẩy &quot;;&quot;):
                      </label>
                      <input
                        type="text"
                        value={cpAcceptedAnswersText}
                        onChange={(e) => setCpAcceptedAnswersText(e.target.value)}
                        onBlur={(e) => setCpAcceptedAnswersText(parseAcceptedShortAnswers(e.target.value).join('; '))}
                        placeholder="Ví dụ: 3,5; 7/2; -1,25"
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono text-xs"
                      />
                    </div>
                  )}

                  {cpType === 'matching' && (
                    <MatchingQuestionEditor
                      idPrefix="cp_match"
                      question={{
                        id: editingBlockId || 'cp_match_draft',
                        type: 'matching',
                        points: Number(cpPoints) || 1.0,
                        question: cpQuestion,
                        explanation: cpExplanation,
                        ...cpMatchingData,
                      }}
                      onChange={(updatedFields) =>
                        setCpMatchingData((prev) => ({
                          matchingLeftLabelStyle:
                            updatedFields.matchingLeftLabelStyle ?? prev.matchingLeftLabelStyle,
                          matchingRightLabelStyle:
                            updatedFields.matchingRightLabelStyle ?? prev.matchingRightLabelStyle,
                          matchingLeftItems:
                            updatedFields.matchingLeftItems ?? prev.matchingLeftItems,
                          matchingRightItems:
                            updatedFields.matchingRightItems ?? prev.matchingRightItems,
                          matchingCorrectPairs:
                            updatedFields.matchingCorrectPairs ?? prev.matchingCorrectPairs,
                        }))
                      }
                    />
                  )}

                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <label className="font-bold text-slate-700 block">
                        Lời giải chi tiết sau khi trả lời:
                      </label>
                      <CopyContentButton compact getText={() => cpExplanation} />
                    </div>
                    <textarea
                      rows={2}
                      value={cpExplanation}
                      onChange={(e) => setCpExplanation(e.target.value)}
                      placeholder="Giải thích vì sao chọn đáp án này..."
                      className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-xs"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={handleCloseBlockModalExplicitly}
                className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleSaveBlock}
                className="px-4 py-2 bg-purple-700 text-white rounded-xl text-xs font-bold cursor-pointer"
              >
                {editingBlockId ? 'Lưu cập nhật' : 'Chèn vào bài học'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- COURSE PREVIEW MODAL (CHẾ ĐỘ XEM TRƯỚC KHÓA HỌC) --- */}
      {isCoursePreviewOpen && currentCourse && (() => {
        const previewChapters: CourseChapter[] =
          currentCourse.chapters && currentCourse.chapters.length > 0
            ? [...currentCourse.chapters].sort((a, b) => a.order - b.order)
            : currentCourse.lessons && currentCourse.lessons.length > 0
            ? [
                {
                  id: 'legacy_preview_chap',
                  title: 'Nội dung khóa học',
                  description: '',
                  order: 1,
                  lessons: currentCourse.lessons,
                },
              ]
            : [];
        const flatLessons = previewChapters.flatMap((ch) =>
          (ch.lessons || []).map((les) => ({ chapter: ch, lesson: les }))
        );
        const totalBlocks = flatLessons.reduce((sum, item) => sum + (item.lesson.blocks?.length || 0), 0);
        const totalCheckpoints = flatLessons.reduce(
          (sum, item) => sum + (item.lesson.blocks?.filter((b) => b.type === 'question').length || 0),
          0
        );
        const simIdx = Math.max(
          0,
          flatLessons.findIndex((item) => item.lesson.id === previewLessonId)
        );
        const currentSim = flatLessons[simIdx] || flatLessons[0];
        const finalExamPreview = currentCourse.finalExamId
          ? allExams.find((e) => e.id === currentCourse.finalExamId)
          : undefined;

        const renderPreviewBlock = (block: LessonBlock, bIdx: number) => {
          return (
            <div
              key={block.id}
              className={`rounded-xl border p-4 space-y-2.5 ${
                block.type === 'callout'
                  ? block.calloutType === 'warning'
                    ? 'bg-amber-50/70 border-amber-200'
                    : block.calloutType === 'tip'
                    ? 'bg-emerald-50/70 border-emerald-200'
                    : 'bg-blue-50/70 border-blue-200'
                  : block.type === 'question'
                  ? 'bg-purple-50/40 border-purple-200'
                  : block.type === 'image'
                  ? 'bg-slate-50/70 border-slate-200'
                  : block.type === 'file'
                  ? 'bg-indigo-50/35 border-indigo-200'
                  : 'bg-white border-slate-200'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                    #{bIdx + 1}
                  </span>
                  <span className="text-xs font-bold text-slate-900">
                    {block.title ||
                      (block.type === 'theory'
                        ? 'Nội dung lý thuyết'
                        : block.type === 'callout'
                        ? 'Ghi nhớ trọng tâm'
                        : block.type === 'image'
                        ? 'Hình ảnh minh họa'
                        : block.type === 'file'
                        ? 'Tài liệu học tập đính kèm'
                        : 'Câu hỏi tương tác giữa bài')}
                  </span>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-500">
                  {block.type === 'theory'
                    ? 'Lý thuyết'
                    : block.type === 'callout'
                    ? 'Công thức / Ghi nhớ'
                    : block.type === 'image'
                    ? 'Hình ảnh'
                    : block.type === 'file'
                    ? 'Tài liệu / Tệp'
                    : 'Câu hỏi giữa bài'}
                </span>
              </div>

              {(block.type === 'theory' || block.type === 'callout') && (
                <div className="space-y-2.5">
                  {block.contentMarkdown && (
                    <div className="text-sm text-slate-800 leading-relaxed">
                      <RichContentRenderer content={block.contentMarkdown} />
                    </div>
                  )}
                  {block.imageUrl && (
                    <div className="pt-1 text-center">
                      <img
                        src={block.imageUrl}
                        alt={block.title || 'Minh họa'}
                        className="max-h-72 mx-auto rounded-lg border border-slate-200 object-contain bg-white"
                      />
                    </div>
                  )}
                </div>
              )}

              {block.type === 'image' && block.imageUrl && (
                <div className="text-center space-y-2">
                  <img
                    src={block.imageUrl}
                    alt={block.caption || block.title || 'Hình minh họa'}
                    className="max-h-80 mx-auto rounded-lg border border-slate-200 object-contain bg-white"
                  />
                  {block.caption && (
                    <div className="text-xs italic text-slate-600">
                      <RichContentRenderer content={block.caption} />
                    </div>
                  )}
                </div>
              )}

              {block.type === 'file' && (
                <div className="space-y-2">
                  {block.contentMarkdown && (
                    <div className="text-xs text-slate-700">
                      <RichContentRenderer content={block.contentMarkdown} />
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {(block.attachments || []).map((att) => {
                      const badge = getCourseAttachmentBadge(att);
                      return (
                        <span
                          key={att.id}
                          className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-800 inline-flex items-center gap-1.5"
                        >
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${badge.colorClass}`}>
                            {badge.ext}
                          </span>
                          <span>{att.name}</span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {block.type === 'question' && block.question && (
                <div className="space-y-2.5 bg-white p-3.5 rounded-lg border border-purple-100">
                  <div className="text-sm font-semibold text-slate-900 leading-relaxed">
                    <RichContentRenderer content={block.question.question} />
                  </div>
                  {block.question.imageUrl && (
                    <img
                      src={block.question.imageUrl}
                      alt="Hình câu hỏi"
                      className="max-h-60 rounded-lg border border-slate-200 object-contain"
                    />
                  )}
                  {(block.question.type === 'single_choice' ||
                    block.question.type === 'multiple_choice') &&
                    block.question.options && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                        {block.question.options.map((opt, oIdx) => {
                          const letter = String.fromCharCode(65 + oIdx);
                          const isCorrectOpt =
                            canManageCurrent &&
                            coursePreviewShowAnswers &&
                            (block.question!.type === 'single_choice'
                              ? block.question!.correctAnswer === oIdx
                              : block.question!.correctAnswers?.includes(oIdx));
                          return (
                            <div
                              key={oIdx}
                              className={`p-2.5 rounded-lg border text-xs flex items-start gap-2 ${
                                isCorrectOpt
                                  ? 'bg-emerald-50 border-emerald-400 text-emerald-950 font-semibold'
                                  : 'bg-slate-50 border-slate-200 text-slate-800'
                              }`}
                            >
                              <span
                                className={`w-5 h-5 rounded flex items-center justify-center shrink-0 font-bold ${
                                  isCorrectOpt
                                    ? 'bg-emerald-600 text-white'
                                    : 'bg-white border border-slate-300 text-slate-700'
                                }`}
                              >
                                {letter}
                              </span>
                              <div className="flex-1 min-w-0">
                                <RichContentRenderer content={opt} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                  {block.question.type === 'true_false' && block.question.tfItems && (
                    <div className="space-y-1.5 pt-1">
                      {block.question.tfItems.map((it, tIdx) => (
                        <div
                          key={it.id}
                          className="p-2 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-between gap-3 text-xs"
                        >
                          <div className="flex items-start gap-2 flex-1">
                            <span className="font-bold text-slate-700">
                              {String.fromCharCode(97 + tIdx)})
                            </span>
                            <div className="text-slate-800">
                              <RichContentRenderer content={it.statement} />
                            </div>
                          </div>
                          {canManageCurrent && coursePreviewShowAnswers && (
                            <span
                              className={`px-2 py-0.5 rounded font-bold text-[11px] shrink-0 ${
                                it.isCorrect
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-rose-600 text-white'
                              }`}
                            >
                              {it.isCorrect ? 'Đúng' : 'Sai'}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {block.question.type === 'text_input' && (
                    <div className="p-2.5 rounded-lg border border-dashed border-slate-300 bg-slate-50 text-xs text-slate-600">
                      Ô nhập câu trả lời ngắn của học sinh
                      {canManageCurrent &&
                        coursePreviewShowAnswers &&
                        block.question.acceptedAnswers && (
                          <span className="ml-2 font-mono font-bold text-emerald-700">
                            · Đáp án chấp nhận: {formatAcceptedShortAnswersList(block.question.acceptedAnswers)}
                          </span>
                        )}
                    </div>
                  )}

                  {block.question.type === 'matching' && (
                    <MatchingQuestionView
                      question={block.question}
                      mode="preview"
                      showSolutions={canManageCurrent && coursePreviewShowAnswers}
                      hidePrompt={true}
                    />
                  )}

                  {canManageCurrent &&
                    coursePreviewShowAnswers &&
                    block.question.explanation && (
                      <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-950 space-y-1">
                        <div className="font-bold">Lời giải chi tiết:</div>
                        <RichContentRenderer content={block.question.explanation} />
                      </div>
                    )}
                </div>
              )}
            </div>
          );
        };

        return (
          <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5">
            <div className="bg-white rounded-2xl max-w-5xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
              {/* Preview Header */}
              <div className="p-5 bg-slate-900 text-white flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-1.5 min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    <span className="px-2 py-0.5 rounded bg-blue-500 text-white font-bold uppercase tracking-wider flex items-center gap-1">
                      <Eye className="w-3 h-3" />
                      <span>Chế độ xem trước khóa học</span>
                    </span>
                    {currentCourse.grade && (
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 font-semibold">
                        {currentCourse.grade}
                      </span>
                    )}
                    <span className="px-2 py-0.5 rounded bg-indigo-900 text-indigo-200 font-semibold">
                      SCORM {currentCourse.scormVersion || '1.2'}
                    </span>
                    <span className="text-slate-400">
                      (Không làm thay đổi tiến độ học thật)
                    </span>
                  </div>
                  <h2 className="text-lg sm:text-xl font-extrabold text-white truncate">
                    {currentCourse.title}
                  </h2>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300">
                    {currentCourse.instructor && (
                      <span>Giảng viên: <strong>{currentCourse.instructor}</strong></span>
                    )}
                    <span>{previewChapters.length} chương</span>
                    <span>{flatLessons.length} bài học</span>
                    <span>{totalBlocks} khối nội dung</span>
                    <span>{totalCheckpoints} câu hỏi tương tác</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCoursePreviewOpen(false)}
                  className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white cursor-pointer shrink-0"
                  title="Đóng chế độ xem trước"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Preview Mode Tabs & Answer Toggle */}
              <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                <div className="inline-flex rounded-xl bg-slate-200/70 p-1 text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => setCoursePreviewTab('full_syllabus')}
                    className={`px-3.5 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                      coursePreviewTab === 'full_syllabus'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>Xem toàn bộ khóa học</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCoursePreviewTab('lesson_sim')}
                    className={`px-3.5 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                      coursePreviewTab === 'lesson_sim'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>Mô phỏng từng bài học</span>
                  </button>
                </div>

                {canManageCurrent && totalCheckpoints > 0 && (
                  <button
                    type="button"
                    onClick={() => setCoursePreviewShowAnswers((v) => !v)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border flex items-center gap-1.5 cursor-pointer transition-colors ${
                      coursePreviewShowAnswers
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    {coursePreviewShowAnswers ? (
                      <EyeOff className="w-3.5 h-3.5" />
                    ) : (
                      <Eye className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {coursePreviewShowAnswers ? 'Ẩn đáp án & lời giải' : 'Hiện đáp án & lời giải'}
                    </span>
                  </button>
                )}
              </div>

              {/* Preview Body */}
              <div className="flex-1 overflow-y-auto p-5 bg-slate-50/40">
                {flatLessons.length === 0 ? (
                  <div className="p-10 text-center bg-white rounded-2xl border border-dashed border-slate-300 text-slate-500 text-sm">
                    Khóa học này chưa có chương hoặc bài học nào để xem trước.
                  </div>
                ) : coursePreviewTab === 'full_syllabus' ? (
                  <div className="space-y-6">
                    {currentCourse.description && (
                      <div className="p-4 bg-white rounded-xl border border-slate-200 text-sm text-slate-700 leading-relaxed">
                        <span className="font-bold text-slate-900 block mb-1 text-xs uppercase tracking-wide">
                          Mô tả khóa học:
                        </span>
                        <RichContentRenderer content={currentCourse.description} />
                      </div>
                    )}

                    {previewChapters.map((chap, cIdx) => {
                      const chapExam = chap.chapterExamId
                        ? allExams.find((e) => e.id === chap.chapterExamId)
                        : undefined;
                      return (
                        <div
                          key={chap.id}
                          className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs"
                        >
                          <div className="p-4 bg-purple-50/70 border-b border-purple-100 flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <div className="text-[11px] font-bold uppercase tracking-wider text-purple-700">
                                Chương {cIdx + 1} · {(chap.lessons || []).length} bài học
                              </div>
                              <h3 className="text-base font-extrabold text-slate-900">
                                {chap.title}
                              </h3>
                              {chap.description && (
                                <p className="text-xs text-slate-600 mt-0.5">{chap.description}</p>
                              )}
                            </div>
                          </div>

                          <div className="p-4 space-y-5">
                            {(chap.lessons || []).length === 0 ? (
                              <div className="text-xs text-slate-400 italic">
                                Chưa có bài học trong chương này.
                              </div>
                            ) : (
                              (chap.lessons || []).map((les, lIdx) => {
                                const pExam = les.practiceExamId
                                  ? allExams.find((e) => e.id === les.practiceExamId)
                                  : undefined;
                                return (
                                  <div
                                    key={les.id}
                                    className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3"
                                  >
                                    <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200/80">
                                      <div>
                                        <div className="text-sm font-bold text-slate-900">
                                          Bài {lIdx + 1}: {les.title}
                                        </div>
                                        {les.summary && (
                                          <p className="text-xs text-slate-600 mt-0.5">
                                            {les.summary}
                                          </p>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-2 text-[11px] text-slate-500 font-mono">
                                        <span>{les.durationMinutes || 25} phút</span>
                                        <span>· {(les.blocks || []).length} nội dung</span>
                                      </div>
                                    </div>

                                    {(les.blocks || []).length === 0 ? (
                                      <div className="text-xs text-slate-400 italic py-2">
                                        Chưa có khối nội dung nào trong bài học này.
                                      </div>
                                    ) : (
                                      <div className="space-y-3">
                                        {(les.blocks || []).map((blk, bIdx) =>
                                          renderPreviewBlock(blk, bIdx)
                                        )}
                                      </div>
                                    )}

                                    {(les.attachments || []).length > 0 && (
                                      <div className="p-3 rounded-lg bg-indigo-50/70 border border-indigo-200 text-xs space-y-1.5">
                                        <div className="font-bold text-indigo-900 flex items-center gap-1.5">
                                          <Paperclip className="w-3.5 h-3.5" />
                                          <span>Tài liệu đính kèm bài học ({les.attachments!.length}):</span>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                          {les.attachments!.map((att) => (
                                            <span
                                              key={att.id}
                                              className="px-2 py-1 rounded bg-white border border-indigo-200 text-slate-700 font-medium"
                                            >
                                              {att.name}
                                            </span>
                                          ))}
                                        </div>
                                      </div>
                                    )}

                                    {pExam && (
                                      <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs flex items-center justify-between">
                                        <span className="font-bold text-amber-900">
                                          Đề luyện tập kèm theo: {pExam.title}
                                        </span>
                                        <span className="text-amber-700 font-mono">
                                          {pExam.questions.length} câu · {pExam.durationMinutes}p
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                );
                              })
                            )}

                            {chapExam && (
                              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs flex items-center justify-between">
                                <span className="font-bold text-amber-900">
                                  Kiểm tra định kỳ chương: {chapExam.title}
                                </span>
                                <span className="text-amber-700 font-mono">
                                  {chapExam.questions.length} câu · {chapExam.durationMinutes}p
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {finalExamPreview && (
                      <div className="p-4 rounded-2xl bg-slate-900 text-white flex items-center justify-between text-xs">
                        <div>
                          <div className="text-amber-400 font-bold uppercase tracking-wider text-[10px]">
                            Đề thi tổng kết khóa học
                          </div>
                          <div className="text-sm font-bold mt-0.5">{finalExamPreview.title}</div>
                        </div>
                        <span className="font-mono text-slate-300">
                          {finalExamPreview.questions.length} câu · {finalExamPreview.durationMinutes} phút
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                    {/* Left Outline */}
                    <div className="lg:col-span-4 space-y-2.5">
                      {previewChapters.map((chap, cIdx) => (
                        <div
                          key={chap.id}
                          className="bg-white rounded-xl border border-slate-200 overflow-hidden"
                        >
                          <div className="px-3.5 py-2.5 bg-slate-100 border-b border-slate-200 text-xs font-bold text-slate-900">
                            Chương {cIdx + 1}: {chap.title}
                          </div>
                          <div className="divide-y divide-slate-100">
                            {(chap.lessons || []).map((les) => {
                              const isActiveSim = currentSim?.lesson.id === les.id;
                              return (
                                <button
                                  key={les.id}
                                  type="button"
                                  onClick={() => setPreviewLessonId(les.id)}
                                  className={`w-full text-left px-3.5 py-2.5 text-xs transition-colors flex items-center justify-between gap-2 cursor-pointer ${
                                    isActiveSim
                                      ? 'bg-purple-50 text-purple-900 font-bold'
                                      : 'text-slate-700 hover:bg-slate-50'
                                  }`}
                                >
                                  <span className="truncate">{les.title}</span>
                                  <span className="text-[10px] font-mono text-slate-400 shrink-0">
                                    {(les.blocks || []).length} phần
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Right Simulated Reader */}
                    <div className="lg:col-span-8">
                      {currentSim && (
                        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4 shadow-2xs">
                          <div className="pb-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <div className="text-[11px] font-bold text-purple-700 uppercase">
                                {currentSim.chapter.title}
                              </div>
                              <h3 className="text-lg font-extrabold text-slate-900">
                                {currentSim.lesson.title}
                              </h3>
                            </div>
                            <span className="text-xs font-mono text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg">
                              {currentSim.lesson.durationMinutes || 25} phút
                            </span>
                          </div>

                          {currentSim.lesson.summary && (
                            <div className="text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100">
                              {currentSim.lesson.summary}
                            </div>
                          )}

                          {(currentSim.lesson.blocks || []).length === 0 ? (
                            <div className="p-8 text-center text-xs text-slate-400 italic">
                              Bài học này chưa có khối nội dung nào.
                            </div>
                          ) : (
                            <div className="space-y-4">
                              {(currentSim.lesson.blocks || []).map((blk, bIdx) =>
                                renderPreviewBlock(blk, bIdx)
                              )}
                            </div>
                          )}

                          {(currentSim.lesson.attachments || []).length > 0 && (
                            <div className="p-3.5 rounded-xl bg-indigo-50/70 border border-indigo-200 text-xs space-y-2">
                              <div className="font-bold text-indigo-900 flex items-center gap-1.5">
                                <Paperclip className="w-3.5 h-3.5" />
                                <span>Tài liệu đính kèm bài học ({currentSim.lesson.attachments!.length})</span>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {currentSim.lesson.attachments!.map((att) => (
                                  <span
                                    key={att.id}
                                    className="px-2.5 py-1 rounded-lg bg-white border border-indigo-200 text-slate-700 font-medium"
                                  >
                                    {att.name}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
                            <button
                              type="button"
                              disabled={simIdx <= 0}
                              onClick={() => {
                                if (simIdx > 0) setPreviewLessonId(flatLessons[simIdx - 1].lesson.id);
                              }}
                              className="px-3.5 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 cursor-pointer flex items-center gap-1"
                            >
                              <ArrowLeft className="w-3.5 h-3.5" />
                              <span>Bài trước</span>
                            </button>
                            <span className="text-xs font-mono text-slate-500">
                              Bài {simIdx + 1} / {flatLessons.length}
                            </span>
                            <button
                              type="button"
                              disabled={simIdx >= flatLessons.length - 1}
                              onClick={() => {
                                if (simIdx < flatLessons.length - 1) {
                                  setPreviewLessonId(flatLessons[simIdx + 1].lesson.id);
                                }
                              }}
                              className="px-3.5 py-2 bg-purple-700 hover:bg-purple-800 text-white rounded-xl text-xs font-bold disabled:opacity-40 cursor-pointer flex items-center gap-1"
                            >
                              <span>Bài tiếp theo</span>
                              <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Preview Footer */}
              <div className="px-5 py-3 bg-white border-t border-slate-200 flex items-center justify-between text-xs">
                <span className="text-slate-500">
                  Đang ở chế độ xem trước nội dung khóa học
                </span>
                <button
                  type="button"
                  onClick={() => setIsCoursePreviewOpen(false)}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold cursor-pointer"
                >
                  Đóng xem trước
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={confirmState.isOpen}
        title={confirmState.title}
        message={confirmState.message}
        onConfirm={confirmState.onConfirm}
        onClose={() => setConfirmState((prev) => ({ ...prev, isOpen: false }))}
      />

      {/* In-App Attachment Preview Modal (PDF / Image / Text — No window.open) */}
      {previewingAttachment && (() => {
        const kind = getCourseAttachmentPreviewKind(previewingAttachment);
        const src = previewingAttachment.dataUrl || previewingAttachment.url || '';
        const textBody = kind === 'text' ? decodeBase64DataUrlText(previewingAttachment.dataUrl) : '';
        return (
          <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5">
            <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between gap-3 shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <Paperclip className="w-4 h-4 text-blue-300 shrink-0" />
                  <h3 className="text-sm font-bold truncate">{previewingAttachment.name}</h3>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {previewingAttachment.dataUrl ? (
                    <a
                      href={src}
                      download={previewingAttachment.name}
                      className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Tải về</span>
                    </a>
                  ) : (
                    <a
                      href={src}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Mở liên kết</span>
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => setPreviewingAttachment(null)}
                    className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="p-4 flex-1 overflow-auto bg-slate-50 flex items-center justify-center">
                {kind === 'pdf' && (
                  <iframe
                    src={src}
                    title={previewingAttachment.name}
                    className="w-full h-[70vh] rounded-xl border border-slate-200 bg-white"
                  />
                )}
                {kind === 'image' && (
                  <img
                    src={src}
                    alt={previewingAttachment.name}
                    className="max-h-[72vh] max-w-full rounded-xl border border-slate-200 object-contain bg-white shadow-sm"
                    referrerPolicy="no-referrer"
                  />
                )}
                {kind === 'text' && (
                  <pre className="w-full max-h-[70vh] overflow-auto p-4 bg-white rounded-xl border border-slate-200 text-xs font-mono text-slate-800 whitespace-pre-wrap">
                    {textBody || 'Không thể hiển thị nội dung văn bản.'}
                  </pre>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
