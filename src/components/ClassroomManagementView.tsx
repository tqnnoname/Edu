import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Classroom, Exam, ExamBundle, ExamResult, StudentMember, UserRole, UserAccount, ClassJoinRequest, MicroCourse } from '../types/exam';
import { 
  Users, 
  Plus, 
  Award, 
  BarChart3, 
  CheckCircle, 
  Trophy, 
  Calendar, 
  BookOpen, 
  Clock, 
  UserPlus, 
  Trash2, 
  Copy, 
  Check, 
  ChevronRight, 
  GraduationCap, 
  Star,
  Search,
  KeyRound,
  ShieldCheck,
  TrendingUp,
  AlertCircle,
  Save,
  Lock,
  Send,
  Inbox,
  UserCheck,
  XCircle,
  HelpCircle,
  Crown,
  Key,
  Sparkles,
  RefreshCw,
  Play,
  CheckCircle2,
  BookmarkCheck,
  FileSpreadsheet,
  FileDown,
  FileCheck2,
  MonitorPlay,
  Eye,
  EyeOff
} from 'lucide-react';
import { 
  saveClassroom, 
  deleteClassroom, 
  setActiveClassId,
  getCurrentUser,
  getVisibleClassrooms,
  isStudentMemberOfClass,
  submitClassJoinRequestAsync,
  reviewClassJoinRequest,
  MASTER_ADMIN_EMAIL,
  isMasterAdminUser,
  fetchAdminUsersFromBackend,
  adminChangeUserRoleOnBackend,
  adminResetUserPasswordOnBackend,
  adminDeleteUserOnBackend,
  fetchClassRosterAccountsFromBackend,
  createClassStudentOnBackend,
  resetClassStudentPasswordOnBackend,
  getAllCourses,
  deleteCourse,
  isCreatorOfItem,
  canShowInPublicLibrary,
  getStudentCourseProgress,
  calculateCourseProgressPercentage,
  syncCourseScormState,
  isItemScheduleOpen,
  formatVietnameseDateTime,
  getHomeworksByClass,
  isCreatorModeRestricted,
  isResultHiddenFromStudent,
  getPendingJoinRequestForClass,
  clearTrackedJoinRequestForClass,
  getUserAttemptCountForExam,
  getUserAttemptCountForBundle,
  fetchExistingStudentDirectory,
  addExistingStudentsToClassroom,
} from '../utils/storage';
import { publishCloudNotification } from '../utils/notificationsFirestore';
import { ConfirmModal } from './ConfirmModal';
import { ClassroomHomeworkTab } from './ClassroomHomeworkTab';
import type { UnsavedNavigationGuard } from './UnsavedChangesModal';
import {
  doesResultBelongToStudent,
  exportClassroomCourseProgressToExcel,
  exportClassroomExamResultsToExcel,
  exportClassroomOverviewToExcel,
  exportExamToWord,
  exportStudentLearningResultsToExcel,
} from '../utils/exportFiles';

import type { ClassroomTabRouteId } from '../utils/urlRouter';

interface ClassroomManagementViewProps {
  classrooms: Classroom[];
  allExams: Exam[];
  allBundles?: ExamBundle[];
  allCourses?: MicroCourse[];
  results: ExamResult[];
  userRole: UserRole;
  currentUser?: UserAccount | null;
  activeClassId: string;
  initialTab?: ClassroomTabRouteId;
  onSelectClass: (classId: string) => void;
  onRouteChange?: (classroom: Classroom | null, tab: ClassroomTabRouteId) => void;
  onRefreshData: () => void;
  onStartExam: (exam: Exam, mode: 'exam' | 'practice', classId?: string) => void;
  onStartBundle?: (bundle: ExamBundle, classId?: string) => void;
  onPresentExam?: (exam: Exam) => void;
  onOpenCourse?: (course: MicroCourse) => void;
  onRequestAuth?: () => void;
  onRegisterUnsavedGuard?: (guard: UnsavedNavigationGuard | null) => void;
}

