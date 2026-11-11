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
  pullDataFromServer,
  triggerCloudSync,
  exportAllDataAsJson,
  importAllDataFromJson
} from './utils/storage';
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
import { ExamPreviewModal } from './components/ExamPreviewModal';
import { BundleElectiveSelectorModal } from './components/BundleElectiveSelectorModal';
import { ClassroomManagementView } from './components/ClassroomManagementView';
import { MicroCoursesView } from './components/MicroCoursesView';
import { BattleArenaView } from './components/BattleArenaView';
import { TabAndSubjectManagerModal } from './components/TabAndSubjectManagerModal';
import { ExamAccessModal } from './components/ExamAccessModal';
import { FeedbackModal } from './components/FeedbackModal';
import { AuthModal } from './components/AuthModal';
import { TeacherRequestModal } from './components/TeacherRequestModal';
import { TeacherRequestsAdminModal } from './components/TeacherRequestsAdminModal';
import { OnlineJudgeView } from './components/OnlineJudgeView';
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
  Terminal
} from 'lucide-react';

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
  | 'oj';

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
  const [currentView, setCurrentView] = useState<ViewState>('home');
  const [homeTab, setHomeTab] = useState<'single' | 'bundle'>('single');

  const [exams, setExams] = useState<Exam[]>(() => getAllExams());
  const [bundles, setBundles] = useState<ExamBundle[]>(() => getAllBundles());
  const [results, setResults] = useState<ExamResult[]>(() => getExamResults());
  const [classrooms, setClassrooms] = useState<Classroom[]>(() => getAllClassrooms());
  const [courses, setCourses] = useState<MicroCourse[]>(() => getAllCourses());
  const [subjects, setSubjects] = useState<CustomSubject[]>(() => getAllSubjects());
  const [navTabs, setNavTabs] = useState<NavTabItem[]>(() => getNavTabs());
  const [activeClassId, setActiveClassIdState] = useState<string>(() => getActiveClassId());
  const [isTabAndSubjectModalOpen, setIsTabAndSubjectModalOpen] = useState(false);
  const [isExamAccessModalOpen, setIsExamAccessModalOpen] = useState(false);
  const [accessModalInitialCode, setAccessModalInitialCode] = useState('');
  const [candidateProfile, setCandidateProfile] = useState(() => getCandidateProfile());
  
  // User Authentication & RBAC state
  const [currentUser, setCurrentUserAccount] = useState<UserAccount | null>(() => getCurrentUser());
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'register'>('login');
  const [isTeacherRequestModalOpen, setIsTeacherRequestModalOpen] = useState(false);
  const [isTeacherRequestsAdminModalOpen, setIsTeacherRequestsAdminModalOpen] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle');
  const [syncToast, setSyncToast] = useState<string | null>(null);
  const [showUserDropdown, setShowUserDropdown] = useState(false);

  // Xác định quyền Giáo viên thực sự: chỉ tài khoản Master Admin hoặc tài khoản giáo viên đã được phê duyệt
  const isActualTeacher = Boolean(
    currentUser && (currentUser.role === 'teacher' || currentUser.email.toLowerCase() === MASTER_ADMIN_EMAIL.toLowerCase())
  );

  // Role-based state (Phân quyền giáo viên và học sinh): Mặc định cho học sinh và khách chưa đăng nhập là 'student'
  const [userRole, setUserRole] = useState<UserRole>(() => {
    const user = getCurrentUser();
    if (user && (user.role === 'teacher' || user.email.toLowerCase() === MASTER_ADMIN_EMAIL.toLowerCase())) {
      const saved = localStorage.getItem('edutest_user_role') as UserRole;
      return saved || 'teacher';
    }
    return 'student'; // Mặc định tuyệt đối cho học sinh và khách chưa đăng nhập
  });

  // Pull cloud data on mount
  useEffect(() => {
    pullDataFromServer()
      .then((pulled) => {
        if (pulled) {
          refreshAllData();
          setSyncStatus('synced');
        }
      })
      .catch(() => {
        // Dev server or offline fallback
      });
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
    if (!isActualTeacher) return;
    setUserRole(newRole);
    localStorage.setItem('edutest_user_role', newRole);
    if (newRole === 'student') {
      setIsLiveEditMode(false);
    }
  };

  const handleManualSync = async () => {
    setSyncStatus('syncing');
    setSyncToast('Đang đồng bộ dữ liệu lên máy chủ web...');
    try {
      const res = await triggerCloudSync();
      if (res.success) {
        setSyncStatus('synced');
        setSyncToast('Đồng bộ thành công! Toàn bộ đề thi, lớp học và tài khoản đã được lưu trên máy chủ.');
      } else {
        setSyncStatus('idle');
        setSyncToast('Dữ liệu đã được lưu an toàn trên trình duyệt.');
      }
    } catch (e) {
      setSyncStatus('error');
      setSyncToast('Lỗi khi kết nối máy chủ đồng bộ.');
    }
    setTimeout(() => setSyncToast(null), 4000);
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
    logoutUserAccount();
    setCurrentUserAccount(null);
    setUserRole('student');
    setShowUserDropdown(false);
    refreshAllData();
  };

  const handleSelectClass = (classId: string) => {
    setActiveClassId(classId);
    setActiveClassIdState(classId);
  };

  // Preview exam modal state (Xem thử toàn bộ đề thi)
  const [previewingExam, setPreviewingExam] = useState<Exam | null>(null);

  // Elective subject selector modal state (Tổ hợp tự chọn môn thi)
  const [selectingElectiveBundle, setSelectingElectiveBundle] = useState<ExamBundle | null>(null);

  // Single active test state
  const [activeExam, setActiveExam] = useState<Exam | null>(null);
  const [activeMode, setActiveMode] = useState<'exam' | 'practice'>('exam');
  const [currentResult, setCurrentResult] = useState<ExamResult | null>(null);

  // Editing state (cho phép người dùng viết, sửa, xóa đề thi & tổ hợp)
  const [editingExam, setEditingExam] = useState<Exam | null>(null);
  const [editingBundle, setEditingBundle] = useState<ExamBundle | null>(null);
  const [isLiveEditMode, setIsLiveEditMode] = useState<boolean>(false);

  // Multi-subject Bundle session state
  const [activeBundleSession, setActiveBundleSession] = useState<ActiveBundleState | null>(null);

  // Filters
  const [selectedSubject, setSelectedSubject] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

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
    studentCodeOverride?: string
  ) => {
    // 1. Phân quyền truy cập đề thi:
    // Học sinh và khách chỉ có quyền truy cập đề thi công khai, trừ khi có sự cho phép của giáo viên (trong lớp học được duyệt hoặc có mã số dự thi)
    const isTeacherPermitted = isActualTeacher && userRole === 'teacher';
    if (!isTeacherPermitted) {
      // a. Đề thi riêng tư (Chế độ người ra đề)
      if (exam.visibility === 'private' || exam.status === 'draft') {
        setConfirmModal({
          isOpen: true,
          title: 'Đề thi bảo mật (Cần sự cho phép của Giáo viên)',
          message: 'Đề thi này đang ở chế độ riêng tư của người ra đề. Bạn cần được giáo viên phụ trách cho phép hoặc cung cấp mã dự thi 8 chữ số để truy cập.',
          confirmText: 'Nhập mã dự thi',
          cancelText: 'Đóng',
          isDanger: false,
          onConfirm: () => {
            setAccessModalInitialCode(exam.examCode || '');
            setIsExamAccessModalOpen(true);
          },
        });
        return;
      }

      // b. Đề thi giới hạn trong lớp
      if (exam.visibility === 'class' && exam.assignedClassId) {
        const isEnrolled = classrooms.some(
          (c) => c.id === exam.assignedClassId && isStudentMemberOfClass(c, currentUser)
        );
        if (!isEnrolled) {
          setConfirmModal({
            isOpen: true,
            title: 'Đề thi giới hạn trong Lớp học',
            message: `Đề thi này chỉ dành cho học sinh thuộc lớp "${exam.assignedClassName || 'Lớp riêng'}". Bạn chưa được giáo viên duyệt vào lớp này. Vui lòng gửi yêu cầu tham gia lớp hoặc nhập mã dự thi được cấp.`,
            confirmText: 'Nhập mã dự thi',
            cancelText: 'Vào danh sách Lớp',
            isDanger: false,
            onConfirm: () => {
              setAccessModalInitialCode(exam.examCode || '');
              setIsExamAccessModalOpen(true);
            },
          });
          return;
        }
      }

      // c. Đề thi yêu cầu mã dự thi bảo mật (nếu chưa có tên thí sinh xác thực)
      if (exam.requireAccessCode && !candidateNameOverride) {
        setAccessModalInitialCode(exam.examCode || '');
        setIsExamAccessModalOpen(true);
        return;
      }
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

    setActiveExam(targetExam);
    setActiveMode(mode);
    setCurrentView('taking');
  };

  const handleEditExam = (exam: Exam) => {
    if (!isActualTeacher || userRole !== 'teacher') return;
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
    };
    saveCustomExam(copyExam);
    refreshAllData();
  };

  const handleEditBundle = (bundle: ExamBundle) => {
    if (!isActualTeacher || userRole !== 'teacher') return;
    setEditingBundle(bundle);
    setCurrentView('bundle-create');
  };

  const handleCompleteSingleExam = (result: ExamResult) => {
    saveExamResult(result);
    setResults(getExamResults());
    setCurrentResult(result);
    setCurrentView('result');
  };

  const handleSaveCustomExam = (newExam: Exam) => {
    if (!isActualTeacher || userRole !== 'teacher') return;
    saveCustomExam(newExam);
    setEditingExam(null);
    refreshAllData();
    setCurrentView('home');
  };

  const handleDeleteCustomExam = (examId: string) => {
    if (!isActualTeacher || userRole !== 'teacher') return;
    const target = exams.find((e) => e.id === examId);
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
    if (!isActualTeacher || userRole !== 'teacher') return;
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
    studentCodeOverride?: string
  ) => {
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
        showOnlyStudentAnswersAfterExam: bundle.showOnlyStudentAnswersAfterExam ?? subExam.showOnlyStudentAnswersAfterExam,
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

    saveExamResult(result);
    setResults(getExamResults());

    const updatedResults = [...activeBundleSession.results, result];
    const isLastCompulsory = 
      activeBundleSession.compulsoryExams.length === 0 || 
      activeBundleSession.currentCompulsoryIndex >= activeBundleSession.compulsoryExams.length - 1;

    if (!isLastCompulsory) {
      // More compulsory exams remain -> break to next compulsory exam
      setActiveBundleSession({
        ...activeBundleSession,
        results: updatedResults,
        phase: 'break_to_compulsory',
      });
    } else if (activeBundleSession.electiveExams.length > 0) {
      // Completed last compulsory exam, next is elective cluster -> break to elective cluster
      setActiveBundleSession({
        ...activeBundleSession,
        results: updatedResults,
        phase: 'break_to_elective_cluster',
      });
    } else {
      // All exams completed!
      setActiveBundleSession({
        ...activeBundleSession,
        results: updatedResults,
      });
      setCurrentView('bundle-result');
    }
  };

  const handleCompleteBundleElectiveCluster = (clusterResults: ExamResult[]) => {
    if (!activeBundleSession) return;

    clusterResults.forEach((res) => {
      saveExamResult(res);
    });
    setResults(getExamResults());

    const updatedResults = [...activeBundleSession.results, ...clusterResults];
    setActiveBundleSession({
      ...activeBundleSession,
      results: updatedResults,
    });
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
    saveCustomBundle(newBundle);
    refreshAllData();
    setCurrentView('home');
    setHomeTab('bundle');
  };

  const handleDeleteCustomBundle = (bundleId: string) => {
    const target = bundles.find((b) => b.id === bundleId);
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

  // Filtered single exams
  const filteredExams = useMemo(() => {
    return exams.filter((e) => {
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
  }, [exams, selectedSubject, searchQuery]);

  // Filtered bundles
  const filteredBundles = useMemo(() => {
    if (!searchQuery.trim()) return bundles;
    const query = searchQuery.toLowerCase();
    return bundles.filter(
      (b) =>
        b.title.toLowerCase().includes(query) ||
        b.description.toLowerCase().includes(query)
    );
  }, [bundles, searchQuery]);

  const handleNavClick = (tab: NavTabItem) => {
    if (tab.targetView === 'single') {
      setHomeTab('single');
      setSelectedSubject('all');
      setCurrentView('home');
    } else if (tab.targetView === 'bundle') {
      setHomeTab('bundle');
      setCurrentView('home');
    } else if (tab.targetView === 'oj') {
      setCurrentView('oj');
    } else if (tab.targetView === 'classrooms') {
      setCurrentView('classrooms');
    } else if (tab.targetView === 'courses') {
      setCurrentView('courses');
    } else if (tab.targetView === 'battle') {
      setCurrentView('battle');
    } else if (tab.targetView === 'history') {
      setCurrentView('history');
    } else if (tab.targetView === 'analytics') {
      setCurrentView('classrooms');
    } else {
      setSelectedSubject(tab.targetView);
      setHomeTab('single');
      setCurrentView('home');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col selection:bg-slate-900 selection:text-white">
      {/* 
        Top Bar Contract: 
        Zone 1: Brand title, one line
        Zone 2: Dynamic nav links + Customizer (Dài rộng, dễ nhìn thấy nội dung)
        Zone 3: Role switcher & primary actions
      */}
      {currentView !== 'taking' && currentView !== 'bundle-taking' && (
        <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-2xs">
          <div className="max-w-[1720px] mx-auto flex items-center justify-between gap-4 px-4 sm:px-8 py-3.5">
            {/* Zone 1: Brand Wordmark */}
            <button
              onClick={() => {
                setHomeTab('single');
                setSelectedSubject('all');
                setCurrentView('home');
              }}
              className="text-lg font-bold tracking-tight text-slate-900 hover:text-blue-600 transition-colors whitespace-nowrap shrink-0 flex items-center gap-2.5 cursor-pointer"
            >
              <div className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center font-extrabold text-sm shadow-xs">
                ET
              </div>
              <div className="text-left hidden sm:block">
                <div className="font-extrabold text-base leading-none text-slate-900">EduTest</div>
                <div className="text-[10px] text-slate-500 font-medium tracking-wide">Luyện thi & Online Judge</div>
              </div>
            </button>

            {/* Zone 2: Dynamic Customizable Navigation Tabs (Dài ra, hiển thị rõ ràng nội dung) */}
            <nav className="hidden lg:flex items-center gap-2 overflow-x-auto py-1">
              {navTabs.filter((t) => t.isVisible !== false).map((tab) => {
                const isActive = 
                  (tab.targetView === 'single' && currentView === 'home' && homeTab === 'single' && selectedSubject === 'all') ||
                  (tab.targetView === 'bundle' && currentView === 'home' && homeTab === 'bundle') ||
                  (tab.targetView === 'oj' && currentView === 'oj') ||
                  (tab.targetView === 'classrooms' && currentView === 'classrooms') ||
                  (tab.targetView === 'courses' && currentView === 'courses') ||
                  (tab.targetView === 'battle' && currentView === 'battle') ||
                  (tab.targetView === 'history' && currentView === 'history') ||
                  (tab.targetView === 'analytics' && currentView === 'classrooms');

                return (
                  <button
                    key={tab.id}
                    onClick={() => handleNavClick(tab)}
                    className={`px-4.5 py-2.5 rounded-xl transition-all whitespace-nowrap shrink-0 flex items-center gap-2 cursor-pointer font-bold text-xs sm:text-sm min-w-[120px] justify-center shadow-2xs ${
                      isActive
                        ? 'bg-blue-50 text-blue-700 font-extrabold border border-blue-300 ring-2 ring-blue-500/10 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/90 border border-transparent'
                    }`}
                  >
                    {tab.iconName === 'book' && <BookOpen className="w-4 h-4 text-blue-600" />}
                    {tab.iconName === 'layers' && <Layers className="w-4 h-4 text-purple-600" />}
                    {tab.iconName === 'code' && <Code2 className="w-4 h-4 text-emerald-600" />}
                    {tab.iconName === 'users' && <Users className="w-4 h-4 text-indigo-600" />}
                    {tab.iconName === 'graduation' && <GraduationCap className="w-4 h-4 text-teal-600" />}
                    {tab.iconName === 'swords' && <Swords className="w-4 h-4 text-rose-600" />}
                    {tab.iconName === 'chart' && <BarChart3 className="w-4 h-4 text-amber-600" />}
                    {tab.iconName === 'clock' && <Clock className="w-4 h-4 text-slate-500" />}
                    <span>{tab.label}</span>
                    {tab.badgeText && (
                      <span className="text-[10px] font-extrabold px-1.5 py-0.2 rounded-full bg-rose-500 text-white animate-pulse">
                        {tab.badgeText}
                      </span>
                    )}
                  </button>
                );
              })}

              {/* Tab & Subject Customizer Button - ONLY TEACHER */}
              {isActualTeacher && userRole === 'teacher' && (
                <button
                  onClick={() => setIsTabAndSubjectModalOpen(true)}
                  className="px-3.5 py-2.5 text-xs font-bold text-slate-600 hover:text-blue-700 bg-slate-100 hover:bg-blue-50 border border-slate-200 rounded-xl transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer ml-1"
                  title="Tùy biến thêm, xóa, sửa các Tabs và Danh mục Môn học"
                >
                  <SlidersHorizontal className="w-4 h-4 text-slate-500" />
                  <span className="hidden xl:inline">Tùy biến</span>
                </button>
              )}
            </nav>

            {/* Zone 3: Authentication, RBAC Role & Primary Actions */}
            <div className="flex items-center gap-2 shrink-0">
              {/* Direct 8-Digit Code Entry Portal Button */}
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

              {/* Cloud Sync Button (Chỉ dành cho Giáo viên) */}
              {isActualTeacher && (
                <button
                  type="button"
                  onClick={handleManualSync}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors flex items-center gap-1.5 cursor-pointer ${
                    syncStatus === 'syncing'
                      ? 'bg-blue-50 border-blue-300 text-blue-700 animate-pulse'
                      : syncStatus === 'synced'
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                      : 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700'
                  }`}
                  title="Đồng bộ tất cả đề thi, lớp học và tài khoản lên máy chủ web"
                >
                  <Cloud className={`w-3.5 h-3.5 ${syncStatus === 'syncing' ? 'animate-spin' : ''}`} />
                  <span className="hidden xl:inline">
                    {syncStatus === 'syncing' ? 'Đang đồng bộ...' : 'Đồng bộ Web'}
                  </span>
                </button>
              )}

              {/* If Student: Upgrade to Teacher button */}
              {currentUser && currentUser.role === 'student' && (
                <button
                  type="button"
                  onClick={() => setIsTeacherRequestModalOpen(true)}
                  className="px-2.5 py-1.5 text-xs font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                  title="Gửi yêu cầu nâng quyền lên Giáo viên tổ chức (chờ tài khoản Master phê duyệt)"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                  <span className="hidden md:inline">Xin quyền Giáo viên</span>
                  <span className="md:hidden">Xin quyền</span>
                </button>
              )}

              {/* If Teacher / Master Admin: Review Teacher Requests button */}
              {isActualTeacher && userRole === 'teacher' && (
                <button
                  type="button"
                  onClick={() => setIsTeacherRequestsAdminModalOpen(true)}
                  className="px-2.5 py-1.5 text-xs font-semibold text-purple-800 bg-purple-50 hover:bg-purple-100 border border-purple-300 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer relative shadow-2xs"
                  title="Xem và phê duyệt các học sinh xin nâng quyền Giáo viên"
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-purple-600" />
                  <span className="hidden md:inline">Duyệt Giáo viên</span>
                  {getAllTeacherRequests().filter((r) => r.status === 'pending').length > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-rose-600 text-white font-extrabold animate-pulse">
                      {getAllTeacherRequests().filter((r) => r.status === 'pending').length}
                    </span>
                  )}
                </button>
              )}

              {/* User Account / Login Button */}
              {currentUser ? (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowUserDropdown(!showUserDropdown)}
                    className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer border border-slate-200 bg-white"
                  >
                    <div className="w-7 h-7 rounded-full bg-slate-900 text-white font-bold text-xs flex items-center justify-center shrink-0">
                      {currentUser.fullName.charAt(0).toUpperCase()}
                    </div>
                    <div className="text-left hidden sm:block">
                      <div className="text-xs font-bold text-slate-900 leading-none truncate max-w-[120px]">
                        {currentUser.fullName}
                      </div>
                      <div className="text-[10px] font-semibold mt-0.5 flex items-center gap-1">
                        {currentUser.email === MASTER_ADMIN_EMAIL ? (
                          <span className="text-amber-700 font-bold flex items-center gap-0.5">
                            <Crown className="w-2.5 h-2.5 text-amber-500 fill-amber-500" />
                            <span>Admin Tối Cao</span>
                          </span>
                        ) : currentUser.role === 'teacher' ? (
                          <span className="text-blue-700 font-bold">Giáo viên</span>
                        ) : (
                          <span className="text-emerald-700 font-medium">Học sinh</span>
                        )}
                      </div>
                    </div>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                  </button>

                  {/* Dropdown Menu */}
                  {showUserDropdown && (
                    <div className="absolute right-0 mt-1.5 w-64 bg-white rounded-xl shadow-xl border border-slate-200 p-2 z-50 text-xs">
                      <div className="p-2 border-b border-slate-100 mb-1">
                        <p className="font-bold text-slate-900 text-sm truncate">{currentUser.fullName}</p>
                        <p className="text-slate-500 text-[11px] truncate">{currentUser.email}</p>
                        <div className="mt-1.5 inline-block">
                          {currentUser.email === MASTER_ADMIN_EMAIL ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-1">
                              <Crown className="w-3 h-3 text-amber-600 fill-amber-600" />
                              <span>Tài khoản Quản trị Tối Cao ⭐</span>
                            </span>
                          ) : (
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              currentUser.role === 'teacher' 
                                ? 'bg-blue-50 text-blue-700 border border-blue-200' 
                                : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            }`}>
                              Vai trò: {currentUser.role === 'teacher' ? 'Giáo viên' : 'Học sinh'}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Quick Role Switcher for preview: CHỈ HIỂN THỊ VỚI GIÁO VIÊN THỰC SỰ */}
                      {isActualTeacher ? (
                        <>
                          <div className="px-2 py-1 text-[11px] text-slate-500 font-medium">
                            Xem giao diện dưới vai trò:
                          </div>
                          <div className="grid grid-cols-2 gap-1 mb-2 px-1">
                            <button
                              type="button"
                              onClick={() => {
                                handleSwitchRole('teacher');
                                setShowUserDropdown(false);
                              }}
                              className={`py-1 px-2 rounded text-[11px] font-bold text-center cursor-pointer ${
                                userRole === 'teacher' 
                                  ? 'bg-blue-600 text-white' 
                                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                              }`}
                            >
                              Giáo viên
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                handleSwitchRole('student');
                                setShowUserDropdown(false);
                              }}
                              className={`py-1 px-2 rounded text-[11px] font-bold text-center cursor-pointer ${
                                userRole === 'student' 
                                  ? 'bg-emerald-600 text-white' 
                                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                              }`}
                            >
                              Học sinh
                            </button>
                          </div>
                        </>
                      ) : (
                        <div className="p-2 mb-2 bg-emerald-50/70 border border-emerald-200 rounded-lg text-emerald-950 text-[11px] space-y-1">
                          <div className="font-bold text-emerald-900">Quyền hạn: Học sinh</div>
                          <p className="text-emerald-800 leading-snug">
                            Bạn chỉ có quyền truy cập vào các bài công khai, làm đề hoặc khóa học khi có sự cho phép của giáo viên.
                          </p>
                        </div>
                      )}

                      {/* Teacher admin actions in dropdown */}
                      {isActualTeacher && (
                        <div className="border-t border-slate-100 my-1 pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              setShowUserDropdown(false);
                              handleManualSync();
                            }}
                            className="w-full text-left px-2.5 py-1.5 hover:bg-slate-50 rounded-lg flex items-center gap-2 text-slate-700 cursor-pointer"
                          >
                            <Cloud className="w-3.5 h-3.5 text-blue-600" />
                            <span>Đồng bộ ngay với máy chủ web</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setShowUserDropdown(false);
                              handleExportBackup();
                            }}
                            className="w-full text-left px-2.5 py-1.5 hover:bg-slate-50 rounded-lg flex items-center gap-2 text-slate-700 cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5 text-slate-500" />
                            <span>Tải file sao lưu (JSON)</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setShowUserDropdown(false);
                              handleImportBackup();
                            }}
                            className="w-full text-left px-2.5 py-1.5 hover:bg-slate-50 rounded-lg flex items-center gap-2 text-slate-700 cursor-pointer"
                          >
                            <Upload className="w-3.5 h-3.5 text-slate-500" />
                            <span>Khôi phục dữ liệu từ file</span>
                          </button>
                        </div>
                      )}

                      <div className="border-t border-slate-100 pt-1 mt-1">
                        <button
                          type="button"
                          onClick={handleLogout}
                          className="w-full text-left px-2.5 py-1.5 text-rose-600 hover:bg-rose-50 rounded-lg flex items-center gap-2 font-semibold cursor-pointer"
                        >
                          <LogOut className="w-3.5 h-3.5" />
                          <span>Đăng xuất</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="hidden xl:inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 text-slate-600 border border-slate-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                    <span>Khách (Chưa đăng nhập)</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthModalMode('login');
                      setIsAuthModalOpen(true);
                    }}
                    className="px-3 py-1.5 text-xs font-bold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                  >
                    Đăng nhập
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthModalMode('register');
                      setIsAuthModalOpen(true);
                    }}
                    className="px-3 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors cursor-pointer shadow-2xs"
                  >
                    Đăng ký
                  </button>
                </div>
              )}

              {/* Actions for Teachers ONLY */}
              {isActualTeacher && userRole === 'teacher' && (
                <>
                  {/* Live Edit Mode Button */}
                  <button
                    onClick={() => setIsLiveEditMode(!isLiveEditMode)}
                    className={`px-2.5 sm:px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer ${
                      isLiveEditMode
                        ? 'bg-amber-400 text-slate-950 ring-2 ring-amber-300 font-bold shadow-xs'
                        : 'text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200'
                    }`}
                    title="Bật quyền viết, sửa, xóa text trực tiếp trên trang"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span className="hidden xl:inline">
                      {isLiveEditMode ? 'Đang sửa text...' : 'Sửa text (Live)'}
                    </span>
                  </button>

                  <button
                    onClick={() => {
                      setEditingBundle(null);
                      setCurrentView('bundle-create');
                    }}
                    className="hidden lg:flex px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-purple-800 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg transition-colors whitespace-nowrap items-center gap-1.5 cursor-pointer"
                    title="Tạo nhóm đề thi liên môn có đếm giờ nghỉ giải lao"
                  >
                    <Layers className="w-3.5 h-3.5 text-purple-600" />
                    <span>Tạo tổ hợp</span>
                  </button>

                  <button
                    onClick={() => {
                      setEditingExam(null);
                      setCurrentView('create');
                    }}
                    className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 active:bg-black rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Tạo đề mới</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Mobile & Tablet Navigation Strip (Dài và rộng rãi) */}
          <div className="lg:hidden flex items-center gap-2 overflow-x-auto px-4 py-2.5 bg-slate-50 border-t border-slate-200 text-xs">
            {navTabs.filter((t) => t.isVisible !== false).map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleNavClick(tab)}
                className="px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-800 whitespace-nowrap shrink-0 flex items-center gap-1.5 font-bold text-xs shadow-2xs min-w-[110px] justify-center cursor-pointer"
              >
                <span>{tab.label}</span>
                {tab.badgeText && <span className="text-[9px] bg-rose-500 text-white px-1.5 py-0.2 rounded-full font-extrabold">{tab.badgeText}</span>}
              </button>
            ))}
            {isActualTeacher && userRole === 'teacher' && (
              <button
                onClick={() => setIsTabAndSubjectModalOpen(true)}
                className="px-3.5 py-2.5 rounded-xl bg-blue-50 text-blue-700 border border-blue-200 whitespace-nowrap shrink-0 flex items-center gap-1.5 font-bold text-xs cursor-pointer shadow-2xs shrink-0"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>Tùy biến</span>
              </button>
            )}
          </div>
        </header>
      )}

      {/* View 1: Active Single Exam Taking */}
      {currentView === 'taking' && activeExam && (
        <ExamTakingView
          exam={activeExam}
          mode={activeMode}
          userRole={userRole}
          candidateName={candidateProfile.fullName}
          studentCode={candidateProfile.studentCode}
          onComplete={handleCompleteSingleExam}
          onExit={() => setCurrentView('home')}
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
                    setCurrentView('home');
                  },
                });
              }}
            />
          )}
        </main>
      )}

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
              onCancel={() => {
                setEditingExam(null);
                setCurrentView('home');
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
              availableExams={exams}
              initialBundle={editingBundle}
              onSave={handleSaveCustomBundle}
              onCancel={() => {
                setEditingBundle(null);
                setCurrentView('home');
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
            onSelectResult={(res) => {
              setCurrentResult(res);
              setCurrentView('result');
            }}
            onClearHistory={() => {
              clearExamResults();
              setResults([]);
            }}
            onDeleteResult={(resId) => {
              deleteExamResult(resId);
              setResults(getExamResults());
            }}
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
            results={results}
            userRole={userRole}
            currentUser={currentUser}
            onRequestAuth={() => {
              setAuthModalMode('login');
              setIsAuthModalOpen(true);
            }}
            activeClassId={activeClassId}
            onSelectClass={handleSelectClass}
            onRefreshData={refreshAllData}
            onStartExam={(exam, mode) => handleStartExam(exam, mode)}
          />
        </main>
      )}

      {/* View 9: Micro-Courses (Khóa học nhỏ) */}
      {currentView === 'courses' && (
        <main className="flex-1">
          <MicroCoursesView
            courses={courses}
            allExams={exams}
            userRole={userRole}
            onRefreshCourses={refreshAllData}
            onStartExam={(exam, mode) => handleStartExam(exam, mode)}
          />
        </main>
      )}

      {/* View 10: 1v1 Battle Arena (Đấu trường đối kháng) */}
      {currentView === 'battle' && (
        <main className="flex-1">
          <BattleArenaView
            onBackToHome={() => setCurrentView('home')}
          />
        </main>
      )}

      {/* View 11: Online Judge (VNOI / SPOJ Lập trình thi đấu) */}
      {currentView === 'oj' && (
        <main className="flex-1">
          <OnlineJudgeView
            userRole={userRole}
            currentUser={currentUser}
            onRequestAuth={() => {
              setAuthModalMode('login');
              setIsAuthModalOpen(true);
            }}
          />
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
                  <span>Đề thi theo môn lẻ ({exams.length})</span>
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
                  <span>Tổ hợp thi liên môn ({bundles.length})</span>
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
                    Tất cả đề ({exams.length})
                  </button>

                  {subjects.map((sub) => {
                    const count = exams.filter(
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
                  {isActualTeacher && userRole === 'teacher' && exams.length > 0 && (
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
                {filteredExams.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-slate-200 p-8 sm:p-12 text-center my-6">
                    <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    {exams.length === 0 ? (
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
                      return (
                        <ExamCard
                          key={exam.id}
                          exam={exam}
                          userRole={isActualTeacher ? userRole : 'student'}
                          attemptCount={results.filter((r) => r.examId === exam.id).length}
                          activeClassId={activeClassId}
                          isEnrolledInClass={isEnrolled}
                          onStartExam={handleStartExam}
                          onPreviewExam={(e) => setPreviewingExam(e)}
                          onEditExam={isActualTeacher && userRole === 'teacher' ? handleEditExam : undefined}
                          onDuplicateExam={isActualTeacher && userRole === 'teacher' ? handleDuplicateExam : undefined}
                          onDeleteCustom={isActualTeacher && userRole === 'teacher' ? handleDeleteCustomExam : undefined}
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

                {filteredBundles.length === 0 ? (
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
                    {filteredBundles.map((bundle) => (
                      <BundleCard
                        key={bundle.id}
                        bundle={bundle}
                        allExams={exams}
                        userRole={isActualTeacher ? userRole : 'student'}
                        onStartBundle={handleStartBundle}
                        onSelectElectives={(b) => setSelectingElectiveBundle(b)}
                        onEditBundle={isActualTeacher && userRole === 'teacher' ? handleEditBundle : undefined}
                        onDeleteCustom={isActualTeacher && userRole === 'teacher' ? handleDeleteCustomBundle : undefined}
                      />
                    ))}
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
      {currentView !== 'taking' && currentView !== 'bundle-taking' && (
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

      {/* Global Exam Preview Modal (Xem thử đề thi) */}
      <ExamPreviewModal
        isOpen={Boolean(previewingExam)}
        exam={previewingExam}
        userRole={userRole}
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
        onSuccess={(user) => {
          setCurrentUserAccount(user);
          setUserRole(user.role);
          refreshAllData();
          setIsAuthModalOpen(false);
        }}
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
