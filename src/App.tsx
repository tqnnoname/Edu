import React, { useState, useMemo, useEffect } from 'react';
import { 
  Exam, 
  ExamBundle, 
  ExamResult, 
  SubjectType, 
  UserRole, 
  Classroom, 
  MicroCourse, 
  CustomSubject, 
  NavTabItem,
  UserAccount,
  TeacherRoleRequest
} from './types/exam';
import { 
  getAllExams, 
  saveCustomExam, 
  deleteCustomExam, 
  getAllBundles,
  saveCustomBundle,
  deleteCustomBundle, 
  getExamResults, 
  saveExamResult, 
  deleteExamResult,
  clearExamResults,
  deleteAllExams,
  clearLiveTextOverrides,
  getAllClassrooms,
  getAllCourses,
  getAllSubjects,
  getNavTabs,
  getActiveClassId,
  setActiveClassId,
  instantiateExamWithRandomQuestions,
  getCandidateProfile,
  saveCandidateProfile,
  getCurrentUser,
  setCurrentUser,
  logoutUserAccount,
  getAllTeacherRequests,
  MASTER_ADMIN_EMAIL,
  isStudentMemberOfClass,
  isCreatorOfItem,
  canShowInPublicLibrary,
  canUserAccessProtectedItem,
  pullDataFromServer,
  triggerCloudSync,
  initAutoSyncLifecycle,
  subscribeCloudSyncStatus,
  exportAllDataAsJson,
  importAllDataFromJson,
  hasLocalCachedLibraryData,
  syncUserSessionFromFirebaseAuth,
  buildOptimisticUserFromFirebase,
  isExamHiddenFromStudents
} from './utils/storage';
import {
  attachRealtimeFirestoreListeners,
  subscribeFirebaseAuthState,
  getFirebaseAuthUser,
} from './utils/firebase';
import { ExamCard } from './components/ExamCard';
import { BundleCard } from './components/BundleCard';
import { ExamTakingView } from './components/ExamTakingView';
import { ExamResultView } from './components/ExamResultView';
import { CustomExamCreator } from './components/CustomExamCreator';
import { BundleCreator } from './components/BundleCreator';
import { IntermissionBreakView } from './components/IntermissionBreakView';
import { BundleResultSummary } from './components/BundleResultSummary';
import { ElectiveClusterTakingView } from './components/ElectiveClusterTakingView';
import { ExamHistoryView } from './components/ExamHistoryView';
import { EditableText } from './components/EditableText';
import { ConfirmModal } from './components/ConfirmModal';
import { UnsavedChangesModal, type UnsavedNavigationGuard } from './components/UnsavedChangesModal';
import { ExamPreviewModal } from './components/ExamPreviewModal';
import { BundleElectiveSelectorModal } from './components/BundleElectiveSelectorModal';
import { ClassroomManagementView } from './components/ClassroomManagementView';
import { MicroCoursesView } from './components/MicroCoursesView';
import { BattleArenaView } from './components/BattleArenaView';
import { TabAndSubjectManagerModal } from './components/TabAndSubjectManagerModal';
import { ExamAccessModal } from './components/ExamAccessModal';
import { FeedbackModal } from './components/FeedbackModal';
import { AuthModal } from './components/AuthModal';
import { LoginGateScreen } from './components/LoginGateScreen';
import { TeacherRequestModal } from './components/TeacherRequestModal';
import { TeacherRequestsAdminModal } from './components/TeacherRequestsAdminModal';
import { ChangePasswordModal } from './components/ChangePasswordModal';
import { StudentCompetencyView } from './components/StudentCompetencyView';
import { TeacherToolsView } from './components/TeacherToolsView';
import { ExamScorePresentationView } from './components/ExamScorePresentationView';
import { RoomLockGuard, tryEnterKioskFullscreen } from './components/RoomLockGuard';
import { exportExamToWord, exportResultsToExcel } from './utils/exportFiles';
import { 
  Search, 
  Plus, 
  Clock, 
  CheckCircle, 
  Sparkles, 
  Layers,
  Coffee,
  BookOpen,
  Edit3,
  RotateCcw,
  Trash2,
  ShieldCheck,
  ShieldAlert,
  GraduationCap,
  Eye,
  Users,
  Swords,
  SlidersHorizontal,
  BarChart3,
  KeyRound,
  MessageSquarePlus,
  Cloud,
  CloudCheck,
  Upload,
  Download,
  LogOut,
  UserCheck,
  Bell,
  Crown,
  ChevronDown,
  Code2,
  Menu,
  X,
  FileSpreadsheet,
  Link2,
  Check,
  Award,
  Lock
} from 'lucide-react';
import {
  buildAppUrlPath,
  buildNavTabPath,
  parsePathnameToRoute,
  type ClassroomTabRouteId,
} from './utils/urlRouter';
import type { CourseChapter, CourseLesson } from './types/exam';

type ViewState = 
  | 'home' 
  | 'taking' 
  | 'result' 
  | 'create' 
  | 'history'
  | 'bundle-create'
  | 'bundle-taking'
  | 'bundle-result'
  | 'classrooms'
  | 'courses'
  | 'battle'
  | 'analytics'
  | 'teacher-tools';

interface ActiveBundleState {
  bundle: ExamBundle;
  allSelectedExams: Exam[];
  compulsoryExams: Exam[];
  electiveExams: Exam[];
  currentCompulsoryIndex: number;
  results: ExamResult[];
  phase: 'compulsory_exam' | 'break_to_compulsory' | 'break_to_elective_cluster' | 'elective_cluster';
}