export const ClassroomManagementView: React.FC<ClassroomManagementViewProps> = ({
  classrooms,
  allExams,
  allBundles = [],
  allCourses,
  results,
  userRole,
  currentUser,
  activeClassId,
  initialTab,
  onSelectClass,
  onRouteChange,
  onRefreshData,
  onStartExam,
  onStartBundle,
  onPresentExam,
  onOpenCourse,
  onRequestAuth,
  onRegisterUnsavedGuard,
}) => {
  const homeworkGuardRef = useRef<UnsavedNavigationGuard | null>(null);
  const user = currentUser || getCurrentUser();
  const isTeacher = userRole === 'teacher' && Boolean(user && (user.role === 'teacher' || user.email.toLowerCase() === MASTER_ADMIN_EMAIL.toLowerCase()));
  const isMasterAdmin = Boolean(user && (user.isMasterAdmin || user.email.toLowerCase() === MASTER_ADMIN_EMAIL.toLowerCase()));

  // Học sinh chỉ thấy các lớp mình đã được duyệt tham gia; Giáo viên chỉ thấy lớp của mình (trừ Master Admin)
  const visibleClassrooms = useMemo(() => {
    return getVisibleClassrooms(classrooms, user);
  }, [classrooms, user]);

  const [selectedClassId, setSelectedClassId] = useState<string>(() => {
    if (activeClassId && visibleClassrooms.some((c) => c.id === activeClassId)) {
      return activeClassId;
    }
    return visibleClassrooms[0]?.id || '';
  });

  useEffect(() => {
    if (activeClassId && visibleClassrooms.some((c) => c.id === activeClassId)) {
      setSelectedClassId(activeClassId);
    }
  }, [activeClassId, visibleClassrooms]);

  const [activeTab, setActiveTab] = useState<ClassroomTabRouteId>(() =>
    initialTab || (isTeacher ? 'overview' : 'exams')
  );

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  useEffect(() => {
    if (
      !isTeacher &&
      (activeTab === 'overview' ||
        activeTab === 'ranking' ||
        activeTab === 'analytics' ||
        activeTab === 'requests' ||
        activeTab === 'all_accounts')
    ) {
      setActiveTab('exams');
    }
  }, [isTeacher, activeTab]);
  const [copiedCode, setCopiedCode] = useState(false);
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [joinMessage, setJoinMessage] = useState<{ text: string; isError?: boolean } | null>(null);
  const [joinNoteInput, setJoinNoteInput] = useState('');
  const [isSubmittingJoin, setIsSubmittingJoin] = useState(false);

  // Copy status & backend-fetched account state (kept only in React memory, never cached in browser storage)
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [allUsersList, setAllUsersList] = useState<UserAccount[]>([]);
  const [rosterAccountsByStudentId, setRosterAccountsByStudentId] = useState<
    Record<string, { username: string; email: string; visiblePassword?: string; isGoogleOnly?: boolean }>
  >({});
  const [revealedStudentPasswordIds, setRevealedStudentPasswordIds] = useState<Record<string, boolean>>({});
  const [showAllClassPasswords, setShowAllClassPasswords] = useState(false);
  const [revealedAdminPasswordIds, setRevealedAdminPasswordIds] = useState<Record<string, boolean>>({});
  const [showAllAdminPasswords, setShowAllAdminPasswords] = useState(false);
  const [classTeacherIds, setClassTeacherIds] = useState<string[]>([]);
  const [classTeacherEmails, setClassTeacherEmails] = useState<string[]>([]);
  const [issuedCredentialNotice, setIssuedCredentialNotice] = useState<{
    title: string;
    username: string;
    email: string;
    oneTimePassword: string;
  } | null>(null);
  const [accountFilter, setAccountFilter] = useState<'all' | 'teacher' | 'student'>('all');
  const [accountSearch, setAccountSearch] = useState('');

  // Course states for classroom (sync live with prop)
  const allCoursesList = useMemo(() => allCourses ?? getAllCourses(), [allCourses]);
  const [selectedCourseIdsForNewClass, setSelectedCourseIdsForNewClass] = useState<string[]>([]);
  const [isAssignCoursesModalOpen, setIsAssignCoursesModalOpen] = useState(false);
  const [tempAssignedCourseIds, setTempAssignedCourseIds] = useState<string[]>([]);

  // Modal create class state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [newClassGrade, setNewClassGrade] = useState('');
  const [newClassTeacher, setNewClassTeacher] = useState(user?.fullName || '');
  const [newClassDesc, setNewClassDesc] = useState('');
  const [selectedExamIdsForNewClass, setSelectedExamIdsForNewClass] = useState<string[]>([]);

  // Modal add student state
  const [isAddStudentOpen, setIsAddStudentOpen] = useState(false);
  const [addStudentMode, setAddStudentMode] = useState<'existing' | 'create'>('existing');
  const [existingStudentDirectory, setExistingStudentDirectory] = useState<UserAccount[]>([]);
  const [isLoadingStudentDirectory, setIsLoadingStudentDirectory] = useState(false);
  const [existingStudentSearch, setExistingStudentSearch] = useState('');
  const [selectedExistingStudentIds, setSelectedExistingStudentIds] = useState<string[]>([]);
  const [isAddingExistingStudents, setIsAddingExistingStudents] = useState(false);
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentCode, setNewStudentCode] = useState('');
  const [newStudentEmail, setNewStudentEmail] = useState('');
  const [saveToast, setSaveToast] = useState<string | null>(null);

  // Confirm modal state (replaces window.confirm/alert)
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    confirmText: 'Xác nhận xóa',
    onConfirm: () => {},
  });

  const currentClass = useMemo(() => {
    return visibleClassrooms.find((c) => c.id === selectedClassId) || visibleClassrooms[0] || null;
  }, [visibleClassrooms, selectedClassId]);

  useEffect(() => {
    onRouteChange?.(currentClass, activeTab);
  }, [currentClass?.id, activeTab]);

  const refreshAdminUsersFromBackend = async () => {
    if (!isMasterAdmin) return;
    const res = await fetchAdminUsersFromBackend();
    if (res.success && res.users) {
      setAllUsersList(res.users);
    }
  };

  useEffect(() => {
    if (isMasterAdmin) {
      void refreshAdminUsersFromBackend();
    } else {
      setAllUsersList([]);
    }
  }, [isMasterAdmin, activeTab === 'all_accounts']);

  const refreshClassRosterFromBackend = async (classId: string) => {
    if (!isTeacher || !classId) return;
    const res = await fetchClassRosterAccountsFromBackend(classId);
    if (res.success) {
      setRosterAccountsByStudentId(res.accountsByStudentId);
      setClassTeacherIds(res.teacherIds);
      setClassTeacherEmails(res.teacherEmails);
    }
  };

  useEffect(() => {
    if (isTeacher && currentClass?.id) {
      void refreshClassRosterFromBackend(currentClass.id);
    } else {
      setRosterAccountsByStudentId({});
      setClassTeacherIds([]);
      setClassTeacherEmails([]);
    }
  }, [isTeacher, currentClass?.id, currentClass?.students?.length, activeTab === 'students']);

  const getActivePendingRequests = (cls: Classroom | null | undefined): ClassJoinRequest[] => {
    if (!cls || !Array.isArray(cls.pendingRequests)) return [];
    const memberIds = new Set((cls.students || []).map((s) => String(s?.id || '').trim()).filter(Boolean));
    const memberEmails = new Set(
      (cls.students || []).map((s) => String(s?.email || '').trim().toLowerCase()).filter(Boolean)
    );
    const memberCodes = new Set(
      (cls.students || []).map((s) => String(s?.studentCode || '').trim().toUpperCase()).filter(Boolean)
    );
    return cls.pendingRequests.filter((r) => {
      if (!r) return false;
      if (r.status && r.status !== 'pending') return false;
      const rId = String(r.studentId || '').trim();
      const rEmail = String(r.studentEmail || '').trim().toLowerCase();
      const rCode = String(r.studentCode || '').trim().toUpperCase();
      if (rId && memberIds.has(rId)) return false;
      if (rEmail && memberEmails.has(rEmail)) return false;
      if (rCode && memberCodes.has(rCode)) return false;
      return true;
    });
  };

  // Load existing student directory whenever "Thêm học sinh" modal opens
  useEffect(() => {
    if (!isAddStudentOpen || !isTeacher) return;
    let active = true;
    setIsLoadingStudentDirectory(true);
    void fetchExistingStudentDirectory()
      .then((list) => {
        if (active) {
          setExistingStudentDirectory(list);
        }
      })
      .finally(() => {
        if (active) setIsLoadingStudentDirectory(false);
      });
    return () => {
      active = false;
    };
  }, [isAddStudentOpen, isTeacher]);

  // Instant realtime refresh whenever Firestore users / userCredentials change on any device
  useEffect(() => {
    if (!isTeacher && !isMasterAdmin) return;
    const handleAccountsUpdated = () => {
      if (isMasterAdmin) {
        void refreshAdminUsersFromBackend();
      }
      if (isTeacher && currentClass?.id) {
        void refreshClassRosterFromBackend(currentClass.id);
      }
      if (isAddStudentOpen && isTeacher) {
        void fetchExistingStudentDirectory().then((list) => setExistingStudentDirectory(list));
      }
    };
    window.addEventListener('edutest-accounts-updated', handleAccountsUpdated);
    return () => {
      window.removeEventListener('edutest-accounts-updated', handleAccountsUpdated);
    };
  }, [isTeacher, isMasterAdmin, currentClass?.id, isAddStudentOpen]);

  const handleSaveClassroomData = () => {
    if (currentClass) {
      saveClassroom(currentClass);
      onRefreshData();
      const timeStr = new Date().toLocaleTimeString('vi-VN');
      setSaveToast(`✓ Đã lưu và đồng bộ dữ liệu lớp học "${currentClass.name}" thành công lúc ${timeStr}!`);
      setTimeout(() => setSaveToast(null), 3000);
    }
  };

  const handleExportClassOverviewExcel = () => {
    if (!currentClass || !isTeacher) return;
    const res = exportClassroomOverviewToExcel({
      classroom: currentClass,
      assignedExams,
      classResults,
      assignedCoursesCount: assignedCourses.length,
      allUsers: allUsersList,
    });
    setSaveToast(`✓ Đã xuất kết quả tổng quan lớp "${currentClass.name}" ra file ${res.fileName}!`);
    setTimeout(() => setSaveToast(null), 4000);
  };

  const handleExportExamInClassExcel = (targetExam: Exam) => {
    if (!currentClass || !isTeacher) return;
    const res = exportClassroomExamResultsToExcel({
      classroom: currentClass,
      exam: targetExam,
      results,
      allUsers: allUsersList,
    });
    setSaveToast(`✓ Đã xuất kết quả đề "${targetExam.title}" (${res.count} lượt nộp) ra file ${res.fileName}!`);
    setTimeout(() => setSaveToast(null), 4000);
  };

  const handleExportClassCourseProgressExcel = (targetCourse?: MicroCourse) => {
    if (!currentClass || !isTeacher) return;
    if (!targetCourse && assignedCourses.length === 0) {
      setSaveToast('Lớp học chưa có khóa học nào được gán để xuất tiến độ.');
      setTimeout(() => setSaveToast(null), 3500);
      return;
    }
    const res = exportClassroomCourseProgressToExcel({
      classroom: currentClass,
      courses: assignedCourses,
      targetCourse,
      allUsers: allUsersList,
    });
    const scopeText = targetCourse
      ? `khóa "${targetCourse.title}"`
      : `toàn bộ ${assignedCourses.length} khóa học của lớp`;
    setSaveToast(`✓ Đã xuất quá trình học ${scopeText} ra file ${res.fileName}!`);
    setTimeout(() => setSaveToast(null), 4000);
  };

  const handleExportStudentLearningExcel = (student: {
    id?: string;
    name: string;
    studentCode?: string;
    email?: string;
    username?: string;
  }) => {
    if (!currentClass) return;
    const isSelf = Boolean(
      user &&
        ((student.id && user.id === student.id) ||
          (student.email && user.email && user.email.toLowerCase() === student.email.toLowerCase()) ||
          (student.studentCode &&
            user.studentCode &&
            user.studentCode.trim().toUpperCase() === student.studentCode.trim().toUpperCase()))
    );
    if (!isTeacher && !isSelf) {
      setSaveToast('Bạn chỉ có quyền xuất kết quả học tập của chính mình!');
      setTimeout(() => setSaveToast(null), 3500);
      return;
    }

    const linkedAcc = allUsersList.find(
      (u) =>
        (student.id && u.id === student.id) ||
        (student.email && u.email && u.email.toLowerCase() === student.email.toLowerCase()) ||
        (student.username && u.username && u.username.toLowerCase() === student.username.toLowerCase()) ||
        (student.studentCode &&
          u.studentCode &&
          u.studentCode.trim().toUpperCase() === student.studentCode.trim().toUpperCase())
    );

    const studentResults = results.filter((r) => {
      if (!isTeacher && isResultHiddenFromStudent(r, allExams)) return false;
      return (
        doesResultBelongToStudent(r, student) ||
        (linkedAcc
          ? doesResultBelongToStudent(r, {
              id: linkedAcc.id,
              email: linkedAcc.email,
              studentCode: linkedAcc.studentCode,
              name: linkedAcc.fullName,
            })
          : false)
      );
    });

    const progressOwnerId = linkedAcc?.id || student.id || '';
    const coursesProgress = progressOwnerId
      ? assignedCourses.map((course) => {
          const rawProg = getStudentCourseProgress(course.id, progressOwnerId);
          const synced = syncCourseScormState(course, rawProg);
          const pct = calculateCourseProgressPercentage(course, synced);
          const totalLessons =
            course.chapters && course.chapters.length > 0
              ? course.chapters.reduce((sum, ch) => sum + ch.lessons.length, 0)
              : course.lessonCount ?? course.lessons?.length ?? 0;
          const status = synced.scormData?.lessonStatus || 'not attempted';
          const statusLabel =
            status === 'passed'
              ? 'Đạt chuẩn'
              : status === 'completed'
              ? 'Hoàn thành'
              : status === 'incomplete'
              ? 'Đang học'
              : 'Chưa học';
          return {
            courseTitle: course.title,
            subject: course.subject,
            grade: course.grade,
            progressPercent: pct,
            completedLessons: synced.completedLessonIds?.length || 0,
            totalLessons,
            statusLabel,
          };
        })
      : [];

    const res = exportStudentLearningResultsToExcel({
      studentName: student.name,
      studentCode: student.studentCode || linkedAcc?.studentCode,
      studentEmail: student.email || linkedAcc?.email,
      className: currentClass.name,
      results: studentResults,
      coursesProgress,
    });
    setSaveToast(`✓ Đã xuất kết quả học tập của "${student.name}" (${res.count} bài thi) ra file ${res.fileName}!`);
    setTimeout(() => setSaveToast(null), 4000);
  };

  const handleExportAssignedExamWord = async (exam: Exam, includeAnswers = false) => {
    try {
      const res = await exportExamToWord(exam, { includeAnswers });
      setSaveToast(`✓ Đã xuất đề thi ra file Word ${res.fileName}!`);
      setTimeout(() => setSaveToast(null), 4000);
    } catch {
      setSaveToast('Không thể xuất file Word cho đề thi này.');
      setTimeout(() => setSaveToast(null), 3500);
    }
  };

  const isMemberOfCurrentClass = useMemo(() => {
    if (!currentClass) return false;
    return isStudentMemberOfClass(currentClass, user);
  }, [currentClass, user]);

  const assignedExams = useMemo(() => {
    if (!currentClass) return [];
    return allExams.filter((e) => {
      const belongs =
        currentClass.assignedExamIds?.includes(e.id) ||
        (e.visibility === 'class' && e.assignedClassId === currentClass.id);
      if (!belongs) return false;
      if (isCreatorModeRestricted(e) || e.status === 'draft') {
        return isTeacher && (isCreatorOfItem(e, user) || isMasterAdmin);
      }
      return true;
    });
  }, [allExams, currentClass, isTeacher, user, isMasterAdmin]);

  const pendingForJoinInput = useMemo(() => {
    if (!user || !joinCodeInput.trim()) return null;
    return getPendingJoinRequestForClass(joinCodeInput.trim(), user, classrooms);
  }, [user, joinCodeInput, classrooms, joinMessage]);

  const pendingForCurrentClass = useMemo(() => {
    if (!user || !currentClass) return null;
    return getPendingJoinRequestForClass(currentClass.id, user, classrooms);
  }, [user, currentClass, classrooms, joinMessage]);

  const assignedBundles = useMemo(() => {
    if (!currentClass) return [];
    return allBundles.filter((b) => {
      const belongs = b.visibility === 'class' && b.assignedClassId === currentClass.id;
      if (!belongs) return false;
      if (isCreatorModeRestricted(b) || b.status === 'draft') {
        return isTeacher && (isCreatorOfItem(b, user) || isMasterAdmin);
      }
      return true;
    });
  }, [allBundles, currentClass, isTeacher, user, isMasterAdmin]);

  const assignedCourses = useMemo(() => {
    if (!currentClass) return [];
    const courseIds = currentClass.assignedCourseIds || [];
    return allCoursesList.filter((c) => {
      const belongs =
        courseIds.includes(c.id) ||
        (c.visibility === 'class' && c.assignedClassId === currentClass.id);
      if (!belongs) return false;
      if (isCreatorModeRestricted(c) || c.status === 'draft') {
        return isTeacher && (isCreatorOfItem(c, user) || isMasterAdmin);
      }
      return true;
    });
  }, [allCoursesList, currentClass, isTeacher, user, isMasterAdmin]);

  const [hwBadgeTick, setHwBadgeTick] = useState(0);
  const classHomeworksCount = useMemo(() => {
    void hwBadgeTick;
    return currentClass ? getHomeworksByClass(currentClass.id).length : 0;
  }, [currentClass, hwBadgeTick, classrooms]);

  // Danh sách đề và khóa học người dùng hiện tại được phép chọn để gán cho lớp
  const selectableExamsForTeacher = useMemo(() => {
    return allExams.filter(
      (ex) =>
        isMasterAdmin ||
        isCreatorOfItem(ex, user) ||
        (!isCreatorModeRestricted(ex) && canShowInPublicLibrary(ex, user, userRole, classrooms))
    );
  }, [allExams, user, userRole, classrooms, isMasterAdmin]);

  const selectableCoursesForTeacher = useMemo(() => {
    return allCoursesList.filter(
      (c) =>
        isMasterAdmin ||
        isCreatorOfItem(c, user) ||
        (!isCreatorModeRestricted(c) && canShowInPublicLibrary(c, user, userRole, classrooms))
    );
  }, [allCoursesList, user, userRole, classrooms, isMasterAdmin]);

  // Compute student results for this class (exclude teacher attempts)
  const classResults = useMemo(() => {
    if (!currentClass) return [];
    const teacherIdSet = new Set(
      [
        ...classTeacherIds,
        ...allUsersList
          .filter(
            (u) =>
              u.role === 'teacher' ||
              u.isMasterAdmin ||
              u.email?.toLowerCase() === MASTER_ADMIN_EMAIL.toLowerCase()
          )
          .map((u) => u.id),
        ...(user && isTeacher ? [user.id, user.uid] : []),
        currentClass.teacherId,
      ].filter((x): x is string => Boolean(x))
    );
    const teacherEmailSet = new Set(
      [
        MASTER_ADMIN_EMAIL.toLowerCase(),
        ...classTeacherEmails.map((e) => e.toLowerCase()),
        ...allUsersList
          .filter(
            (u) =>
              u.role === 'teacher' ||
              u.isMasterAdmin ||
              u.email?.toLowerCase() === MASTER_ADMIN_EMAIL.toLowerCase()
          )
          .map((u) => u.email?.toLowerCase() || ''),
        ...(user && isTeacher && user.email ? [user.email.toLowerCase()] : []),
        currentClass.teacherEmail?.toLowerCase() || '',
      ].filter(Boolean)
    );

    return results.filter((r) => {
      const inClass = r.classId === currentClass.id || currentClass.assignedExamIds?.includes(r.examId);
      if (!inClass) return false;
      const email = r.userEmail?.trim().toLowerCase() || '';
      if (r.userId && teacherIdSet.has(r.userId)) return false;
      if (email && teacherEmailSet.has(email)) return false;
      return true;
    });
  }, [results, currentClass, allUsersList, classTeacherIds, classTeacherEmails, user, isTeacher]);

  // Statistics
  const stats = useMemo(() => {
    if (classResults.length === 0) {
      return {
        avgScore: 0,
        highestScore: 0,
        lowestScore: 0,
        totalSubmissions: 0,
        passRate: 0,
        tiers: { excellent: 0, good: 0, fair: 0, average: 0, poor: 0 },
      };
    }

    const scores = classResults.map((r) => r.scoreOnTenScale || (r.earnedPoints / (r.totalPoints || 10)) * 10);
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    const highest = Math.max(...scores);
    const lowest = Math.min(...scores);
    const passCount = scores.filter((s) => s >= 5.0).length;

    const tiers = {
      excellent: scores.filter((s) => s >= 9.0).length,
      good: scores.filter((s) => s >= 8.0 && s < 9.0).length,
      fair: scores.filter((s) => s >= 6.5 && s < 8.0).length,
      average: scores.filter((s) => s >= 5.0 && s < 6.5).length,
      poor: scores.filter((s) => s < 5.0).length,
    };

    return {
      avgScore: Number(avg.toFixed(2)),
      highestScore: Number(highest.toFixed(2)),
      lowestScore: Number(lowest.toFixed(2)),
      totalSubmissions: classResults.length,
      passRate: Math.round((passCount / scores.length) * 100),
      tiers,
    };
  }, [classResults]);

  // Leaderboard ranking list (sorted by score desc, then time spent asc)
  const leaderboard = useMemo(() => {
    const list = [...classResults].sort((a, b) => {
      const sA = a.scoreOnTenScale ?? (a.earnedPoints / (a.totalPoints || 10)) * 10;
      const sB = b.scoreOnTenScale ?? (b.earnedPoints / (b.totalPoints || 10)) * 10;
      if (sB !== sA) return sB - sA;
      return a.timeSpentSeconds - b.timeSpentSeconds;
    });

    return list.slice(0, 15);
  }, [classResults]);

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleJoinClass = async () => {
    if (!joinCodeInput.trim() || isSubmittingJoin) return;
    if (!user) {
      if (onRequestAuth) onRequestAuth();
      return;
    }
    if (pendingForJoinInput) {
      setJoinMessage({
        text: `Bạn đã gửi yêu cầu tham gia lớp "${pendingForJoinInput.className || joinCodeInput.trim()}". Đang chờ giáo viên duyệt!`,
        isError: true,
      });
      return;
    }
    setIsSubmittingJoin(true);
    try {
      const res = await submitClassJoinRequestAsync(joinCodeInput.trim(), user, joinNoteInput);
      onRefreshData();
      if (res.success) {
        setJoinMessage({ text: res.message });
        setJoinNoteInput('');
        if (res.classroom) {
          setSelectedClassId(res.classroom.id);
          setActiveClassId(res.classroom.id);
          onSelectClass(res.classroom.id);
          setJoinCodeInput('');
          if (res.classroom.teacherEmail && !isStudentMemberOfClass(res.classroom, user)) {
            void publishCloudNotification({
              title: `Yêu cầu xin vào lớp ${res.classroom.name}`,
              message: `${user.fullName} (${user.email}) vừa gửi yêu cầu tham gia lớp ${res.classroom.name}.`,
              category: 'classroom',
              targetType: 'classroom_requests',
              targetId: res.classroom.id,
              secondaryId: 'requests',
              targetLabel: `Duyệt yêu cầu · ${res.classroom.name}`,
              classId: res.classroom.id,
              className: res.classroom.name,
              recipientScope: 'user',
              recipientEmails: [res.classroom.teacherEmail.trim().toLowerCase()],
              senderName: user.fullName || user.username,
              senderEmail: user.email,
            }).catch(() => {});
          }
        }
      } else {
        setJoinMessage({ text: res.message, isError: true });
      }
      setTimeout(() => setJoinMessage(null), 5000);
    } finally {
      setIsSubmittingJoin(false);
    }
  };

  const handleReviewJoin = (requestId: string, action: 'approve' | 'reject') => {
    if (!currentClass) return;
    const targetReq = (currentClass.pendingRequests || []).find((r) => r.id === requestId);
    const res = reviewClassJoinRequest(currentClass.id, requestId, action);
    if (res.success && action === 'approve' && targetReq?.studentEmail) {
      void publishCloudNotification({
        title: `Đã được duyệt vào lớp ${currentClass.name}`,
        message: `Giáo viên đã phê duyệt yêu cầu tham gia lớp ${currentClass.name}. Nhấn để mở danh sách đề thi và bài tập của lớp.`,
        category: 'classroom',
        targetType: 'classroom',
        targetId: currentClass.id,
        secondaryId: 'exams',
        targetLabel: `Mở lớp ${currentClass.name}`,
        classId: currentClass.id,
        className: currentClass.name,
        recipientScope: 'user',
        recipientEmails: [targetReq.studentEmail.trim().toLowerCase()],
        senderName: user?.fullName || currentClass.teacherName || 'Giáo viên',
        senderEmail: user?.email || currentClass.teacherEmail || '',
      }).catch(() => {});
    }
    onRefreshData();
    setJoinMessage({ text: res.message });
    setTimeout(() => setJoinMessage(null), 4000);
  };

  const handleCreateClass = (): boolean => {
    if (!newClassName.trim()) {
      setSaveToast('⚠️ Vui lòng nhập Tên lớp học trước khi lưu!');
      setTimeout(() => setSaveToast(null), 3500);
      return false;
    }
    const newClass: Classroom = {
      id: 'class_' + Date.now(),
      name: newClassName.trim(),
      grade: newClassGrade.trim(),
      code: 'ED' + Math.floor(1000 + Math.random() * 9000),
      teacherId: user?.id,
      teacherEmail: user?.email,
      teacherName: newClassTeacher.trim() || user?.fullName || 'Giáo viên',
      description: newClassDesc.trim(),
      students: [],
      assignedExamIds: selectedExamIdsForNewClass,
      assignedCourseIds: selectedCourseIdsForNewClass,
      createdAt: new Date().toISOString().split('T')[0],
    };

    saveClassroom(newClass);
    onRefreshData();
    setSelectedClassId(newClass.id);
    setActiveClassId(newClass.id);
    onSelectClass(newClass.id);
    setIsCreateModalOpen(false);
    setNewClassName('');
    setNewClassDesc('');
    setSelectedExamIdsForNewClass([]);
    setSelectedCourseIdsForNewClass([]);
    setSaveToast(`✓ Đã tạo lớp học "${newClass.name}" (Mã lớp: ${newClass.code})`);
    setTimeout(() => setSaveToast(null), 4000);
    return true;
  };

  const handleOpenAssignCoursesModal = () => {
    if (!currentClass) return;
    setTempAssignedCourseIds(currentClass.assignedCourseIds || []);
    setIsAssignCoursesModalOpen(true);
  };

  const handleSaveAssignedCourses = (): boolean => {
    if (!currentClass) return false;
    const updatedClass: Classroom = {
      ...currentClass,
      assignedCourseIds: tempAssignedCourseIds,
    };
    saveClassroom(updatedClass);
    onRefreshData();
    setIsAssignCoursesModalOpen(false);
    setSaveToast(`✓ Đã cập nhật danh sách khóa học cho lớp "${currentClass.name}"!`);
    setTimeout(() => setSaveToast(null), 3000);
    return true;
  };

  const handleUnassignCourse = (courseId: string) => {
    if (!currentClass) return;
    const updatedIds = (currentClass.assignedCourseIds || []).filter((id) => id !== courseId);
    const updatedClass: Classroom = {
      ...currentClass,
      assignedCourseIds: updatedIds,
    };
    saveClassroom(updatedClass);
    onRefreshData();
    setSaveToast('✓ Đã gỡ khóa học khỏi lớp!');
    setTimeout(() => setSaveToast(null), 3000);
  };

  const handleAddStudent = async (): Promise<boolean> => {
    if (!currentClass || !newStudentName.trim()) {
      setSaveToast('⚠️ Vui lòng nhập Họ và tên học sinh trước khi lưu!');
      setTimeout(() => setSaveToast(null), 3500);
      return false;
    }

    const res = await createClassStudentOnBackend(currentClass.id, {
      name: newStudentName.trim(),
      studentCode: newStudentCode.trim() || undefined,
      email: newStudentEmail.trim() || undefined,
      className: currentClass.name,
    });

    if (!res.success || !res.studentMember) {
      setSaveToast(`⚠️ ${res.error || 'Không thể thêm học sinh vào máy chủ!'}`);
      setTimeout(() => setSaveToast(null), 4000);
      return false;
    }

    const newStudent = res.studentMember;
    const updatedClass: Classroom = {
      ...currentClass,
      students: [...currentClass.students, newStudent],
    };

    saveClassroom(updatedClass);
    if (res.accountUsername || res.oneTimePassword) {
      setRosterAccountsByStudentId((prev) => ({
        ...prev,
        [newStudent.id]: {
          username: res.accountUsername || '',
          email: res.email || newStudent.email || '',
          ...(res.oneTimePassword ? { visiblePassword: res.oneTimePassword } : {}),
        },
      }));
    }
    if (isMasterAdmin && res.email) {
      const targetEmailLower = res.email.toLowerCase();
      setAllUsersList((prev) => {
        const idx = prev.findIndex((u) => u.email.toLowerCase() === targetEmailLower);
        const entry: UserAccount = {
          id: newStudent.id,
          uid: newStudent.id,
          email: targetEmailLower,
          username: res.accountUsername || targetEmailLower.split('@')[0],
          fullName: newStudent.name,
          name: newStudent.name,
          studentCode: newStudent.studentCode,
          role: 'student',
          school: currentClass.name,
          visiblePassword: res.oneTimePassword,
          createdAt: newStudent.joinedAt,
          updatedAt: new Date().toISOString(),
        };
        if (idx === -1) return [entry, ...prev];
        const next = [...prev];
        next[idx] = { ...next[idx], ...entry };
        return next;
      });
    }
    void refreshClassRosterFromBackend(currentClass.id);
    if (isMasterAdmin) void refreshAdminUsersFromBackend();
    onRefreshData();
    setIsAddStudentOpen(false);
    setNewStudentName('');
    setNewStudentCode('');
    setNewStudentEmail('');

    if (res.oneTimePassword) {
      setIssuedCredentialNotice({
        title: `Đã tạo tài khoản cho học sinh "${newStudent.name}"`,
        username: res.accountUsername || '',
        email: res.email || newStudent.email || '',
        oneTimePassword: res.oneTimePassword,
      });
    }
    setSaveToast(`✓ Đã thêm học sinh "${newStudent.name}" (${res.accountUsername || newStudent.studentCode}) vào lớp!`);
    setTimeout(() => setSaveToast(null), 4500);
    return true;
  };

  const handleAddExistingStudents = async (accountsOverride?: UserAccount[]): Promise<boolean> => {
    if (!currentClass) return false;
    const targets =
      accountsOverride && accountsOverride.length > 0
        ? accountsOverride
        : existingStudentDirectory.filter((acc) =>
            selectedExistingStudentIds.includes(acc.uid || acc.id)
          );

    if (targets.length === 0) {
      setSaveToast('⚠️ Vui lòng chọn ít nhất 1 học sinh để thêm vào lớp!');
      setTimeout(() => setSaveToast(null), 3500);
      return false;
    }

    setIsAddingExistingStudents(true);
    try {
      const res = await addExistingStudentsToClassroom(currentClass.id, targets);
      if (!res.success) {
        setSaveToast(`⚠️ ${res.message}`);
        setTimeout(() => setSaveToast(null), 4000);
        return false;
      }

      if (Object.keys(res.linkedCredentials).length > 0) {
        setRosterAccountsByStudentId((prev) => ({
          ...prev,
          ...res.linkedCredentials,
        }));
      }

      const addedIdSet = new Set(targets.map((t) => t.uid || t.id));
      setSelectedExistingStudentIds((prev) => prev.filter((id) => !addedIdSet.has(id)));
      if (!accountsOverride) {
        setIsAddStudentOpen(false);
        setExistingStudentSearch('');
      }
      onRefreshData();
      void refreshClassRosterFromBackend(currentClass.id);
      setSaveToast(res.message);
      setTimeout(() => setSaveToast(null), 4500);
      return true;
    } finally {
      setIsAddingExistingStudents(false);
    }
  };

  useEffect(() => {
    if (!onRegisterUnsavedGuard) return;
    onRegisterUnsavedGuard({
      title: 'Bạn đang tạo lập / bổ sung dữ liệu lớp học',
      message: 'Bạn có thông tin lớp học, phân công hoặc bài tập về nhà chưa lưu. Bạn có muốn lưu lại trước khi chuyển sang mục khác không?',
      isDirty: () => {
        if (
          isCreateModalOpen &&
          Boolean(
            newClassName.trim() ||
              newClassDesc.trim() ||
              selectedExamIdsForNewClass.length > 0 ||
              selectedCourseIdsForNewClass.length > 0
          )
        ) {
          return true;
        }
        if (
          isAddStudentOpen &&
          Boolean(newStudentName.trim() || newStudentCode.trim() || newStudentEmail.trim())
        ) {
          return true;
        }
        if (isAssignCoursesModalOpen) {
          return true;
        }
        return Boolean(homeworkGuardRef.current?.isDirty());
      },
      saveAndExit: async () => {
        if (isCreateModalOpen) return handleCreateClass();
        if (isAddStudentOpen) return await handleAddStudent();
        if (isAssignCoursesModalOpen) return handleSaveAssignedCourses();
        if (homeworkGuardRef.current?.isDirty()) {
          return await homeworkGuardRef.current.saveAndExit();
        }
        return true;
      },
    });
    return () => {
      onRegisterUnsavedGuard(null);
    };
  });

  const handleCopyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleQuickResetStudentPassword = async (student: StudentMember, currentVisiblePwd?: string) => {
    if (!currentClass) return;
    const fallbackRoster =
      rosterAccountsByStudentId[student.id] ||
      Object.values(rosterAccountsByStudentId).find(
        (r) => student.email && r.email && r.email.toLowerCase() === student.email.toLowerCase()
      );
    const prevPwd = currentVisiblePwd || fallbackRoster?.visiblePassword;

    const res = await resetClassStudentPasswordOnBackend(currentClass.id, student, prevPwd);
    if (!res.success || !res.oneTimePassword) {
      setSaveToast(`⚠️ ${res.error || 'Không thể cấp lại mật khẩu cho học sinh!'}`);
      setTimeout(() => setSaveToast(null), 4500);
      return;
    }

    if (res.accountUsername || res.oneTimePassword) {
      setRosterAccountsByStudentId((prev) => ({
        ...prev,
        [student.id]: {
          username: res.accountUsername || prev[student.id]?.username || '',
          email: res.email || student.email || prev[student.id]?.email || '',
          visiblePassword: res.oneTimePassword,
        },
      }));
      if (isMasterAdmin) {
        const targetEmailLower = String(res.email || student.email || '').toLowerCase();
        setAllUsersList((prev) =>
          prev.map((u) =>
            u.id === student.id ||
            u.uid === student.id ||
            (targetEmailLower && u.email.toLowerCase() === targetEmailLower)
              ? { ...u, visiblePassword: res.oneTimePassword, updatedAt: new Date().toISOString() }
              : u
          )
        );
      }
    }
    void refreshClassRosterFromBackend(currentClass.id);
    if (isMasterAdmin) void refreshAdminUsersFromBackend();
    setIssuedCredentialNotice({
      title: `Mật khẩu mới cấp một lần cho "${student.name}"`,
      username: res.accountUsername || fallbackRoster?.username || '',
      email: res.email || student.email || '',
      oneTimePassword: res.oneTimePassword,
    });
    setSaveToast(`✓ Đã cấp lại mật khẩu 8 ký tự mới (đồng bộ tức thì) cho học sinh ${student.name}!`);
    setTimeout(() => setSaveToast(null), 5000);
  };

  const handleAdminResetAccountPassword = async (acc: UserAccount) => {
    const res = await adminResetUserPasswordOnBackend(acc.id, undefined, acc.email, {
      username: acc.username,
      fullName: acc.fullName || acc.name,
      role: acc.role,
      studentCode: acc.studentCode,
      school: acc.school || acc.schoolOrOrg,
      previousPassword: acc.visiblePassword,
    });
    if (!res.success || !res.oneTimePassword) {
      setSaveToast(`⚠️ ${res.error || 'Không thể cấp lại mật khẩu tài khoản!'}`);
      setTimeout(() => setSaveToast(null), 4500);
      return;
    }
    // Update UI password immediately without waiting for any extra network fetch
    const targetEmailLower = String(res.email || acc.email || '').toLowerCase();
    setAllUsersList((prev) =>
      prev.map((u) =>
        u.id === acc.id ||
        u.uid === acc.id ||
        (targetEmailLower && u.email.toLowerCase() === targetEmailLower)
          ? {
              ...u,
              visiblePassword: res.oneTimePassword,
              isGoogleAuth: false,
              updatedAt: new Date().toISOString(),
            }
          : u
      )
    );
    void refreshAdminUsersFromBackend();
    if (isTeacher && currentClass?.id) void refreshClassRosterFromBackend(currentClass.id);
    onRefreshData();
    setIssuedCredentialNotice({
      title: `Mật khẩu mới cấp một lần cho "${acc.fullName || acc.name || acc.email}"`,
      username: res.username || acc.username || '',
      email: res.email || acc.email,
      oneTimePassword: res.oneTimePassword,
    });
    setSaveToast(`✓ Đã đặt lại mật khẩu 8 ký tự (đồng bộ Cloud) cho tài khoản ${res.username || acc.email}!`);
    setTimeout(() => setSaveToast(null), 5000);
  };

  const handleAdminToggleRole = async (acc: UserAccount) => {
    if (acc.email.toLowerCase() === MASTER_ADMIN_EMAIL.toLowerCase() || acc.isMasterAdmin) {
      setSaveToast('Không thể thay đổi quyền của Quản trị viên tối cao!');
      setTimeout(() => setSaveToast(null), 3500);
      return;
    }
    const nextRole = acc.role === 'teacher' ? 'student' : 'teacher';
    const res = await adminChangeUserRoleOnBackend(acc.id, nextRole);
    if (!res.success) {
      setSaveToast(`⚠️ ${res.error || 'Không thể cập nhật vai trò tài khoản!'}`);
      setTimeout(() => setSaveToast(null), 4000);
      return;
    }
    await refreshAdminUsersFromBackend();
    onRefreshData();
    setSaveToast(`✓ Đã chuyển vai trò tài khoản "${acc.fullName || acc.name || acc.username || acc.email}" thành "${nextRole === 'teacher' ? 'Giáo viên' : 'Học sinh'}"!`);
    setTimeout(() => setSaveToast(null), 4000);
  };

  const handleAdminDeleteAccount = (acc: UserAccount) => {
    if (acc.email.toLowerCase() === MASTER_ADMIN_EMAIL.toLowerCase() || acc.isMasterAdmin) {
      setSaveToast('Không thể xóa tài khoản Quản trị viên tối cao!');
      setTimeout(() => setSaveToast(null), 3500);
      return;
    }
    setConfirmModal({
      isOpen: true,
      title: 'Xác nhận xóa tài khoản người dùng',
      message: `Bạn có chắc chắn muốn xóa vĩnh viễn tài khoản "${acc.fullName || acc.name || acc.username || acc.email}" (${acc.email}) khỏi hệ thống và gỡ khỏi mọi lớp học?`,
      confirmText: 'Xóa tài khoản',
      onConfirm: () => {
        void adminDeleteUserOnBackend(acc.id).then(async (res) => {
          if (res.success) {
            await refreshAdminUsersFromBackend();
            onRefreshData();
            setSaveToast(`✓ Đã xóa tài khoản "${acc.fullName || acc.name || acc.username || acc.email}"!`);
          } else {
            setSaveToast(res.error || 'Không thể xóa tài khoản!');
          }
          setTimeout(() => setSaveToast(null), 4000);
        });
      },
    });
  };

  const filteredAccounts = useMemo(() => {
    return allUsersList.filter(acc => {
      if (accountFilter !== 'all' && acc.role !== accountFilter) return false;
      if (accountSearch.trim()) {
        const q = accountSearch.trim().toLowerCase();
        const matchName = (acc.fullName || acc.name || '').toLowerCase().includes(q);
        const matchEmail = acc.email.toLowerCase().includes(q);
        const matchUsername = (acc.username || '').toLowerCase().includes(q);
        return matchName || matchEmail || matchUsername;
      }
      return true;
    });
  }, [allUsersList, accountFilter, accountSearch]);

  const handleDeleteStudent = (student: StudentMember) => {
    if (!currentClass) return;
    setConfirmModal({
      isOpen: true,
      title: 'Xác nhận xóa học sinh khỏi lớp',
      message: `Bạn có chắc chắn muốn xóa học sinh "${student.name}" (${student.studentCode}) khỏi lớp "${currentClass.name}"?`,
      confirmText: 'Xóa học sinh',
      onConfirm: () => {
        const updatedClass: Classroom = {
          ...currentClass,
          students: currentClass.students.filter((s) => s.id !== student.id),
        };
        saveClassroom(updatedClass);
        clearTrackedJoinRequestForClass(currentClass.id, {
          id: student.id,
          fullName: student.name,
          email: student.email || '',
          role: 'student',
          createdAt: '',
        } as UserAccount);
        onRefreshData();
        setSaveToast(`✓ Đã xóa học sinh "${student.name}" khỏi lớp "${currentClass.name}"!`);
        setTimeout(() => setSaveToast(null), 3500);
      },
    });
  };

  const handleDeleteCourseForever = (course: MicroCourse) => {
    setConfirmModal({
      isOpen: true,
      title: 'Xác nhận xóa khóa học',
      message: `Bạn có chắc chắn muốn xóa khóa học "${course.title}"? Toàn bộ chương, bài học và nội dung tương tác của khóa học này sẽ bị xóa.`,
      confirmText: 'Xóa khóa học',
      onConfirm: () => {
        deleteCourse(course.id);
        onRefreshData();
        setSaveToast(`✓ Đã xóa khóa học "${course.title}"!`);
        setTimeout(() => setSaveToast(null), 3500);
      },
    });
  };

  const handleDeleteClass = () => {
    if (!currentClass) return;
    const deletingClass = currentClass;
    setConfirmModal({
      isOpen: true,
      title: 'Xác nhận xóa lớp học',
      message: `Bạn có chắc chắn muốn xóa hoàn toàn lớp học "${deletingClass.name}" (Mã: ${deletingClass.code})? Danh sách học sinh và yêu cầu của lớp này sẽ bị xóa.`,
      confirmText: 'Xóa lớp học',
      onConfirm: () => {
        deleteClassroom(deletingClass.id);
        const remaining = visibleClassrooms.filter((c) => c.id !== deletingClass.id);
        setSelectedClassId(remaining[0]?.id || '');
        onRefreshData();
        setSaveToast(`✓ Đã xóa lớp học "${deletingClass.name}"!`);
        setTimeout(() => setSaveToast(null), 3500);
      },
    });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 font-sans">
      {/* Top Banner & Header */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs mb-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-1 text-xs font-bold rounded-md bg-blue-50 text-blue-800 border border-blue-200 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" />
                <span>{isTeacher ? 'Hệ thống Lớp học & Đánh giá Xếp hạng' : 'Lớp học của tôi'}</span>
              </span>
              <span className="text-xs text-slate-500">
                {visibleClassrooms.length} Lớp khả dụng
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              {isTeacher ? 'Quản lý Lớp học & Thống kê Học lực' : 'Lớp học & Nội dung được giao'}
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 mt-1 max-w-2xl leading-relaxed">
              {isTeacher
                ? 'Tạo lớp học, cấp mã tham gia, phân công đề thi trắc nghiệm riêng cho từng lớp và theo dõi phổ điểm, học lực (Xuất sắc, Giỏi, Khá, Trung bình, Yếu) cùng bảng vàng xếp hạng thành tích.'
                : 'Nhập mã lớp do giáo viên cung cấp để tham gia lớp học, làm các đề thi, tổ hợp liên môn và học các khóa học riêng của lớp.'}
            </p>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-3 shrink-0 flex-wrap">
            {/* Join class input for students */}
            <div className="flex items-center gap-1.5 bg-slate-50 p-1.5 rounded-xl border border-slate-200">
              <KeyRound className="w-4 h-4 text-slate-400 ml-2 shrink-0" />
              <input
                type="text"
                value={joinCodeInput}
                onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                placeholder="Nhập mã lớp..."
                className="w-28 sm:w-36 text-xs bg-transparent px-2 py-1 uppercase font-mono font-bold text-slate-900 focus:outline-none"
              />
              <button
                type="button"
                disabled={isSubmittingJoin || Boolean(pendingForJoinInput) || !joinCodeInput.trim()}
                onClick={handleJoinClass}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors whitespace-nowrap ${
                  pendingForJoinInput
                    ? 'bg-amber-100 text-amber-800 border border-amber-300 cursor-not-allowed'
                    : isSubmittingJoin || !joinCodeInput.trim()
                    ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer'
                }`}
              >
                {pendingForJoinInput
                  ? 'Đang chờ giáo viên duyệt'
                  : isSubmittingJoin
                  ? 'Đang gửi...'
                  : 'Vào lớp'}
              </button>
            </div>

            {isMasterAdmin && (
              <button
                type="button"
                onClick={() => {
                  setActiveTab('all_accounts');
                  void refreshAdminUsersFromBackend();
                }}
                className={`px-3.5 py-2 text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer border ${
                  activeTab === 'all_accounts'
                    ? 'bg-purple-950 text-white border-purple-800'
                    : 'bg-purple-50 hover:bg-purple-100 text-purple-800 border-purple-200'
                }`}
              >
                <Crown className="w-4 h-4 text-amber-500" />
                <span>Tài khoản & Mật khẩu ({allUsersList.length})</span>
              </button>
            )}

            {isTeacher && (
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(true)}
                className="px-4 py-2 text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white rounded-xl transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Tạo lớp mới</span>
              </button>
            )}
          </div>
        </div>

        {joinMessage && (
          <div
            className={`mt-4 p-3 rounded-xl text-xs flex items-center gap-2 ${
              joinMessage.isError
                ? 'bg-rose-50 border border-rose-200 text-rose-800'
                : 'bg-emerald-50 border border-emerald-200 text-emerald-800'
            }`}
          >
            <CheckCircle className="w-4 h-4 shrink-0" />
            <span className="font-semibold">{joinMessage.text}</span>
          </div>
        )}

        {issuedCredentialNotice && (
          <div className="mt-4 p-4 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="font-extrabold flex items-center gap-1.5 text-amber-900">
                <Key className="w-4 h-4 text-amber-700 shrink-0" />
                <span>{issuedCredentialNotice.title} (Hiển thị 1 lần để bàn giao)</span>
              </div>
              <div className="flex flex-wrap items-center gap-3 font-mono text-[11px]">
                {issuedCredentialNotice.username && (
                  <span>
                    TK: <strong className="bg-white px-1.5 py-0.5 rounded border border-amber-200">{issuedCredentialNotice.username}</strong>
                  </span>
                )}
                {issuedCredentialNotice.email && (
                  <span>
                    Email: <strong className="bg-white px-1.5 py-0.5 rounded border border-amber-200">{issuedCredentialNotice.email}</strong>
                  </span>
                )}
                <span>
                  MK mới: <strong className="bg-white px-2 py-0.5 rounded border border-amber-300 text-rose-700 select-all">{issuedCredentialNotice.oneTimePassword}</strong>
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() =>
                  handleCopyText(
                    `TK: ${issuedCredentialNotice.username || issuedCredentialNotice.email} | MK: ${issuedCredentialNotice.oneTimePassword}`,
                    'issued_cred'
                  )
                }
                className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-lg flex items-center gap-1 cursor-pointer"
              >
                {copiedId === 'issued_cred' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedId === 'issued_cred' ? 'Đã chép' : 'Sao chép'}</span>
              </button>
              <button
                type="button"
                onClick={() => setIssuedCredentialNotice(null)}
                className="px-2.5 py-1.5 bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 font-semibold rounded-lg cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        )}

        {/* Class Selection Pills - Ẩn đối với học sinh không phải thành viên */}
        <div className="pt-5 flex items-center gap-2 overflow-x-auto pb-1">
          {visibleClassrooms.length === 0 ? (
            <div className="p-3 bg-amber-50/70 rounded-xl border border-amber-200 text-xs text-amber-900 flex items-center gap-2 w-full">
              <Lock className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                Các lớp học do giáo viên tạo ra được ẩn và bảo mật. Nhập <strong>Mã lớp</strong> giáo viên cấp vào ô phía trên để gửi yêu cầu gia nhập lớp!
              </span>
            </div>
          ) : (
            visibleClassrooms.map((c) => {
              const isSelected = c.id === currentClass?.id;
              const pendingReqCount = getActivePendingRequests(c).length;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setSelectedClassId(c.id);
                    setActiveClassId(c.id);
                    onSelectClass(c.id);
                  }}
                  className={`px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-2 cursor-pointer border relative ${
                    isSelected
                      ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <GraduationCap className={`w-3.5 h-3.5 ${isSelected ? 'text-white' : 'text-blue-600'}`} />
                  <span>{c.name}</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${
                    isSelected ? 'bg-blue-700 text-blue-100' : 'bg-slate-200 text-slate-600'
                  }`}>
                    {c.students?.length || 0} HS
                  </span>
                  {isTeacher && pendingReqCount > 0 && (
                    <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping absolute -top-0.5 -right-0.5" />
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>

      {currentClass && !isMemberOfCurrentClass ? (
        /* MÀN HÌNH BẢO MẬT: HỌC SINH CHƯA LÀ THÀNH VIÊN CỦA LỚP */
        <div className="bg-white rounded-2xl border border-rose-200 p-8 sm:p-12 shadow-sm text-center max-w-xl mx-auto space-y-5 my-8">
          <div className="w-16 h-16 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto shadow-2xs">
            <Lock className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900">
              Lớp học đang được bảo mật
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              Bạn không có quyền truy cập lớp học này. Các lớp học do giáo viên phụ trách được ẩn và bảo mật nghiêm ngặt đối với học sinh bên ngoài. 
              Chỉ học sinh đã gửi yêu cầu và được giáo viên chủ quản duyệt vào danh sách thành viên mới có thể xem nội dung và làm bài thi.
            </p>
          </div>

          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-left space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Tên lớp:</span>
              <strong className="text-slate-900">{currentClass.name}</strong>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Giáo viên phụ trách:</span>
              <strong className="text-slate-900">{currentClass.teacherName}</strong>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Khối lớp:</span>
              <span className="font-bold text-slate-700">{currentClass.grade}</span>
            </div>
          </div>

          <button
            type="button"
            disabled={isSubmittingJoin || Boolean(pendingForCurrentClass)}
            onClick={async () => {
              if (isSubmittingJoin || pendingForCurrentClass) return;
              if (!user) {
                if (onRequestAuth) onRequestAuth();
                return;
              }
              setIsSubmittingJoin(true);
              try {
                const res = await submitClassJoinRequestAsync(currentClass.code, user, 'Xin tham gia lớp học để làm bài thi');
                setJoinMessage({ text: res.message, isError: !res.success });
                onRefreshData();
                setTimeout(() => setJoinMessage(null), 5000);
              } finally {
                setIsSubmittingJoin(false);
              }
            }}
            className={`w-full py-3 px-5 rounded-xl text-xs sm:text-sm font-bold transition-all shadow-xs flex items-center justify-center gap-2 ${
              pendingForCurrentClass
                ? 'bg-amber-100 text-amber-800 border border-amber-300 cursor-not-allowed'
                : isSubmittingJoin
                ? 'bg-blue-400 text-white cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer'
            }`}
          >
            {pendingForCurrentClass ? <Clock className="w-4 h-4" /> : <Send className="w-4 h-4" />}
            <span>
              {pendingForCurrentClass
                ? 'Đang chờ giáo viên duyệt'
                : isSubmittingJoin
                ? 'Đang gửi yêu cầu...'
                : 'Gửi yêu cầu xin tham gia lớp học này'}
            </span>
          </button>
        </div>
      ) : currentClass ? (
        <div className="space-y-6">
          {/* Active Class Hero Banner */}
          <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white rounded-2xl p-6 sm:p-8 shadow-md">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div>
                <div className="flex items-center gap-2.5 mb-2 flex-wrap">
                  <span className="px-2.5 py-0.5 rounded text-[11px] font-bold bg-amber-400 text-slate-950 uppercase tracking-wide">
                    {currentClass.grade}
                  </span>
                  <span className="text-xs text-slate-300">
                    Phụ trách: <strong>{currentClass.teacherName}</strong>
                  </span>
                  <span className="text-xs text-slate-400">·</span>
                  <span className="text-xs text-slate-300">
                    Sĩ số: <strong>{currentClass.students?.length || 0} học sinh</strong>
                  </span>
                </div>
                <h2 className="text-xl sm:text-2xl font-extrabold text-white">
                  {currentClass.name}
                </h2>
                {currentClass.description && (
                  <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-2xl leading-relaxed">
                    {currentClass.description}
                  </p>
                )}
              </div>

              {/* Class Code Box */}
              <div className="flex items-center gap-3 bg-white/10 backdrop-blur-md p-4 rounded-xl border border-white/20 shrink-0">
                <div>
                  <div className="text-[10px] uppercase font-bold text-amber-300 tracking-wider">
                    Mã mời tham gia lớp
                  </div>
                  <div className="text-2xl font-extrabold font-mono text-white tracking-widest mt-0.5">
                    {currentClass.code}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopyCode(currentClass.code)}
                  className="p-2.5 bg-white text-slate-900 hover:bg-amber-400 rounded-lg transition-colors cursor-pointer"
                  title="Sao chép mã lớp"
                >
                  {copiedCode ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          {/* Sub Navigation Tabs (Dài ra, hiển thị rõ ràng nội dung) */}
          <div className="flex items-center gap-2 border-b border-slate-200 pb-3 text-sm font-bold overflow-x-auto">
            {isTeacher && (
              <>
                <button
                  onClick={() => setActiveTab('overview')}
                  className={`py-2.5 px-6 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer min-w-[170px] ${
                    activeTab === 'overview'
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <BarChart3 className="w-4 h-4 text-blue-500" />
                  <span>Tổng quan & Học lực</span>
                </button>
                <button
                  onClick={() => setActiveTab('ranking')}
                  className={`py-2.5 px-6 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer min-w-[180px] ${
                    activeTab === 'ranking'
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <Trophy className="w-4 h-4 text-amber-400" />
                  <span>Bảng vàng Xếp hạng ({leaderboard.length})</span>
                </button>
              </>
            )}
            <button
              onClick={() => setActiveTab('exams')}
              className={`py-2.5 px-6 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer min-w-[180px] ${
                activeTab === 'exams'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <BookOpen className="w-4 h-4 text-blue-500" />
              <span>Đề thi & Tổ hợp ({assignedExams.length + assignedBundles.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('courses')}
              className={`py-2.5 px-6 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer min-w-[180px] ${
                activeTab === 'courses'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <GraduationCap className="w-4 h-4 text-teal-500" />
              <span>Khóa học của lớp ({assignedCourses.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('homework')}
              className={`py-2.5 px-6 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer min-w-[190px] ${
                activeTab === 'homework'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <FileCheck2 className="w-4 h-4 text-orange-500" />
              <span>Bài tập về nhà ({classHomeworksCount})</span>
            </button>
            <button
              onClick={() => setActiveTab('students')}
              className={`py-2.5 px-6 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer min-w-[180px] ${
                activeTab === 'students'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Users className="w-4 h-4 text-emerald-500" />
              <span>Danh sách Học sinh ({currentClass.students?.length || 0})</span>
            </button>

            {isTeacher && (() => {
              const activePendingCount = getActivePendingRequests(currentClass).length;
              return (
                <button
                  onClick={() => setActiveTab('requests')}
                  className={`py-2.5 px-6 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer relative min-w-[190px] ${
                    activeTab === 'requests'
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <Inbox className="w-4 h-4 text-amber-500" />
                  <span>Yêu cầu vào lớp ({activePendingCount})</span>
                  {activePendingCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-[11px] bg-rose-500 text-white font-extrabold ml-1 animate-pulse">
                      {activePendingCount}
                    </span>
                  )}
                </button>
              );
            })()}

            {isMasterAdmin && (
              <button
                onClick={() => setActiveTab('all_accounts')}
                className={`py-2.5 px-6 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer min-w-[250px] border ${
                  activeTab === 'all_accounts'
                    ? 'bg-purple-950 text-white border-purple-800 shadow-md ring-2 ring-purple-400/30'
                    : 'text-purple-700 bg-purple-50 hover:bg-purple-100 border-purple-200'
                }`}
              >
                <Crown className="w-4 h-4 text-amber-400" />
                <span>Toàn bộ Mật khẩu Hệ thống ({allUsersList.length})</span>
                <span className="text-[10px] bg-amber-400 text-slate-950 font-extrabold px-1.5 py-0.5 rounded shadow-xs">
                  Admin
                </span>
              </button>
            )}

            {isTeacher && (
              <button
                onClick={handleDeleteClass}
                className="ml-auto py-1.5 px-3 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg border border-rose-200 transition-colors flex items-center gap-1 cursor-pointer shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Xóa lớp học này</span>
              </button>
            )}
          </div>

          {/* TAB 1: OVERVIEW & ACADEMIC STATISTICS (TEACHER ONLY) */}
          {isTeacher && activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
                <div className="text-xs text-slate-600">
                  Tổng hợp điểm số và phân loại học lực của lớp <strong className="text-slate-900">{currentClass.name}</strong> ({classResults.length} lượt nộp bài)
                </div>
                <button
                  type="button"
                  onClick={handleExportClassOverviewExcel}
                  className="px-3.5 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>Xuất Excel tổng quan lớp (.xlsx)</span>
                </button>
              </div>

              {/* 4 Quantitative Metric Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Điểm trung bình (GPA)
                  </div>
                  <div className="flex items-baseline gap-1 mt-2">
                    <span className="text-3xl font-extrabold font-mono text-blue-700">
                      {stats.avgScore.toFixed(2)}
                    </span>
                    <span className="text-xs text-slate-400 font-mono">/ 10</span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    Dựa trên {stats.totalSubmissions} bài làm đã nộp
                  </div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Điểm cao nhất (Max)
                  </div>
                  <div className="flex items-baseline gap-1 mt-2">
                    <span className="text-3xl font-extrabold font-mono text-emerald-700">
                      {stats.highestScore.toFixed(2)}
                    </span>
                    <span className="text-xs text-slate-400 font-mono">/ 10</span>
                  </div>
                  <div className="text-[11px] text-emerald-600 font-medium mt-1">
                    Thủ khoa lớp đạt thành tích cao
                  </div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Tỷ lệ Đạt yêu cầu (≥ 5.0)
                  </div>
                  <div className="flex items-baseline gap-1 mt-2">
                    <span className="text-3xl font-extrabold font-mono text-purple-700">
                      {stats.passRate}%
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    Mức sàn tốt nghiệp & đại học
                  </div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Điểm thấp nhất (Min)
                  </div>
                  <div className="flex items-baseline gap-1 mt-2">
                    <span className="text-3xl font-extrabold font-mono text-slate-800">
                      {stats.lowestScore.toFixed(2)}
                    </span>
                    <span className="text-xs text-slate-400 font-mono">/ 10</span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    Cần phụ đạo thêm kiến thức
                  </div>
                </div>
              </div>

              {/* Academic Performance Distribution (Phân loại học lực) */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <Award className="w-4 h-4 text-blue-600" />
                      <span>Đánh giá & Phân loại Học lực theo Thang điểm 10</span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Tiêu chuẩn: Xuất sắc (≥ 9.0), Giỏi (8.0 - 8.9), Khá (6.5 - 7.9), Trung bình (5.0 - 6.4), Yếu (&lt; 5.0)
                    </p>
                  </div>
                  <span className="text-xs font-mono font-semibold text-slate-600">
                    Tổng: {stats.totalSubmissions} lượt đánh giá
                  </span>
                </div>

                {/* Bars */}
                <div className="space-y-3 pt-2">
                  {[
                    { label: 'Xuất sắc (9.0 - 10.0)', count: stats.tiers.excellent, color: 'bg-emerald-600', badge: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
                    { label: 'Giỏi (8.0 - 8.9)', count: stats.tiers.good, color: 'bg-blue-600', badge: 'text-blue-700 bg-blue-50 border-blue-200' },
                    { label: 'Khá (6.5 - 7.9)', count: stats.tiers.fair, color: 'bg-indigo-600', badge: 'text-indigo-700 bg-indigo-50 border-indigo-200' },
                    { label: 'Trung bình (5.0 - 6.4)', count: stats.tiers.average, color: 'bg-amber-500', badge: 'text-amber-800 bg-amber-50 border-amber-200' },
                    { label: 'Yếu / Cần cố gắng (< 5.0)', count: stats.tiers.poor, color: 'bg-rose-500', badge: 'text-rose-800 bg-rose-50 border-rose-200' },
                  ].map((tier, idx) => {
                    const percent = stats.totalSubmissions > 0 ? Math.round((tier.count / stats.totalSubmissions) * 100) : 0;
                    return (
                      <div key={idx} className="space-y-1 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-800">{tier.label}</span>
                          <span className="font-mono text-slate-600 font-bold">
                            {tier.count} bài ({percent}%)
                          </span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                          <div
                            className={`h-full ${tier.color} transition-all duration-500`}
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Per-exam statistics & Excel export (Teacher only) */}
              {assignedExams.length > 0 && (
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                        <BookOpen className="w-4 h-4 text-emerald-600" />
                        <span>Kết quả & Xuất Excel theo từng bài thi trong lớp ({assignedExams.length} đề)</span>
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Giáo viên có thể xuất riêng báo cáo Excel cho từng bài thi gồm danh sách HS đã nộp/chưa làm và chi tiết điểm.
                      </p>
                    </div>
                  </div>

                  <div className="overflow-x-auto border border-slate-200 rounded-xl">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-600 uppercase font-semibold border-b border-slate-200">
                        <tr>
                          <th className="py-2.5 px-4">STT</th>
                          <th className="py-2.5 px-4">Tên bài thi</th>
                          <th className="py-2.5 px-4 text-center">Lượt nộp</th>
                          <th className="py-2.5 px-4 text-center">Điểm TB (Thang 10)</th>
                          <th className="py-2.5 px-4 text-center">Tỷ lệ đạt</th>
                          <th className="py-2.5 px-4 text-right">Xuất Excel</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {assignedExams.map((ex, exIdx) => {
                          const exAttempts = classResults.filter((r) => r.examId === ex.id);
                          const exScores = exAttempts.map(
                            (r) => r.scoreOnTenScale ?? (r.earnedPoints / (r.totalPoints || 10)) * 10
                          );
                          const exAvg =
                            exScores.length > 0
                              ? (exScores.reduce((a, b) => a + b, 0) / exScores.length).toFixed(2)
                              : '—';
                          const exPass =
                            exScores.length > 0
                              ? `${Math.round((exScores.filter((s) => s >= 5.0).length / exScores.length) * 100)}%`
                              : '—';
                          return (
                            <tr key={ex.id} className="hover:bg-slate-50 transition-colors">
                              <td className="py-2.5 px-4 font-mono text-slate-400">{exIdx + 1}</td>
                              <td className="py-2.5 px-4 font-bold text-slate-900 max-w-[280px] truncate">
                                {ex.title}
                              </td>
                              <td className="py-2.5 px-4 text-center font-mono font-semibold text-slate-700">
                                {exAttempts.length}
                              </td>
                              <td className="py-2.5 px-4 text-center font-mono font-bold text-blue-700">
                                {exAvg}
                              </td>
                              <td className="py-2.5 px-4 text-center font-mono text-emerald-700 font-semibold">
                                {exPass}
                              </td>
                              <td className="py-2.5 px-4 text-right">
                                <button
                                  type="button"
                                  onClick={() => handleExportExamInClassExcel(ex)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg transition-colors cursor-pointer"
                                >
                                  <FileSpreadsheet className="w-3.5 h-3.5" />
                                  <span>Xuất Excel đề này</span>
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: RANKING / LEADERBOARD (TEACHER ONLY) */}
          {isTeacher && activeTab === 'ranking' && (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
              <div className="p-6 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <Trophy className="w-5 h-5 text-amber-500" />
                    <span>Bảng vàng Vinh danh & Xếp hạng Học sinh</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Xếp theo thứ tự điểm cao nhất và thời gian làm bài nhanh nhất
                  </p>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="font-semibold text-slate-600">Top 15 Thí sinh xuất sắc</span>
                  <button
                    type="button"
                    onClick={handleExportClassOverviewExcel}
                    className="px-3.5 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                    <span>Xuất Excel tổng quan lớp (.xlsx)</span>
                  </button>
                </div>
              </div>

              {leaderboard.length === 0 ? (
                <div className="p-12 text-center text-slate-500 text-xs">
                  Chưa có kết quả làm bài nào được ghi nhận cho lớp này. Hãy giao đề thi để học sinh làm bài!
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600 uppercase font-semibold border-b border-slate-200">
                      <tr>
                        <th className="py-3 px-4">Thứ hạng</th>
                        <th className="py-3 px-4">Học sinh / Thí sinh</th>
                        <th className="py-3 px-4">Đề thi</th>
                        <th className="py-3 px-4 text-center">Điểm số (Thang 10)</th>
                        <th className="py-3 px-4 text-center">Thời gian</th>
                        <th className="py-3 px-4">Học lực</th>
                        <th className="py-3 px-4 text-right">Ngày thi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {leaderboard.map((item, idx) => {
                        const score = item.scoreOnTenScale ?? (item.earnedPoints / (item.totalPoints || 10)) * 10;
                        let tierBadge = 'text-slate-700 bg-slate-50 border-slate-200';
                        let tierText = 'Trung bình';
                        if (score >= 9.0) {
                          tierBadge = 'text-emerald-700 bg-emerald-50 border-emerald-200 font-bold';
                          tierText = 'Xuất sắc 🌟';
                        } else if (score >= 8.0) {
                          tierBadge = 'text-blue-700 bg-blue-50 border-blue-200 font-semibold';
                          tierText = 'Giỏi 🥇';
                        } else if (score >= 6.5) {
                          tierBadge = 'text-indigo-700 bg-indigo-50 border-indigo-200';
                          tierText = 'Khá';
                        } else if (score < 5.0) {
                          tierBadge = 'text-rose-700 bg-rose-50 border-rose-200';
                          tierText = 'Yếu';
                        }

                        return (
                          <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                            <td className="py-3 px-4 font-bold font-mono">
                              {idx === 0 ? (
                                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-400 text-slate-950 text-xs shadow-2xs font-extrabold">
                                  🥇 1
                                </span>
                              ) : idx === 1 ? (
                                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-300 text-slate-900 text-xs shadow-2xs font-extrabold">
                                  🥈 2
                                </span>
                              ) : idx === 2 ? (
                                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-700 text-white text-xs shadow-2xs font-extrabold">
                                  🥉 3
                                </span>
                              ) : (
                                <span className="text-slate-500 ml-2">#{idx + 1}</span>
                              )}
                            </td>
                            <td className="py-3 px-4 font-bold text-slate-900">
                              {item.studentName || 'Nguyễn Văn An (Bạn)'}
                              {item.studentCode && (
                                <span className="block font-normal text-[11px] text-slate-500 font-mono">
                                  {item.studentCode}
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-slate-700 max-w-[220px] truncate">
                              {item.examTitle}
                            </td>
                            <td className="py-3 px-4 text-center font-mono font-extrabold text-blue-700 text-sm">
                              {score.toFixed(2)}
                            </td>
                            <td className="py-3 px-4 text-center font-mono text-slate-600">
                              {Math.floor(item.timeSpentSeconds / 60)}p {item.timeSpentSeconds % 60}s
                            </td>
                            <td className="py-3 px-4">
                              <span className={`px-2 py-0.5 rounded text-[11px] border ${tierBadge}`}>
                                {tierText}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-slate-500 text-[11px]">
                              {new Date(item.completedAt).toLocaleDateString('vi-VN')}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: ASSIGNED EXAMS & BUNDLES */}
          {activeTab === 'exams' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-2">
                <h3 className="text-sm font-bold text-slate-900">
                  Danh sách đề thi & tổ hợp giao cho lớp {currentClass.name}
                </h3>
                <div className="flex items-center gap-2 flex-wrap">
                  {isTeacher ? (
                    <button
                      type="button"
                      onClick={handleExportClassOverviewExcel}
                      className="px-3 py-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      <span>Xuất Excel tổng quan lớp ({classResults.length})</span>
                    </button>
                  ) : user ? (
                    <button
                      type="button"
                      onClick={() =>
                        handleExportStudentLearningExcel({
                          id: user.id,
                          name: user.fullName || user.name || 'Học sinh',
                          studentCode: user.studentCode,
                          email: user.email,
                          username: user.username,
                        })
                      }
                      className="px-3 py-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
                      title="Xuất kết quả học tập cá nhân của bạn ra file Excel"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      <span>Xuất Excel KQ học tập của tôi</span>
                    </button>
                  ) : null}
                </div>
              </div>

              {assignedExams.length === 0 && assignedBundles.length === 0 ? (
                <div className="bg-white p-8 rounded-xl border border-slate-200 text-center text-xs text-slate-500">
                  Chưa có đề thi hoặc tổ hợp nào được gán riêng cho lớp này.
                </div>
              ) : (
                <div className="space-y-6">
                  {assignedExams.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {assignedExams.map((exam) => {
                        const examSubmissionCount = classResults.filter((r) => r.examId === exam.id).length;
                        const myAttemptCount = getUserAttemptCountForExam(exam.id, results, user);
                        const maxAtt = exam.maxAttempts || 0;
                        const isAttemptsExceeded = !isTeacher && maxAtt > 0 && myAttemptCount >= maxAtt;
                        const schedCheck = isItemScheduleOpen({
                          openTime: exam.openTime,
                          closeTime: exam.closeTime,
                          status: exam.status,
                        });
                        const isBlocked = !isTeacher && (isAttemptsExceeded || !schedCheck.isOpen);
                        return (
                          <div
                            key={exam.id}
                            className="bg-white p-5 rounded-xl border border-slate-200 hover:border-slate-300 shadow-xs flex flex-col justify-between"
                          >
                            <div>
                              <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                                <span className="font-semibold uppercase text-blue-700">{exam.subject}</span>
                                <span className="font-mono">{exam.durationMinutes} phút</span>
                              </div>
                              <h4 className="font-bold text-slate-900 text-sm mb-2 line-clamp-2">
                                {exam.title}
                              </h4>
                              <div className="text-xs text-slate-500 mb-3 flex items-center gap-2 flex-wrap">
                                <span>{exam.questions.length} câu</span>
                                <span>·</span>
                                <span className="font-mono font-bold text-blue-700">{exam.totalPoints || 10}đ</span>
                                {maxAtt > 0 && (
                                  <>
                                    <span>·</span>
                                    <span className={`font-semibold ${isAttemptsExceeded ? 'text-rose-700' : 'text-slate-600'}`}>
                                      Lượt: {!isTeacher ? `${myAttemptCount}/${maxAtt}` : `Tối đa ${maxAtt}`}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>

                            <div className="pt-3 border-t border-slate-100 space-y-2">
                              {isBlocked ? (
                                <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-center justify-center gap-1.5">
                                  <Lock className="w-3.5 h-3.5 shrink-0" />
                                  <span>
                                    {isAttemptsExceeded
                                      ? `Đã hết lượt thi (${myAttemptCount}/${maxAtt})`
                                      : schedCheck.statusLabel || 'Đang đóng đề'}
                                  </span>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => onStartExam(exam, 'exam', currentClass.id)}
                                    className="flex-1 py-1.5 px-3 text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white rounded-lg transition-colors cursor-pointer text-center"
                                  >
                                    Làm đề thi
                                  </button>
                                  {exam.modeType !== 'exam_only' && (
                                    <button
                                      type="button"
                                      onClick={() => onStartExam(exam, 'practice', currentClass.id)}
                                      className="py-1.5 px-2.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors cursor-pointer"
                                    >
                                      Luyện tập
                                    </button>
                                  )}
                                </div>
                              )}

                              {isTeacher && (
                                <div className="space-y-1.5">
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => handleExportAssignedExamWord(exam, false)}
                                      className="flex-1 py-1.5 px-2 text-[11px] font-semibold bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 rounded-lg transition-colors flex items-center justify-center gap-1 cursor-pointer"
                                      title="Tải file Word đề thi (.docx)"
                                    >
                                      <FileDown className="w-3.5 h-3.5" />
                                      <span>Xuất Word</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleExportExamInClassExcel(exam)}
                                      className="flex-1 py-1.5 px-2 text-[11px] font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg transition-colors flex items-center justify-center gap-1 cursor-pointer"
                                      title="Xuất bảng kết quả bài thi này trong lớp ra Excel"
                                    >
                                      <FileSpreadsheet className="w-3.5 h-3.5" />
                                      <span>Xuất KQ Excel ({examSubmissionCount})</span>
                                    </button>
                                  </div>
                                  {onPresentExam && (
                                    <button
                                      type="button"
                                      onClick={() => onPresentExam(exam)}
                                      className="w-full py-1.5 px-2.5 text-[11px] font-bold bg-slate-900 hover:bg-indigo-950 text-amber-300 border border-slate-800 rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                                      title="Mở tab trình chiếu công bố điểm toàn màn hình cho phòng thi này"
                                    >
                                      <MonitorPlay className="w-3.5 h-3.5" />
                                      <span>Trình chiếu công bố điểm ({examSubmissionCount})</span>
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {assignedBundles.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="text-xs font-bold uppercase tracking-wide text-purple-800">
                        Tổ hợp liên môn riêng của lớp ({assignedBundles.length})
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {assignedBundles.map((bundle) => {
                          const myBundleAttempts = getUserAttemptCountForBundle(bundle, results, user);
                          const maxAtt = bundle.maxAttempts || 0;
                          const isBundleAttemptsExceeded = !isTeacher && maxAtt > 0 && myBundleAttempts >= maxAtt;
                          const bSched = isItemScheduleOpen({
                            openTime: bundle.openTime,
                            closeTime: bundle.closeTime,
                            status: bundle.status,
                          });
                          const isBundleBlocked = !isTeacher && (isBundleAttemptsExceeded || !bSched.isOpen);

                          return (
                            <div
                              key={bundle.id}
                              className="bg-purple-50/50 p-5 rounded-xl border border-purple-200 hover:border-purple-300 shadow-xs flex flex-col justify-between"
                            >
                              <div>
                                <div className="flex items-center justify-between text-xs text-purple-700 mb-2">
                                  <span className="font-bold uppercase">Tổ hợp lớp</span>
                                  <span className="font-mono">{bundle.examIds.length} môn</span>
                                </div>
                                <h4 className="font-bold text-slate-900 text-sm mb-1.5 line-clamp-2">
                                  {bundle.title}
                                </h4>
                                <p className="text-xs text-slate-600 line-clamp-2 mb-3">
                                  {bundle.description}
                                </p>
                              </div>
                              {onStartBundle && (
                                isBundleBlocked ? (
                                  <div className="w-full py-2 px-3 text-xs font-bold bg-rose-50 text-rose-800 border border-rose-200 rounded-lg flex items-center justify-center gap-1.5">
                                    <Lock className="w-3.5 h-3.5 shrink-0" />
                                    <span>
                                      {isBundleAttemptsExceeded
                                        ? `Đã hết lượt (${myBundleAttempts}/${maxAtt})`
                                        : bSched.statusLabel || 'Đang đóng'}
                                    </span>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => onStartBundle(bundle, currentClass.id)}
                                    className="w-full py-2 px-3 text-xs font-bold bg-purple-700 hover:bg-purple-800 text-white rounded-lg transition-colors cursor-pointer"
                                  >
                                    Bắt đầu thi tổ hợp
                                  </button>
                                )
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB: ASSIGNED COURSES IN CLASSROOM (Chế độ Khóa học của Lớp học) */}
          {activeTab === 'courses' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
                <div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <GraduationCap className="w-5 h-5 text-teal-600" />
                    <span>Hệ thống Khóa học của lớp {currentClass.name}</span>
                    <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-teal-50 text-teal-700 border border-teal-200">
                      {assignedCourses.length} khóa
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Các khóa học lý thuyết trực quan theo chương, bài học kết hợp câu hỏi tương tác trung gian và bài kiểm tra định kỳ được giao cho lớp này.
                  </p>
                </div>

                {isTeacher && (
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {assignedCourses.length > 0 && (
                      <button
                        type="button"
                        onClick={() => handleExportClassCourseProgressExcel()}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-2 cursor-pointer shadow-xs"
                        title="Xuất file Excel quá trình học tất cả khóa học trong lớp (Chỉ Giáo viên)"
                      >
                        <FileSpreadsheet className="w-4 h-4" />
                        <span>Xuất Excel Quá trình học</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleOpenAssignCoursesModal}
                      className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-2 cursor-pointer shadow-xs"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Quản lý & Gán khóa học</span>
                    </button>
                  </div>
                )}
              </div>

              {assignedCourses.length === 0 ? (
                <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center shadow-xs">
                  <GraduationCap className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <h4 className="font-bold text-slate-700 text-sm mb-1">Chưa có khóa học nào được giao cho lớp này</h4>
                  <p className="text-xs text-slate-500 max-w-md mx-auto mb-4">
                    {isTeacher
                      ? 'Giáo viên có thể gán các khóa học chuyên đề (hàm số, hình học, ngữ pháp...) để học sinh trong lớp cùng học và theo dõi tiến độ.'
                      : 'Giáo viên phụ trách lớp chưa gán khóa học nào. Vui lòng quay lại sau!'}
                  </p>
                  {isTeacher && (
                    <button
                      type="button"
                      onClick={handleOpenAssignCoursesModal}
                      className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
                    >
                      Chọn khóa học để giao cho lớp ngay
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {assignedCourses.map((course) => {
                    const currentUserId = user?.id || 'guest_user';
                    const prog = getStudentCourseProgress(course.id, currentUserId);
                    const pct = calculateCourseProgressPercentage(course, prog);
                    const totalLessons =
                      course.chapters && course.chapters.length > 0
                        ? course.chapters.reduce((sum, ch) => sum + ch.lessons.length, 0)
                        : course.lessonCount ?? course.lessons?.length ?? 0;
                    const completedLessons = prog?.completedLessonIds?.length || 0;
                    const courseSched = isItemScheduleOpen(course, 'course');
                    const isCourseLockedForStudent = !isTeacher && !courseSched.isOpen;

                    return (
                      <div
                        key={course.id}
                        className="bg-white rounded-2xl border border-slate-200 hover:border-teal-300 hover:shadow-md transition-all p-5 flex flex-col justify-between group"
                      >
                        <div>
                          <div className="flex items-center justify-between gap-2 mb-3">
                            <div className="flex items-center gap-1.5 text-[11px]">
                              <span className="font-bold uppercase text-teal-700">
                                {course.subject === 'math' ? 'Toán học' : course.subject === 'english' ? 'Tiếng Anh' : course.subject === 'physics' ? 'Vật lý' : course.subject}
                              </span>
                              <span aria-hidden="true" className="text-slate-300">·</span>
                              <span className="font-medium text-slate-600">
                                {course.grade}
                              </span>
                              <span aria-hidden="true" className="text-slate-300">·</span>
                              <span className={`font-semibold inline-flex items-center gap-1 ${courseSched.isOpen ? 'text-emerald-700' : 'text-rose-700'}`}>
                                {courseSched.isOpen ? <CheckCircle2 className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                                <span>{courseSched.statusLabel}</span>
                              </span>
                            </div>
                            {isTeacher && (
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleUnassignCourse(course.id)}
                                  className="text-slate-400 hover:text-amber-600 transition-colors p-1 cursor-pointer"
                                  title="Gỡ khóa học khỏi lớp"
                                >
                                  <XCircle className="w-3.5 h-3.5" />
                                </button>
                                {(isMasterAdmin || isCreatorOfItem(course, user)) && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteCourseForever(course)}
                                    className="text-slate-400 hover:text-rose-600 transition-colors p-1 cursor-pointer"
                                    title="Xóa hoàn toàn khóa học"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            )}
                          </div>

                          <h4 className="font-bold text-slate-900 text-sm mb-1.5 group-hover:text-teal-700 transition-colors line-clamp-2">
                            {course.title}
                          </h4>
                          <p className="text-xs text-slate-500 mb-3">
                            Giảng viên: {course.instructor}
                          </p>

                          {(course.openTime || course.closeTime) && (
                            <div className="text-[11px] text-slate-600 mb-3 flex items-center gap-1.5 tabular-nums">
                              <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span>
                                {course.openTime ? `Mở ${formatVietnameseDateTime(course.openTime)}` : 'Mở ngay'}
                                {' – '}
                                {course.closeTime ? `Đóng ${formatVietnameseDateTime(course.closeTime)}` : 'Không giới hạn'}
                              </span>
                            </div>
                          )}

                          <p className="text-xs text-slate-600 line-clamp-2 mb-4 leading-relaxed">
                            {course.description}
                          </p>

                          <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 mb-4 space-y-2">
                            <div className="flex items-center justify-between text-xs text-slate-600">
                              <span className="flex items-center gap-1.5">
                                <BookOpen className="w-3.5 h-3.5 text-teal-600" />
                                <span>Quy mô:</span>
                              </span>
                              <span className="font-semibold text-slate-800">
                                {(course.chapters && course.chapters.length > 0 ? course.chapters.length : course.chapterCount) ?? 0} chương · {totalLessons} bài học
                              </span>
                            </div>

                            <div>
                              <div className="flex items-center justify-between text-[11px] mb-1">
                                <span className="text-slate-500 font-medium">Tiến độ của bạn:</span>
                                <span className="font-mono font-bold text-teal-700">{pct}%</span>
                              </div>
                              <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                                <div
                                  className="bg-teal-500 h-full rounded-full transition-all duration-300"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <div className="text-[10px] text-slate-400 mt-1">
                                Đã hoàn thành {completedLessons}/{totalLessons} bài học
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="pt-2 space-y-2">
                          {isTeacher && (
                            <button
                              type="button"
                              onClick={() => handleExportClassCourseProgressExcel(course)}
                              className="w-full py-2 px-3 rounded-xl text-xs font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                              title="Xuất bảng tiến độ chi tiết từng học sinh & từng bài học của khóa này"
                            >
                              <FileSpreadsheet className="w-3.5 h-3.5" />
                              <span>Xuất Excel quá trình học khóa này</span>
                            </button>
                          )}

                          <button
                            type="button"
                            disabled={isCourseLockedForStudent}
                            title={isCourseLockedForStudent ? courseSched.reason : undefined}
                            onClick={() => {
                              if (onOpenCourse && !isCourseLockedForStudent) {
                                onOpenCourse(course);
                              }
                            }}
                            className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-2 shadow-xs ${
                              isCourseLockedForStudent
                                ? 'bg-slate-100 text-slate-500 border border-slate-200 cursor-not-allowed'
                                : 'bg-teal-600 hover:bg-teal-700 text-white cursor-pointer'
                            }`}
                          >
                            {isCourseLockedForStudent ? (
                              <>
                                <Lock className="w-3.5 h-3.5" />
                                <span>Khóa học {courseSched.statusLabel.toLowerCase()}</span>
                              </>
                            ) : (
                              <>
                                <Play className="w-3.5 h-3.5 fill-white" />
                                <span>Vào học khóa học này</span>
                                <ChevronRight className="w-3.5 h-3.5" />
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB: BÀI TẬP VỀ NHÀ (BTVN RIÊNG CỦA LỚP HỌC) */}
          {activeTab === 'homework' && (
            <ClassroomHomeworkTab
              classroom={currentClass}
              currentUser={user}
              isTeacher={isTeacher}
              onRegisterUnsavedGuard={(g) => {
                homeworkGuardRef.current = g;
              }}
              onToast={(msg) => {
                setSaveToast(msg);
                setHwBadgeTick((t) => t + 1);
                setTimeout(() => setSaveToast(null), 3500);
              }}
            />
          )}

          {/* TAB 4: STUDENTS LIST (Có tên đăng nhập & mật khẩu cho giáo viên) */}
          {activeTab === 'students' && (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Users className="w-4 h-4 text-emerald-600" />
                    <span>Danh sách học sinh trong lớp ({currentClass.students?.length || 0})</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {isTeacher 
                      ? 'Giáo viên có quyền xem tên đăng nhập, mật khẩu của học sinh lớp mình và cấp lại mật khẩu 8 ký tự mới (lưu mã hóa bảo mật trên Backend).' 
                      : `Học sinh có thể tự gia nhập bằng mã lớp ${currentClass.code}`}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {isTeacher ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setShowAllClassPasswords((v) => !v)}
                        className="px-3 py-1.5 text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                        title={showAllClassPasswords ? 'Ẩn toàn bộ mật khẩu học sinh' : 'Hiện toàn bộ mật khẩu học sinh trong lớp'}
                      >
                        {showAllClassPasswords ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        <span>{showAllClassPasswords ? 'Ẩn tất cả MK' : 'Hiện tất cả MK'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleExportClassOverviewExcel}
                        className="px-3 py-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                        title="Xuất bảng tổng quan kết quả cả lớp ra file Excel"
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5" />
                        <span>Xuất Excel tổng quan lớp</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsAddStudentOpen(true)}
                        className="px-3.5 py-1.5 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        <span>Thêm học sinh</span>
                      </button>
                    </>
                  ) : user ? (
                    <button
                      type="button"
                      onClick={() =>
                        handleExportStudentLearningExcel({
                          id: user.id,
                          name: user.fullName || user.name || 'Học sinh',
                          studentCode: user.studentCode,
                          email: user.email,
                          username: user.username,
                        })
                      }
                      className="px-3.5 py-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                      title="Xuất kết quả học tập cá nhân của bạn ra file Excel"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      <span>Xuất Excel KQ học tập của tôi</span>
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 uppercase font-semibold border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-4">STT</th>
                      <th className="py-2.5 px-4">Họ và tên</th>
                      <th className="py-2.5 px-4 font-mono">Số báo danh / Mã HS</th>
                      <th className="py-2.5 px-4">Email</th>
                      {isTeacher && <th className="py-2.5 px-4 font-mono">Tên đăng nhập</th>}
                      {isTeacher && <th className="py-2.5 px-4 font-mono">Mật khẩu</th>}
                      <th className="py-2.5 px-4">Ngày tham gia</th>
                      {(isTeacher || Boolean(user)) && <th className="py-2.5 px-4 text-right">Thao tác</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {currentClass.students?.map((s, idx) => {
                      const rosterValues = Object.values(rosterAccountsByStudentId);
                      const rosterAcc =
                        rosterAccountsByStudentId[s.id] ||
                        rosterValues.find(
                          (r) =>
                            (s.email && r.email && r.email.toLowerCase() === s.email.toLowerCase()) ||
                            (s.studentCode &&
                              r.username &&
                              r.username.toLowerCase() ===
                                `hs_${s.studentCode.toLowerCase().replace(/[^a-z0-9]/g, '')}`)
                        );
                      const linkedAcc = allUsersList.find(
                        (u) =>
                          u.id === s.id ||
                          u.uid === s.id ||
                          (s.email && u.email.toLowerCase() === s.email.toLowerCase()) ||
                          (s.studentCode && u.studentCode?.toUpperCase() === s.studentCode.toUpperCase())
                      );
                      const displayUsername =
                        rosterAcc?.username ||
                        linkedAcc?.username ||
                        `hs_${s.studentCode.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
                      const visibleStudentPwd =
                        rosterAcc?.visiblePassword ||
                        (isMasterAdmin || linkedAcc?.role !== 'teacher' ? linkedAcc?.visiblePassword : undefined);
                      const isPwdRevealed = showAllClassPasswords || Boolean(revealedStudentPasswordIds[s.id]);
                      const isSelfRow = Boolean(
                        user &&
                          (s.id === user.id ||
                            (user.email && s.email && s.email.toLowerCase() === user.email.toLowerCase()) ||
                            (user.studentCode &&
                              s.studentCode &&
                              s.studentCode.toUpperCase() === user.studentCode.toUpperCase()))
                      );

                      return (
                        <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                          <td className="py-2.5 px-4 font-mono text-slate-400">{idx + 1}</td>
                          <td className="py-2.5 px-4">
                            <div className="font-bold text-slate-900">
                              {s.name}
                              {isSelfRow && !isTeacher && (
                                <span className="ml-2 px-1.5 py-0.5 text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 rounded">
                                  Bạn
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-4 font-mono font-semibold text-blue-700">{s.studentCode}</td>
                          <td className="py-2.5 px-4 text-slate-600 font-mono">{s.email || '—'}</td>
                          {isTeacher && (
                            <td className="py-2.5 px-4">
                              <span className="font-mono bg-slate-100 text-slate-800 font-semibold px-2 py-1 rounded border border-slate-200">
                                {displayUsername}
                              </span>
                            </td>
                          )}
                          {isTeacher && (
                            <td className="py-2.5 px-4">
                              {visibleStudentPwd ? (
                                <div className="inline-flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1">
                                  <span className="font-mono font-bold text-slate-900 select-all">
                                    {isPwdRevealed ? visibleStudentPwd : '••••••••'}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setRevealedStudentPasswordIds((prev) => ({
                                        ...prev,
                                        [s.id]: !isPwdRevealed,
                                      }))
                                    }
                                    className="p-0.5 text-slate-500 hover:text-slate-900 cursor-pointer"
                                    title={isPwdRevealed ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                                  >
                                    {isPwdRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleCopyText(visibleStudentPwd, `stu_pwd_${s.id}`)}
                                    className="p-0.5 text-slate-500 hover:text-emerald-700 cursor-pointer"
                                    title="Sao chép mật khẩu"
                                  >
                                    {copiedId === `stu_pwd_${s.id}` ? (
                                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                                    ) : (
                                      <Copy className="w-3.5 h-3.5" />
                                    )}
                                  </button>
                                </div>
                              ) : rosterAcc?.isGoogleOnly ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 text-[11px] font-medium">
                                  Đăng nhập Google
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200 text-[11px]">
                                  <Lock className="w-3 h-3" />
                                  <span>Chưa đồng bộ</span>
                                </span>
                              )}
                            </td>
                          )}
                          <td className="py-2.5 px-4 text-slate-500 font-mono">{s.joinedAt}</td>
                          {(isTeacher || Boolean(user)) && (
                            <td className="py-2.5 px-4 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {(isTeacher || isSelfRow) && (
                                  <button
                                    type="button"
                                    onClick={() => handleExportStudentLearningExcel(s)}
                                    className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded text-[11px] font-semibold transition-colors flex items-center gap-1 cursor-pointer"
                                    title={`Xuất file Excel kết quả học tập của ${s.name}`}
                                  >
                                    <FileSpreadsheet className="w-3 h-3 text-emerald-700" />
                                    <span>{isTeacher ? 'Xuất KQ Excel' : 'Xuất KQ của tôi'}</span>
                                  </button>
                                )}
                                {isTeacher && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => handleQuickResetStudentPassword(s, visibleStudentPwd)}
                                      className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded text-[11px] font-semibold transition-colors flex items-center gap-1 cursor-pointer"
                                      title="Cấp mật khẩu 8 ký tự mới gồm Hoa, Thường, Số và Ký tự đặc biệt"
                                    >
                                      <Key className="w-3 h-3 text-amber-600" />
                                      <span>Cấp lại MK</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteStudent(s)}
                                      className="text-slate-400 hover:text-rose-600 transition-colors p-1 cursor-pointer"
                                      title="Xóa học sinh này khỏi lớp"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 5: PENDING JOIN REQUESTS */}
          {activeTab === 'requests' && (() => {
            const activePendingRequests = getActivePendingRequests(currentClass);
            return (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <Inbox className="w-4 h-4 text-amber-500" />
                      <span>Danh sách Yêu cầu tham gia Lớp học ({activePendingRequests.length})</span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Học sinh chỉ cần được duyệt 1 lần; sau khi duyệt sẽ tự động vào lớp ngay lập tức.
                    </p>
                  </div>
                </div>

                {activePendingRequests.length === 0 ? (
                  <div className="py-12 text-center text-xs text-slate-500 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    <Inbox className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="font-semibold text-slate-700">Hiện không có yêu cầu nào đang chờ duyệt</p>
                    <p className="text-slate-400 mt-1">
                      Cung cấp mã lớp <span className="font-mono font-bold text-slate-800">{currentClass.code}</span> cho học sinh hoặc dùng nút <strong>Thêm học sinh</strong> để thêm trực tiếp tài khoản có sẵn vào lớp.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-600 uppercase font-semibold border-b border-slate-200">
                        <tr>
                          <th className="py-2.5 px-4">STT</th>
                          <th className="py-2.5 px-4">Học sinh</th>
                          <th className="py-2.5 px-4">Email</th>
                          <th className="py-2.5 px-4">Thời gian gửi</th>
                          <th className="py-2.5 px-4">Ghi chú từ học sinh</th>
                          <th className="py-2.5 px-4">Trạng thái</th>
                          <th className="py-2.5 px-4 text-right">Phê duyệt</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {activePendingRequests.map((req, idx) => (
                        <tr key={req.id} className="hover:bg-slate-50">
                          <td className="py-3 px-4 font-mono text-slate-400">{idx + 1}</td>
                          <td className="py-3 px-4">
                            <span className="font-bold text-slate-900 block">{req.studentName}</span>
                            <span className="text-[11px] font-mono text-blue-700">{req.studentCode || 'Chưa có SBD'}</span>
                          </td>
                          <td className="py-3 px-4 text-slate-600">{req.studentEmail}</td>
                          <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">
                            {new Date(req.createdAt).toLocaleString('vi-VN')}
                          </td>
                          <td className="py-3 px-4 text-slate-700 max-w-[200px] truncate">
                            {req.note || '—'}
                          </td>
                          <td className="py-3 px-4">
                            <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                              Chờ duyệt
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => handleReviewJoin(req.id, 'approve')}
                                className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs transition-colors flex items-center gap-1 cursor-pointer"
                              >
                                <CheckCircle className="w-3.5 h-3.5" />
                                <span>Duyệt</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleReviewJoin(req.id, 'reject')}
                                className="px-2.5 py-1 bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 rounded-lg font-semibold text-xs transition-colors cursor-pointer"
                              >
                                Từ chối
                              </button>
                            </div>
                          </td>
                        </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })()}

          {/* TAB 6: ALL ACCOUNTS & PASSWORDS (MASTER ADMIN ONLY) */}
          {activeTab === 'all_accounts' && isMasterAdmin && (
            <div className="bg-white rounded-2xl border-2 border-purple-200 p-6 shadow-sm space-y-6">
              {/* Header */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-purple-100 bg-purple-50/50 p-4 rounded-xl">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 bg-purple-900 text-amber-400 rounded-lg">
                      <Crown className="w-5 h-5" />
                    </span>
                    <h3 className="text-base font-extrabold text-slate-900">
                      Bảng Quản Trị Tối Cao — Toàn Bộ Tài Khoản & Mật Khẩu
                    </h3>
                    <span className="px-2 py-0.5 rounded text-[11px] font-extrabold bg-amber-400 text-slate-950 uppercase tracking-wide">
                      Super Admin
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1">
                    Chỉ hiển thị cho tài khoản Quản trị viên tối cao (<code className="font-mono text-purple-900 font-bold">{MASTER_ADMIN_EMAIL}</code>). 
                    Mật khẩu được mã hóa bảo mật trên máy chủ Backend; QTV có toàn quyền xem mật khẩu, cấp lại mật khẩu 8 ký tự mới và phân quyền người dùng.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAllAdminPasswords((v) => !v)}
                    className="px-3 py-1.5 text-xs font-bold text-purple-900 bg-purple-100 hover:bg-purple-200 rounded-lg border border-purple-300 transition-colors cursor-pointer flex items-center gap-1.5"
                    title={showAllAdminPasswords ? 'Ẩn tất cả mật khẩu' : 'Hiển thị tất cả mật khẩu'}
                  >
                    {showAllAdminPasswords ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    <span>{showAllAdminPasswords ? 'Ẩn tất cả MK' : 'Hiện tất cả MK'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void refreshAdminUsersFromBackend().then(() => {
                        setSaveToast('✓ Đã đồng bộ mới nhất toàn bộ danh sách tài khoản từ Backend!');
                        setTimeout(() => setSaveToast(null), 3000);
                      });
                    }}
                    className="px-3 py-1.5 text-xs font-bold text-slate-700 hover:text-purple-700 bg-white hover:bg-slate-50 rounded-lg border border-slate-300 transition-colors cursor-pointer flex items-center gap-1.5"
                    title="Làm mới dữ liệu"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Làm mới từ Backend</span>
                  </button>
                </div>
              </div>

              {/* 4 Stats Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Tổng tài khoản</div>
                  <div className="text-2xl font-extrabold font-mono text-slate-900 mt-1">{allUsersList.length}</div>
                </div>
                <div className="p-4 rounded-xl bg-purple-50 border border-purple-200">
                  <div className="text-[11px] font-semibold text-purple-700 uppercase tracking-wide">Giáo viên tổ chức</div>
                  <div className="text-2xl font-extrabold font-mono text-purple-900 mt-1">
                    {allUsersList.filter(u => u.role === 'teacher').length}
                  </div>
                </div>
                <div className="p-4 rounded-xl bg-blue-50 border border-blue-200">
                  <div className="text-[11px] font-semibold text-blue-700 uppercase tracking-wide">Học sinh</div>
                  <div className="text-2xl font-extrabold font-mono text-blue-900 mt-1">
                    {allUsersList.filter(u => u.role === 'student').length}
                  </div>
                </div>
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200">
                  <div className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wide">Tổng lớp học</div>
                  <div className="text-2xl font-extrabold font-mono text-emerald-900 mt-1">
                    {classrooms.length}
                  </div>
                </div>
              </div>

              {/* Filter & Search Toolbar */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                <div className="flex items-center gap-1.5 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => setAccountFilter('all')}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                      accountFilter === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Tất cả ({allUsersList.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setAccountFilter('teacher')}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                      accountFilter === 'teacher' ? 'bg-purple-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Giáo viên ({allUsersList.filter(u => u.role === 'teacher').length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setAccountFilter('student')}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                      accountFilter === 'student' ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Học sinh ({allUsersList.filter(u => u.role === 'student').length})
                  </button>
                </div>

                <div className="relative w-full sm:w-72">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={accountSearch}
                    onChange={(e) => setAccountSearch(e.target.value)}
                    placeholder="Tìm theo tên, email, tên đăng nhập..."
                    className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:bg-white"
                  />
                </div>
              </div>

              {/* Accounts Table */}
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100/80 text-slate-700 uppercase font-bold border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4">STT</th>
                      <th className="py-3 px-4">Họ và tên & Email</th>
                      <th className="py-3 px-4 font-mono">Tên đăng nhập</th>
                      <th className="py-3 px-4 font-mono">Mật khẩu</th>
                      <th className="py-3 px-4">Trường / Tổ chức</th>
                      <th className="py-3 px-4">Vai trò & Phân quyền</th>
                      <th className="py-3 px-4 text-right">Cấp lại Mật khẩu</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredAccounts.map((acc, idx) => {
                      const isSuper = acc.isMasterAdmin || acc.email.toLowerCase() === MASTER_ADMIN_EMAIL.toLowerCase();
                      const isPwdRevealed = showAllAdminPasswords || Boolean(revealedAdminPasswordIds[acc.id]);

                      return (
                        <tr key={acc.id} className="hover:bg-purple-50/30 transition-colors">
                          <td className="py-3 px-4 font-mono text-slate-400">{idx + 1}</td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-full bg-slate-900 text-white font-bold flex items-center justify-center text-xs shrink-0">
                                {(acc.fullName || acc.name || acc.username || '?').charAt(0)}
                              </div>
                              <div>
                                <div className="font-bold text-slate-900 flex items-center gap-1.5">
                                  <span>{acc.fullName || acc.name || acc.username}</span>
                                  {isSuper && (
                                    <span className="p-0.5 bg-amber-400 text-slate-950 rounded text-[9px] font-extrabold">
                                      ADMIN
                                    </span>
                                  )}
                                </div>
                                <div className="text-slate-500 font-mono text-[11px] flex items-center gap-1.5">
                                  <span>{acc.email}</span>
                                </div>
                              </div>
                            </div>
                          </td>

                          <td className="py-3 px-4">
                            <span className="font-mono bg-slate-100 text-slate-900 font-bold px-2.5 py-1 rounded border border-slate-300">
                              {acc.username || acc.email.split('@')[0]}
                            </span>
                          </td>

                          <td className="py-3 px-4">
                            {acc.visiblePassword ? (
                              <div className="inline-flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1">
                                <span className="font-mono font-bold text-slate-900 select-all">
                                  {isPwdRevealed ? acc.visiblePassword : '••••••••'}
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setRevealedAdminPasswordIds((prev) => ({
                                      ...prev,
                                      [acc.id]: !isPwdRevealed,
                                    }))
                                  }
                                  className="p-0.5 text-slate-500 hover:text-slate-900 cursor-pointer"
                                  title={isPwdRevealed ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                                >
                                  {isPwdRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleCopyText(acc.visiblePassword!, `adm_pwd_${acc.id}`)}
                                  className="p-0.5 text-slate-500 hover:text-emerald-700 cursor-pointer"
                                  title="Sao chép mật khẩu"
                                >
                                  {copiedId === `adm_pwd_${acc.id}` ? (
                                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                                  ) : (
                                    <Copy className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              </div>
                            ) : acc.isGoogleAuth ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-100 text-slate-600 border border-slate-200 text-[11px] font-medium">
                                Đăng nhập Google
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-100 text-slate-500 border border-slate-200 text-[11px]">
                                <Lock className="w-3 h-3" />
                                <span>Chưa đồng bộ (đăng nhập lại)</span>
                              </span>
                            )}
                          </td>

                          <td className="py-3 px-4 text-slate-600 text-xs">
                            {acc.school || acc.schoolOrOrg || 'Hệ thống EduTest'}
                          </td>

                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                acc.role === 'teacher'
                                  ? 'bg-purple-100 text-purple-900 border-purple-300'
                                  : 'bg-blue-100 text-blue-900 border-blue-300'
                              }`}>
                                {acc.role === 'teacher' ? 'Giáo viên' : 'Học sinh'}
                              </span>

                              {!isSuper && (
                                <button
                                  type="button"
                                  onClick={() => handleAdminToggleRole(acc)}
                                  className="text-[10px] text-slate-500 hover:text-purple-700 underline cursor-pointer"
                                  title="Chuyển đổi phân quyền Giáo viên <-> Học sinh"
                                >
                                  Đổi quyền
                                </button>
                              )}
                            </div>
                          </td>

                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleAdminResetAccountPassword(acc)}
                                className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-lg transition-colors inline-flex items-center gap-1 cursor-pointer text-xs shadow-xs"
                                title="Tạo mật khẩu 8 ký tự mới gồm chữ Hoa, thường, số và ký tự đặc biệt"
                              >
                                <Sparkles className="w-3 h-3" />
                                <span>Cấp MK 8 ký tự</span>
                              </button>
                              {!isSuper && (
                                <button
                                  type="button"
                                  onClick={() => handleAdminDeleteAccount(acc)}
                                  className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg border border-rose-200 transition-colors cursor-pointer"
                                  title="Xóa tài khoản học sinh / giáo viên này"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ) : activeTab === 'all_accounts' && isMasterAdmin ? (
        <div className="bg-white rounded-2xl border-2 border-purple-200 p-6 shadow-sm space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-purple-100 bg-purple-50/50 p-4 rounded-xl">
            <div>
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-purple-900 text-amber-400 rounded-lg">
                  <Crown className="w-5 h-5" />
                </span>
                <h3 className="text-base font-extrabold text-slate-900">
                  Bảng Quản Trị Tối Cao — Toàn Bộ Tài Khoản & Mật Khẩu
                </h3>
                <span className="px-2 py-0.5 rounded text-[11px] font-extrabold bg-amber-400 text-slate-950 uppercase tracking-wide">
                  Super Admin
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-1">
                Chỉ hiển thị cho Quản trị viên tối cao (<code className="font-mono text-purple-900 font-bold">{MASTER_ADMIN_EMAIL}</code>).
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowAllAdminPasswords((v) => !v)}
                className="px-3 py-1.5 text-xs font-bold text-purple-900 bg-purple-100 hover:bg-purple-200 rounded-lg border border-purple-300 transition-colors cursor-pointer flex items-center gap-1.5"
              >
                {showAllAdminPasswords ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                <span>{showAllAdminPasswords ? 'Ẩn tất cả MK' : 'Hiện tất cả MK'}</span>
              </button>
              <button
                type="button"
                onClick={() => void refreshAdminUsersFromBackend()}
                className="px-3 py-1.5 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 rounded-lg border border-slate-300 transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Làm mới từ Backend</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100/80 text-slate-700 uppercase font-bold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">STT</th>
                  <th className="py-3 px-4">Họ và tên & Email</th>
                  <th className="py-3 px-4 font-mono">Tên đăng nhập</th>
                  <th className="py-3 px-4 font-mono">Mật khẩu</th>
                  <th className="py-3 px-4">Vai trò</th>
                  <th className="py-3 px-4 text-right">Cấp lại Mật khẩu</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAccounts.map((acc, idx) => {
                  const isSuper = acc.isMasterAdmin || acc.email.toLowerCase() === MASTER_ADMIN_EMAIL.toLowerCase();
                  const isPwdRevealed = showAllAdminPasswords || Boolean(revealedAdminPasswordIds[acc.id]);
                  return (
                    <tr key={acc.id} className="hover:bg-purple-50/30 transition-colors">
                      <td className="py-3 px-4 font-mono text-slate-400">{idx + 1}</td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">{acc.fullName || acc.name || acc.username}</div>
                        <div className="text-slate-500 font-mono text-[11px]">{acc.email}</div>
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-slate-800">{acc.username || acc.email.split('@')[0]}</td>
                      <td className="py-3 px-4">
                        {acc.visiblePassword ? (
                          <div className="inline-flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1">
                            <span className="font-mono font-bold text-slate-900 select-all">
                              {isPwdRevealed ? acc.visiblePassword : '••••••••'}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setRevealedAdminPasswordIds((prev) => ({
                                  ...prev,
                                  [acc.id]: !isPwdRevealed,
                                }))
                              }
                              className="p-0.5 text-slate-500 hover:text-slate-900 cursor-pointer"
                            >
                              {isPwdRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleCopyText(acc.visiblePassword!, `adm2_pwd_${acc.id}`)}
                              className="p-0.5 text-slate-500 hover:text-emerald-700 cursor-pointer"
                            >
                              {copiedId === `adm2_pwd_${acc.id}` ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        ) : (
                          <span className="text-slate-500 text-[11px]">{acc.isGoogleAuth ? 'Đăng nhập Google' : 'Chưa đồng bộ'}</span>
                        )}
                      </td>
                      <td className="py-3 px-4">{acc.role === 'teacher' ? 'Giáo viên' : 'Học sinh'}</td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => handleAdminResetAccountPassword(acc)}
                          className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-lg text-xs cursor-pointer"
                        >
                          Cấp MK 8 ký tự
                        </button>
                        {!isSuper && (
                          <button
                            type="button"
                            onClick={() => handleAdminDeleteAccount(acc)}
                            className="ml-1.5 p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg border border-rose-200 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* MODAL: CREATE CLASSROOM */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              Tạo Lớp học mới
            </h3>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Tên lớp học <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={newClassName}
                onChange={(e) => setNewClassName(e.target.value)}
                placeholder="Nhập tên lớp học..."
                className="w-full px-3 py-2 text-xs border rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Khối lớp</label>
                <input
                  type="text"
                  value={newClassGrade}
                  onChange={(e) => setNewClassGrade(e.target.value)}
                  placeholder="Nhập khối lớp..."
                  className="w-full px-3 py-2 text-xs border rounded-lg focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Giáo viên phụ trách</label>
                <input
                  type="text"
                  value={newClassTeacher}
                  onChange={(e) => setNewClassTeacher(e.target.value)}
                  placeholder="Nhập tên giáo viên phụ trách..."
                  className="w-full px-3 py-2 text-xs border rounded-lg focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Mô tả lớp</label>
              <textarea
                rows={2}
                value={newClassDesc}
                onChange={(e) => setNewClassDesc(e.target.value)}
                placeholder="Mục tiêu ôn tập, đối tượng..."
                className="w-full px-3 py-2 text-xs border rounded-lg focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Giao sẵn các đề thi cho lớp này:
              </label>
              <div className="max-h-28 overflow-y-auto border rounded-lg p-2 space-y-1.5 text-xs">
                {selectableExamsForTeacher.length === 0 ? (
                  <div className="text-slate-400 text-center py-2">Chưa có đề thi khả dụng.</div>
                ) : (
                  selectableExamsForTeacher.map((ex) => (
                    <label key={ex.id} className="flex items-center gap-2 cursor-pointer p-1 hover:bg-slate-50 rounded">
                      <input
                        type="checkbox"
                        checked={selectedExamIdsForNewClass.includes(ex.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedExamIdsForNewClass([...selectedExamIdsForNewClass, ex.id]);
                          } else {
                            setSelectedExamIdsForNewClass(selectedExamIdsForNewClass.filter((id) => id !== ex.id));
                          }
                        }}
                        className="rounded text-blue-600"
                      />
                      <span className="truncate">{ex.title}</span>
                    </label>
                  ))
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Giao sẵn các khóa học cho lớp này:
              </label>
              <div className="max-h-28 overflow-y-auto border rounded-lg p-2 space-y-1.5 text-xs">
                {selectableCoursesForTeacher.length === 0 ? (
                  <div className="text-slate-400 text-center py-2">Chưa có khóa học khả dụng.</div>
                ) : (
                  selectableCoursesForTeacher.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 cursor-pointer p-1 hover:bg-slate-50 rounded">
                      <input
                        type="checkbox"
                        checked={selectedCourseIdsForNewClass.includes(c.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedCourseIdsForNewClass([...selectedCourseIdsForNewClass, c.id]);
                          } else {
                            setSelectedCourseIdsForNewClass(selectedCourseIdsForNewClass.filter((id) => id !== c.id));
                          }
                        }}
                        className="rounded text-teal-600"
                      />
                      <span className="truncate font-medium">{c.title} ({c.grade})</span>
                    </label>
                  ))
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleCreateClass}
                className="px-5 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg cursor-pointer"
              >
                Tạo lớp ngay
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ASSIGN COURSES TO CLASSROOM */}
      {isAssignCoursesModalOpen && currentClass && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <GraduationCap className="w-5 h-5 text-teal-600" />
                <span>Quản lý Khóa học của lớp {currentClass.name}</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsAssignCoursesModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Chọn các khóa học lý thuyết và câu hỏi tương tác để giao cho học sinh trong lớp học này:
            </p>

            <div className="max-h-60 overflow-y-auto border rounded-xl p-3 space-y-2 text-xs">
              {selectableCoursesForTeacher.length === 0 ? (
                <div className="text-slate-400 text-center py-4">Chưa có khóa học khả dụng để gán vào lớp.</div>
              ) : (
                selectableCoursesForTeacher.map((course) => {
                  const isChecked = tempAssignedCourseIds.includes(course.id);
                  return (
                    <label
                      key={course.id}
                      className={`flex items-start gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                        isChecked ? 'bg-teal-50/70 border-teal-300' : 'bg-white border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setTempAssignedCourseIds([...tempAssignedCourseIds, course.id]);
                          } else {
                            setTempAssignedCourseIds(tempAssignedCourseIds.filter((id) => id !== course.id));
                          }
                        }}
                        className="mt-0.5 rounded text-teal-600"
                      />
                      <div className="flex-1">
                        <div className="font-bold text-slate-900">{course.title}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {course.grade} · {(course.chapters && course.chapters.length > 0 ? course.chapters.length : course.chapterCount) ?? 0} chương · Giảng viên: {course.instructor}
                        </div>
                      </div>
                    </label>
                  );
                })
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsAssignCoursesModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleSaveAssignedCourses}
                className="px-5 py-2 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-lg cursor-pointer shadow-xs"
              >
                Lưu phân công khóa học
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADD STUDENT (CHỌN TÀI KHOẢN CÓ SẴN HOẶC TẠO MỚI) */}
      {isAddStudentOpen && currentClass && (() => {
        const currentMemberIds = new Set(
          (currentClass.students || []).map((s) => String(s?.id || '').trim()).filter(Boolean)
        );
        const currentMemberEmails = new Set(
          (currentClass.students || []).map((s) => String(s?.email || '').trim().toLowerCase()).filter(Boolean)
        );
        const currentMemberCodes = new Set(
          (currentClass.students || []).map((s) => String(s?.studentCode || '').trim().toUpperCase()).filter(Boolean)
        );

        const isAlreadyEnrolled = (acc: UserAccount) => {
          const id = acc.uid || acc.id;
          const email = (acc.email || '').trim().toLowerCase();
          const code = (acc.studentCode || '').trim().toUpperCase();
          return (
            currentMemberIds.has(id) ||
            (Boolean(email) && currentMemberEmails.has(email)) ||
            (Boolean(code) && currentMemberCodes.has(code))
          );
        };

        const searchQ = existingStudentSearch.trim().toLowerCase();
        const filteredDirectory = existingStudentDirectory.filter((acc) => {
          if (!searchQ) return true;
          return (
            (acc.fullName || '').toLowerCase().includes(searchQ) ||
            (acc.name || '').toLowerCase().includes(searchQ) ||
            (acc.email || '').toLowerCase().includes(searchQ) ||
            (acc.username || '').toLowerCase().includes(searchQ) ||
            (acc.studentCode || '').toLowerCase().includes(searchQ)
          );
        });

        const selectableAccounts = filteredDirectory.filter((acc) => !isAlreadyEnrolled(acc));

        return (
          <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-2xl w-full p-5 sm:p-6 shadow-xl border border-slate-200 space-y-4 max-h-[90vh] flex flex-col">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Thêm học sinh vào lớp &quot;{currentClass.name}&quot;
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Chọn tài khoản học sinh có sẵn để vào lớp ngay lập tức, hoặc tạo tài khoản mới.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAddStudentOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer shrink-0"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              {/* 2 Mode Tabs */}
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-xl shrink-0">
                <button
                  type="button"
                  onClick={() => setAddStudentMode('existing')}
                  className={`py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap ${
                    addStudentMode === 'existing'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <UserCheck className="w-3.5 h-3.5 shrink-0" />
                  <span>Chọn tài khoản có sẵn ({existingStudentDirectory.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAddStudentMode('create')}
                  className={`py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap ${
                    addStudentMode === 'create'
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <UserPlus className="w-3.5 h-3.5 shrink-0" />
                  <span>Tạo tài khoản mới</span>
                </button>
              </div>

              {addStudentMode === 'existing' ? (
                <div className="flex-1 min-h-0 flex flex-col space-y-3">
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <div className="relative flex-1 min-w-[200px]">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={existingStudentSearch}
                        onChange={(e) => setExistingStudentSearch(e.target.value)}
                        placeholder="Tìm theo họ tên, email, @username hoặc SBD..."
                        className="w-full pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                    {selectableAccounts.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          const allSelectableIds = selectableAccounts.map((a) => a.uid || a.id);
                          const allChosen = allSelectableIds.every((id) =>
                            selectedExistingStudentIds.includes(id)
                          );
                          setSelectedExistingStudentIds(allChosen ? [] : allSelectableIds);
                        }}
                        className="px-3 py-2 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-xl border border-blue-200 cursor-pointer whitespace-nowrap shrink-0"
                      >
                        {selectableAccounts.every((a) =>
                          selectedExistingStudentIds.includes(a.uid || a.id)
                        )
                          ? 'Bỏ chọn tất cả'
                          : `Chọn tất cả (${selectableAccounts.length})`}
                      </button>
                    )}
                  </div>

                  <div className="flex-1 min-h-[220px] max-h-[340px] overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 bg-slate-50/40">
                    {isLoadingStudentDirectory && existingStudentDirectory.length === 0 ? (
                      <div className="py-12 text-center text-xs text-slate-500">
                        Đang tải danh sách tài khoản học sinh từ Cloud...
                      </div>
                    ) : filteredDirectory.length === 0 ? (
                      <div className="py-10 text-center text-xs text-slate-500 space-y-2 px-4">
                        <p className="font-semibold text-slate-700">
                          {existingStudentDirectory.length === 0
                            ? 'Chưa tìm thấy tài khoản học sinh nào đã đăng ký.'
                            : 'Không có tài khoản học sinh nào khớp với từ khóa tìm kiếm.'}
                        </p>
                        <button
                          type="button"
                          onClick={() => setAddStudentMode('create')}
                          className="px-3 py-1.5 bg-blue-600 text-white font-bold rounded-lg text-xs cursor-pointer"
                        >
                          + Chuyển sang Tạo tài khoản mới
                        </button>
                      </div>
                    ) : (
                      filteredDirectory.map((acc) => {
                        const accKey = acc.uid || acc.id;
                        const enrolled = isAlreadyEnrolled(acc);
                        const checked = selectedExistingStudentIds.includes(accKey);

                        return (
                          <div
                            key={accKey}
                            className={`p-3 flex items-center justify-between gap-3 transition-colors ${
                              enrolled
                                ? 'bg-emerald-50/40 opacity-80'
                                : checked
                                ? 'bg-blue-50/70'
                                : 'bg-white hover:bg-slate-50'
                            }`}
                          >
                            <label
                              className={`flex items-center gap-3 flex-1 min-w-0 ${
                                enrolled ? 'cursor-default' : 'cursor-pointer'
                              }`}
                            >
                              <input
                                type="checkbox"
                                disabled={enrolled}
                                checked={enrolled || checked}
                                onChange={() => {
                                  if (enrolled) return;
                                  setSelectedExistingStudentIds((prev) =>
                                    prev.includes(accKey)
                                      ? prev.filter((x) => x !== accKey)
                                      : [...prev, accKey]
                                  );
                                }}
                                className="w-4 h-4 rounded accent-blue-600 shrink-0"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="font-bold text-xs text-slate-900 truncate">
                                    {acc.fullName || acc.name || acc.username}
                                  </span>
                                  {acc.studentCode && (
                                    <span className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 font-mono text-[10px] font-semibold text-slate-700">
                                      {acc.studentCode}
                                    </span>
                                  )}
                                  <span className="font-mono text-[10px] text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">
                                    @{acc.username}
                                  </span>
                                </div>
                                <div className="text-[11px] text-slate-500 truncate mt-0.5">
                                  {acc.email}
                                </div>
                              </div>
                            </label>

                            {enrolled ? (
                              <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 border border-emerald-200 text-[11px] font-bold whitespace-nowrap shrink-0 flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>Đã trong lớp</span>
                              </span>
                            ) : (
                              <button
                                type="button"
                                disabled={isAddingExistingStudents}
                                onClick={() => void handleAddExistingStudents([acc])}
                                className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-[11px] font-bold whitespace-nowrap shrink-0 cursor-pointer"
                              >
                                + Thêm ngay
                              </button>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 shrink-0">
                    <span className="text-[11px] text-slate-500">
                      Đã chọn <strong className="text-blue-700">{selectedExistingStudentIds.length}</strong> học sinh (tự động vào lớp ngay)
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setIsAddStudentOpen(false)}
                        className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer whitespace-nowrap"
                      >
                        Đóng
                      </button>
                      <button
                        type="button"
                        disabled={selectedExistingStudentIds.length === 0 || isAddingExistingStudents}
                        onClick={() => void handleAddExistingStudents()}
                        className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg cursor-pointer whitespace-nowrap"
                      >
                        {isAddingExistingStudents
                          ? 'Đang thêm...'
                          : `Thêm ${selectedExistingStudentIds.length} học sinh vào lớp`}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Họ và tên học sinh <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={newStudentName}
                      onChange={(e) => setNewStudentName(e.target.value)}
                      placeholder="Nhập họ và tên học sinh..."
                      className="w-full px-3 py-2 text-xs border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Số báo danh / Mã học sinh
                    </label>
                    <input
                      type="text"
                      value={newStudentCode}
                      onChange={(e) => setNewStudentCode(e.target.value)}
                      placeholder="Nhập SBD hoặc mã học sinh..."
                      className="w-full px-3 py-2 text-xs border rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Email (Tùy chọn)
                    </label>
                    <input
                      type="email"
                      value={newStudentEmail}
                      onChange={(e) => setNewStudentEmail(e.target.value)}
                      placeholder="Nhập email học sinh..."
                      className="w-full px-3 py-2 text-xs border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setIsAddStudentOpen(false)}
                      className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                    >
                      Hủy
                    </button>
                    <button
                      type="button"
                      onClick={handleAddStudent}
                      className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg cursor-pointer"
                    >
                      Tạo &amp; Thêm vào lớp
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Sticky Bottom Action Bar with In-Place Save */}
      <div className="sticky bottom-0 z-30 bg-white/95 backdrop-blur-md border-t border-slate-200 py-3 px-4 sm:px-6 shadow-lg flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {saveToast ? (
            <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200 animate-in fade-in duration-150">
              {saveToast}
            </span>
          ) : (
            <span className="text-xs text-slate-500 hidden sm:inline">
              Mọi thay đổi danh sách học sinh và phân công đề sẽ được cập nhật đồng bộ.
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isTeacher && (
            <button
              onClick={handleSaveClassroomData}
              className="py-2.5 px-5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>Lưu dữ liệu lớp học tại đây</span>
            </button>
          )}
        </div>
      </div>
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText={confirmModal.confirmText}
        onConfirm={confirmModal.onConfirm}
        onClose={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};
