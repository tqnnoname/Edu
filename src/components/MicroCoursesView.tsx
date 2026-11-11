import React, { useState, useEffect } from 'react';
import { 
  MicroCourse, 
  CourseChapter, 
  CourseLesson, 
  LessonBlock, 
  LessonBlockType,
  Exam, 
  UserRole,
  Question,
  CandidateAnswerValue,
  TrueFalseItem
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
  Save,
  Check,
  X,
  AlertTriangle,
  HelpCircle,
  Send,
  ListChecks,
  Layers,
  ArrowRight,
  ArrowLeft,
  RotateCcw,
  Zap,
  BookmarkCheck
} from 'lucide-react';
import { 
  saveCourse, 
  deleteCourse, 
  getCurrentUser, 
  MASTER_ADMIN_EMAIL,
  getStudentCourseProgress,
  markLessonCompleted,
  recordInteractiveAnswer,
  calculateCourseProgressPercentage
} from '../utils/storage';
import { RichContentRenderer } from './RichContentRenderer';
import { MathToolbar } from './MathToolbar';
import { gradeQuestion, formatTrueFalseScoringRule } from '../utils/scoring';

interface MicroCoursesViewProps {
  courses: MicroCourse[];
  allExams: Exam[];
  userRole: UserRole;
  onRefreshCourses: () => void;
  onStartExam: (exam: Exam, mode: 'exam' | 'practice') => void;
}

