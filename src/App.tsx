import React, { useState, useMemo } from 'react';
import { Exam, ExamBundle, ExamResult, SubjectType, UserRole } from './types/exam';
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
  loadSampleDemoExam,
  deleteAllExams,
  clearLiveTextOverrides
} from './utils/storage';
import { ExamCard } from './components/ExamCard';
import { BundleCard } from './components/BundleCard';
import { ExamTakingView } from './components/ExamTakingView';
import { ExamResultView } from './components/ExamResultView';
import { CustomExamCreator } from './components/CustomExamCreator';
import { BundleCreator } from './components/BundleCreator';
import { IntermissionBreakView } from './components/IntermissionBreakView';
import { BundleResultSummary } from './components/BundleResultSummary';
import { ExamHistoryView } from './components/ExamHistoryView';
import { EditableText } from './components/EditableText';
import { ConfirmModal } from './components/ConfirmModal';
import { ExamPreviewModal } from './components/ExamPreviewModal';
import { BundleElectiveSelectorModal } from './components/BundleElectiveSelectorModal';
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
  GraduationCap,
  Eye
} from 'lucide-react';

type ViewState = 
  | 'home' 
  | 'taking' 
  | 'result' 
  | 'create' 
  | 'history'
  | 'bundle-create'
  | 'bundle-taking'
  | 'bundle-result';

interface ActiveBundleState {
  bundle: ExamBundle;
  exams: Exam[];
  currentIndex: number;
  results: ExamResult[];
  status: 'exam' | 'break';
}