export default function App() {
  const [exams, setExams] = useState<Exam[]>(() => getAllExams());
  const [bundles, setBundles] = useState<ExamBundle[]>(() => getAllBundles());
  const [results, setResults] = useState<ExamResult[]>(() => getExamResults());
  const [classrooms, setClassrooms] = useState<Classroom[]>(() => getAllClassrooms());
  const [courses, setCourses] = useState<MicroCourse[]>(() => getAllCourses());
  const [subjects, setSubjects] = useState<CustomSubject[]>(() => getAllSubjects());
  const [navTabs, setNavTabs] = useState<NavTabItem[]>(() => getNavTabs());

  const initialParsedRoute = useMemo(() => {
    if (typeof window === 'undefined') {
      return { view: 'home' as ViewState, homeTab: 'single' as const, selectedSubject: 'all' };
    }
    return parsePathnameToRoute(window.location.pathname, {
      courses: getAllCourses(),
      classrooms: getAllClassrooms(),
      subjects: getAllSubjects(),
    });
  }, []);

  const [currentView, setCurrentView] = useState<ViewState>(initialParsedRoute.view);
  const [homeTab, setHomeTab] = useState<'single' | 'bundle'>(initialParsedRoute.homeTab || 'single');
  const [activeClassId, setActiveClassIdState] = useState<string>(
    () => initialParsedRoute.classroomId || getActiveClassId()
  );
  const [isTabAndSubjectModalOpen, setIsTabAndSubjectModalOpen] = useState(false);
  const [isExamAccessModalOpen, setIsExamAccessModalOpen] = useState(false);
  const [accessModalInitialCode, setAccessModalInitialCode] = useState('');
  const [candidateProfile, setCandidateProfile] = useState(() => getCandidateProfile());
  
  // Session-scoped auth
  const [currentUser, setCurrentUserAccount] = useState<UserAccount | null>(() => getCurrentUser());
  const [isInitialLoading, setIsInitialLoading] = useState<boolean>(() => !hasLocalCachedLibraryData());
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'register'>('login');
  const [isTeacherRequestModalOpen, setIsTeacherRequestModalOpen] = useState(false);
  const [isTeacherRequestsAdminModalOpen, setIsTeacherRequestsAdminModalOpen] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle');
  const [syncErrorMsg, setSyncErrorMsg] = useState<string | null>(null);
  const [syncToast, setSyncToast] = useState<string | null>(null);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [selectedCourseIdForView, setSelectedCourseIdForView] = useState<string>(
    initialParsedRoute.courseId || ''
  );
  const [urlCourseChapterSlug, setUrlCourseChapterSlug] = useState<string | undefined>(
    initialParsedRoute.courseChapterSlug
  );
  const [urlCourseLessonSlug, setUrlCourseLessonSlug] = useState<string | undefined>(
    initialParsedRoute.courseLessonSlug
  );
  const [courseRouteLocation, setCourseRouteLocation] = useState<{
    course: MicroCourse | null;
    chapter: CourseChapter | null;
    lesson: CourseLesson | null;
  }>({ course: null, chapter: null, lesson: null });
  const [urlClassroomTab, setUrlClassroomTab] = useState<ClassroomTabRouteId | undefined>(
    initialParsedRoute.classroomTab
  );
  const [classroomRouteLocation, setClassroomRouteLocation] = useState<{
    classroom: Classroom | null;
    tab?: ClassroomTabRouteId;
  }>({ classroom: null, tab: initialParsedRoute.classroomTab });
  const [copiedRouteLink, setCopiedRouteLink] = useState(false);
  const [presentingExamForStage, setPresentingExamForStage] = useState<Exam | null>(null);

  // Xác định quyền Giáo viên thực sự: chỉ tài khoản Master Admin hoặc tài khoản giáo viên đã được phê duyệt
  const isActualTeacher = Boolean(
    currentUser && (currentUser.role === 'teacher' || currentUser.email.toLowerCase() === MASTER_ADMIN_EMAIL.toLowerCase())
  );
  const isMasterAdmin = Boolean(
    currentUser && (currentUser.isMasterAdmin || currentUser.email.toLowerCase() === MASTER_ADMIN_EMAIL.toLowerCase())
  );

  // Role-based state (Phân quyền giáo viên và học sinh): Mặc định cho học sinh và khách chưa đăng nhập là 'student'
  const [userRole, setUserRole] = useState<UserRole>('student');

  // Initialize resilient auto-sync & Firebase Auth session check
  useEffect(() => {
    try {
      localStorage.removeItem('edutest_web_lock_v1');
    } catch {}
    initAutoSyncLifecycle();

    let unsubscribeFirestore: () => void = () => {};

    const syncAll = () => {
      if (!getCurrentUser()) {
        setIsInitialLoading(false);
        return;
      }
      pullDataFromServer()
        .then((pulled) => {
          if (pulled.success) {
            refreshAllData();
            const fbUser = getFirebaseAuthUser();
            if (fbUser && !fbUser.isAnonymous) {
              void syncUserSessionFromFirebaseAuth(fbUser)
                .then((latest) => {
                  if (latest) {
                    setCurrentUser(latest);
                    setCurrentUserAccount(latest);
                  }
                })
                .catch(() => {});
            }
          }
        })
        .catch(() => {
          // Resilient fallback
        })
        .finally(() => {
          setIsInitialLoading(false);
        });
    };

    const unsubscribeSyncState = subscribeCloudSyncStatus((state) => {
      setSyncStatus(state.status);
      setSyncErrorMsg(state.error || null);
    });

    syncAll();

    const unsubscribeAuth = subscribeFirebaseAuthState((fbUser) => {
      unsubscribeFirestore();
      unsubscribeFirestore = () => {};
      if (fbUser && !fbUser.isAnonymous) {
        // 0ms immediate optimistic workspace unlock
        const optimisticUser = buildOptimisticUserFromFirebase(fbUser);
        setCurrentUser(optimisticUser);
        setCurrentUserAccount(optimisticUser);
        setIsInitialLoading(false);
        syncAll();
        unsubscribeFirestore = attachRealtimeFirestoreListeners(
          optimisticUser,
          () => syncAll()
        );
        // Non-blocking background profile reconciliation
        void syncUserSessionFromFirebaseAuth(fbUser)
          .then((unified) => {
            if (unified) {
              setCurrentUserAccount(unified);
            }
          })
          .catch(() => {});
      } else {
        setCurrentUser(null);
        setCurrentUserAccount(null);
        setIsInitialLoading(false);
      }
    });

    const handleProfileSynced = (ev: Event) => {
      const detail = (ev as CustomEvent<UserAccount | null>).detail;
      if (detail) {
        setCurrentUserAccount(detail);
      }
    };
    window.addEventListener('edutest-auth-profile-synced', handleProfileSynced);

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        syncAll();
      }
    };
    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);

    const periodicSyncTimer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        syncAll();
      }
    }, 25000);

    const handleStorageSync = () => {
      refreshAllData();
    };
    window.addEventListener('storage', handleStorageSync);
    return () => {
      clearInterval(periodicSyncTimer);
      unsubscribeSyncState();
      unsubscribeAuth();
      unsubscribeFirestore();
      window.removeEventListener('edutest-auth-profile-synced', handleProfileSynced);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('storage', handleStorageSync);
    };
  }, []);

  // Sync role and candidateProfile when currentUser changes
  useEffect(() => {
    if (currentUser) {
      const isTeacher = currentUser.role === 'teacher' || currentUser.email.toLowerCase() === MASTER_ADMIN_EMAIL.toLowerCase();
      if (!isTeacher) {
        setUserRole('student');
        localStorage.setItem('edutest_user_role', 'student');
        setIsLiveEditMode(false);
      } else {
        const saved = localStorage.getItem('edutest_user_role') as UserRole;
        setUserRole(saved || 'teacher');
      }
      setCandidateProfile((prev) => ({
        fullName: currentUser.fullName || prev.fullName,
        studentCode: currentUser.studentCode || prev.studentCode,
        schoolName: currentUser.school || prev.schoolName,
      }));
    } else {
      setUserRole('student');
      localStorage.setItem('edutest_user_role', 'student');
      setIsLiveEditMode(false);
    }
  }, [currentUser]);

  const handleSwitchRole = (newRole: UserRole) => {
    // Chỉ duy nhất giáo viên thực sự mới được phép chuyển đổi góc nhìn preview giữa Giáo viên và Học sinh
    if (!isActualTeacher || newRole === userRole) return;
    const applySwitch = () => {
      setUserRole(newRole);
      localStorage.setItem('edutest_user_role', newRole);
      if (newRole === 'student') {
        setIsLiveEditMode(false);
        if (currentView === 'create' || currentView === 'bundle-create' || currentView === 'teacher-tools') {
          setEditingExam(null);
          setEditingBundle(null);
          setCurrentView('home');
        }
        setSyncToast('Đã bật Chế độ Trải nghiệm Học sinh — Bạn đang xem web đúng như học sinh nhìn thấy.');
      } else {
        setSyncToast('Đã quay lại Chế độ Giáo viên đầy đủ quyền soạn đề & quản lý lớp.');
      }
      setTimeout(() => setSyncToast(null), 3500);
    };

    if (newRole === 'student' && (currentView === 'create' || currentView === 'bundle-create' || currentView === 'teacher-tools')) {
      requestProtectedNavigate(applySwitch);
      return;
    }
    applySwitch();
  };

  const handleManualSync = async () => {
    setSyncStatus('syncing');
    setSyncErrorMsg(null);
    setSyncToast('Đang đồng bộ dữ liệu lên Cloud Firestore...');
    try {
      const res = await triggerCloudSync();
      const pullRes = await pullDataFromServer();
      refreshAllData();
      if (res.firestoreSynced) {
        setSyncStatus('synced');
        setSyncToast('Đã đồng bộ Cloud Firestore thành công! Dữ liệu luôn thống nhất trên mọi thiết bị & trình duyệt.');
      } else if (res.error || pullRes.error) {
        const errText = res.error || pullRes.error || 'Lỗi đồng bộ Cloud Firestore.';
        setSyncStatus('error');
        setSyncErrorMsg(errText);
        setSyncToast(`Lỗi đồng bộ Cloud: ${errText}`);
      } else if (res.success) {
        setSyncStatus('synced');
        setSyncToast('Đã đồng bộ dữ liệu thành công!');
      } else {
        setSyncStatus('error');
        setSyncToast('Chưa thể đồng bộ lên Cloud. Vui lòng kiểm tra kết nối và thử lại.');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setSyncStatus('error');
      setSyncErrorMsg(msg);
      setSyncToast(`Lỗi đồng bộ Cloud: ${msg}`);
    }
    setTimeout(() => setSyncToast(null), 4500);
  };

  const handleExportBackup = () => {
    exportAllDataAsJson();
    setSyncToast('Đã tải xuống file sao lưu edutest-backup.json!');
    setTimeout(() => setSyncToast(null), 3000);
  };

  const handleImportBackup = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const text = await file.text();
      const success = importAllDataFromJson(text);
      if (success) {
        refreshAllData();
        setCurrentUserAccount(getCurrentUser());
        setSyncToast('Khôi phục dữ liệu thành công!');
      } else {
        setSyncToast('Lỗi khi nạp file sao lưu.');
      }
      setTimeout(() => setSyncToast(null), 4000);
    };
    input.click();
  };

  const handleLogout = () => {
    logoutUserAccount(true);
    setCurrentUserAccount(null);
    setUserRole('student');
    setShowUserDropdown(false);
    setCurrentView('home');
    setActiveExam(null);
    setActiveBundleSession(null);
    setCurrentResult(null);
    setAuthModalMode('login');
    setIsAuthModalOpen(false);
    refreshAllData();
  };

  const handleAuthSuccess = (user: UserAccount) => {
    setCurrentUserAccount(user);
    setUserRole(user.role);
    refreshAllData();
    setIsAuthModalOpen(false);
    setSyncStatus('synced');
    void pullDataFromServer().then(() => {
      refreshAllData();
      const fbUser = getFirebaseAuthUser();
      if (fbUser && !fbUser.isAnonymous) {
        void syncUserSessionFromFirebaseAuth(fbUser)
          .then((latest) => {
            if (latest) {
              setCurrentUser(latest);
              setCurrentUserAccount(latest);
              setUserRole(latest.role);
            }
          })
          .catch(() => {});
      }
    });
  };

  const handleSelectClass = (classId: string) => {
    setActiveClassId(classId);
    setActiveClassIdState(classId);
  };

  const handleExportExamWord = async (exam: Exam) => {
    try {
      const res = await exportExamToWord(exam, { includeAnswers: false });
      setSyncToast(`✓ Đã xuất đề thi ra file Word ${res.fileName}!`);
    } catch {
      setSyncToast('Không thể xuất file Word cho đề thi này.');
    }
    setTimeout(() => setSyncToast(null), 4000);
  };

  const handleExportExamResultsExcel = (exam: Exam) => {
    const examResults = results.filter((r) => r.examId === exam.id);
    if (examResults.length === 0) {
      setSyncToast('Chưa có học sinh nào nộp bài cho đề thi này!');
      setTimeout(() => setSyncToast(null), 3500);
      return;
    }
    const res = exportResultsToExcel(examResults, { examTitle: exam.title });
    setSyncToast(`✓ Đã xuất ${res.count} kết quả ra file ${res.fileName}!`);
    setTimeout(() => setSyncToast(null), 4000);
  };

  // Preview exam modal state (Xem thử toàn bộ đề thi)
  const [previewingExam, setPreviewingExam] = useState<Exam | null>(null);

  // Elective subject selector modal state (Tổ hợp tự chọn môn thi)
  const [selectingElectiveBundle, setSelectingElectiveBundle] = useState<ExamBundle | null>(null);

  // Single active test state
  const [activeExam, setActiveExam] = useState<Exam | null>(null);
  const [activeMode, setActiveMode] = useState<'exam' | 'practice'>('exam');
  const [activeAttemptClassId, setActiveAttemptClassId] = useState<string | null>(null);
  const [currentResult, setCurrentResult] = useState<ExamResult | null>(null);

  // Editing state (cho phép người dùng viết, sửa, xóa đề thi & tổ hợp)
  const [editingExam, setEditingExam] = useState<Exam | null>(null);
  const [editingBundle, setEditingBundle] = useState<ExamBundle | null>(null);
  const [isLiveEditMode, setIsLiveEditMode] = useState<boolean>(false);

  // Multi-subject Bundle session state
  const [activeBundleSession, setActiveBundleSession] = useState<ActiveBundleState | null>(null);

  // Filters
  const [selectedSubject, setSelectedSubject] = useState<string>(
    initialParsedRoute.selectedSubject || 'all'
  );
  const [searchQuery, setSearchQuery] = useState('');

  const isPopStateNavRef = React.useRef(false);
  const hasNormalizedInitialUrlRef = React.useRef(false);

  const currentRoutePath = useMemo(() => {
    return buildAppUrlPath({
      currentView,
      homeTab,
      selectedSubject,
      subjects,
      courseState: courseRouteLocation,
      classroomState: classroomRouteLocation,
      activeExamTitle: activeExam?.title,
      activeBundleTitle: activeBundleSession?.bundle.title,
      editingExamTitle: editingExam?.title,
      resultExamTitle: currentResult?.examTitle,
    });
  }, [
    currentView,
    homeTab,
    selectedSubject,
    subjects,
    courseRouteLocation,
    classroomRouteLocation,
    activeExam?.title,
    activeBundleSession?.bundle.title,
    editingExam?.title,
    currentResult?.examTitle,
  ]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isPopStateNavRef.current) {
      isPopStateNavRef.current = false;
      return;
    }
    if (window.location.pathname !== currentRoutePath) {
      if (!hasNormalizedInitialUrlRef.current) {
        hasNormalizedInitialUrlRef.current = true;
        window.history.replaceState({}, '', currentRoutePath);
      } else {
        window.history.pushState({}, '', currentRoutePath);
      }
    } else {
      hasNormalizedInitialUrlRef.current = true;
    }
  }, [currentRoutePath]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handlePopState = () => {
      isPopStateNavRef.current = true;
      const parsed = parsePathnameToRoute(window.location.pathname, {
        courses: getAllCourses(),
        classrooms: getAllClassrooms(),
        subjects: getAllSubjects(),
      });
      setCurrentView(parsed.view);
      if (parsed.homeTab) setHomeTab(parsed.homeTab);
      if (parsed.selectedSubject) setSelectedSubject(parsed.selectedSubject);
      if (parsed.view === 'courses') {
        setSelectedCourseIdForView(parsed.courseId || '');
        setUrlCourseChapterSlug(parsed.courseChapterSlug);
        setUrlCourseLessonSlug(parsed.courseLessonSlug);
      }
      if (parsed.view === 'classrooms') {
        if (parsed.classroomId) {
          setActiveClassId(parsed.classroomId);
          setActiveClassIdState(parsed.classroomId);
        }
        setUrlClassroomTab(parsed.classroomTab);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Unsaved Changes Protection Guard
  const unsavedGuardRef = React.useRef<UnsavedNavigationGuard | null>(null);
  const [pendingNavState, setPendingNavState] = useState<{
    action: () => void;
    variant?: 'default' | 'confirm-discard';
    title?: string;
    message?: string;
    stayLabel?: string;
    discardLabel?: string;
  } | null>(null);

  const requestProtectedNavigate = (navAction: () => void) => {
    const guard = unsavedGuardRef.current;
    if (guard && guard.isDirty()) {
      setPendingNavState({
        action: navAction,
        variant: guard.variant || 'default',
        title: guard.title,
        message: guard.message,
        stayLabel: guard.stayLabel,
        discardLabel: guard.discardLabel,
      });
      return;
    }
    navAction();
  };

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (unsavedGuardRef.current?.isDirty()) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // Scoped Official Class Exam Navigation Lockdown (ONLY logged-in student members of that specific class)
  const [lockdownNowMs, setLockdownNowMs] = useState<number>(() => Date.now());
  const isLockdownCandidate = Boolean(currentUser && !isActualTeacher);

  useEffect(() => {
    if (!isLockdownCandidate) return;
    setLockdownNowMs(Date.now());
    const timer = setInterval(() => {
      setLockdownNowMs(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, [isLockdownCandidate]);

  const activeOfficialLockdown = useMemo(() => {
    if (!isLockdownCandidate || !currentUser) return null;
    const nowMs = lockdownNowMs;
    for (const exam of exams) {
      if (exam.visibility !== 'class' || !exam.isOfficialClassExam || !exam.assignedClassId) {
        continue;
      }
      if (exam.status === 'draft' || exam.status === 'closed' || isExamHiddenFromStudents(exam)) {
        continue;
      }
      if (!exam.openTime || !exam.closeTime) continue;

      const openTs = new Date(exam.openTime).getTime();
      const closeTs = new Date(exam.closeTime).getTime();
      if (!Number.isFinite(openTs) || !Number.isFinite(closeTs) || closeTs <= openTs) continue;

      const preMinutes = Math.max(0, exam.preExamLockMinutes ?? 5);
      const lockStartMs = openTs - preMinutes * 60_000;
      if (nowMs < lockStartMs || nowMs >= closeTs) continue;

      const targetClassroom = classrooms.find((c) => c.id === exam.assignedClassId);
      if (!targetClassroom || !isStudentMemberOfClass(targetClassroom, currentUser)) continue;

      const matchedSubmission = results.find((r) => {
        if (r.examId !== exam.id) return false;
        const belongsToStudent =
          (r.userId && (r.userId === currentUser.id || r.userId === currentUser.uid)) ||
          (r.userEmail &&
            currentUser.email &&
            r.userEmail.toLowerCase() === currentUser.email.toLowerCase()) ||
          (r.studentCode &&
            currentUser.studentCode &&
            r.studentCode.trim().toUpperCase() === currentUser.studentCode.trim().toUpperCase());
        if (!belongsToStudent) return false;
        const completedTs = new Date(r.completedAt).getTime();
        return Number.isFinite(completedTs) && completedTs >= lockStartMs;
      });

      if (exam.allowExitAfterSubmit && matchedSubmission) {
        continue;
      }

      return {
        exam,
        classroom: targetClassroom,
        openTs,
        closeTs,
        lockStartMs,
        preMinutes,
        alreadySubmittedInWindow: Boolean(matchedSubmission),
        submission: matchedSubmission || null,
      };
    }
    return null;
  }, [isLockdownCandidate, currentUser, lockdownNowMs, exams, classrooms, results]);

  // Reusable in-app confirmation modal state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    isDanger?: boolean;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    confirmText: 'Xác nhận xóa',
    cancelText: 'Hủy bỏ',
    isDanger: true,
    onConfirm: () => {},
  });

  // Refresh lists
  const refreshAllData = () => {
    setExams(getAllExams());
    setBundles(getAllBundles());
    setResults(getExamResults());
    setClassrooms(getAllClassrooms());
    setCourses(getAllCourses());
    setSubjects(getAllSubjects());
    setNavTabs(getNavTabs());
    setActiveClassIdState(getActiveClassId());
  };

  // --- Single Exam Handlers ---
  const handleStartExam = (
    exam: Exam, 
    mode: 'exam' | 'practice', 
    candidateNameOverride?: string, 
    studentCodeOverride?: string,
    sourceClassId?: string
  ) => {
    const accessCheck = canUserAccessProtectedItem(exam, currentUser, userRole, classrooms);
    if (!accessCheck.allowed) {
      setConfirmModal({
        isOpen: true,
        title: 'Không có quyền truy cập đề thi',
        message: accessCheck.reason || 'Bạn không có quyền truy cập đề thi này.',
        confirmText: 'Đã hiểu',
        cancelText: 'Đóng',
        isDanger: false,
        onConfirm: () => {},
      });
      return;
    }

    const isCreatorTeacher = isActualTeacher && userRole === 'teacher' && isCreatorOfItem(exam, currentUser);
    if (!isCreatorTeacher && exam.requireAccessCode && !candidateNameOverride) {
      setAccessModalInitialCode(exam.examCode || '');
      setIsExamAccessModalOpen(true);
      return;
    }

    let targetExam = exam;
    if (targetExam.randomQuestionCount && targetExam.randomQuestionCount > 0) {
      targetExam = instantiateExamWithRandomQuestions(targetExam);
    }

    if (candidateNameOverride) {
      setCandidateProfile({
        fullName: candidateNameOverride,
        studentCode: studentCodeOverride,
      });
      saveCandidateProfile({
        fullName: candidateNameOverride,
        studentCode: studentCodeOverride,
      });
    }

    if (mode === 'exam' && userRole === 'student' && (targetExam.lockExitUntilTimeout || targetExam.isOfficialClassExam)) {
      void tryEnterKioskFullscreen();
    }

    setActiveAttemptClassId(
      sourceClassId || (exam.visibility === 'class' ? exam.assignedClassId || null : null)
    );
    setActiveExam(targetExam);
    setActiveMode(mode);
    setCurrentView('taking');
  };

  const handleEditExam = (exam: Exam) => {
    if (!isActualTeacher || userRole !== 'teacher' || !isCreatorOfItem(exam, currentUser)) return;
    setEditingExam(exam);
    setCurrentView('create');
  };

  const handleDuplicateExam = (exam: Exam) => {
    if (!isActualTeacher || userRole !== 'teacher') return;
    const copyExam: Exam = {
      ...exam,
      id: 'custom-copy-' + Date.now(),
      title: `[Bản sao] ${exam.title}`,
      createdAt: new Date().toISOString().split('T')[0],
      isCustom: true,
      creatorId: currentUser?.id,
      creatorEmail: currentUser?.email,
      creatorName: currentUser?.fullName,
    };
    saveCustomExam(copyExam);
    refreshAllData();
  };

  const handleEditBundle = (bundle: ExamBundle) => {
    if (!isActualTeacher || userRole !== 'teacher' || !isCreatorOfItem(bundle, currentUser)) return;
    setEditingBundle(bundle);
    setCurrentView('bundle-create');
  };

  const enrichResultWithUser = (res: ExamResult, extraClassId?: string | null): ExamResult => ({
    ...res,
    classId: res.classId || extraClassId || undefined,
    userId: res.userId || currentUser?.id,
    userEmail: res.userEmail || currentUser?.email,
    studentName: res.studentName || currentUser?.fullName || candidateProfile.fullName,
    studentCode: res.studentCode || currentUser?.studentCode || candidateProfile.studentCode,
  });

  const isTeacherClassroomAttempt = (
    item?: { id?: string; visibility?: string; assignedClassId?: string } | null
  ): boolean => {
    const isTeacherActor = isActualTeacher || userRole === 'teacher';
    if (!isTeacherActor) return false;
    if (activeAttemptClassId) return true;
    if (!item) return false;
    if (item.visibility === 'class' || Boolean(item.assignedClassId)) return true;
    return Boolean(
      item.id && classrooms.some((c) => c.assignedExamIds?.includes(item.id!))
    );
  };

  const handleCompleteSingleExam = (result: ExamResult) => {
    const skipTeacherClassScore = isTeacherClassroomAttempt(activeExam);
    const resolvedClassId = activeAttemptClassId || activeExam?.assignedClassId || null;
    const taggedResult = enrichResultWithUser(result, resolvedClassId);

    if (skipTeacherClassScore) {
      setCurrentResult({
        ...taggedResult,
        submissionReason: taggedResult.submissionReason
          ? `${taggedResult.submissionReason} · Bài làm thử của Giáo viên (không tính vào kết quả lớp)`
          : 'Bài làm thử của Giáo viên trong lớp (không tính và không lưu điểm)',
      });
      setSyncToast('Giáo viên làm bài trong lớp: kết quả không được tính và không lưu vào bảng điểm lớp học.');
      setTimeout(() => setSyncToast(null), 5000);
    } else {
      saveExamResult(taggedResult);
      setResults(getExamResults());
      setCurrentResult(taggedResult);
    }

    setActiveAttemptClassId(null);
    setCurrentView('result');
  };

  const handleDeleteHistoryResult = (targetResult: ExamResult) => {
    if (!isActualTeacher || userRole !== 'teacher') return;
    setConfirmModal({
      isOpen: true,
      title: 'Xác nhận xóa kết quả thi',
      message: `Bạn có chắc chắn muốn xóa lịch sử làm bài "${targetResult.examTitle}" (${targetResult.studentName || 'Thí sinh'}) không?`,
      confirmText: 'Xóa kết quả',
      cancelText: 'Hủy bỏ',
      isDanger: true,
      onConfirm: () => {
        deleteExamResult(targetResult.id);
        setResults(getExamResults());
      },
    });
  };

  const handleClearHistoryResults = () => {
    if (!isActualTeacher || userRole !== 'teacher') return;
    setConfirmModal({
      isOpen: true,
      title: 'Xác nhận xóa toàn bộ lịch sử thi',
      message: 'Bạn có chắc chắn muốn xóa toàn bộ lịch sử kết quả làm bài hiện có không? Thao tác này không thể hoàn tác.',
      confirmText: 'Xóa tất cả',
      cancelText: 'Hủy bỏ',
      isDanger: true,
      onConfirm: () => {
        clearExamResults();
        setResults(getExamResults());
      },
    });
  };

  const handleSaveCustomExam = (newExam: Exam) => {
    if (!isActualTeacher || userRole !== 'teacher') return;
    const existingTarget = exams.find((e) => e.id === newExam.id);
    if (existingTarget && !isCreatorOfItem(existingTarget, currentUser)) {
      setSyncToast('Bạn không có quyền chỉnh sửa đề thi gốc của giáo viên khác. Hãy sao chép hoặc lấy câu hỏi về đề mới.');
      setTimeout(() => setSyncToast(null), 4000);
      return;
    }
    saveCustomExam(newExam);
    unsavedGuardRef.current = null;
    setEditingExam(null);
    refreshAllData();
    setCurrentView('home');
  };

  const handleDeleteCustomExam = (examId: string) => {
    if (!isActualTeacher || userRole !== 'teacher') return;
    const target = exams.find((e) => e.id === examId);
    if (target && !isCreatorOfItem(target, currentUser)) return;
    const title = target ? `"${target.title}"` : 'đề thi này';
    setConfirmModal({
      isOpen: true,
      title: 'Xác nhận xóa đề thi',
      message: `Bạn có chắc chắn muốn xóa ${title} không? Đề thi và toàn bộ nội dung câu hỏi liên quan sẽ được xóa sạch khỏi thư viện.`,
      confirmText: 'Xóa đề thi',
      cancelText: 'Hủy bỏ',
      isDanger: true,
      onConfirm: () => {
        deleteCustomExam(examId);
        refreshAllData();
      },
    });
  };

  const handleDeleteAllExams = () => {
    if (!isMasterAdmin || userRole !== 'teacher') return;
    setConfirmModal({
      isOpen: true,
      title: 'Xác nhận xóa toàn bộ đề thi',
      message: 'Bạn có chắc chắn muốn xóa toàn bộ tất cả đề thi hiện có trên web không? Danh sách đề thi sẽ được làm trống hoàn toàn.',
      confirmText: 'Xóa sạch tất cả đề thi',
      cancelText: 'Hủy bỏ',
      isDanger: true,
      onConfirm: () => {
        deleteAllExams();
        refreshAllData();
      },
    });
  };

  // --- Bundle Handlers ---
  const handleStartBundle = (
    bundle: ExamBundle, 
    selectedExamsOverride?: Exam[],
    candidateNameOverride?: string,
    studentCodeOverride?: string,
    sourceClassId?: string
  ) => {
    const accessCheck = canUserAccessProtectedItem(bundle, currentUser, userRole, classrooms);
    if (!accessCheck.allowed) {
      setConfirmModal({
        isOpen: true,
        title: 'Không có quyền truy cập tổ hợp thi',
        message: accessCheck.reason || 'Bạn không có quyền truy cập tổ hợp đề thi này.',
        confirmText: 'Đã hiểu',
        cancelText: 'Đóng',
        isDanger: false,
        onConfirm: () => {},
      });
      return;
    }

    const isCreatorTeacher = isActualTeacher && userRole === 'teacher' && isCreatorOfItem(bundle, currentUser);
    if (!isCreatorTeacher && bundle.requireAccessCode && !candidateNameOverride) {
      setAccessModalInitialCode(bundle.bundleCode || '');
      setIsExamAccessModalOpen(true);
      return;
    }

    let memberExams = selectedExamsOverride;

    if (!memberExams) {
      // If bundle has elective groups and no specific override passed, ask user to select electives
      if (bundle.selectionMode === 'has_electives' && bundle.electiveGroups && bundle.electiveGroups.length > 0) {
        setSelectingElectiveBundle(bundle);
        return;
      }

      memberExams = bundle.examIds
        .map((id) => exams.find((e) => e.id === id))
        .filter(Boolean) as Exam[];
    }

    if (!memberExams || memberExams.length === 0) {
      setConfirmModal({
        isOpen: true,
        title: 'Thông báo',
        message: 'Không tìm thấy các đề thi thành viên trong tổ hợp này. Bạn có thể nhấn biểu tượng Sửa trên tổ hợp để chọn lại các đề thi có sẵn trong thư viện.',
        confirmText: 'Đã hiểu',
        cancelText: 'Đóng',
        isDanger: false,
        onConfirm: () => {},
      });
      return;
    }

    if (candidateNameOverride) {
      setCandidateProfile({
        fullName: candidateNameOverride,
        studentCode: studentCodeOverride,
      });
      saveCandidateProfile({
        fullName: candidateNameOverride,
        studentCode: studentCodeOverride,
      });
    }

    // Process each exam in bundle (apply random question selection & propagate bundle strict lockdown rules)
    const processedMemberExams = memberExams.map((rawExam) => {
      let subExam = rawExam;
      const countForExam = bundle.randomQuestionCountPerExam ? bundle.randomQuestionCountPerExam[rawExam.id] : undefined;
      if (countForExam && countForExam > 0) {
        subExam = instantiateExamWithRandomQuestions(subExam, countForExam);
      }
      return {
        ...subExam,
        lockExitUntilTimeout: bundle.lockExitUntilTimeout ?? subExam.lockExitUntilTimeout,
        minSubmitMinutes: bundle.minSubmitMinutes ?? subExam.minSubmitMinutes,
        showScoreAfterExam:
          (bundle.showScoreAfterExam ?? true) &&
          (subExam.showScoreAfterExam ?? subExam.settings?.showScoreAfterExam ?? true),
        showAnswersAfterExam:
          (bundle.showAnswersAfterExam ?? true) &&
          (subExam.showAnswersAfterExam ?? subExam.settings?.showAnswersAfterExam ?? true),
        showOnlyStudentAnswersAfterExam:
          Boolean(bundle.showOnlyStudentAnswersAfterExam) ||
          Boolean(subExam.showOnlyStudentAnswersAfterExam),
      };
    });

    const isClusterMaxMode = bundle.timingMode !== 'all_sequential_independent' && bundle.selectionMode === 'has_electives';
    const compulsoryIds = new Set(bundle.compulsoryExamIds || []);

    let compExams: Exam[] = [];
    let elecExams: Exam[] = [];

    if (isClusterMaxMode) {
      compExams = processedMemberExams.filter((e) => compulsoryIds.has(e.id));
      elecExams = processedMemberExams.filter((e) => !compulsoryIds.has(e.id));
    } else {
      compExams = processedMemberExams;
      elecExams = [];
    }

    const initialPhase: 'compulsory_exam' | 'elective_cluster' = 
      compExams.length > 0 ? 'compulsory_exam' : 'elective_cluster';

    if (userRole === 'student' && (bundle.lockExitUntilTimeout || processedMemberExams.some((e) => e.lockExitUntilTimeout))) {
      void tryEnterKioskFullscreen();
    }

    setActiveAttemptClassId(
      sourceClassId || (bundle.visibility === 'class' ? bundle.assignedClassId || null : null)
    );
    setActiveBundleSession({
      bundle,
      allSelectedExams: processedMemberExams,
      compulsoryExams: compExams,
      electiveExams: elecExams,
      currentCompulsoryIndex: 0,
      results: [],
      phase: initialPhase,
    });
    setCurrentView('bundle-taking');
  };

  const handleCompleteBundleCurrentExam = (result: ExamResult) => {
    if (!activeBundleSession) return;

    const skipTeacherClassScore = isTeacherClassroomAttempt(activeBundleSession.bundle);
    const resolvedClassId = activeAttemptClassId || activeBundleSession.bundle.assignedClassId || null;
    const taggedResult = enrichResultWithUser(result, resolvedClassId);

    const updatedResults = [...activeBundleSession.results, taggedResult];
    const isLastCompulsory = 
      activeBundleSession.compulsoryExams.length === 0 || 
      activeBundleSession.currentCompulsoryIndex >= activeBundleSession.compulsoryExams.length - 1;

    if (!isLastCompulsory) {
      // More compulsory exams remain -> hold saving/announcing until full bundle completion
      setActiveBundleSession({
        ...activeBundleSession,
        results: updatedResults,
        phase: 'break_to_compulsory',
      });
    } else if (activeBundleSession.electiveExams.length > 0) {
      // Completed last compulsory exam, next is elective cluster -> hold until full bundle completion
      setActiveBundleSession({
        ...activeBundleSession,
        results: updatedResults,
        phase: 'break_to_elective_cluster',
      });
    } else {
      // All subjects in bundle completed -> persist & reveal all results together now
      if (!skipTeacherClassScore) {
        updatedResults.forEach((res) => {
          saveExamResult(res);
        });
        setResults(getExamResults());
      } else {
        setSyncToast('Giáo viên làm tổ hợp trong lớp: kết quả không được tính và không lưu vào bảng điểm lớp.');
        setTimeout(() => setSyncToast(null), 5000);
      }
      setActiveBundleSession({
        ...activeBundleSession,
        results: updatedResults,
      });
      setActiveAttemptClassId(null);
      setCurrentView('bundle-result');
    }
  };

  const handleCompleteBundleElectiveCluster = (clusterResults: ExamResult[]) => {
    if (!activeBundleSession) return;

    const skipTeacherClassScore = isTeacherClassroomAttempt(activeBundleSession.bundle);
    const resolvedClassId = activeAttemptClassId || activeBundleSession.bundle.assignedClassId || null;
    const taggedClusterResults = clusterResults.map((res) => enrichResultWithUser(res, resolvedClassId));

    const updatedResults = [...activeBundleSession.results, ...taggedClusterResults];
    if (!skipTeacherClassScore) {
      updatedResults.forEach((res) => {
        saveExamResult(res);
      });
      setResults(getExamResults());
    } else {
      setSyncToast('Giáo viên làm tổ hợp trong lớp: kết quả không được tính và không lưu vào bảng điểm lớp.');
      setTimeout(() => setSyncToast(null), 5000);
    }

    setActiveBundleSession({
      ...activeBundleSession,
      results: updatedResults,
    });
    setActiveAttemptClassId(null);
    setCurrentView('bundle-result');
  };

  const handleStartNextInBundle = () => {
    if (!activeBundleSession) return;
    if (activeBundleSession.phase === 'break_to_compulsory') {
      setActiveBundleSession({
        ...activeBundleSession,
        currentCompulsoryIndex: activeBundleSession.currentCompulsoryIndex + 1,
        phase: 'compulsory_exam',
      });
    } else if (activeBundleSession.phase === 'break_to_elective_cluster') {
      setActiveBundleSession({
        ...activeBundleSession,
        phase: 'elective_cluster',
      });
    }
  };

  const handleSaveCustomBundle = (newBundle: ExamBundle) => {
    if (!isActualTeacher || userRole !== 'teacher') return;
    const existingTarget = bundles.find((b) => b.id === newBundle.id);
    if (existingTarget && !isCreatorOfItem(existingTarget, currentUser)) {
      setSyncToast('Bạn không có quyền chỉnh sửa tổ hợp đề thi gốc của giáo viên khác.');
      setTimeout(() => setSyncToast(null), 4000);
      return;
    }
    saveCustomBundle(newBundle);
    unsavedGuardRef.current = null;
    refreshAllData();
    setCurrentView('home');
    setHomeTab('bundle');
  };

  const handleDeleteCustomBundle = (bundleId: string) => {
    if (!isActualTeacher || userRole !== 'teacher') return;
    const target = bundles.find((b) => b.id === bundleId);
    if (target && !isCreatorOfItem(target, currentUser)) return;
    const title = target ? `"${target.title}"` : 'tổ hợp môn này';
    setConfirmModal({
      isOpen: true,
      title: 'Xác nhận xóa tổ hợp môn',
      message: `Bạn có chắc chắn muốn xóa ${title} không? Tổ hợp này sẽ được xóa khỏi hệ thống.`,
      confirmText: 'Xóa tổ hợp',
      cancelText: 'Hủy bỏ',
      isDanger: true,
      onConfirm: () => {
        deleteCustomBundle(bundleId);
        refreshAllData();
      },
    });
  };

  const handleRetakeMistakes = (wrongQuestionIds: string[]) => {
    if (!activeExam) return;
    const filteredQuestions = activeExam.questions.filter((q) =>
      wrongQuestionIds.includes(q.id)
    );
    const mistakeExam: Exam = {
      ...activeExam,
      id: activeExam.id + '-mistakes-' + Date.now(),
      title: `${activeExam.title} (Luyện câu sai - ${filteredQuestions.length} câu)`,
      questions: filteredQuestions,
      totalQuestions: filteredQuestions.length,
      durationMinutes: Math.max(10, Math.ceil(filteredQuestions.length * 1.5)),
    };
    setActiveExam(mistakeExam);
    setActiveMode('practice');
    setCurrentView('taking');
  };

  // Hiển thị đề thi & tổ hợp công khai web, thuộc lớp của người xem, hoặc riêng tư của người ra đề/QTV
  const visibleLibraryExams = useMemo(() => {
    return exams.filter((e) => canShowInPublicLibrary(e, currentUser, userRole, classrooms));
  }, [exams, currentUser, userRole, classrooms]);

  const visibleLibraryBundles = useMemo(() => {
    return bundles.filter((b) => canShowInPublicLibrary(b, currentUser, userRole, classrooms));
  }, [bundles, currentUser, userRole, classrooms]);

  // Filtered single exams
  const filteredExams = useMemo(() => {
    return visibleLibraryExams.filter((e) => {
      if (selectedSubject === 'custom') {
        if (!e.isCustom) return false;
      } else if (selectedSubject !== 'all') {
        const matchesExact = e.subject === selectedSubject;
        const matchesName = e.subject.toLowerCase() === selectedSubject.toLowerCase();
        if (!matchesExact && !matchesName) return false;
      }
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        return (
          e.title.toLowerCase().includes(query) ||
          e.description.toLowerCase().includes(query) ||
          e.grade.toLowerCase().includes(query)
        );
      }
      return true;
    });
  }, [visibleLibraryExams, selectedSubject, searchQuery]);

  // Filtered bundles
  const filteredBundles = useMemo(() => {
    if (!searchQuery.trim()) return visibleLibraryBundles;
    const query = searchQuery.toLowerCase();
    return visibleLibraryBundles.filter(
      (b) =>
        b.title.toLowerCase().includes(query) ||
        b.description.toLowerCase().includes(query)
    );
  }, [visibleLibraryBundles, searchQuery]);

  const handleNavClick = (tab: NavTabItem) => {
    requestProtectedNavigate(() => {
      if (tab.targetView === 'single') {
        setHomeTab('single');
        setSelectedSubject('all');
        setCurrentView('home');
      } else if (tab.targetView === 'bundle') {
        setHomeTab('bundle');
        setCurrentView('home');
      } else if (tab.targetView === 'classrooms') {
        setUrlClassroomTab(undefined);
        setCurrentView('classrooms');
      } else if (tab.targetView === 'courses') {
        setSelectedCourseIdForView('');
        setUrlCourseChapterSlug(undefined);
        setUrlCourseLessonSlug(undefined);
        setCurrentView('courses');
      } else if (tab.targetView === 'battle') {
        setCurrentView('battle');
      } else if (tab.targetView === 'history') {
        setCurrentView('history');
      } else if (tab.targetView === 'analytics') {
        setCurrentView('analytics');
      } else {
        setSelectedSubject(tab.targetView);
        setHomeTab('single');
        setCurrentView('home');
      }
      setIsMobileNavOpen(false);
    });
  };


  const renderSidebarNav = () => (
    <div className="flex flex-col h-full justify-between font-sans">
      <div>
        {/* Brand Header */}
        <div className="flex items-center justify-between pb-3.5 border-b border-slate-200 mb-3">
          <a
            href="/de-thi"
            onClick={(e) => {
              e.preventDefault();
              requestProtectedNavigate(() => {
                setHomeTab('single');
                setSelectedSubject('all');
                setCurrentView('home');
                setIsMobileNavOpen(false);
              });
            }}
            className="flex items-center gap-3 text-left cursor-pointer group"
          >
            <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center font-extrabold text-base shadow-xs group-hover:bg-blue-600 transition-colors shrink-0">
              ET
            </div>
            <div>
              <div className="font-extrabold text-lg text-slate-900 leading-tight">EduTest</div>
              <div className="text-[11px] text-slate-500 font-medium">Luyện thi & Khóa học</div>
            </div>
          </a>
          {isMobileNavOpen && (
            <button
              onClick={() => setIsMobileNavOpen(false)}
              className="lg:hidden p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Current Role status & Student Experience Mode Switcher */}
        <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 mb-3.5 space-y-2 shadow-2xs">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <GraduationCap className={`w-4 h-4 shrink-0 ${
                isActualTeacher ? 'text-purple-600' : currentUser ? 'text-blue-600' : 'text-slate-400'
              }`} />
              <span className="text-[11px] font-bold text-slate-700 truncate">
                {currentUser?.email === MASTER_ADMIN_EMAIL
                  ? 'Admin Tối Cao'
                  : isActualTeacher
                  ? 'Giáo viên tổ chức'
                  : currentUser
                  ? 'Học sinh'
                  : 'Khách (Chưa đăng nhập)'}
              </span>
            </div>
            <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-white text-slate-600 border border-slate-200 shrink-0">
              {userRole === 'teacher' ? 'GV' : 'HS'}
            </span>
          </div>

          {isActualTeacher && (
            <div className="grid grid-cols-2 gap-1 p-1 bg-slate-200/75 rounded-lg">
              <button
                type="button"
                onClick={() => handleSwitchRole('teacher')}
                className={`py-1.5 px-2 rounded-md text-[11px] font-bold transition-all cursor-pointer whitespace-nowrap ${
                  userRole === 'teacher'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Chế độ GV
              </button>
              <button
                type="button"
                onClick={() => handleSwitchRole('student')}
                className={`py-1.5 px-2 rounded-md text-[11px] font-bold transition-all cursor-pointer flex items-center justify-center gap-1 whitespace-nowrap ${
                  userRole === 'student'
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-emerald-700'
                }`}
                title="Xem và trải nghiệm giao diện như một học sinh"
              >
                <Eye className="w-3 h-3 shrink-0" />
                <span>Thử vai HS</span>
              </button>
            </div>
          )}
        </div>

        {/* Navigation list */}
        <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 px-2 mb-2 flex items-center justify-between">
          <span>DANH MỤC ĐIỀU HƯỚNG</span>
          <span>{navTabs.filter((t) => t.isVisible !== false).length} mục</span>
        </div>

        <nav className="space-y-1.5 overflow-y-auto max-h-[calc(100vh-340px)] pr-1">
          {navTabs
            .filter((t) => t.isVisible !== false)
            .map((tab) => {
              const tabHref = buildNavTabPath(tab, subjects);
              const isActive =
                (tab.targetView === 'single' && currentView === 'home' && homeTab === 'single' && selectedSubject === 'all') ||
                (tab.targetView === 'bundle' && currentView === 'home' && homeTab === 'bundle') ||
                (tab.targetView === 'classrooms' && currentView === 'classrooms') ||
                (tab.targetView === 'courses' && currentView === 'courses') ||
                (tab.targetView === 'battle' && currentView === 'battle') ||
                (tab.targetView === 'history' && currentView === 'history') ||
                (tab.targetView === 'analytics' && currentView === 'analytics') ||
                (selectedSubject === tab.targetView && currentView === 'home');

              return (
                <a
                  key={tab.id}
                  href={tabHref}
                  onClick={(e) => {
                    e.preventDefault();
                    handleNavClick(tab);
                  }}
                  title={tabHref}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl transition-all text-left cursor-pointer group ${
                    isActive
                      ? 'bg-blue-600 text-white font-bold shadow-xs'
                      : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100 font-semibold'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 pr-2">
                    <span
                      className={`p-1.5 rounded-lg shrink-0 transition-colors ${
                        isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600 group-hover:bg-slate-200'
                      }`}
                    >
                      {tab.iconName === 'book' && <BookOpen className="w-4 h-4" />}
                      {tab.iconName === 'layers' && <Layers className="w-4 h-4" />}
                      {tab.iconName === 'users' && <Users className="w-4 h-4" />}
                      {tab.iconName === 'graduation' && <GraduationCap className="w-4 h-4" />}
                      {tab.iconName === 'swords' && <Swords className="w-4 h-4" />}
                      {tab.iconName === 'chart' && <BarChart3 className="w-4 h-4" />}
                      {tab.iconName === 'clock' && <Clock className="w-4 h-4" />}
                      {!['book', 'layers', 'users', 'graduation', 'swords', 'chart', 'clock'].includes(
                        tab.iconName || ''
                      ) && <BookOpen className="w-4 h-4" />}
                    </span>
                    <div className="min-w-0">
                      <span className="text-xs sm:text-sm whitespace-normal leading-snug font-bold block">
                        {(!isActualTeacher || userRole !== 'teacher') &&
                        tab.targetView === 'classrooms' &&
                        tab.label === 'Lớp học & Xếp hạng'
                          ? 'Lớp học'
                          : tab.label}
                      </span>
                      <span
                        className={`text-[10px] font-mono block truncate ${
                          isActive ? 'text-blue-100' : 'text-slate-400'
                        }`}
                      >
                        {tabHref}
                      </span>
                    </div>
                  </div>
                  {tab.badgeText && (
                    <span
                      className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full shrink-0 ${
                        isActive ? 'bg-white text-blue-700' : 'bg-rose-500 text-white animate-pulse'
                      }`}
                    >
                      {tab.badgeText}
                    </span>
                  )}
                </a>
              );
            })}

          {/* Teacher customizer & Tools buttons */}
          {isActualTeacher && userRole === 'teacher' && (
            <div className="space-y-1.5 mt-2">
              <a
                href="/cong-cu-giao-vien"
                onClick={(e) => {
                  e.preventDefault();
                  requestProtectedNavigate(() => {
                    setCurrentView('teacher-tools');
                    setIsMobileNavOpen(false);
                  });
                }}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl transition-all text-left cursor-pointer group ${
                  currentView === 'teacher-tools'
                    ? 'bg-indigo-600 text-white font-bold shadow-xs'
                    : 'text-indigo-800 bg-indigo-50/80 hover:bg-indigo-100 border border-indigo-200 font-semibold'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0 pr-2">
                  <span
                    className={`p-1.5 rounded-lg shrink-0 transition-colors ${
                      currentView === 'teacher-tools' ? 'bg-white/20 text-white' : 'bg-white text-indigo-600'
                    }`}
                  >
                    <Award className="w-4 h-4" />
                  </span>
                  <div className="min-w-0">
                    <span className="text-xs sm:text-sm font-bold block truncate">Công cụ Giáo viên</span>
                    <span
                      className={`text-[10px] font-mono block truncate ${
                        currentView === 'teacher-tools' ? 'text-indigo-100' : 'text-indigo-500'
                      }`}
                    >
                      /cong-cu-giao-vien
                    </span>
                  </div>
                </div>
              </a>

              <button
                onClick={() => {
                  setIsTabAndSubjectModalOpen(true);
                  setIsMobileNavOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold text-slate-600 hover:text-blue-700 hover:bg-blue-50/70 border border-dashed border-slate-200 transition-colors cursor-pointer"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500" />
                <span>Tùy biến Menu & Môn học</span>
              </button>
            </div>
          )}
        </nav>
      </div>

      {/* Bottom Profile & Actions */}
      <div className="pt-3.5 border-t border-slate-200 space-y-2.5">
        {/* Direct 8-digit access button */}
        <button
          type="button"
          onClick={() => {
            setAccessModalInitialCode('');
            setIsExamAccessModalOpen(true);
            setIsMobileNavOpen(false);
          }}
          className="w-full py-2.5 px-3.5 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-2xs"
        >
          <KeyRound className="w-4 h-4 text-blue-600 shrink-0" />
          <span>Nhập mã số đề thi (8 số)</span>
        </button>

        {currentUser ? (
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-slate-900 text-white font-bold text-xs flex items-center justify-center shrink-0">
                {currentUser.fullName.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1 text-left">
                <div className="text-xs font-bold text-slate-900 truncate">{currentUser.fullName}</div>
                <div className="text-[10px] text-slate-500 truncate">{currentUser.email}</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-1.5 pt-1 text-[11px]">
              <button
                type="button"
                onClick={() => {
                  setIsChangePasswordOpen(true);
                  setIsMobileNavOpen(false);
                }}
                className="py-1.5 px-2 text-center rounded-lg bg-white border border-slate-200 text-slate-700 hover:text-purple-700 hover:bg-purple-50 font-semibold cursor-pointer truncate"
              >
                Đổi mật khẩu
              </button>
              <button
                type="button"
                onClick={() => {
                  handleLogout();
                  setIsMobileNavOpen(false);
                }}
                className="py-1.5 px-2 text-center rounded-lg bg-white border border-slate-200 text-rose-600 hover:bg-rose-50 font-semibold cursor-pointer truncate"
              >
                Đăng xuất
              </button>
            </div>

            {currentUser.role === 'student' && (
              <button
                type="button"
                onClick={() => {
                  setIsTeacherRequestModalOpen(true);
                  setIsMobileNavOpen(false);
                }}
                className="w-full py-1.5 px-2 text-[11px] font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg flex items-center justify-center gap-1 cursor-pointer"
              >
                <Sparkles className="w-3 h-3 text-amber-600" />
                <span>Xin quyền Giáo viên</span>
              </button>
            )}

            {isActualTeacher && userRole === 'teacher' && (
              <button
                type="button"
                onClick={() => {
                  setIsTeacherRequestsAdminModalOpen(true);
                  setIsMobileNavOpen(false);
                }}
                className="w-full py-1.5 px-2 text-[11px] font-semibold text-purple-800 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg flex items-center justify-center gap-1 cursor-pointer"
              >
                <ShieldCheck className="w-3 h-3 text-purple-600" />
                <span>Duyệt quyền Giáo viên</span>
                {getAllTeacherRequests().filter((r) => r.status === 'pending').length > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[9px] bg-rose-600 text-white font-extrabold ml-1">
                    {getAllTeacherRequests().filter((r) => r.status === 'pending').length}
                  </span>
                )}
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setAuthModalMode('login');
                setIsAuthModalOpen(true);
                setIsMobileNavOpen(false);
              }}
              className="py-2 px-3 text-xs font-bold text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl transition-colors cursor-pointer text-center"
            >
              Đăng nhập
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthModalMode('register');
                setIsAuthModalOpen(true);
                setIsMobileNavOpen(false);
              }}
              className="py-2 px-3 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors cursor-pointer text-center shadow-xs"
            >
              Đăng ký
            </button>
          </div>
        )}
      </div>
    </div>
  );

  // Mandatory Login on Web Entry (mới vào web bắt buộc phải đăng nhập trước)
  if (!currentUser) {
    return (
      <>
        <LoginGateScreen initialMode={authModalMode} onSuccess={handleAuthSuccess} />
        {syncToast && (
          <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white text-xs font-semibold px-4 py-3 rounded-xl shadow-2xl border border-slate-700 flex items-center gap-3">
            <Cloud className="w-4 h-4 text-blue-400 shrink-0" />
            <span>{syncToast}</span>
          </div>
        )}
      </>
    );
  }

  // Scoped Official Class Exam Lockdown UI (ONLY affects logged-in student members inside [openTime - preExamLockMinutes, closeTime))
  if (activeOfficialLockdown) {
    const formatHMS = (ms: number) => {
      const totalSec = Math.max(0, Math.floor(ms / 1000));
      const h = Math.floor(totalSec / 3600);
      const m = Math.floor((totalSec % 3600) / 60);
      const s = totalSec % 60;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };

    if (lockdownNowMs < activeOfficialLockdown.openTs) {
      const waitMs = activeOfficialLockdown.openTs - lockdownNowMs;
      return (
        <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4 font-sans">
          <div className="max-w-lg w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-rose-500/20 border border-rose-400/30 text-rose-300 flex items-center justify-center mx-auto">
              <Lock className="w-8 h-8" />
            </div>
            <div className="space-y-2">
              <span className="inline-block px-3 py-1 rounded-full bg-rose-500/20 text-rose-300 text-xs font-bold uppercase tracking-wider">
                Phòng chờ Kỳ thi chính thức · Lớp {activeOfficialLockdown.classroom.name}
              </span>
              <h1 className="text-xl sm:text-2xl font-extrabold text-white leading-snug">
                {activeOfficialLockdown.exam.title}
              </h1>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                Hệ thống đang bật chế độ khóa điều hướng tập trung trước giờ thi. Khi đồng hồ đếm ngược về 00:00:00, bài thi sẽ tự động mở ra ngay lập tức.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                Thời gian còn lại trước khi mở đề
              </div>
              <div className="text-4xl sm:text-5xl font-mono font-black tracking-widest text-amber-300 tabular-nums">
                {formatHMS(waitMs)}
              </div>
              <div className="mt-3 text-xs text-slate-400 flex items-center justify-center gap-4">
                <span>Thời lượng: <strong className="text-white">{activeOfficialLockdown.exam.durationMinutes} phút</strong></span>
                <span>Số câu: <strong className="text-white">{activeOfficialLockdown.exam.questions.length} câu</strong></span>
              </div>
            </div>

            {activeOfficialLockdown.exam.instructions && (
              <div className="p-4 rounded-xl bg-slate-800/70 border border-slate-700 text-left text-xs text-slate-200 leading-relaxed">
                <div className="font-bold text-amber-300 mb-1">Hướng dẫn trước giờ làm bài:</div>
                <div className="whitespace-pre-line">{activeOfficialLockdown.exam.instructions}</div>
              </div>
            )}

            <div className="text-xs text-slate-400">
              Thí sinh: <strong className="text-white">{currentUser.fullName}</strong>
              {currentUser.studentCode ? ` (${currentUser.studentCode})` : ''}
            </div>
          </div>
          <RoomLockGuard
            active={true}
            title={activeOfficialLockdown.exam.title}
            subtitle={`Phòng chờ Kỳ thi chính thức · Lớp ${activeOfficialLockdown.classroom.name}`}
            remainingLabel={formatHMS(waitMs)}
          />
        </div>
      );
    }

    if (activeOfficialLockdown.alreadySubmittedInWindow) {
      const remainCloseMs = activeOfficialLockdown.closeTs - lockdownNowMs;
      return (
        <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4 font-sans">
          <div className="max-w-lg w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 flex items-center justify-center mx-auto">
              <CheckCircle className="w-8 h-8" />
            </div>
            <div className="space-y-2">
              <span className="inline-block px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-bold uppercase tracking-wider">
                Đã ghi nhận bài nộp chính thức
              </span>
              <h1 className="text-xl sm:text-2xl font-extrabold text-white">
                {activeOfficialLockdown.exam.title}
              </h1>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                Bài làm của bạn đã được lưu an toàn. Theo quy định kỳ thi chính thức của lớp <strong>{activeOfficialLockdown.classroom.name}</strong>, màn hình sẽ giữ trạng thái tập trung toàn màn hình cho đến khi hết giờ đóng đề.
              </p>
            </div>

            {activeOfficialLockdown.exam.showScoreAfterExam !== false && activeOfficialLockdown.submission && (
              <div className="p-4 rounded-2xl bg-slate-800/80 border border-slate-700 text-sm">
                <div className="text-xs text-slate-400">Điểm ghi nhận</div>
                <div className="text-3xl font-mono font-extrabold text-emerald-300 mt-1">
                  {activeOfficialLockdown.submission.scoreOnTenScale?.toFixed(2) ?? activeOfficialLockdown.submission.earnedPoints} đ
                </div>
              </div>
            )}

            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800">
              <div className="text-xs text-slate-400 mb-1">Tự động mở khóa điều hướng sau</div>
              <div className="text-3xl font-mono font-black tracking-widest text-amber-300 tabular-nums">
                {formatHMS(remainCloseMs)}
              </div>
            </div>
          </div>
          <RoomLockGuard
            active={true}
            title={activeOfficialLockdown.exam.title}
            subtitle={`Đã nộp bài · Giữ phòng thi đến hết giờ đóng đề`}
            remainingLabel={formatHMS(remainCloseMs)}
          />
        </div>
      );
    }

    return (
      <ExamTakingView
        key={`official_${activeOfficialLockdown.exam.id}`}
        exam={activeOfficialLockdown.exam}
        mode="exam"
        userRole="student"
        isOfficialLocked={true}
        candidateName={currentUser.fullName}
        studentCode={currentUser.studentCode}
        onComplete={(res) => {
          handleCompleteSingleExam({
            ...res,
            classId: activeOfficialLockdown.classroom.id,
          });
        }}
        onExit={() => {}}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col selection:bg-slate-900 selection:text-white">
      {/* 
        Top Bar Contract: 
        Zone 1: Brand title, one line
        Zone 2: Dynamic nav links + Customizer (Dài rộng, dễ nhìn thấy nội dung)
        Zone 3: Role switcher & primary actions
      */}


{/* View 1: Active Single Exam Taking */}
      {currentView === 'taking' && activeExam && (
        <ExamTakingView
          exam={activeExam}
          mode={activeMode}
          userRole={userRole}
          candidateName={candidateProfile.fullName}
          studentCode={candidateProfile.studentCode}
          onComplete={handleCompleteSingleExam}
          onExit={() => {
            setActiveAttemptClassId(null);
            setCurrentView('home');
          }}
          onUpdateExam={(updated) => {
            refreshAllData();
            setActiveExam(updated);
          }}
        />
      )}

      {/* View 2: Active Multi-Subject Bundle Session */}
      {currentView === 'bundle-taking' && activeBundleSession && (
        <main className="flex-1">
          {activeBundleSession.phase === 'compulsory_exam' && activeBundleSession.compulsoryExams[activeBundleSession.currentCompulsoryIndex] && (
            <ExamTakingView
              exam={activeBundleSession.compulsoryExams[activeBundleSession.currentCompulsoryIndex]}
              mode="exam"
              userRole={userRole}
              candidateName={candidateProfile.fullName}
              studentCode={candidateProfile.studentCode}
              onComplete={handleCompleteBundleCurrentExam}
              onExit={() => {
                setConfirmModal({
                  isOpen: true,
                  title: 'Xác nhận thoát thi tổ hợp',
                  message: 'Bạn có chắc muốn thoát toàn bộ buổi thi tổ hợp liên môn này? Tiến trình làm bài chưa nộp sẽ không được lưu.',
                  confirmText: 'Rời phòng thi',
                  cancelText: 'Tiếp tục làm bài',
                  isDanger: true,
                  onConfirm: () => {
                    setActiveBundleSession(null);
                    setActiveAttemptClassId(null);
                    setCurrentView('home');
                  },
                });
              }}
            />
          )}

          {activeBundleSession.phase === 'break_to_compulsory' && (
            <IntermissionBreakView
              completedExam={activeBundleSession.compulsoryExams[activeBundleSession.currentCompulsoryIndex]}
              completedResult={
                activeBundleSession.results[activeBundleSession.currentCompulsoryIndex]
              }
              nextExam={
                activeBundleSession.compulsoryExams[activeBundleSession.currentCompulsoryIndex + 1]
              }
              nextIndex={activeBundleSession.currentCompulsoryIndex + 1}
              totalExams={
                activeBundleSession.compulsoryExams.length + (activeBundleSession.electiveExams.length > 0 ? 1 : 0)
              }
              breakMinutes={activeBundleSession.bundle.breakMinutes}
              isRoomLocked={Boolean(activeBundleSession.bundle.lockExitUntilTimeout && userRole === 'student')}
              onStartNext={handleStartNextInBundle}
            />
          )}

          {activeBundleSession.phase === 'break_to_elective_cluster' && (
            <IntermissionBreakView
              completedExam={activeBundleSession.compulsoryExams[activeBundleSession.currentCompulsoryIndex]}
              completedResult={
                activeBundleSession.results[activeBundleSession.currentCompulsoryIndex]
              }
              nextClusterExams={activeBundleSession.electiveExams}
              nextClusterMaxDuration={Math.max(...activeBundleSession.electiveExams.map((e) => e.durationMinutes || 45))}
              nextIndex={activeBundleSession.currentCompulsoryIndex + 1}
              totalExams={activeBundleSession.compulsoryExams.length + 1}
              breakMinutes={activeBundleSession.bundle.breakMinutes}
              isRoomLocked={Boolean(activeBundleSession.bundle.lockExitUntilTimeout && userRole === 'student')}
              onStartNext={handleStartNextInBundle}
            />
          )}

          {activeBundleSession.phase === 'elective_cluster' && (
            <ElectiveClusterTakingView
              bundle={activeBundleSession.bundle}
              electiveExams={activeBundleSession.electiveExams}
              userRole={userRole}
              candidateName={candidateProfile.fullName}
              studentCode={candidateProfile.studentCode}
              onComplete={handleCompleteBundleElectiveCluster}
              onExit={() => {
                setConfirmModal({
                  isOpen: true,
                  title: 'Xác nhận thoát thi tổ hợp',
                  message: 'Bạn có chắc muốn thoát toàn bộ buổi thi tổ hợp liên môn này? Tiến trình làm bài chưa nộp sẽ không được lưu.',
                  confirmText: 'Rời phòng thi',
                  cancelText: 'Tiếp tục làm bài',
                  isDanger: true,
                  onConfirm: () => {
                    setActiveBundleSession(null);
                    setActiveAttemptClassId(null);
                    setCurrentView('home');
                  },
                });
              }}
            />
          )}
        </main>
      )}


      {/* Non-taking views with Left Sidebar Layout */}
      {currentView !== 'taking' && currentView !== 'bundle-taking' && (
        <div className="flex flex-col lg:flex-row flex-1 min-h-screen">
          {/* Left Sidebar (Desktop: Sticky w-72 xl:w-80) */}
          <aside className="hidden lg:flex w-72 xl:w-80 shrink-0 bg-white border-r border-slate-200 sticky top-0 h-screen overflow-y-auto p-4 z-30 flex-col justify-between">
            {renderSidebarNav()}
          </aside>

          {/* Mobile Navigation Drawer (Slide-in) */}
          {isMobileNavOpen && (
            <div className="fixed inset-0 z-50 flex lg:hidden">
              <div 
                className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
                onClick={() => setIsMobileNavOpen(false)}
              />
              <aside className="relative w-80 max-w-[85vw] bg-white h-full p-4 overflow-y-auto z-10 shadow-2xl flex flex-col justify-between">
                {renderSidebarNav()}
              </aside>
            </div>
          )}

          {/* Main Content Area */}
          <div className="flex-1 min-w-0 flex flex-col">
            {/* Compact Top Header Bar */}
            <header className="sticky top-0 z-20 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-2xs px-4 sm:px-6 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsMobileNavOpen(true)}
                  className="lg:hidden p-2 rounded-xl text-slate-700 hover:bg-slate-100 border border-slate-200 cursor-pointer"
                  aria-label="Mở menu điều hướng"
                >
                  <Menu className="w-5 h-5" />
                </button>
                
                <div className="min-w-0">
                  <div className="font-extrabold text-slate-900 text-base leading-tight">
                    {currentView === 'home' && (homeTab === 'single' ? 'Ngân hàng Đề thi' : 'Tổ hợp Đề liên môn')}
                    {currentView === 'classrooms' && 'Hệ thống Lớp học & Khóa học'}
                    {currentView === 'courses' && 'Khóa học & Lý thuyết tương tác'}
                    {currentView === 'battle' && 'Đấu trường Tri thức (1v1 Arena)'}
                    {currentView === 'analytics' && 'Năng lực cá nhân Học sinh'}
                    {currentView === 'teacher-tools' && 'Công cụ Giáo viên · Bảng điểm & Vinh danh'}
                    {currentView === 'history' && 'Lịch sử & Báo cáo Điểm số'}
                    {currentView === 'create' && 'Soạn thảo Đề thi Mới'}
                    {currentView === 'bundle-create' && 'Tạo Tổ hợp Thi Liên môn'}
                    {currentView === 'result' && 'Kết quả Bài thi'}
                    {currentView === 'bundle-result' && 'Tổng kết Điểm Tổ hợp Liên môn'}
                  </div>
                  <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-slate-500 mt-0.5 min-w-0">
                    <Link2 className="w-3 h-3 text-blue-600 shrink-0" />
                    <a
                      href={currentRoutePath}
                      onClick={(e) => e.preventDefault()}
                      className="font-mono text-slate-600 hover:text-blue-700 truncate max-w-[380px] lg:max-w-[520px]"
                      title={typeof window !== 'undefined' ? `${window.location.origin}${currentRoutePath}` : currentRoutePath}
                    >
                      {currentRoutePath}
                    </a>
                    <button
                      type="button"
                      onClick={() => {
                        if (typeof window !== 'undefined' && navigator.clipboard) {
                          navigator.clipboard.writeText(`${window.location.origin}${currentRoutePath}`).catch(() => {});
                        }
                        setCopiedRouteLink(true);
                        setTimeout(() => setCopiedRouteLink(false), 2000);
                      }}
                      className="px-1.5 py-0.5 rounded bg-slate-100 hover:bg-blue-50 text-slate-600 hover:text-blue-700 border border-slate-200 text-[10px] font-semibold inline-flex items-center gap-1 cursor-pointer shrink-0"
                      title="Sao chép đường link trang hiện tại"
                    >
                      {copiedRouteLink ? (
                        <>
                          <Check className="w-2.5 h-2.5 text-emerald-600" />
                          <span className="text-emerald-700">Đã chép</span>
                        </>
                      ) : (
                        <span>Sao chép link</span>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Right quick tools */}
              <div className="flex items-center gap-2">
                {/* Direct 8-digit code */}
                <button
                  type="button"
                  onClick={() => {
                    setAccessModalInitialCode('');
                    setIsExamAccessModalOpen(true);
                  }}
                  className="px-2.5 sm:px-3 py-1.5 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer shadow-2xs"
                  title="Nhập mã số 8 chữ số đề thi hoặc tổ hợp để bắt đầu làm bài"
                >
                  <KeyRound className="w-3.5 h-3.5 text-blue-600" />
                  <span className="hidden sm:inline">Vào thi mã số</span>
                  <span className="sm:hidden">Mã thi</span>
                </button>

                {currentUser && (
                  <button
                    type="button"
                    onClick={handleManualSync}
                    className={`px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
                      syncStatus === 'syncing'
                        ? 'bg-blue-50 border-blue-300 text-blue-700 animate-pulse'
                        : syncStatus === 'error'
                        ? 'bg-rose-50 border-rose-300 text-rose-700 hover:bg-rose-100'
                        : syncStatus === 'synced'
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100'
                        : 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700'
                    }`}
                    title={
                      syncStatus === 'error' && syncErrorMsg
                        ? `Lỗi đồng bộ: ${syncErrorMsg} (Nhấn để Đồng bộ ngay)`
                        : 'Nhấn để Đồng bộ ngay với Cloud Firestore (idyllic-setting-15v9p)'
                    }
                  >
                    <Cloud className={`w-3.5 h-3.5 ${syncStatus === 'syncing' ? 'animate-spin' : ''}`} />
                    <span className="hidden sm:inline">
                      {syncStatus === 'syncing'
                        ? 'Đang đồng bộ...'
                        : syncStatus === 'error'
                        ? 'Lỗi đồng bộ · Đồng bộ ngay'
                        : syncStatus === 'synced'
                        ? 'Đã đồng bộ Cloud'
                        : 'Đồng bộ ngay'}
                    </span>
                    <span className="sm:hidden">
                      {syncStatus === 'syncing' ? 'Đang bộ...' : syncStatus === 'error' ? 'Lỗi' : 'Cloud'}
                    </span>
                  </button>
                )}

                {isActualTeacher && (
                  <button
                    type="button"
                    onClick={() => handleSwitchRole(userRole === 'teacher' ? 'student' : 'teacher')}
                    className={`px-2.5 py-1.5 text-xs font-bold rounded-lg border transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
                      userRole === 'student'
                        ? 'bg-emerald-600 text-white border-emerald-700 hover:bg-emerald-700 shadow-xs'
                        : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                    }`}
                    title={
                      userRole === 'teacher'
                        ? 'Chuyển sang góc nhìn Trải nghiệm Học sinh'
                        : 'Quay lại giao diện Giáo viên'
                    }
                  >
                    {userRole === 'student' ? (
                      <>
                        <GraduationCap className="w-3.5 h-3.5" />
                        <span className="hidden md:inline">Quay lại Giáo viên</span>
                        <span className="md:hidden">Về GV</span>
                      </>
                    ) : (
                      <>
                        <Eye className="w-3.5 h-3.5 text-emerald-700" />
                        <span className="hidden md:inline">Trải nghiệm Học sinh</span>
                        <span className="md:hidden">Vai HS</span>
                      </>
                    )}
                  </button>
                )}

                {isActualTeacher && userRole === 'teacher' && (
                  <>
                    <button
                      onClick={() => setIsLiveEditMode(!isLiveEditMode)}
                      className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer ${
                        isLiveEditMode
                          ? 'bg-amber-400 text-slate-950 ring-2 ring-amber-300 font-bold shadow-xs'
                          : 'text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200'
                      }`}
                      title="Bật quyền viết, sửa, xóa text trực tiếp trên trang"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span className="hidden md:inline">
                        {isLiveEditMode ? 'Sửa text ON' : 'Sửa text (Live)'}
                      </span>
                    </button>

                    <button
                      onClick={() => {
                        requestProtectedNavigate(() => {
                          setEditingExam(null);
                          setCurrentView('create');
                        });
                      }}
                      className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Tạo đề mới</span>
                    </button>
                  </>
                )}
              </div>
            </header>

            {/* Persistent Teacher Student-Experience Mode Banner */}
            {isActualTeacher && userRole === 'student' && (
              <div className="bg-emerald-700 text-white px-4 sm:px-6 py-2.5 border-b border-emerald-800 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Eye className="w-4 h-4 text-emerald-200 shrink-0" />
                  <div className="leading-snug">
                    <strong className="font-bold">Chế độ Trải nghiệm Học sinh đang bật:</strong>{' '}
                    <span className="text-emerald-100">
                      Mọi đề thi, khóa học (chặn từng block/bài) và lớp học đang hiển thị đúng như góc nhìn học sinh. Bài làm thử trong lớp không ghi điểm vào bảng điểm lớp.
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleSwitchRole('teacher')}
                  className="px-3 py-1.5 rounded-lg bg-white text-emerald-900 hover:bg-emerald-50 font-bold text-xs flex items-center gap-1.5 cursor-pointer shrink-0 whitespace-nowrap shadow-2xs"
                >
                  <GraduationCap className="w-3.5 h-3.5" />
                  <span>Quay lại Chế độ Giáo viên</span>
                </button>
              </div>
            )}

            {/* All non-taking views */}

{/* View 3: Bundle Result Summary */}
      {currentView === 'bundle-result' && activeBundleSession && (
        <main className="flex-1">
          <BundleResultSummary
            bundle={activeBundleSession.bundle}
            results={activeBundleSession.results}
            onRetakeBundle={() => handleStartBundle(activeBundleSession.bundle, activeBundleSession.allSelectedExams)}
            onGoHome={() => {
              setActiveBundleSession(null);
              setCurrentView('home');
            }}
          />
        </main>
      )}

      {/* View 4: Single Exam Result View */}
      {currentView === 'result' && currentResult && (
        <main className="flex-1">
          <ExamResultView
            result={currentResult}
            onRetake={() => {
              const orig = exams.find((e) => e.id === currentResult.examId) || activeExam;
              if (orig) {
                setActiveExam(orig);
                setActiveMode('exam');
                setCurrentView('taking');
              }
            }}
            onRetakeMistakes={handleRetakeMistakes}
            onGoHome={() => setCurrentView('home')}
          />
        </main>
      )}

      {/* View 5: Custom Single Exam Creator */}
      {currentView === 'create' && (
        <main className="flex-1">
          {isActualTeacher ? (
            <CustomExamCreator
              initialExam={editingExam}
              onSave={handleSaveCustomExam}
              onRegisterUnsavedGuard={(g) => {
                unsavedGuardRef.current = g;
              }}
              onCancel={() => {
                requestProtectedNavigate(() => {
                  unsavedGuardRef.current = null;
                  setEditingExam(null);
                  setCurrentView('home');
                });
              }}
            />
          ) : (
            <div className="max-w-md mx-auto my-16 p-8 bg-white rounded-2xl border border-slate-200 text-center shadow-xs">
              <ShieldAlert className="w-12 h-12 text-rose-500 mx-auto mb-3" />
              <h3 className="text-base font-bold text-slate-900 mb-1">Quyền truy cập bị giới hạn</h3>
              <p className="text-xs text-slate-600 mb-6">
                Chỉ tài khoản Giáo viên mới có quyền soạn và chỉnh sửa đề thi. Bạn đang đăng nhập với tư cách Học sinh hoặc Khách.
              </p>
              <button
                onClick={() => setCurrentView('home')}
                className="py-2.5 px-5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Về trang chủ
              </button>
            </div>
          )}
        </main>
      )}

      {/* View 6: Multi-subject Bundle Creator */}
      {currentView === 'bundle-create' && (
        <main className="flex-1">
          {isActualTeacher ? (
            <BundleCreator
              availableExams={visibleLibraryExams}
              initialBundle={editingBundle}
              onSave={handleSaveCustomBundle}
              onRegisterUnsavedGuard={(g) => {
                unsavedGuardRef.current = g;
              }}
              onCancel={() => {
                requestProtectedNavigate(() => {
                  unsavedGuardRef.current = null;
                  setEditingBundle(null);
                  setCurrentView('home');
                });
              }}
            />
          ) : (
            <div className="max-w-md mx-auto my-16 p-8 bg-white rounded-2xl border border-slate-200 text-center shadow-xs">
              <ShieldAlert className="w-12 h-12 text-rose-500 mx-auto mb-3" />
              <h3 className="text-base font-bold text-slate-900 mb-1">Quyền truy cập bị giới hạn</h3>
              <p className="text-xs text-slate-600 mb-6">
                Chỉ tài khoản Giáo viên mới có quyền tạo tổ hợp thi liên môn.
              </p>
              <button
                onClick={() => setCurrentView('home')}
                className="py-2.5 px-5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Về trang chủ
              </button>
            </div>
          )}
        </main>
      )}

      {/* View 7: Exam History */}
      {currentView === 'history' && (
        <main className="flex-1">
          <ExamHistoryView
            results={results}
            exams={exams}
            currentUser={currentUser}
            isTeacher={isActualTeacher && userRole === 'teacher'}
            courses={courses}
            classrooms={classrooms}
            onSelectResult={(res) => {
              setCurrentResult(res);
              setCurrentView('result');
            }}
            onDeleteResult={isActualTeacher && userRole === 'teacher' ? handleDeleteHistoryResult : undefined}
            onClearResults={isActualTeacher && userRole === 'teacher' ? handleClearHistoryResults : undefined}
            onBack={() => setCurrentView('home')}
          />
        </main>
      )}

      {/* View 8: Classroom Management & Analytics */}
      {currentView === 'classrooms' && (
        <main className="flex-1">
          <ClassroomManagementView
            classrooms={classrooms}
            allExams={exams}
            allBundles={bundles}
            allCourses={courses}
            results={results}
            userRole={userRole}
            currentUser={currentUser}
            onRequestAuth={() => {
              setAuthModalMode('login');
              setIsAuthModalOpen(true);
            }}
            activeClassId={activeClassId}
            initialTab={urlClassroomTab}
            onSelectClass={handleSelectClass}
            onRouteChange={(classroom, tab) => {
              setClassroomRouteLocation({ classroom, tab });
            }}
            onOpenCourse={(course) => {
              requestProtectedNavigate(() => {
                setSelectedCourseIdForView(course.id);
                setUrlCourseChapterSlug(undefined);
                setUrlCourseLessonSlug(undefined);
                setCurrentView('courses');
              });
            }}
            onRefreshData={refreshAllData}
            onRegisterUnsavedGuard={(g) => {
              unsavedGuardRef.current = g;
            }}
            onStartExam={(exam, mode, classId) => handleStartExam(exam, mode, undefined, undefined, classId)}
            onStartBundle={(bundle, classId) => handleStartBundle(bundle, undefined, undefined, undefined, classId)}
            onPresentExam={
              isActualTeacher && userRole === 'teacher'
                ? (ex) => setPresentingExamForStage(ex)
                : undefined
            }
          />
        </main>
      )}

      {/* View 9: Micro-Courses (Khóa học nhỏ) */}
      {currentView === 'courses' && (
        <main className="flex-1">
          <MicroCoursesView
            courses={courses}
            allExams={exams}
            classrooms={classrooms}
            initialCourseId={selectedCourseIdForView}
            initialChapterSlug={urlCourseChapterSlug}
            initialLessonSlug={urlCourseLessonSlug}
            userRole={userRole}
            onRefreshCourses={refreshAllData}
            onRegisterUnsavedGuard={(g) => {
              unsavedGuardRef.current = g;
            }}
            onStartExam={(exam, mode) => handleStartExam(exam, mode)}
            onCourseLocationChange={(course, chapter, lesson) => {
              setCourseRouteLocation({ course, chapter, lesson });
            }}
          />
        </main>
      )}

      {/* View 10: 1v1 Battle Arena (Đấu trường đối kháng) */}
      {currentView === 'battle' && (
        <main className="flex-1">
          <BattleArenaView
            onBackToHome={() => setCurrentView('home')}
            allExams={exams}
            allBundles={bundles}
            currentUser={currentUser}
            userRole={userRole}
            classrooms={classrooms}
          />
        </main>
      )}

      {/* View 10b: Dedicated Private Student Competency Tab */}
      {currentView === 'analytics' && (
        <main className="flex-1">
          <StudentCompetencyView
            currentUser={currentUser}
            results={results}
            exams={exams}
            classrooms={classrooms}
            courses={courses}
            subjects={subjects}
            onRequestAuth={() => {
              setAuthModalMode('login');
              setIsAuthModalOpen(true);
            }}
            onSelectResult={(res) => {
              setCurrentResult(res);
              setCurrentView('result');
            }}
            onOpenCourse={(course) => {
              setSelectedCourseIdForView(course.id);
              setCurrentView('courses');
            }}
            onOpenClassrooms={() => setCurrentView('classrooms')}
            onGoHome={() => setCurrentView('home')}
          />
        </main>
      )}

      {/* View 10c: Teacher Tools (Scoreboards, Odometer Reveal, FLIP Ranking, Mode Sync & Hidden Exams) */}
      {currentView === 'teacher-tools' && (
        <main className="flex-1">
          {isActualTeacher ? (
            <TeacherToolsView
              currentUser={currentUser}
              allExams={exams}
              results={results}
              classrooms={classrooms}
              onExamsChanged={refreshAllData}
              onEditExam={(exam) => {
                setEditingExam(exam);
                setCurrentView('create');
              }}
              onRegisterUnsavedGuard={(g) => {
                unsavedGuardRef.current = g;
              }}
            />
          ) : (
            <div className="max-w-md mx-auto my-16 p-8 bg-white rounded-2xl border border-slate-200 text-center shadow-xs">
              <ShieldAlert className="w-12 h-12 text-rose-500 mx-auto mb-3" />
              <h3 className="text-base font-bold text-slate-900 mb-1">Quyền truy cập bị giới hạn</h3>
              <p className="text-xs text-slate-600 mb-6">
                Chỉ tài khoản Giáo viên mới có quyền truy cập Công cụ Giáo viên và quản lý bảng điểm vinh danh.
              </p>
              <button
                onClick={() => setCurrentView('home')}
                className="py-2.5 px-5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Về trang chủ
              </button>
            </div>
          )}
        </main>
      )}

      {/* View 11: Home / Library */}
      {currentView === 'home' && (
        <main className="flex-1">
          {/* Hero Section */}
          <section className="bg-white border-b border-slate-200 overflow-hidden">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 lg:py-14">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
                {/* Left Hero Text (7 cols) */}
                <div className="lg:col-span-7">
                  <div className="flex items-center gap-2 text-xs font-semibold text-blue-700 uppercase tracking-wider mb-3">
                    <Sparkles className="w-4 h-4 text-blue-600 shrink-0" />
                    <EditableText
                      id="hero_badge"
                      defaultText="Làm đề online · Hỗ trợ Toán học KaTeX, Bảng biểu & Tổ hợp môn"
                      as="span"
                      isLiveEditMode={isLiveEditMode}
                      className="font-semibold"
                    />
                  </div>

                  <EditableText
                    id="hero_title"
                    defaultText="Luyện thi toàn diện chuẩn thi cử cùng EduTest"
                    as="h1"
                    isLiveEditMode={isLiveEditMode}
                    className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-slate-900 leading-[1.15] text-balance mb-4 block"
                  />

                  <EditableText
                    id="hero_desc"
                    defaultText="Hỗ trợ hiển thị công thức Toán học chuẩn LaTeX, bảng biến thiên, hình ảnh minh họa và tính năng thi tổ hợp liên môn với thời gian chờ nghỉ giải lao đếm ngược chuẩn kỳ thi quốc gia."
                    as="p"
                    isLiveEditMode={isLiveEditMode}
                    className="text-sm sm:text-base text-slate-600 leading-relaxed max-w-xl mb-6 block"
                  />

                  {/* Hero Action Buttons */}
                  <div className="flex flex-wrap items-center gap-3 mb-6">
                    <button
                      onClick={() => {
                        setAccessModalInitialCode('');
                        setIsExamAccessModalOpen(true);
                      }}
                      className="py-3 px-5 text-xs sm:text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-xl transition-all cursor-pointer flex items-center gap-2 shadow-md shadow-blue-500/20"
                    >
                      <KeyRound className="w-4 h-4 text-amber-300" />
                      <span>Vào thi bằng mã số (8 số)</span>
                    </button>
                    <button
                      onClick={() => {
                        setHomeTab('bundle');
                      }}
                      className="py-3 px-4 text-xs sm:text-sm font-semibold text-purple-900 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-xl transition-colors cursor-pointer flex items-center gap-2"
                    >
                      <Layers className="w-4 h-4 text-purple-600" />
                      <span>Xem tổ hợp thi liên môn</span>
                    </button>
                  </div>

                  {/* Quantitative proof points with clear unboxed labels */}
                  <div className="flex flex-wrap items-center gap-6 pt-2 border-t border-slate-100 text-xs sm:text-sm text-slate-600">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-blue-600" />
                      <span>Đồng hồ bấm giờ chuẩn thi</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Coffee className="w-4 h-4 text-amber-600" />
                      <span>Nghỉ giải lao chuyển môn</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-emerald-600" />
                      <span>100% có đáp án & lời giải</span>
                    </div>
                  </div>
                </div>

                {/* Right Hero Visual Banner (5 cols) */}
                <div className="lg:col-span-5">
                  <div className="relative rounded-2xl overflow-hidden border border-slate-200 shadow-md aspect-16/10 bg-slate-100">
                    <img
                      src="/src/assets/images/hero_exam_study_1793293047418.jpg"
                      alt="Bàn học và không gian làm bài thi trực tuyến EduTest"
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900/40 via-transparent to-transparent pointer-events-none" />
                    <div className="absolute bottom-3 left-3 right-3 text-white text-xs font-medium px-2 py-1 drop-shadow-sm flex items-center justify-between">
                      <span>Phòng thi mô phỏng trực tuyến</span>
                      <span className="font-mono">Chuẩn cấu trúc 2026</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Exam Directory & Filters (Dài và rộng rãi) */}
          <section className="max-w-[1720px] mx-auto px-4 sm:px-8 py-8">
            {/* Guest notice banner */}
            {!currentUser && (
              <div className="mb-6 p-4 rounded-2xl bg-blue-50/80 border border-blue-200 text-blue-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-2xs">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
                    ET
                  </div>
                  <div>
                    <div className="font-extrabold text-blue-950 text-sm">
                      Chế độ Khách (Chưa đăng nhập) · Chỉ xem và làm bài công khai
                    </div>
                    <div className="text-blue-800 text-xs mt-0.5">
                      Bạn có quyền truy cập vào các đề thi, bài tập và khóa học công khai. Để lưu kết quả thi hoặc truy cập đề thi riêng của lớp học, vui lòng đăng nhập hoặc đăng ký tài khoản.
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => {
                      setAuthModalMode('login');
                      setIsAuthModalOpen(true);
                    }}
                    className="px-3.5 py-1.5 text-xs font-bold text-blue-700 bg-white hover:bg-blue-100 rounded-lg border border-blue-200 transition-colors cursor-pointer"
                  >
                    Đăng nhập
                  </button>
                  <button
                    onClick={() => {
                      setAuthModalMode('register');
                      setIsAuthModalOpen(true);
                    }}
                    className="px-3.5 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors cursor-pointer shadow-xs"
                  >
                    Đăng ký ngay
                  </button>
                </div>
              </div>
            )}

            {/* Student role status banner */}
            {currentUser && !isActualTeacher && (
              <div className="mb-6 p-3.5 rounded-2xl bg-emerald-50/80 border border-emerald-200 text-emerald-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-2xs">
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
                    HS
                  </span>
                  <div>
                    <span className="font-bold text-emerald-900 text-sm">Giao diện Học sinh ({currentUser.fullName}): </span>
                    <span className="text-emerald-800 text-xs block sm:inline mt-0.5 sm:mt-0">
                      Bạn có quyền làm các đề thi công khai và các lớp học/đề thi được giáo viên duyệt cho phép.
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => setCurrentView('classrooms')}
                    className="px-3.5 py-1.5 font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors cursor-pointer text-xs"
                  >
                    Lớp học của tôi
                  </button>
                  <button
                    onClick={() => setIsTeacherRequestModalOpen(true)}
                    className="px-3 py-1.5 font-semibold rounded-lg bg-white text-emerald-800 border border-emerald-300 hover:bg-emerald-100 transition-colors cursor-pointer text-xs"
                  >
                    Xin quyền Giáo viên
                  </button>
                </div>
              </div>
            )}

            {/* Primary Category Switcher: Đề thi từng môn VS Tổ hợp liên môn (Dài ra, rộng rãi) */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 mb-6">
              <div className="flex items-center gap-2 p-1.5 bg-slate-200/80 rounded-2xl max-w-fit shadow-inner">
                <button
                  onClick={() => setHomeTab('single')}
                  className={`py-3 px-8 text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2.5 cursor-pointer min-w-[240px] ${
                    homeTab === 'single'
                      ? 'bg-white text-slate-900 shadow-sm scale-101'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <BookOpen className="w-4 h-4 text-blue-600" />
                  <span>Đề thi theo môn lẻ ({visibleLibraryExams.length})</span>
                </button>
                <button
                  onClick={() => setHomeTab('bundle')}
                  className={`py-3 px-8 text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2.5 cursor-pointer min-w-[240px] ${
                    homeTab === 'bundle'
                      ? 'bg-white text-purple-900 shadow-sm scale-101'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Layers className="w-4 h-4 text-purple-600" />
                  <span>Tổ hợp thi liên môn ({visibleLibraryBundles.length})</span>
                </button>
              </div>

              {/* Search Bar */}
              <div className="relative w-full sm:w-80">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={
                    homeTab === 'single'
                      ? 'Tìm kiếm theo môn, tên đề...'
                      : 'Tìm tổ hợp thi...'
                  }
                  className="w-full pl-10 pr-4 py-2.5 text-xs sm:text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 shadow-2xs"
                />
              </div>
            </div>

            {/* If Single Exams Tab */}
            {homeTab === 'single' && (
              <>
                {/* Subject Sub-filters (Dài ra, hiển thị rõ ràng nội dung từng môn) */}
                <div className="flex items-center gap-2.5 overflow-x-auto pb-3 mb-6 text-xs sm:text-sm">
                  <button
                    onClick={() => setSelectedSubject('all')}
                    className={`px-5 py-2.5 font-bold rounded-xl whitespace-nowrap transition-all cursor-pointer min-w-[130px] text-center shadow-2xs ${
                      selectedSubject === 'all'
                        ? 'bg-slate-900 text-white shadow-sm'
                        : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                    }`}
                  >
                    Tất cả đề ({visibleLibraryExams.length})
                  </button>

                  {subjects.map((sub) => {
                    const count = visibleLibraryExams.filter(
                      (e) => e.subject === sub.id || e.subject.toLowerCase() === sub.name.toLowerCase()
                    ).length;
                    return (
                      <button
                        key={sub.id}
                        onClick={() => setSelectedSubject(sub.id)}
                        className={`px-5 py-2.5 font-bold rounded-xl whitespace-nowrap transition-all cursor-pointer min-w-[130px] text-center shadow-2xs ${
                          selectedSubject === sub.id
                            ? 'bg-slate-900 text-white shadow-sm'
                            : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                        }`}
                      >
                        {sub.name} {count > 0 && `(${count})`}
                      </button>
                    );
                  })}

                  <button
                    onClick={() => setSelectedSubject('custom')}
                    className={`px-5 py-2.5 font-bold rounded-xl whitespace-nowrap transition-all cursor-pointer min-w-[120px] text-center shadow-2xs ${
                      selectedSubject === 'custom'
                        ? 'bg-slate-900 text-white shadow-sm'
                        : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                    }`}
                  >
                    Đề tự tạo
                  </button>

                  {/* Manage subjects modal trigger - ONLY TEACHER */}
                  {isActualTeacher && userRole === 'teacher' && (
                    <button
                      onClick={() => setIsTabAndSubjectModalOpen(true)}
                      className="px-4 py-2.5 font-bold text-xs sm:text-sm text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1.5 shrink-0 shadow-2xs"
                      title="Thêm, xóa hoặc chỉnh sửa danh mục môn học"
                    >
                      <SlidersHorizontal className="w-4 h-4 text-blue-600" />
                      <span>Tùy biến Môn</span>
                    </button>
                  )}
                  {isActualTeacher && userRole === 'teacher' && results.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        const res = exportResultsToExcel(results);
                        setSyncToast(`✓ Đã xuất ${res.count} kết quả thi ra file ${res.fileName}!`);
                        setTimeout(() => setSyncToast(null), 4000);
                      }}
                      className="px-4 py-2.5 font-bold text-xs sm:text-sm text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1.5 shrink-0 shadow-2xs"
                      title="Xuất toàn bộ kết quả học sinh tham gia thi ra Excel (.xlsx)"
                    >
                      <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
                      <span>Xuất Excel KQ ({results.length})</span>
                    </button>
                  )}
                  {isMasterAdmin && userRole === 'teacher' && visibleLibraryExams.length > 0 && (
                    <button
                      onClick={handleDeleteAllExams}
                      className="ml-auto px-2.5 py-1 text-xs font-semibold rounded-lg whitespace-nowrap transition-colors cursor-pointer text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 flex items-center gap-1 shrink-0"
                      title="Xóa toàn bộ các đề thi hiện có trong thư viện"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Xóa sạch tất cả đề</span>
                    </button>
                  )}
                </div>

                {/* Exam Cards Grid */}
                {isInitialLoading && visibleLibraryExams.length === 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 my-2">
                    {[1, 2, 3, 4, 5, 6].map((sk) => (
                      <div
                        key={sk}
                        className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4 animate-pulse"
                      >
                        <div className="flex items-center justify-between">
                          <div className="h-5 w-24 bg-slate-200 rounded-md" />
                          <div className="h-5 w-16 bg-slate-100 rounded-md" />
                        </div>
                        <div className="space-y-2">
                          <div className="h-5 w-4/5 bg-slate-200 rounded-md" />
                          <div className="h-4 w-2/3 bg-slate-100 rounded-md" />
                        </div>
                        <div className="flex gap-3 pt-2">
                          <div className="h-4 w-20 bg-slate-100 rounded-md" />
                          <div className="h-4 w-20 bg-slate-100 rounded-md" />
                        </div>
                        <div className="h-10 w-full bg-slate-200 rounded-xl mt-2" />
                      </div>
                    ))}
                  </div>
                ) : filteredExams.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-slate-200 p-8 sm:p-12 text-center my-6">
                    <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    {visibleLibraryExams.length === 0 ? (
                      <>
                        <h3 className="text-base font-bold text-slate-900 mb-1">
                          Chưa có đề thi nào trong hệ thống
                        </h3>
                        <p className="text-xs sm:text-sm text-slate-500 max-w-lg mx-auto mb-6 leading-relaxed">
                          {isActualTeacher && userRole === 'teacher'
                            ? 'Danh sách đề thi đang trống. Bạn có thể soạn đề thi mới chuẩn kỳ thi để học sinh luyện tập.'
                            : 'Hiện tại chưa có đề thi nào được mở. Vui lòng quay lại sau hoặc liên hệ giáo viên phụ trách.'}
                        </p>
                        {isActualTeacher && userRole === 'teacher' && (
                          <div className="flex flex-wrap items-center justify-center gap-3">
                            <button
                              onClick={() => setCurrentView('create')}
                              className="py-2.5 px-4 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>Soạn đề thi mới</span>
                            </button>
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <h3 className="text-base font-bold text-slate-900 mb-1">
                          Không tìm thấy đề thi phù hợp
                        </h3>
                        <p className="text-xs sm:text-sm text-slate-500 mb-6">
                          Thử tìm với từ khóa khác hoặc bạn có thể tự tạo đề thi mới theo ý muốn.
                        </p>
                        <button
                          onClick={() => {
                            setSelectedSubject('all');
                            setSearchQuery('');
                          }}
                          className="py-2 px-4 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                        >
                          Đặt lại bộ lọc
                        </button>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredExams.map((exam) => {
                      const isEnrolled = exam.assignedClassId
                        ? classrooms.some((c) => c.id === exam.assignedClassId && isStudentMemberOfClass(c, currentUser))
                        : true;
                      const isCreator = isActualTeacher && userRole === 'teacher' && isCreatorOfItem(exam, currentUser);
                      const examResultCount = results.filter((r) => r.examId === exam.id).length;
                      return (
                        <ExamCard
                          key={exam.id}
                          exam={exam}
                          userRole={isActualTeacher ? userRole : 'student'}
                          attemptCount={examResultCount}
                          resultCount={examResultCount}
                          activeClassId={activeClassId}
                          isEnrolledInClass={isEnrolled}
                          onStartExam={handleStartExam}
                          onPreviewExam={(e) => setPreviewingExam(e)}
                          onEditExam={isCreator ? handleEditExam : undefined}
                          onDuplicateExam={isActualTeacher && userRole === 'teacher' ? handleDuplicateExam : undefined}
                          onDeleteCustom={isCreator ? handleDeleteCustomExam : undefined}
                          onExportWord={isActualTeacher && userRole === 'teacher' ? handleExportExamWord : undefined}
                          onExportResultsExcel={isActualTeacher && userRole === 'teacher' ? handleExportExamResultsExcel : undefined}
                          onPresentExam={
                            isActualTeacher && userRole === 'teacher'
                              ? (ex) => setPresentingExamForStage(ex)
                              : undefined
                          }
                        />
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {/* If Multi-Subject Bundle Tab */}
            {homeTab === 'bundle' && (
              <div>
                <div className="mb-6 p-4 bg-purple-50/70 border border-purple-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-bold text-purple-950 flex items-center gap-1.5">
                      <Layers className="w-4 h-4 text-purple-700" />
                      <span>Tính năng Tổ hợp đề thi liên môn (Có thời gian chờ)</span>
                    </h3>
                    <p className="text-xs text-purple-900/80 mt-1 max-w-2xl leading-relaxed">
                      Luyện thi liên tiếp nhiều môn theo đúng quy chế thi tốt nghiệp hoặc chứng chỉ: Hết thời gian môn này, hệ thống sẽ tự động chuyển sang <strong>màn hình thời gian nghỉ giải lao đếm ngược</strong> trước khi tự động vào môn thi kế tiếp!
                    </p>
                  </div>

                  {isActualTeacher && userRole === 'teacher' && (
                    <button
                      onClick={() => setCurrentView('bundle-create')}
                      className="py-2 px-4 text-xs font-semibold text-white bg-purple-700 hover:bg-purple-800 rounded-xl transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 shadow-xs cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Tạo tổ hợp mới</span>
                    </button>
                  )}
                </div>

                {isInitialLoading && visibleLibraryBundles.length === 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 my-2">
                    {[1, 2, 3].map((sk) => (
                      <div
                        key={sk}
                        className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4 animate-pulse"
                      >
                        <div className="h-5 w-28 bg-purple-100 rounded-md" />
                        <div className="h-5 w-3/4 bg-slate-200 rounded-md" />
                        <div className="h-4 w-1/2 bg-slate-100 rounded-md" />
                        <div className="h-10 w-full bg-slate-200 rounded-xl mt-2" />
                      </div>
                    ))}
                  </div>
                ) : filteredBundles.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center my-6">
                    <Layers className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    <h3 className="text-base font-bold text-slate-900 mb-1">
                      Không tìm thấy tổ hợp nào
                    </h3>
                    <p className="text-xs text-slate-500 mb-6">
                      {isActualTeacher && userRole === 'teacher'
                        ? 'Bạn có thể ghép các đề thi thành một tổ hợp môn mới theo ý muốn.'
                        : 'Hiện tại chưa có tổ hợp môn nào được mở công khai.'}
                    </p>
                    {isActualTeacher && userRole === 'teacher' && (
                      <button
                        onClick={() => setCurrentView('bundle-create')}
                        className="py-2 px-4 text-xs font-semibold text-white bg-purple-700 rounded-lg cursor-pointer"
                      >
                        Tạo tổ hợp ngay
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredBundles.map((bundle) => {
                      const isCreator = isActualTeacher && userRole === 'teacher' && isCreatorOfItem(bundle, currentUser);
                      return (
                        <BundleCard
                          key={bundle.id}
                          bundle={bundle}
                          allExams={exams}
                          userRole={isActualTeacher ? userRole : 'student'}
                          onStartBundle={handleStartBundle}
                          onSelectElectives={(b) => setSelectingElectiveBundle(b)}
                          onEditBundle={isCreator ? handleEditBundle : undefined}
                          onDeleteCustom={isCreator ? handleDeleteCustomBundle : undefined}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Quick Action CTA Section */}
          <section className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
            <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 flex flex-col md:flex-row items-center justify-between gap-6 shadow-xs">
              <div>
                <span className="text-xs font-semibold text-blue-700 uppercase tracking-wide">
                  {isActualTeacher && userRole === 'teacher' ? 'Dành cho giáo viên tổ chức' : 'Luyện thi & Phòng thi bảo mật'}
                </span>
                <EditableText
                  id="cta_title"
                  defaultText={isActualTeacher && userRole === 'teacher' 
                    ? "Bạn có sẵn đề thi muốn đưa lên web để học sinh luyện tập?" 
                    : "Bạn muốn vào phòng thi bảo mật hoặc tham gia lớp học?"}
                  as="h3"
                  isLiveEditMode={isLiveEditMode}
                  className="text-xl font-bold text-slate-900 mt-1 mb-2 block"
                />
                <EditableText
                  id="cta_desc"
                  defaultText={isActualTeacher && userRole === 'teacher'
                    ? "Hỗ trợ đầy đủ công thức Toán học LaTeX, chèn bảng biến thiên, hình ảnh minh họa, hoặc tạo đợt thi gồm nhiều môn liên tiếp!"
                    : "Nhập mã số vào thi 8 chữ số do giáo viên cung cấp hoặc gửi yêu cầu tham gia lớp để làm các bài kiểm tra riêng."}
                  as="p"
                  isLiveEditMode={isLiveEditMode}
                  className="text-xs sm:text-sm text-slate-600 max-w-xl block"
                />
              </div>

              <div className="flex items-center gap-3 shrink-0">
                {isActualTeacher && userRole === 'teacher' ? (
                  <>
                    <button
                      onClick={() => {
                        setEditingBundle(null);
                        setCurrentView('bundle-create');
                      }}
                      className="py-2.5 px-4 text-xs sm:text-sm font-semibold text-purple-800 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-xl transition-colors cursor-pointer flex items-center gap-2"
                    >
                      <Layers className="w-4 h-4 text-purple-700" />
                      <span>Tạo tổ hợp môn</span>
                    </button>
                    <button
                      onClick={() => {
                        setEditingExam(null);
                        setCurrentView('create');
                      }}
                      className="py-2.5 px-5 text-xs sm:text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-colors cursor-pointer flex items-center gap-2 shadow-xs"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Soạn đề thi ngay</span>
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setAccessModalInitialCode('');
                        setIsExamAccessModalOpen(true);
                      }}
                      className="py-2.5 px-4 text-xs sm:text-sm font-semibold text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl transition-colors cursor-pointer flex items-center gap-2"
                    >
                      <KeyRound className="w-4 h-4 text-blue-600" />
                      <span>Nhập mã số thi (8 số)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setCurrentView('classrooms')}
                      className="py-2.5 px-5 text-xs sm:text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-colors cursor-pointer flex items-center gap-2 shadow-xs"
                    >
                      <Users className="w-4 h-4" />
                      <span>Tham gia Lớp học</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          </section>
        </main>
      )}

            {/* Footer */}
            <footer className="bg-white border-t border-slate-200 py-6 text-xs text-slate-500">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-900">EduTest Online</span>
                  <span>· Hệ thống làm đề & luyện thi trắc nghiệm trực tuyến</span>
                </div>
                <div>
                  <span>Hỗ trợ KaTeX Math · Bảng biểu Markdown · Hình ảnh · Quyền viết, sửa, xóa trực tiếp.</span>
                </div>
              </div>
            </footer>
          </div>
        </div>
      )}


      {/* Floating Live Edit Mode Bar */}
      {isLiveEditMode && (
        <aside aria-label="Thanh công cụ chỉnh sửa văn bản trực tiếp" className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 bg-slate-900/95 backdrop-blur-md text-white px-5 py-3 rounded-2xl shadow-2xl border border-slate-700 flex items-center gap-4 text-xs sm:text-sm animate-in fade-in slide-in-from-bottom-3 duration-200">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
            <span className="font-semibold text-amber-300 whitespace-nowrap">Quyền sửa chữ đang bật:</span>
            <span className="hidden md:inline text-slate-300 text-xs">
              Nhấp trực tiếp vào bất kỳ văn bản nào có viền đứt nét để viết thêm, sửa hoặc xóa.
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => {
                setConfirmModal({
                  isOpen: true,
                  title: 'Khôi phục văn bản gốc',
                  message: 'Bạn có chắc chắn muốn khôi phục toàn bộ các đoạn văn bản về nội dung mặc định ban đầu không?',
                  confirmText: 'Khôi phục ngay',
                  cancelText: 'Hủy',
                  isDanger: false,
                  onConfirm: () => {
                    clearLiveTextOverrides();
                    window.location.reload();
                  },
                });
              }}
              className="px-2.5 py-1.5 text-xs text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors cursor-pointer flex items-center gap-1"
              title="Khôi phục chữ gốc"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Khôi phục gốc</span>
            </button>
            <button
              onClick={() => setIsLiveEditMode(false)}
              className="px-3.5 py-1.5 text-xs font-semibold text-slate-900 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors cursor-pointer"
            >
              Xong & Đóng
            </button>
          </div>
        </aside>
      )}

      {/* Global In-App Confirmation Modal */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText={confirmModal.confirmText}
        cancelText={confirmModal.cancelText}
        isDanger={confirmModal.isDanger}
        onConfirm={confirmModal.onConfirm}
        onClose={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
      />

      {/* Unsaved Changes Navigation Guard Modal (3 Choices: Save & Exit / Discard / Cancel OR 2 Choices: Confirm Discard) */}
      <UnsavedChangesModal
        isOpen={Boolean(pendingNavState)}
        variant={pendingNavState?.variant || 'default'}
        title={pendingNavState?.title}
        message={pendingNavState?.message}
        stayLabel={pendingNavState?.stayLabel}
        discardLabel={pendingNavState?.discardLabel}
        onSaveAndExit={async () => {
          const guard = unsavedGuardRef.current;
          if (guard) {
            const ok = await guard.saveAndExit();
            if (!ok) {
              setPendingNavState(null);
              return false;
            }
          }
          const fn = pendingNavState?.action;
          unsavedGuardRef.current = null;
          setPendingNavState(null);
          fn?.();
          return true;
        }}
        onDiscardAndExit={() => {
          const guard = unsavedGuardRef.current;
          guard?.discardChanges?.();
          const fn = pendingNavState?.action;
          unsavedGuardRef.current = null;
          setPendingNavState(null);
          fn?.();
        }}
        onCancel={() => setPendingNavState(null)}
      />

      {/* Global Exam Preview Modal (Xem thử đề thi) */}
      <ExamPreviewModal
        isOpen={Boolean(previewingExam)}
        exam={previewingExam}
        userRole={userRole}
        currentUser={currentUser}
        isTaking={false}
        onClose={() => setPreviewingExam(null)}
      />

      {/* Bundle Elective Selector Modal (Thí sinh chọn môn theo quy chế tự chọn) */}
      <BundleElectiveSelectorModal
        isOpen={Boolean(selectingElectiveBundle)}
        bundle={selectingElectiveBundle}
        allExams={exams}
        onConfirm={(chosenExams) => {
          if (selectingElectiveBundle) {
            handleStartBundle(selectingElectiveBundle, chosenExams);
            setSelectingElectiveBundle(null);
          }
        }}
        onClose={() => setSelectingElectiveBundle(null)}
      />

      {/* Tab & Subject Manager Modal */}
      <TabAndSubjectManagerModal
        isOpen={isTabAndSubjectModalOpen}
        navTabs={navTabs}
        subjects={subjects}
        onClose={() => {
          setIsTabAndSubjectModalOpen(false);
          refreshAllData();
        }}
        onRefreshTabsAndSubjects={refreshAllData}
      />

      {/* Global 8-Digit Exam/Bundle Access Portal Modal */}
      <ExamAccessModal
        isOpen={isExamAccessModalOpen}
        allExams={exams}
        allBundles={bundles}
        userRole={userRole}
        initialExamCode={accessModalInitialCode}
        onClose={() => setIsExamAccessModalOpen(false)}
        onEnterExam={(ex, name, code, chosenMode) => {
          setIsExamAccessModalOpen(false);
          handleStartExam(ex, chosenMode || 'exam', name, code);
        }}
        onEnterBundle={(b, name, code) => {
          setIsExamAccessModalOpen(false);
          handleStartBundle(b, undefined, name, code);
        }}
      />

      {/* Auth Modal (Đăng nhập & Đăng ký) */}
      <AuthModal
        isOpen={isAuthModalOpen}
        initialMode={authModalMode}
        onClose={() => setIsAuthModalOpen(false)}
        onSuccess={handleAuthSuccess}
      />

      {/* Teacher Role Request Modal (Học sinh xin nâng quyền Giáo viên) */}
      {currentUser && (
        <TeacherRequestModal
          isOpen={isTeacherRequestModalOpen}
          currentUser={currentUser}
          onClose={() => setIsTeacherRequestModalOpen(false)}
          onSubmitted={() => {
            refreshAllData();
          }}
        />
      )}

      {/* Teacher Requests Admin Review Modal (Duyệt yêu cầu Giáo viên dành cho Master Admin) */}
      {currentUser && (
        <TeacherRequestsAdminModal
          isOpen={isTeacherRequestsAdminModalOpen}
          currentUser={currentUser}
          onClose={() => setIsTeacherRequestsAdminModalOpen(false)}
          onUpdated={() => {
            refreshAllData();
            // In case the current user themselves was updated
            setCurrentUserAccount(getCurrentUser());
          }}
        />
      )}

      {/* Change Password Modal (Đổi mật khẩu trực tiếp) */}
      <ChangePasswordModal
        isOpen={isChangePasswordOpen}
        currentUser={currentUser}
        onClose={() => setIsChangePasswordOpen(false)}
      />

      {/* Fullscreen 50/50 Exam Room Score Presentation Stage */}
      {presentingExamForStage && isActualTeacher && (
        <ExamScorePresentationView
          exams={exams}
          results={results}
          classrooms={classrooms}
          initialExamId={presentingExamForStage.id}
          isFullscreenModal={true}
          onClose={() => setPresentingExamForStage(null)}
        />
      )}

      {/* Cloud Sync Toast Notification */}
      {syncToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white text-xs font-semibold px-4 py-3 rounded-xl shadow-2xl border border-slate-700 flex items-center gap-3 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <Cloud className="w-4 h-4 text-blue-400 shrink-0 animate-pulse" />
          <span>{syncToast}</span>
          <button
            type="button"
            onClick={() => setSyncToast(null)}
            className="text-slate-400 hover:text-white ml-2 text-xs"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