export const MicroCoursesView: React.FC<MicroCoursesViewProps> = ({
  courses,
  allExams,
  userRole,
  onRefreshCourses,
  onStartExam,
}) => {
  const currentUser = getCurrentUser();
  const currentUserId = currentUser?.id || 'guest_user';
  const isTeacher = userRole === 'teacher' && Boolean(currentUser && (currentUser.role === 'teacher' || currentUser.email === MASTER_ADMIN_EMAIL));

  const [selectedCourseId, setSelectedCourseId] = useState<string>(courses[0]?.id || '');
  const currentCourse = courses.find((c) => c.id === selectedCourseId) || courses[0];

  // Selected Chapter and Lesson
  const [activeChapterId, setActiveChapterId] = useState<string>('');
  const [activeLessonId, setActiveLessonId] = useState<string>('');
  const [expandedChapterIds, setExpandedChapterIds] = useState<{ [id: string]: boolean }>({});

  // Student Course Progress State
  const [progress, setProgress] = useState(() => 
    currentCourse ? getStudentCourseProgress(currentCourse.id, currentUserId) : null
  );

  // Interactive Question State inside lesson: { [blockId]: CandidateAnswerValue }
  const [checkpointAnswers, setCheckpointAnswers] = useState<{ [blockId: string]: any }>({});
  const [checkpointResults, setCheckpointResults] = useState<{ [blockId: string]: { isCorrect: boolean; earned: number; explanation: string } }>({});

  // Feedback toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // --- Modals for Teacher Management ---
  const [isCourseModalOpen, setIsCourseModalOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Partial<MicroCourse> | null>(null);

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
  const [editingLesson, setEditingLesson] = useState<Partial<CourseLesson> | null>(null);

  const [isAddBlockModalOpen, setIsAddBlockModalOpen] = useState(false);
  const [newBlockType, setNewBlockType] = useState<LessonBlockType>('theory');
  const [newBlockTitle, setNewBlockTitle] = useState('');
  const [newBlockContent, setNewBlockContent] = useState('');
  const [newBlockCalloutType, setNewBlockCalloutType] = useState<'formula' | 'tip' | 'warning' | 'info'>('formula');
  // Checkpoint question creator inside block
  const [newCheckpointType, setNewCheckpointType] = useState<'single_choice' | 'true_false' | 'text_input'>('single_choice');
  const [newCheckpointQuestion, setNewCheckpointQuestion] = useState('');
  const [newCheckpointOptions, setNewCheckpointOptions] = useState<string[]>(['', '', '', '']);
  const [newCheckpointCorrect, setNewCheckpointCorrect] = useState(0);
  const [newCheckpointExplanation, setNewCheckpointExplanation] = useState('');

  // Sync current chapter & lesson when current course changes
  useEffect(() => {
    if (currentCourse) {
      const p = getStudentCourseProgress(currentCourse.id, currentUserId);
      setProgress(p);

      // Find first chapter and lesson
      const chapters = currentCourse.chapters || [];
      if (chapters.length > 0) {
        const firstChap = chapters[0];
        setActiveChapterId(firstChap.id);
        setExpandedChapterIds((prev) => ({ ...prev, [firstChap.id]: true }));
        if (firstChap.lessons.length > 0) {
          setActiveLessonId(firstChap.lessons[0].id);
        }
      } else if (currentCourse.lessons && currentCourse.lessons.length > 0) {
        setActiveLessonId(currentCourse.lessons[0].id);
      }
    }
  }, [selectedCourseId, currentCourse?.id, currentUserId]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Extract all lessons from chapters or fallback lessons
  const allLessons: { chapter: CourseChapter | null; lesson: CourseLesson }[] = [];
  if (currentCourse?.chapters && currentCourse.chapters.length > 0) {
    currentCourse.chapters.forEach((chap) => {
      chap.lessons.forEach((les) => allLessons.push({ chapter: chap, lesson: les }));
    });
  } else if (currentCourse?.lessons) {
    currentCourse.lessons.forEach((les) => allLessons.push({ chapter: null, lesson: les }));
  }

  // Find currently active lesson object
  const activeLessonItem = allLessons.find((item) => item.lesson.id === activeLessonId)?.lesson || allLessons[0]?.lesson;
  const activeChapterItem = allLessons.find((item) => item.lesson.id === activeLessonId)?.chapter;

  const currentLessonIndex = allLessons.findIndex((item) => item.lesson.id === activeLessonId);
  const prevLessonItem = currentLessonIndex > 0 ? allLessons[currentLessonIndex - 1] : null;
  const nextLessonItem = currentLessonIndex < allLessons.length - 1 ? allLessons[currentLessonIndex + 1] : null;

  // Toggle chapter collapse
  const toggleChapter = (chapId: string) => {
    setExpandedChapterIds((prev) => ({
      ...prev,
      [chapId]: !prev[chapId],
    }));
  };

  // Mark Lesson as Completed
  const handleToggleLessonComplete = (lessonId: string) => {
    if (!currentCourse) return;
    const isCompleted = progress?.completedLessonIds.includes(lessonId);
    let updated: any;
    if (isCompleted) {
      // Unmark
      const newCompleted = (progress?.completedLessonIds || []).filter((id) => id !== lessonId);
      updated = { ...progress, completedLessonIds: newCompleted };
      setProgress(updated);
      localStorage.setItem(`edutest_course_progress_v2_${currentUserId}_${currentCourse.id}`, JSON.stringify(updated));
      showToast('Đã bỏ đánh dấu hoàn thành bài học.');
    } else {
      updated = markLessonCompleted(currentCourse.id, currentUserId, lessonId);
      setProgress(updated);
      showToast('✓ Tuyệt vời! Bạn đã hoàn thành bài học này.');
    }
  };

  // Check interactive checkpoint question
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
        explanation: block.question?.explanation || 'Không có giải thích thêm.',
      },
    }));

    // Record progress
    const updatedProgress = recordInteractiveAnswer(
      currentCourse.id,
      currentUserId,
      block.id,
      userAns,
      isPassed
    );
    setProgress(updatedProgress);

    if (isPassed) {
      showToast(`✓ Chính xác! Bạn nhận được ${result.earnedPoints} điểm.`);
    } else {
      showToast('Chưa chính xác! Hãy đọc lời giải chi tiết và thử lại nhé.');
    }
  };

  // Save new or edited course
  const handleSaveCourse = () => {
    if (!editingCourse || !editingCourse.title?.trim()) return;
    const toSave: MicroCourse = {
      id: editingCourse.id || 'course_' + Date.now(),
      title: editingCourse.title.trim(),
      subject: editingCourse.subject || 'math',
      grade: editingCourse.grade || 'Lớp 12',
      description: editingCourse.description || '',
      instructor: editingCourse.instructor || 'Giáo viên phụ trách',
      chapters: editingCourse.chapters || [],
      lessons: editingCourse.lessons || [],
      finalExamId: editingCourse.finalExamId || undefined,
      finalExamTitle: editingCourse.finalExamTitle || undefined,
      createdAt: editingCourse.createdAt || new Date().toISOString().split('T')[0],
    };
    saveCourse(toSave);
    onRefreshCourses();
    setSelectedCourseId(toSave.id);
    setIsCourseModalOpen(false);
    setEditingCourse(null);
    showToast('✓ Đã lưu thông tin khóa học thành công!');
  };

  // Save Chapter
  const handleSaveChapter = () => {
    if (!editingChapter || !editingChapter.title.trim() || !currentCourse) return;
    const existingChapters = currentCourse.chapters || [];
    let updatedChapters: CourseChapter[];

    if (editingChapter.id) {
      // Edit
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
      // Add
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
    }

    const updatedCourse: MicroCourse = { ...currentCourse, chapters: updatedChapters };
    saveCourse(updatedCourse);
    onRefreshCourses();
    setIsChapterModalOpen(false);
    setEditingChapter(null);
    showToast('✓ Đã cập nhật chương học!');
  };

  // Save Lesson
  const handleSaveLesson = () => {
    if (!editingLesson || !editingLesson.title?.trim() || !currentCourse) return;
    const chapters = [...(currentCourse.chapters || [])];
    const targetChapIdx = chapters.findIndex((c) => c.id === targetChapterIdForLesson);

    if (targetChapIdx !== -1) {
      const targetChap = chapters[targetChapIdx];
      let updatedLessons = [...targetChap.lessons];

      if (editingLesson.id) {
        updatedLessons = updatedLessons.map((les) =>
          les.id === editingLesson.id
            ? ({
                ...les,
                ...editingLesson,
                title: editingLesson.title!.trim(),
              } as CourseLesson)
            : les
        );
      } else {
        const newLes: CourseLesson = {
          id: 'les_' + Date.now(),
          title: editingLesson.title!.trim(),
          durationMinutes: editingLesson.durationMinutes || 25,
          summary: editingLesson.summary || '',
          practiceExamId: editingLesson.practiceExamId || undefined,
          practiceExamTitle: allExams.find((e) => e.id === editingLesson.practiceExamId)?.title,
          blocks: [],
        };
        updatedLessons.push(newLes);
        setActiveLessonId(newLes.id);
      }

      chapters[targetChapIdx] = { ...targetChap, lessons: updatedLessons };
      const updatedCourse: MicroCourse = { ...currentCourse, chapters };
      saveCourse(updatedCourse);
      onRefreshCourses();
      setIsLessonModalOpen(false);
      setEditingLesson(null);
      showToast('✓ Đã lưu bài học vào chương!');
    }
  };

  // Add block to current active lesson
  const handleAddBlockToActiveLesson = () => {
    if (!activeLessonItem || !currentCourse || !activeChapterItem) return;

    let newBlock: LessonBlock;

    if (newBlockType === 'theory') {
      if (!newBlockContent.trim()) {
        alert('Vui lòng nhập nội dung lý thuyết');
        return;
      }
      newBlock = {
        id: 'blk_' + Date.now(),
        type: 'theory',
        title: newBlockTitle.trim() || undefined,
        contentMarkdown: newBlockContent.trim(),
      };
    } else if (newBlockType === 'callout') {
      if (!newBlockContent.trim()) {
        alert('Vui lòng nhập nội dung ghi chú');
        return;
      }
      newBlock = {
        id: 'blk_' + Date.now(),
        type: 'callout',
        title: newBlockTitle.trim() || 'Ghi nhớ trọng tâm',
        calloutType: newBlockCalloutType,
        contentMarkdown: newBlockContent.trim(),
      };
    } else {
      // Question block
      if (!newCheckpointQuestion.trim()) {
        alert('Vui lòng nhập câu hỏi tương tác');
        return;
      }
      const q: Question = {
        id: 'cp_q_' + Date.now(),
        type: newCheckpointType,
        points: 1.0,
        question: newCheckpointQuestion.trim(),
        explanation: newCheckpointExplanation.trim() || 'Xem lại lý thuyết phía trên.',
      };
      if (newCheckpointType === 'single_choice') {
        q.options = newCheckpointOptions.filter(Boolean);
        q.correctAnswer = newCheckpointCorrect;
      } else if (newCheckpointType === 'true_false') {
        q.tfScoringMode = 'standard_ministry';
        q.tfTierPoints = [0.1, 0.25, 0.5, 1.0];
        q.tfItems = [
          { id: 'tf_1', statement: 'Mệnh đề thứ nhất', isCorrect: true },
          { id: 'tf_2', statement: 'Mệnh đề thứ hai', isCorrect: false },
        ];
      } else if (newCheckpointType === 'text_input') {
        q.acceptedAnswers = ['1'];
      }
      newBlock = {
        id: 'blk_' + Date.now(),
        type: 'question',
        title: newBlockTitle.trim() || 'Câu hỏi tương tác củng cố',
        question: q,
      };
    }

    // Append to lesson
    const updatedChapters = (currentCourse.chapters || []).map((ch) => {
      if (ch.id === activeChapterItem.id) {
        return {
          ...ch,
          lessons: ch.lessons.map((les) => {
            if (les.id === activeLessonItem.id) {
              return {
                ...les,
                blocks: [...(les.blocks || []), newBlock],
              };
            }
            return les;
          }),
        };
      }
      return ch;
    });

    const updatedCourse: MicroCourse = { ...currentCourse, chapters: updatedChapters };
    saveCourse(updatedCourse);
    onRefreshCourses();
    setIsAddBlockModalOpen(false);
    setNewBlockTitle('');
    setNewBlockContent('');
    setNewCheckpointQuestion('');
    showToast('✓ Đã chèn khối nội dung vào bài học!');
  };

  // Calculate Progress
  const progressPct = progress && currentCourse ? calculateCourseProgressPercentage(currentCourse, progress) : 0;
  const completedLessonsCount = allLessons.filter((item) => progress?.completedLessonIds.includes(item.lesson.id)).length;
  const answeredCheckpointsCount = progress ? Object.keys(progress.interactiveAnswers).length : 0;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 font-sans">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-xl flex items-center gap-2 text-xs font-semibold animate-fade-in border border-slate-700">
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
                <span>Hệ Thống Khóa Học: Chương & Bài Học Tương Tác</span>
              </span>
              <span className="text-xs text-slate-500">
                {courses.length} Khóa học có sẵn
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Khóa Học Chuyên Sâu & Đề Kiểm Tra Định Kỳ
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 mt-1 max-w-2xl leading-relaxed">
              Mỗi khóa học được chia theo <strong>các Chương và Bài học</strong>. Học lý thuyết có <strong>công thức KaTeX</strong>, giải ngay <strong>câu hỏi tương tác trung gian</strong> và làm <strong>đề kiểm tra chương</strong>.
            </p>
          </div>

          {isTeacher && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setEditingCourse({
                    title: '',
                    subject: 'math',
                    grade: 'Lớp 12',
                    description: '',
                    instructor: currentUser?.fullName || 'Giáo viên phụ trách',
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
        <div className="pt-4 flex items-center gap-2 overflow-x-auto pb-1">
          {courses.map((c) => {
            const isSelected = c.id === currentCourse?.id;
            const chapCount = c.chapters?.length || 0;
            const lesCount = c.chapters
              ? c.chapters.reduce((sum, ch) => sum + ch.lessons.length, 0)
              : c.lessons?.length || 0;

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
                <BookOpen className={`w-3.5 h-3.5 ${isSelected ? 'text-white' : 'text-purple-600'}`} />
                <span>{c.title}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-bold ${
                  isSelected ? 'bg-purple-800 text-purple-100' : 'bg-slate-200 text-slate-600'
                }`}>
                  {chapCount > 0 ? `${chapCount} chương` : `${lesCount} bài`}
                </span>
              </button>
            );
          })}
        </div>

        {/* --- STUDENT COURSE PROGRESS BAR --- */}
        {currentCourse && (
          <div className="mt-5 pt-4 border-t border-slate-100 bg-gradient-to-r from-purple-50/60 via-emerald-50/40 to-blue-50/60 p-4 rounded-xl border border-purple-100">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-emerald-600 text-white">
                  <BookmarkCheck className="w-4 h-4" />
                </span>
                <div>
                  <span className="text-xs font-bold text-slate-900 block">
                    Tiến độ học tập của bạn:
                  </span>
                  <span className="text-[11px] text-slate-500">
                    {completedLessonsCount}/{allLessons.length} bài học hoàn thành · {answeredCheckpointsCount} câu tương tác đã trả lời
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 self-end sm:self-center">
                <span className="text-xs font-extrabold text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-full border border-emerald-200 font-mono">
                  {progressPct}% Hoàn thành
                </span>
              </div>
            </div>

            {/* Progress track */}
            <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full transition-all duration-500 ease-out shadow-xs"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {currentCourse && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* LEFT COLUMN: CHAPTERS & LESSONS ACCORDION (4 cols) */}
          <div className="lg:col-span-4 space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-purple-600" />
                  <span>Hệ thống Chương & Bài</span>
                </h3>
                {isTeacher && (
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
                    className="px-2 py-1 text-[11px] font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-lg border border-purple-200 flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Thêm chương</span>
                  </button>
                )}
              </div>

              {/* Chapters Tree */}
              {(!currentCourse.chapters || currentCourse.chapters.length === 0) && (
                <div className="p-4 text-center text-xs text-slate-400 italic">
                  Chưa có chương học nào được thiết lập.
                </div>
              )}

              {(currentCourse.chapters || []).map((chap, chapIdx) => {
                const isExpanded = expandedChapterIds[chap.id] ?? true;
                const chapLessons = chap.lessons || [];
                const completedInChap = chapLessons.filter((l) => progress?.completedLessonIds.includes(l.id)).length;
                const chapterExam = allExams.find((e) => e.id === chap.chapterExamId);

                return (
                  <div key={chap.id} className="rounded-xl border border-slate-200 overflow-hidden bg-slate-50/50">
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

                      <div className="flex items-center gap-1 shrink-0 ml-2">
                        {isTeacher && (
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
                        {chapLessons.map((lesson, lIdx) => {
                          const isActive = lesson.id === activeLessonId;
                          const isCompleted = progress?.completedLessonIds.includes(lesson.id);

                          return (
                            <div
                              key={lesson.id}
                              onClick={() => {
                                setActiveLessonId(lesson.id);
                                setActiveChapterId(chap.id);
                              }}
                              className={`p-2.5 rounded-lg border transition-all flex items-center justify-between gap-2 cursor-pointer ${
                                isActive
                                  ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                                  : 'bg-white text-slate-800 border-slate-200 hover:border-purple-300'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <span className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
                                  isCompleted
                                    ? isActive ? 'text-emerald-300' : 'text-emerald-600'
                                    : isActive ? 'text-purple-300' : 'text-slate-300'
                                }`}>
                                  <CheckCircle2 className="w-4 h-4 fill-current" />
                                </span>
                                <span className="text-xs font-semibold truncate">
                                  {lesson.title}
                                </span>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                {lesson.durationMinutes && (
                                  <span className={`text-[10px] font-mono ${isActive ? 'text-purple-200' : 'text-slate-400'}`}>
                                    {lesson.durationMinutes}p
                                  </span>
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

                        {/* Teacher: Add lesson to chapter */}
                        {isTeacher && (
                          <button
                            type="button"
                            onClick={() => {
                              setTargetChapterIdForLesson(chap.id);
                              setEditingLesson({
                                title: `Bài ${chapLessons.length + 1}: Chuyên đề mới`,
                                durationMinutes: 25,
                                summary: '',
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
            {currentCourse.finalExamId && (() => {
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

          {/* RIGHT COLUMN: ACTIVE LESSON CONTENT & INTERACTIVE CHECKPOINTS (8 cols) */}
          <div className="lg:col-span-8 space-y-6">
            {activeLessonItem ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-6">
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

                  {/* Mark complete toggle */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleToggleLessonComplete(activeLessonItem.id)}
                      className={`px-3.5 py-2 text-xs font-bold rounded-xl border flex items-center gap-1.5 transition-all cursor-pointer ${
                        progress?.completedLessonIds.includes(activeLessonItem.id)
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-emerald-50 hover:text-emerald-700'
                      }`}
                    >
                      <Check className="w-4 h-4" />
                      <span>
                        {progress?.completedLessonIds.includes(activeLessonItem.id)
                          ? 'Đã hoàn thành'
                          : 'Đánh dấu hoàn thành'}
                      </span>
                    </button>

                    {isTeacher && (
                      <button
                        type="button"
                        onClick={() => setIsAddBlockModalOpen(true)}
                        className="px-3.5 py-2 text-xs font-bold bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 rounded-xl flex items-center gap-1.5 cursor-pointer"
                        title="Chèn khối lý thuyết hoặc câu hỏi tương tác"
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
                    💡 <strong>Mục tiêu bài học:</strong> {activeLessonItem.summary}
                  </div>
                )}

                {/* --- LESSON BLOCKS (THEORY + INTERACTIVE CHECKPOINTS) --- */}
                <div className="space-y-6">
                  {(!activeLessonItem.blocks || activeLessonItem.blocks.length === 0) && (
                    <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200 space-y-2">
                      <BookOpen className="w-8 h-8 text-slate-300 mx-auto" />
                      <div className="text-sm font-semibold text-slate-600">
                        Nội dung chi tiết của bài học đang được biên soạn.
                      </div>
                      {isTeacher && (
                        <button
                          type="button"
                          onClick={() => setIsAddBlockModalOpen(true)}
                          className="px-3 py-1.5 bg-purple-700 text-white text-xs font-bold rounded-lg cursor-pointer inline-flex items-center gap-1"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Chèn khối lý thuyết & câu hỏi ngay</span>
                        </button>
                      )}
                    </div>
                  )}

                  {(activeLessonItem.blocks || []).map((block, bIdx) => {
                    // BLOCK TYPE 1: THEORY
                    if (block.type === 'theory') {
                      return (
                        <div key={block.id} className="space-y-3">
                          {block.title && (
                            <h3 className="text-base font-bold text-slate-900 pb-1 border-b border-slate-100 flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-purple-600" />
                              <span>{block.title}</span>
                            </h3>
                          )}
                          <div className="text-sm text-slate-800 leading-relaxed space-y-2">
                            <RichContentRenderer content={block.contentMarkdown || ''} />
                          </div>
                        </div>
                      );
                    }

                    // BLOCK TYPE 2: CALLOUT / FORMULA BOX
                    if (block.type === 'callout') {
                      const isFormula = block.calloutType === 'formula';
                      const isTip = block.calloutType === 'tip';
                      return (
                        <div 
                          key={block.id}
                          className={`p-4 rounded-xl border space-y-2 ${
                            isFormula 
                              ? 'bg-purple-50/70 border-purple-200 text-purple-950'
                              : isTip
                              ? 'bg-amber-50/70 border-amber-200 text-amber-950'
                              : 'bg-blue-50/70 border-blue-200 text-blue-950'
                          }`}
                        >
                          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider">
                            <Zap className="w-4 h-4 text-purple-700" />
                            <span>{block.title || 'Công thức quan trọng'}</span>
                          </div>
                          <div className="text-sm">
                            <RichContentRenderer content={block.contentMarkdown || ''} />
                          </div>
                        </div>
                      );
                    }

                    // BLOCK TYPE 3: INTERACTIVE CHECKPOINT QUESTION
                    if (block.type === 'question' && block.question) {
                      const q = block.question;
                      const userChoice = checkpointAnswers[block.id];
                      const evalResult = checkpointResults[block.id];

                      return (
                        <div 
                          key={block.id} 
                          className="p-5 rounded-2xl border-2 border-purple-300 bg-gradient-to-br from-purple-50/30 to-slate-50 space-y-4 shadow-xs"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="px-2.5 py-1 text-xs font-extrabold rounded-lg bg-purple-700 text-white flex items-center gap-1.5 shadow-2xs">
                              <HelpCircle className="w-3.5 h-3.5" />
                              <span>{block.title || 'Câu hỏi tương tác trung gian'}</span>
                            </span>
                            <span className="text-xs font-mono font-bold text-purple-800 bg-purple-100 px-2 py-0.5 rounded border border-purple-200">
                              {q.points || 1.0} điểm
                            </span>
                          </div>

                          {/* Question Statement */}
                          <div className="text-sm font-semibold text-slate-900 leading-relaxed">
                            <RichContentRenderer content={q.question} />
                          </div>

                          {/* Choice Format A: Single choice options */}
                          {q.type === 'single_choice' && (
                            <div className="space-y-2">
                              {(q.options || []).map((opt, optIdx) => {
                                const letter = String.fromCharCode(65 + optIdx);
                                const isSelected = userChoice === optIdx;

                                return (
                                  <div
                                    key={optIdx}
                                    onClick={() => setCheckpointAnswers((prev) => ({ ...prev, [block.id]: optIdx }))}
                                    className={`p-3 rounded-xl border text-xs sm:text-sm font-medium transition-all flex items-center gap-3 cursor-pointer ${
                                      isSelected
                                        ? 'bg-purple-700 text-white border-purple-700 shadow-xs'
                                        : 'bg-white text-slate-800 border-slate-200 hover:border-purple-300'
                                    }`}
                                  >
                                    <span className={`w-6 h-6 rounded-md font-bold text-xs flex items-center justify-center shrink-0 border ${
                                      isSelected ? 'bg-purple-800 text-white border-purple-800' : 'bg-slate-100 text-slate-700 border-slate-200'
                                    }`}>
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

                          {/* Choice Format B: True / False */}
                          {q.type === 'true_false' && (
                            <div className="space-y-3">
                              <div className="text-xs text-slate-500 italic">
                                * {formatTrueFalseScoringRule(q)}
                              </div>
                              {(q.tfItems || []).map((item, itemIdx) => {
                                const letter = String.fromCharCode(97 + itemIdx);
                                const currentMap = (userChoice as { [id: string]: boolean }) || {};
                                const itemChoice = currentMap[item.id];

                                return (
                                  <div key={item.id} className="p-3 bg-white border border-slate-200 rounded-xl flex items-center justify-between gap-3 text-xs sm:text-sm">
                                    <div className="flex items-start gap-2 flex-1">
                                      <span className="font-bold text-slate-700 shrink-0">{letter})</span>
                                      <RichContentRenderer content={item.statement} />
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const nextMap = { ...currentMap, [item.id]: true };
                                          setCheckpointAnswers((prev) => ({ ...prev, [block.id]: nextMap }));
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
                                          const nextMap = { ...currentMap, [item.id]: false };
                                          setCheckpointAnswers((prev) => ({ ...prev, [block.id]: nextMap }));
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

                          {/* Choice Format C: Short text input */}
                          {q.type === 'text_input' && (
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={(userChoice as string) || ''}
                                onChange={(e) => setCheckpointAnswers((prev) => ({ ...prev, [block.id]: e.target.value }))}
                                placeholder="Nhập câu trả lời của bạn..."
                                className="flex-1 px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-600"
                              />
                            </div>
                          )}

                          {/* Check Button */}
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
                              <span className={`text-xs font-bold px-3 py-1 rounded-lg border ${
                                evalResult.isCorrect
                                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                  : 'bg-rose-100 text-rose-800 border-rose-300'
                              }`}>
                                {evalResult.isCorrect ? '✓ Đúng hoàn toàn' : '✗ Chưa đúng'}
                              </span>
                            )}
                          </div>

                          {/* Explanation Accordion / Reveal */}
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
                    }

                    return null;
                  })}
                </div>

                {/* --- PRACTICE EXAM FOR THIS LESSON --- */}
                {activeLessonItem.practiceExamId && (() => {
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
                          <h4 className="text-sm font-bold text-slate-900">
                            {pExam.title}
                          </h4>
                          <span className="text-xs text-slate-500 font-mono">
                            {pExam.questions.length} câu hỏi · {pExam.durationMinutes} phút · {pExam.totalPoints || 10}đ
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

                {/* --- BOTTOM PREV / NEXT NAVIGATION --- */}
                <div className="pt-6 border-t border-slate-100 flex items-center justify-between gap-4">
                  {prevLessonItem ? (
                    <button
                      type="button"
                      onClick={() => {
                        setActiveLessonId(prevLessonItem.lesson.id);
                        if (prevLessonItem.chapter) setActiveChapterId(prevLessonItem.chapter.id);
                      }}
                      className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl flex items-center gap-1.5 cursor-pointer"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Bài trước</span>
                    </button>
                  ) : <div />}

                  {nextLessonItem && (
                    <button
                      type="button"
                      onClick={() => {
                        setActiveLessonId(nextLessonItem.lesson.id);
                        if (nextLessonItem.chapter) setActiveChapterId(nextLessonItem.chapter.id);
                      }}
                      className="px-4 py-2 bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer shadow-xs ml-auto"
                    >
                      <span>Bài kế tiếp</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400 space-y-2">
                <BookOpen className="w-10 h-10 mx-auto text-slate-300" />
                <div className="text-sm font-semibold text-slate-600">
                  Chọn một bài học từ danh sách chương bên trái để bắt đầu học.
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- MODAL 1: ADD / EDIT COURSE --- */}
      {isCourseModalOpen && editingCourse && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">
                {editingCourse.id ? 'Chỉnh sửa khóa học' : 'Tạo khóa học mới'}
              </h3>
              <button onClick={() => setIsCourseModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Tên khóa học:</label>
                <input
                  type="text"
                  value={editingCourse.title || ''}
                  onChange={(e) => setEditingCourse({ ...editingCourse, title: e.target.value })}
                  placeholder="VD: Khóa Chuyên Sâu Tích Phân & Hình Học Không Gian 12"
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
                    value={editingCourse.grade || 'Lớp 12'}
                    onChange={(e) => setEditingCourse({ ...editingCourse, grade: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Giảng viên / Phụ trách:</label>
                <input
                  type="text"
                  value={editingCourse.instructor || ''}
                  onChange={(e) => setEditingCourse({ ...editingCourse, instructor: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Mô tả khóa học:</label>
                <textarea
                  rows={3}
                  value={editingCourse.description || ''}
                  onChange={(e) => setEditingCourse({ ...editingCourse, description: e.target.value })}
                  placeholder="Mục tiêu, đối tượng học sinh và lộ trình..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Đề thi Tổng kết Khóa (Tùy chọn):</label>
                <select
                  value={editingCourse.finalExamId || ''}
                  onChange={(e) => setEditingCourse({ ...editingCourse, finalExamId: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                >
                  <option value="">-- Không gán đề thi tổng kết --</option>
                  {allExams.map((ex) => (
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
      )}

      {/* --- MODAL 2: ADD / EDIT CHAPTER --- */}
      {isChapterModalOpen && editingChapter && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">
                {editingChapter.id ? 'Sửa thông tin Chương' : 'Thêm Chương mới vào khóa học'}
              </h3>
              <button onClick={() => setIsChapterModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Tên chương:</label>
                <input
                  type="text"
                  value={editingChapter.title}
                  onChange={(e) => setEditingChapter({ ...editingChapter, title: e.target.value })}
                  placeholder="VD: Chương I: Đạo hàm & Khảo sát hàm số"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-semibold"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Mô tả ngắn gọn:</label>
                <textarea
                  rows={2}
                  value={editingChapter.description}
                  onChange={(e) => setEditingChapter({ ...editingChapter, description: e.target.value })}
                  placeholder="Tóm tắt trọng tâm chương..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Đề kiểm tra định kỳ Chương:</label>
                <select
                  value={editingChapter.chapterExamId || ''}
                  onChange={(e) => setEditingChapter({ ...editingChapter, chapterExamId: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                >
                  <option value="">-- Chưa gán đề kiểm tra --</option>
                  {allExams.map((ex) => (
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
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">
                Thêm bài học vào Chương
              </h3>
              <button onClick={() => setIsLessonModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Tiêu đề bài học:</label>
                <input
                  type="text"
                  value={editingLesson.title || ''}
                  onChange={(e) => setEditingLesson({ ...editingLesson, title: e.target.value })}
                  placeholder="VD: Bài 1: Tính đơn điệu của hàm số"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-semibold"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Thời lượng học (phút):</label>
                <input
                  type="number"
                  value={editingLesson.durationMinutes || 25}
                  onChange={(e) => setEditingLesson({ ...editingLesson, durationMinutes: parseInt(e.target.value) || 25 })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Tóm lược bài học / Mục tiêu:</label>
                <textarea
                  rows={2}
                  value={editingLesson.summary || ''}
                  onChange={(e) => setEditingLesson({ ...editingLesson, summary: e.target.value })}
                  placeholder="Những kiến thức cần nắm sau khi học xong bài này..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Đề luyện tập kèm theo bài học:</label>
                <select
                  value={editingLesson.practiceExamId || ''}
                  onChange={(e) => setEditingLesson({ ...editingLesson, practiceExamId: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                >
                  <option value="">-- Không đính kèm đề thi --</option>
                  {allExams.map((ex) => (
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

      {/* --- MODAL 4: INSERT CONTENT BLOCK (THEORY OR INTERACTIVE QUESTION) --- */}
      {isAddBlockModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">
                Chèn khối nội dung vào: {activeLessonItem?.title}
              </h3>
              <button onClick={() => setIsAddBlockModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Block Type Picker */}
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setNewBlockType('theory')}
                className={`p-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 cursor-pointer transition-all ${
                  newBlockType === 'theory'
                    ? 'bg-purple-700 text-white border-purple-700 shadow-xs'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <BookOpen className="w-4 h-4" />
                <span>Khối Lý thuyết</span>
              </button>
              <button
                type="button"
                onClick={() => setNewBlockType('question')}
                className={`p-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 cursor-pointer transition-all ${
                  newBlockType === 'question'
                    ? 'bg-purple-700 text-white border-purple-700 shadow-xs'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <HelpCircle className="w-4 h-4" />
                <span>Câu hỏi tương tác</span>
              </button>
              <button
                type="button"
                onClick={() => setNewBlockType('callout')}
                className={`p-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 cursor-pointer transition-all ${
                  newBlockType === 'callout'
                    ? 'bg-purple-700 text-white border-purple-700 shadow-xs'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <Zap className="w-4 h-4" />
                <span>Hộp ghi nhớ / Công thức</span>
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Tiêu đề khối (Tùy chọn):</label>
                <input
                  type="text"
                  value={newBlockTitle}
                  onChange={(e) => setNewBlockTitle(e.target.value)}
                  placeholder="VD: 1. Định lý tính đơn điệu của hàm số..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                />
              </div>

              {/* Form for Theory & Callout */}
              {(newBlockType === 'theory' || newBlockType === 'callout') && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="font-bold text-slate-700 block">Nội dung (Hỗ trợ KaTeX Math $\LaTeX$):</label>
                    <MathToolbar onInsert={(latex) => setNewBlockContent((prev) => prev + latex)} />
                  </div>
                  <textarea
                    rows={6}
                    value={newBlockContent}
                    onChange={(e) => setNewBlockContent(e.target.value)}
                    placeholder="Nhập nội dung markdown, công thức toán học $y = f(x)$..."
                    className="w-full p-3 border border-slate-200 rounded-xl font-mono text-sm leading-relaxed"
                  />
                </div>
              )}

              {/* Form for Question Checkpoint */}
              {newBlockType === 'question' && (
                <div className="space-y-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="flex items-center justify-between">
                    <label className="font-bold text-slate-700">Dạng câu hỏi tương tác:</label>
                    <select
                      value={newCheckpointType}
                      onChange={(e: any) => setNewCheckpointType(e.target.value)}
                      className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg font-semibold"
                    >
                      <option value="single_choice">Trắc nghiệm 4 lựa chọn</option>
                      <option value="true_false">Mệnh đề Đúng / Sai</option>
                      <option value="text_input">Trả lời ngắn (Điền số/từ)</option>
                    </select>
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Nội dung câu hỏi (KaTeX):</label>
                    <textarea
                      rows={3}
                      value={newCheckpointQuestion}
                      onChange={(e) => setNewCheckpointQuestion(e.target.value)}
                      placeholder="Nhập đề bài tương tác..."
                      className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-sm font-mono"
                    />
                  </div>

                  {newCheckpointType === 'single_choice' && (
                    <div className="space-y-2">
                      <label className="font-bold text-slate-700 block">Các phương án & đáp án đúng:</label>
                      {newCheckpointOptions.map((opt, oIdx) => {
                        const letter = String.fromCharCode(65 + oIdx);
                        return (
                          <div key={oIdx} className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setNewCheckpointCorrect(oIdx)}
                              className={`w-7 h-7 rounded text-xs font-bold border cursor-pointer ${
                                newCheckpointCorrect === oIdx
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
                                const next = [...newCheckpointOptions];
                                next[oIdx] = e.target.value;
                                setNewCheckpointOptions(next);
                              }}
                              placeholder={`Nội dung phương án ${letter}...`}
                              className="flex-1 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Lời giải chi tiết sau khi trả lời:</label>
                    <textarea
                      rows={2}
                      value={newCheckpointExplanation}
                      onChange={(e) => setNewCheckpointExplanation(e.target.value)}
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
                onClick={() => setIsAddBlockModalOpen(false)}
                className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleAddBlockToActiveLesson}
                className="px-4 py-2 bg-purple-700 text-white rounded-xl text-xs font-bold cursor-pointer"
              >
                Chèn vào bài học
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