export default function App() {
  const [currentView, setCurrentView] = useState<ViewState>('home');
  const [homeTab, setHomeTab] = useState<'single' | 'bundle'>('single');

  const [exams, setExams] = useState<Exam[]>(() => getAllExams());
  const [bundles, setBundles] = useState<ExamBundle[]>(() => getAllBundles());
  const [results, setResults] = useState<ExamResult[]>(() => getExamResults());
  
  // Role-based state (Phân quyền giáo viên và học sinh)
  const [userRole, setUserRole] = useState<UserRole>(() => {
    return (localStorage.getItem('edutest_user_role') as UserRole) || 'teacher';
  });

  const handleSwitchRole = (newRole: UserRole) => {
    setUserRole(newRole);
    localStorage.setItem('edutest_user_role', newRole);
    if (newRole === 'student') {
      setIsLiveEditMode(false);
    }
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
  const [selectedSubject, setSelectedSubject] = useState<SubjectType | 'all' | 'custom'>('all');
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
  };

  // --- Single Exam Handlers ---
  const handleStartExam = (exam: Exam, mode: 'exam' | 'practice') => {
    setActiveExam(exam);
    setActiveMode(mode);
    setCurrentView('taking');
  };

  const handleEditExam = (exam: Exam) => {
    setEditingExam(exam);
    setCurrentView('create');
  };

  const handleDuplicateExam = (exam: Exam) => {
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
    saveCustomExam(newExam);
    setEditingExam(null);
    refreshAllData();
    setCurrentView('home');
  };

  const handleDeleteCustomExam = (examId: string) => {
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
  const handleStartBundle = (bundle: ExamBundle, selectedExamsOverride?: Exam[]) => {
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

    setActiveBundleSession({
      bundle,
      exams: memberExams,
      currentIndex: 0,
      results: [],
      status: 'exam',
    });
    setCurrentView('bundle-taking');
  };

  const handleCompleteBundleCurrentExam = (result: ExamResult) => {
    if (!activeBundleSession) return;

    saveExamResult(result);
    setResults(getExamResults());

    const updatedResults = [...activeBundleSession.results, result];
    const isLastExam = activeBundleSession.currentIndex >= activeBundleSession.exams.length - 1;

    if (isLastExam) {
      // Completed all exams in the bundle!
      setActiveBundleSession({
        ...activeBundleSession,
        results: updatedResults,
      });
      setCurrentView('bundle-result');
    } else {
      // Move to intermission break
      setActiveBundleSession({
        ...activeBundleSession,
        results: updatedResults,
        status: 'break',
      });
    }
  };

  const handleStartNextExamInBundle = () => {
    if (!activeBundleSession) return;
    setActiveBundleSession({
      ...activeBundleSession,
      currentIndex: activeBundleSession.currentIndex + 1,
      status: 'exam',
    });
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
        if (e.subject !== selectedSubject) return false;
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

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col selection:bg-slate-900 selection:text-white">
      {/* 
        Top Bar Contract: 
        Zone 1: Brand title, one line
        Zone 2: 4-5 nav links, single-line
        Zone 3: 1 primary action
      */}
      {currentView !== 'taking' && currentView !== 'bundle-taking' && (
        <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-8 px-4 sm:px-6 py-3.5">
            {/* Zone 1: Brand Wordmark */}
            <button
              onClick={() => setCurrentView('home')}
              className="text-lg font-bold tracking-tight text-slate-900 hover:text-blue-600 transition-colors whitespace-nowrap shrink-0 flex items-center gap-2 cursor-pointer"
            >
              <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center font-extrabold text-sm shadow-xs">
                ET
              </div>
              <span>EduTest Online</span>
            </button>

            {/* Zone 2: 4-5 Navigation Links */}
            <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
              <button
                onClick={() => {
                  setHomeTab('single');
                  setSelectedSubject('all');
                  setCurrentView('home');
                }}
                className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  currentView === 'home' && homeTab === 'single'
                    ? 'text-slate-900 font-semibold'
                    : ''
                }`}
              >
                Đề thi theo môn
              </button>
              <button
                onClick={() => {
                  setHomeTab('bundle');
                  setCurrentView('home');
                }}
                className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 flex items-center gap-1 cursor-pointer ${
                  currentView === 'home' && homeTab === 'bundle'
                    ? 'text-purple-700 font-semibold'
                    : ''
                }`}
              >
                <Layers className="w-3.5 h-3.5 text-purple-600" />
                <span>Tổ hợp liên môn</span>
                <span className="text-[11px] font-mono text-purple-700 bg-purple-50 px-1.5 py-0.2 rounded border border-purple-200">
                  {bundles.length}
                </span>
              </button>
              <button
                onClick={() => {
                  setHomeTab('single');
                  setSelectedSubject('math');
                  setCurrentView('home');
                }}
                className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  selectedSubject === 'math' && homeTab === 'single' ? 'text-slate-900 font-semibold' : ''
                }`}
              >
                Môn Toán
              </button>
              <button
                onClick={() => setCurrentView('history')}
                className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 flex items-center gap-1 cursor-pointer ${
                  currentView === 'history' ? 'text-slate-900 font-semibold' : ''
                }`}
              >
                <span>Lịch sử thi</span>
                {results.length > 0 && (
                  <span className="text-xs font-mono text-blue-600 font-bold">
                    ({results.length})
                  </span>
                )}
              </button>
            </nav>

            {/* Zone 3: Role Switcher & Primary Actions */}
            <div className="flex items-center gap-2 shrink-0">
              {/* Role Switcher Pill */}
              <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs shadow-2xs">
                <button
                  type="button"
                  onClick={() => handleSwitchRole('teacher')}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md font-semibold transition-all cursor-pointer ${
                    userRole === 'teacher'
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Quyền Giáo viên: Soạn đề, sửa câu hỏi, xóa đề, sửa text toàn web"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Giáo viên</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSwitchRole('student')}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md font-semibold transition-all cursor-pointer ${
                    userRole === 'student'
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Quyền Học sinh: Chỉ làm bài thi, xem thử & xem kết quả (không thể sửa web)"
                >
                  <GraduationCap className="w-3.5 h-3.5" />
                  <span>Học sinh</span>
                </button>
              </div>

              {/* Actions for Teachers ONLY */}
              {userRole === 'teacher' ? (
                <>
                  {/* Live Edit Mode Button */}
                  <button
                    onClick={() => setIsLiveEditMode(!isLiveEditMode)}
                    className={`px-3 py-2 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer ${
                      isLiveEditMode
                        ? 'bg-amber-400 text-slate-950 ring-2 ring-amber-300 font-bold shadow-xs'
                        : 'text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200'
                    }`}
                    title="Bật quyền viết, sửa, xóa text trực tiếp trên trang"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">
                      {isLiveEditMode ? 'Đang sửa text...' : 'Sửa text (Live)'}
                    </span>
                  </button>

                  <button
                    onClick={() => {
                      setEditingBundle(null);
                      setCurrentView('bundle-create');
                    }}
                    className="hidden sm:flex px-3 py-2 text-xs font-semibold text-purple-800 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg transition-colors whitespace-nowrap items-center gap-1.5 cursor-pointer"
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
                    className="px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 active:bg-black rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Tạo đề mới</span>
                  </button>
                </>
              ) : (
                <div className="hidden lg:flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-medium">
                  <span>Chế độ làm bài (Đã khóa chỉnh sửa)</span>
                </div>
              )}
            </div>
          </div>
        </header>
      )}

      {/* View 1: Active Single Exam Taking */}
      {currentView === 'taking' && activeExam && (
        <ExamTakingView
          exam={activeExam}
          mode={activeMode}
          userRole={userRole}
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
          {activeBundleSession.status === 'exam' ? (
            <ExamTakingView
              exam={activeBundleSession.exams[activeBundleSession.currentIndex]}
              mode="exam"
              userRole={userRole}
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
          ) : (
            <IntermissionBreakView
              completedExam={activeBundleSession.exams[activeBundleSession.currentIndex]}
              completedResult={
                activeBundleSession.results[activeBundleSession.currentIndex]
              }
              nextExam={
                activeBundleSession.exams[activeBundleSession.currentIndex + 1]
              }
              nextIndex={activeBundleSession.currentIndex + 1}
              totalExams={activeBundleSession.exams.length}
              breakMinutes={activeBundleSession.bundle.breakMinutes}
              onStartNext={handleStartNextExamInBundle}
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
            onRetakeBundle={() => handleStartBundle(activeBundleSession.bundle)}
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
          <CustomExamCreator
            initialExam={editingExam}
            onSave={handleSaveCustomExam}
            onCancel={() => {
              setEditingExam(null);
              setCurrentView('home');
            }}
          />
        </main>
      )}

      {/* View 6: Multi-subject Bundle Creator */}
      {currentView === 'bundle-create' && (
        <main className="flex-1">
          <BundleCreator
            availableExams={exams}
            initialBundle={editingBundle}
            onSave={handleSaveCustomBundle}
            onCancel={() => {
              setEditingBundle(null);
              setCurrentView('home');
            }}
          />
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

      {/* View 8: Home / Library */}
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

          {/* Exam Directory & Filters */}
          <section className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
            {/* Primary Category Switcher: Đề thi từng môn VS Tổ hợp liên môn */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 mb-6">
              <div className="flex items-center gap-2 p-1 bg-slate-200/70 rounded-xl max-w-fit">
                <button
                  onClick={() => setHomeTab('single')}
                  className={`py-2 px-4 text-xs font-semibold rounded-lg transition-colors flex items-center gap-2 cursor-pointer ${
                    homeTab === 'single'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <BookOpen className="w-4 h-4 text-blue-600" />
                  <span>Đề thi theo môn lẻ ({exams.length})</span>
                </button>
                <button
                  onClick={() => setHomeTab('bundle')}
                  className={`py-2 px-4 text-xs font-semibold rounded-lg transition-colors flex items-center gap-2 cursor-pointer ${
                    homeTab === 'bundle'
                      ? 'bg-white text-purple-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Layers className="w-4 h-4 text-purple-600" />
                  <span>Tổ hợp thi liên môn ({bundles.length})</span>
                </button>
              </div>

              {/* Search Bar */}
              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={
                    homeTab === 'single'
                      ? 'Tìm kiếm theo môn, tên đề...'
                      : 'Tìm tổ hợp thi...'
                  }
                  className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>
            </div>

            {/* If Single Exams Tab */}
            {homeTab === 'single' && (
              <>
                {/* Subject Sub-filters */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-3 mb-6 text-xs">
                  <button
                    onClick={() => setSelectedSubject('all')}
                    className={`px-3 py-1.5 font-medium rounded-lg whitespace-nowrap transition-colors cursor-pointer ${
                      selectedSubject === 'all'
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                    }`}
                  >
                    Tất cả đề thi ({exams.length})
                  </button>
                  <button
                    onClick={() => setSelectedSubject('math')}
                    className={`px-3 py-1.5 font-medium rounded-lg whitespace-nowrap transition-colors cursor-pointer ${
                      selectedSubject === 'math'
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                    }`}
                  >
                    Toán học (KaTeX)
                  </button>
                  <button
                    onClick={() => setSelectedSubject('english')}
                    className={`px-3 py-1.5 font-medium rounded-lg whitespace-nowrap transition-colors cursor-pointer ${
                      selectedSubject === 'english'
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                    }`}
                  >
                    Tiếng Anh
                  </button>
                  <button
                    onClick={() => setSelectedSubject('physics')}
                    className={`px-3 py-1.5 font-medium rounded-lg whitespace-nowrap transition-colors cursor-pointer ${
                      selectedSubject === 'physics'
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                    }`}
                  >
                    Vật lý
                  </button>
                  <button
                    onClick={() => setSelectedSubject('it')}
                    className={`px-3 py-1.5 font-medium rounded-lg whitespace-nowrap transition-colors cursor-pointer ${
                      selectedSubject === 'it'
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                    }`}
                  >
                    Tin học & CNTT
                  </button>
                  <button
                    onClick={() => setSelectedSubject('history')}
                    className={`px-3 py-1.5 font-medium rounded-lg whitespace-nowrap transition-colors cursor-pointer ${
                      selectedSubject === 'history'
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                    }`}
                  >
                    Lịch sử
                  </button>
                  <button
                    onClick={() => setSelectedSubject('custom')}
                    className={`px-3 py-1.5 font-medium rounded-lg whitespace-nowrap transition-colors cursor-pointer ${
                      selectedSubject === 'custom'
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                    }`}
                  >
                    Đề tự tạo
                  </button>

                  {userRole === 'teacher' && exams.length > 0 && (
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
                          Tất cả các đề thi tạo sẵn đã được xóa sạch theo yêu cầu của bạn. Bạn có thể tự soạn đề thi mới theo chuẩn cấu trúc mới hoặc nạp đề mẫu thử nghiệm để trải nghiệm ngay 4 dạng câu hỏi.
                        </p>
                        <div className="flex flex-wrap items-center justify-center gap-3">
                          <button
                            onClick={() => {
                              loadSampleDemoExam();
                              refreshAllData();
                            }}
                            className="py-2.5 px-4 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
                          >
                            <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                            <span>Nạp đề mẫu thử nghiệm (4 dạng câu)</span>
                          </button>
                          <button
                            onClick={() => setCurrentView('create')}
                            className="py-2.5 px-4 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Soạn đề thi mới</span>
                          </button>
                        </div>
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
                    {filteredExams.map((exam) => (
                      <ExamCard
                        key={exam.id}
                        exam={exam}
                        userRole={userRole}
                        onStartExam={handleStartExam}
                        onPreviewExam={(e) => setPreviewingExam(e)}
                        onEditExam={userRole === 'teacher' ? handleEditExam : undefined}
                        onDuplicateExam={userRole === 'teacher' ? handleDuplicateExam : undefined}
                        onDeleteCustom={userRole === 'teacher' ? handleDeleteCustomExam : undefined}
                      />
                    ))}
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

                  {userRole === 'teacher' && (
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
                      Bạn có thể tự ghép các đề thi thành một tổ hợp môn mới theo ý muốn.
                    </p>
                    <button
                      onClick={() => setCurrentView('bundle-create')}
                      className="py-2 px-4 text-xs font-semibold text-white bg-purple-700 rounded-lg"
                    >
                      Tạo tổ hợp ngay
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredBundles.map((bundle) => (
                      <BundleCard
                        key={bundle.id}
                        bundle={bundle}
                        allExams={exams}
                        userRole={userRole}
                        onStartBundle={handleStartBundle}
                        onSelectElectives={(b) => setSelectingElectiveBundle(b)}
                        onEditBundle={userRole === 'teacher' ? handleEditBundle : undefined}
                        onDeleteCustom={userRole === 'teacher' ? handleDeleteCustomBundle : undefined}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Quick Creator CTA Section */}
          <section className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
            <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 flex flex-col md:flex-row items-center justify-between gap-6 shadow-xs">
              <div>
                <span className="text-xs font-semibold text-blue-700 uppercase tracking-wide">
                  Dành cho giáo viên & học sinh
                </span>
                <EditableText
                  id="cta_title"
                  defaultText="Bạn có sẵn đề thi muốn đưa lên web để luyện tập?"
                  as="h3"
                  isLiveEditMode={isLiveEditMode}
                  className="text-xl font-bold text-slate-900 mt-1 mb-2 block"
                />
                <EditableText
                  id="cta_desc"
                  defaultText="Hỗ trợ đầy đủ công thức Toán học LaTeX, chèn bảng biến thiên, hình ảnh minh họa, hoặc tạo đợt thi gồm nhiều môn liên tiếp!"
                  as="p"
                  isLiveEditMode={isLiveEditMode}
                  className="text-xs sm:text-sm text-slate-600 max-w-xl block"
                />
              </div>

              <div className="flex items-center gap-3 shrink-0">
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
    </div>
  );
}
