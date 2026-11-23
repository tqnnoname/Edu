import React, { useMemo, useState } from 'react';
import {
  UserAccount,
  Exam,
  ExamResult,
  Classroom,
  MicroCourse,
  CustomSubject,
} from '../types/exam';
import {
  MASTER_ADMIN_EMAIL,
  getStudentCourseProgress,
  syncCourseScormState,
  calculateCourseProgressPercentage,
  isStudentMemberOfClass,
  isResultHiddenFromStudent,
  canShowInPublicLibrary,
} from '../utils/storage';
import {
  Lock,
  ShieldCheck,
  Award,
  TrendingUp,
  Target,
  BookOpen,
  GraduationCap,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  LogIn,
  Users,
  Clock,
  ArrowRight,
  BarChart3,
  ExternalLink,
  FileSpreadsheet,
} from 'lucide-react';
import { exportStudentLearningResultsToExcel } from '../utils/exportFiles';

interface StudentCompetencyViewProps {
  currentUser: UserAccount | null;
  results: ExamResult[];
  exams?: Exam[];
  classrooms: Classroom[];
  courses: MicroCourse[];
  subjects: CustomSubject[];
  onRequestAuth: () => void;
  onSelectResult: (result: ExamResult) => void;
  onOpenCourse: (course: MicroCourse) => void;
  onOpenClassrooms: () => void;
  onGoHome: () => void;
}

const DEFAULT_SUBJECT_LABELS: Record<string, string> = {
  math: 'Toán học',
  english: 'Tiếng Anh',
  physics: 'Vật lý',
  chemistry: 'Hóa học',
  history: 'Lịch sử',
  it: 'Tin học & CNTT',
  biology: 'Sinh học',
  general: 'Tổng hợp',
};

function getAcademicTier(avgScore: number): {
  label: string;
  badgeClass: string;
  barClass: string;
} {
  if (avgScore >= 9.0) {
    return {
      label: 'Xuất sắc',
      badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      barClass: 'bg-emerald-500',
    };
  }
  if (avgScore >= 8.0) {
    return {
      label: 'Giỏi',
      badgeClass: 'bg-blue-100 text-blue-800 border-blue-200',
      barClass: 'bg-blue-600',
    };
  }
  if (avgScore >= 6.5) {
    return {
      label: 'Khá',
      badgeClass: 'bg-indigo-100 text-indigo-800 border-indigo-200',
      barClass: 'bg-indigo-500',
    };
  }
  if (avgScore >= 5.0) {
    return {
      label: 'Trung bình',
      badgeClass: 'bg-amber-100 text-amber-800 border-amber-200',
      barClass: 'bg-amber-500',
    };
  }
  return {
    label: 'Cần cải thiện',
    badgeClass: 'bg-rose-100 text-rose-800 border-rose-200',
    barClass: 'bg-rose-500',
  };
}

export const StudentCompetencyView: React.FC<StudentCompetencyViewProps> = ({
  currentUser,
  results,
  exams = [],
  classrooms,
  courses,
  subjects,
  onRequestAuth,
  onSelectResult,
  onOpenCourse,
  onOpenClassrooms,
  onGoHome,
}) => {
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState<string>('all');

  const isTeacherOrAdmin = Boolean(
    currentUser &&
      (currentUser.role === 'teacher' ||
        currentUser.isMasterAdmin ||
        currentUser.email.toLowerCase() === MASTER_ADMIN_EMAIL.toLowerCase())
  );

  // Subject lookup helper
  const getSubjectName = (subjectId: string) => {
    const custom = subjects.find((s) => s.id === subjectId);
    if (custom) return custom.name;
    return DEFAULT_SUBJECT_LABELS[subjectId] || subjectId || 'Tổng hợp';
  };

  // STRICT FILTER: Only non-hidden results belonging exclusively to THIS logged-in student
  const myResults = useMemo(() => {
    if (!currentUser || isTeacherOrAdmin) return [];
    const emailLower = currentUser.email.toLowerCase();
    const codeLower = (currentUser.studentCode || '').trim().toLowerCase();

    return results
      .filter((r) => {
        if (isResultHiddenFromStudent(r, exams)) return false;
        if (r.userId) return r.userId === currentUser.id;
        if (r.userEmail) return r.userEmail.toLowerCase() === emailLower;
        // Fallback only for legacy pre-tagging results when studentCode uniquely matches
        if (codeLower && r.studentCode) {
          return r.studentCode.trim().toLowerCase() === codeLower;
        }
        return false;
      })
      .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());
  }, [results, exams, currentUser, isTeacherOrAdmin]);

  const filteredResults = useMemo(() => {
    if (selectedSubjectFilter === 'all') return myResults;
    return myResults.filter((r) => r.subject === selectedSubjectFilter);
  }, [myResults, selectedSubjectFilter]);

  // Enrolled classrooms for this student
  const myClassrooms = useMemo(() => {
    if (!currentUser || isTeacherOrAdmin) return [];
    return classrooms.filter((cls) => isStudentMemberOfClass(cls, currentUser));
  }, [classrooms, currentUser, isTeacherOrAdmin]);

  // Courses visible to this student + their personal SCORM progress
  const myCoursesProgress = useMemo(() => {
    if (!currentUser || isTeacherOrAdmin) return [];
    const accessible = courses.filter((c) => {
      if (canShowInPublicLibrary(c, currentUser, 'student', classrooms)) return true;
      if (c.visibility === 'class' && c.assignedClassId) {
        return myClassrooms.some((cls) => cls.id === c.assignedClassId);
      }
      return myClassrooms.some((cls) => (cls.assignedCourseIds || []).includes(c.id));
    });

    return accessible.map((course) => {
      const rawProgress = getStudentCourseProgress(course.id, currentUser.id);
      const synced = syncCourseScormState(course, rawProgress);
      const pct = calculateCourseProgressPercentage(course, synced);
      return {
        course,
        progress: synced,
        pct,
        status: synced.scormData?.lessonStatus || 'not attempted',
      };
    });
  }, [courses, currentUser, isTeacherOrAdmin, myClassrooms]);

  // Available subjects in student's exam history
  const attemptedSubjects = useMemo(() => {
    const set = new Set<string>();
    myResults.forEach((r) => {
      if (r.subject) set.add(r.subject);
    });
    return Array.from(set);
  }, [myResults]);

  // Core KPI metrics
  const metrics = useMemo(() => {
    if (filteredResults.length === 0) {
      return {
        avgScore: 0,
        highestScore: 0,
        passRate: 0,
        accuracyRate: 0,
        totalExams: 0,
        totalQuestionsDone: 0,
        totalCorrect: 0,
        totalPartial: 0,
        totalWrong: 0,
        totalTimeMinutes: 0,
      };
    }

    const scores = filteredResults.map(
      (r) => r.scoreOnTenScale ?? r.score ?? (r.earnedPoints / (r.totalPoints || 10)) * 10
    );
    const avgScore = Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2));
    const highestScore = Number(Math.max(...scores).toFixed(2));
    const passCount = scores.filter((s) => s >= 5.0).length;
    const passRate = Math.round((passCount / scores.length) * 100);

    const totalQuestionsDone = filteredResults.reduce((acc, r) => acc + (r.totalQuestions || 0), 0);
    const totalCorrect = filteredResults.reduce((acc, r) => acc + (r.correctCount || 0), 0);
    const totalPartial = filteredResults.reduce((acc, r) => acc + (r.partialCount || 0), 0);
    const totalWrong = filteredResults.reduce((acc, r) => acc + (r.wrongCount || 0), 0);
    const totalEarned = filteredResults.reduce((acc, r) => acc + (r.earnedPoints || 0), 0);
    const totalMax = filteredResults.reduce((acc, r) => acc + (r.totalPoints || 0), 0);
    const accuracyRate = totalMax > 0 ? Math.round((totalEarned / totalMax) * 100) : 0;
    const totalTimeMinutes = Math.round(
      filteredResults.reduce((acc, r) => acc + (r.timeSpentSeconds || 0), 0) / 60
    );

    return {
      avgScore,
      highestScore,
      passRate,
      accuracyRate,
      totalExams: filteredResults.length,
      totalQuestionsDone,
      totalCorrect,
      totalPartial,
      totalWrong,
      totalTimeMinutes,
    };
  }, [filteredResults]);

  // Subject breakdown
  const subjectStats = useMemo(() => {
    const map: Record<
      string,
      { subject: string; label: string; count: number; totalScore: number; bestScore: number }
    > = {};

    myResults.forEach((r) => {
      const sub = r.subject || 'general';
      const s = r.scoreOnTenScale ?? r.score ?? (r.earnedPoints / (r.totalPoints || 10)) * 10;
      if (!map[sub]) {
        map[sub] = {
          subject: sub,
          label: getSubjectName(sub),
          count: 0,
          totalScore: 0,
          bestScore: 0,
        };
      }
      map[sub].count += 1;
      map[sub].totalScore += s;
      if (s > map[sub].bestScore) map[sub].bestScore = s;
    });

    return Object.values(map)
      .map((item) => ({
        ...item,
        avgScore: Number((item.totalScore / item.count).toFixed(2)),
        bestScore: Number(item.bestScore.toFixed(2)),
      }))
      .sort((a, b) => b.avgScore - a.avgScore);
  }, [myResults, subjects]);

  // Topic breakdown (strengths & weaknesses)
  const topicStats = useMemo(() => {
    const map: Record<string, { topic: string; totalQuestions: number; earned: number; maxPoints: number }> = {};

    filteredResults.forEach((r) => {
      if (!r.topicBreakdown) return;
      Object.entries(r.topicBreakdown).forEach(([topic, data]) => {
        const key = topic.trim() || 'Tổng hợp';
        if (!map[key]) {
          map[key] = { topic: key, totalQuestions: 0, earned: 0, maxPoints: 0 };
        }
        map[key].totalQuestions += data.total || 0;
        map[key].earned += data.earned || 0;
        map[key].maxPoints += data.maxPoints || 0;
      });
    });

    return Object.values(map)
      .filter((t) => t.maxPoints > 0)
      .map((t) => ({
        ...t,
        pct: Math.round((t.earned / t.maxPoints) * 100),
      }))
      .sort((a, b) => b.pct - a.pct);
  }, [filteredResults]);

  const strengths = topicStats.filter((t) => t.pct >= 75);
  const weakTopics = topicStats.filter((t) => t.pct < 55).reverse();

  // Score timeline (chronological order of latest 10 attempts)
  const recentTimeline = useMemo(() => {
    return [...filteredResults].slice(0, 10).reverse();
  }, [filteredResults]);

  const avgCoursePct = useMemo(() => {
    if (myCoursesProgress.length === 0) return 0;
    const sum = myCoursesProgress.reduce((acc, c) => acc + c.pct, 0);
    return Math.round(sum / myCoursesProgress.length);
  }, [myCoursesProgress]);

  const completedCoursesCount = myCoursesProgress.filter((c) => c.pct >= 100).length;
  const academicTier = getAcademicTier(metrics.avgScore);

  // STRICT PRIVACY: Guard 1 - Not signed in
  if (!currentUser) {
    return (
      <div className="max-w-2xl mx-auto my-12 px-4 font-sans">
        <div className="bg-white rounded-2xl border border-slate-200 p-8 sm:p-10 text-center shadow-xs">
          <div className="w-16 h-16 rounded-2xl bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center mx-auto mb-5">
            <Lock className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-extrabold text-slate-900 mb-2">
            Hồ sơ Năng lực Cá nhân (Riêng tư Học sinh)
          </h2>
          <p className="text-sm text-slate-600 max-w-md mx-auto leading-relaxed mb-6">
            Dữ liệu năng lực học tập được bảo mật tuyệt đối — chỉ từng học sinh mới xem được kết quả,
            điểm mạnh, điểm yếu và tiến độ của riêng mình. Vui lòng đăng nhập tài khoản Học sinh để tiếp tục.
          </p>
          <button
            type="button"
            onClick={onRequestAuth}
            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-sm transition-colors cursor-pointer"
          >
            <LogIn className="w-4 h-4" />
            <span>Đăng nhập tài khoản Học sinh</span>
          </button>
        </div>
      </div>
    );
  }

  // STRICT PRIVACY: Guard 2 - Teacher/Admin accounts cannot browse individual students' private competency tab
  if (isTeacherOrAdmin) {
    return (
      <div className="max-w-2xl mx-auto my-12 px-4 font-sans">
        <div className="bg-white rounded-2xl border border-slate-200 p-8 sm:p-10 text-center shadow-xs">
          <div className="w-16 h-16 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center mx-auto mb-5">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-extrabold text-slate-900 mb-2">
            Khu vực Riêng tư dành riêng cho Tài khoản Học sinh
          </h2>
          <p className="text-sm text-slate-600 max-w-lg mx-auto leading-relaxed mb-6">
            Tab <strong>Năng lực cá nhân</strong> được cách ly hoàn toàn theo từng học sinh — chỉ học sinh sở hữu tài khoản mới xem được bảng phân tích năng lực của chính mình.
            Để xem kết quả học tập chung của lớp do bạn phụ trách, hãy sử dụng mục <strong>Lớp học & Xếp hạng</strong>.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={onOpenClassrooms}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs sm:text-sm font-bold transition-colors cursor-pointer"
            >
              <Users className="w-4 h-4" />
              <span>Đến Lớp học & Xếp hạng</span>
            </button>
            <button
              type="button"
              onClick={onGoHome}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
            >
              <span>Về Ngân hàng Đề thi</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto py-6 sm:py-8 px-4 sm:px-6 font-sans space-y-6">
      {/* Private Identity & Filter Header */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white flex items-center justify-center font-extrabold text-xl shrink-0 shadow-sm">
            {currentUser.fullName.trim().charAt(0).toUpperCase() || 'H'}
          </div>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg sm:text-xl font-extrabold text-slate-900">
                Hồ sơ Năng lực: {currentUser.fullName}
              </h1>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                <Lock className="w-3 h-3" />
                Riêng tư · Chỉ mình bạn xem được
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
              <span>Email: <strong className="text-slate-700">{currentUser.email}</strong></span>
              {currentUser.studentCode && (
                <span>SBD / Mã HS: <strong className="font-mono text-slate-700">{currentUser.studentCode}</strong></span>
              )}
              <span>Lớp đang học: <strong className="text-slate-700">{myClassrooms.length > 0 ? myClassrooms.map((c) => c.name).join(', ') : 'Tự do'}</strong></span>
            </div>
          </div>
        </div>

        {/* Subject filter & Export Excel */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {attemptedSubjects.length > 0 && (
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-slate-600">Lọc theo môn:</label>
              <select
                value={selectedSubjectFilter}
                onChange={(e) => setSelectedSubjectFilter(e.target.value)}
                className="px-3 py-2 text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600 cursor-pointer"
              >
                <option value="all">Tất cả môn ({myResults.length} bài)</option>
                {attemptedSubjects.map((sub) => (
                  <option key={sub} value={sub}>
                    {getSubjectName(sub)}
                  </option>
                ))}
              </select>
            </div>
          )}

          {(myResults.length > 0 || myCoursesProgress.length > 0) && (
            <button
              type="button"
              onClick={() => {
                const coursesProgress = myCoursesProgress.map(({ course, progress, pct, status }) => {
                  const totalLessons = course.chapters
                    ? course.chapters.reduce((sum, ch) => sum + ch.lessons.length, 0)
                    : course.lessons?.length || 0;
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
                    completedLessons: progress.completedLessonIds?.length || 0,
                    totalLessons,
                    statusLabel,
                  };
                });

                exportStudentLearningResultsToExcel({
                  studentName: currentUser.fullName || currentUser.name || 'Học sinh',
                  studentCode: currentUser.studentCode,
                  studentEmail: currentUser.email,
                  className:
                    myClassrooms.length > 0
                      ? myClassrooms.map((c) => c.name).join(', ')
                      : 'Tự do',
                  results: filteredResults,
                  coursesProgress,
                });
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition-colors shadow-xs cursor-pointer"
              title="Xuất bảng tổng hợp kết quả học tập cá nhân ra file Excel (.xlsx)"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Xuất Excel kết quả học tập</span>
            </button>
          )}
        </div>
      </div>

      {/* Empty State when student hasn't taken any exam yet */}
      {myResults.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 sm:p-12 text-center shadow-xs">
          <div className="w-16 h-16 rounded-2xl bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center mx-auto mb-4">
            <BarChart3 className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-extrabold text-slate-900 mb-2">
            Bạn chưa có dữ liệu bài thi nào
          </h3>
          <p className="text-sm text-slate-600 max-w-md mx-auto mb-6 leading-relaxed">
            Hãy hoàn thành ít nhất một bài thi hoặc bài luyện tập khi đang đăng nhập tài khoản này. Hệ thống sẽ tự động phân tích điểm số, biểu đồ tiến bộ và chuyên đề mạnh/yếu dành riêng cho bạn.
          </p>
          <button
            type="button"
            onClick={onGoHome}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs sm:text-sm font-bold shadow-xs transition-colors cursor-pointer"
          >
            <span>Làm bài thi đầu tiên</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <>
          {/* 4 Core KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase">Điểm trung bình</span>
                <Award className="w-5 h-5 text-blue-600" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-extrabold font-mono text-slate-900 tabular-nums">
                  {metrics.avgScore}
                </span>
                <span className="text-xs font-bold text-slate-400">/ 10.0</span>
              </div>
              <div>
                <span className={`inline-block px-2 py-0.5 text-[11px] font-bold rounded border ${academicTier.badgeClass}`}>
                  Học lực: {academicTier.label}
                </span>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase">Đỉnh điểm & Đạt</span>
                <TrendingUp className="w-5 h-5 text-emerald-600" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-extrabold font-mono text-emerald-700 tabular-nums">
                  {metrics.highestScore}
                </span>
                <span className="text-xs font-bold text-slate-400">điểm cao nhất</span>
              </div>
              <div className="text-xs text-slate-600">
                Tỉ lệ đạt (&ge; 5.0đ): <strong className="text-slate-900">{metrics.passRate}%</strong>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase">Độ chính xác bài làm</span>
                <Target className="w-5 h-5 text-indigo-600" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-extrabold font-mono text-indigo-700 tabular-nums">
                  {metrics.accuracyRate}%
                </span>
                <span className="text-xs font-bold text-slate-400">({metrics.totalExams} lượt thi)</span>
              </div>
              <div className="text-xs text-slate-600">
                Đúng hoàn toàn <strong className="text-emerald-700">{metrics.totalCorrect}</strong> / {metrics.totalQuestionsDone} câu
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase">Tiến độ khóa SCORM</span>
                <GraduationCap className="w-5 h-5 text-purple-600" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-extrabold font-mono text-purple-700 tabular-nums">
                  {avgCoursePct}%
                </span>
                <span className="text-xs font-bold text-slate-400">
                  ({completedCoursesCount}/{myCoursesProgress.length} xong)
                </span>
              </div>
              <div className="text-xs text-slate-600 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>Tổng thời gian thi: <strong>{metrics.totalTimeMinutes} phút</strong></span>
              </div>
            </div>
          </div>

          {/* 2-Column Subject Competency & Topic Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Subject Breakdown (5 cols) */}
            <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h2 className="text-sm sm:text-base font-extrabold text-slate-900 flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-blue-600" />
                  <span>Năng lực theo Môn học</span>
                </h2>
                <span className="text-[11px] font-semibold text-slate-500">Thang điểm 10</span>
              </div>

              <div className="space-y-3.5">
                {subjectStats.map((sub) => {
                  const tier = getAcademicTier(sub.avgScore);
                  const pct = Math.min(100, Math.round((sub.avgScore / 10) * 100));
                  return (
                    <div key={sub.subject} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-800">{sub.label}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-slate-500">{sub.count} bài</span>
                          <span className="font-mono font-extrabold text-slate-900">{sub.avgScore}/10</span>
                        </div>
                      </div>
                      <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${tier.barClass}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-500">
                        <span>Mức: <strong className="text-slate-700">{tier.label}</strong></span>
                        <span>Cao nhất: <strong className="font-mono text-slate-700">{sub.bestScore}</strong></span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Topic Competency & Strengths/Weaknesses (7 cols) */}
            <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h2 className="text-sm sm:text-base font-extrabold text-slate-900 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-emerald-600" />
                  <span>Phân tích Chuyên đề: Điểm mạnh & Cần ôn tập</span>
                </h2>
                <span className="text-[11px] font-semibold text-slate-500">{topicStats.length} chuyên đề</span>
              </div>

              {/* Strengths vs Weaknesses quick summary */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200 space-y-2">
                  <div className="text-xs font-extrabold text-emerald-900 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Điểm mạnh nổi bật (&ge; 75%)</span>
                  </div>
                  {strengths.length > 0 ? (
                    <div className="space-y-1">
                      {strengths.slice(0, 4).map((t) => (
                        <div key={t.topic} className="flex items-center justify-between text-xs text-emerald-950">
                          <span className="truncate pr-2 font-medium">{t.topic}</span>
                          <span className="font-mono font-bold text-emerald-700 shrink-0">{t.pct}%</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-emerald-800/80">Tiếp tục luyện thêm để xác lập thế mạnh &ge; 75%.</p>
                  )}
                </div>

                <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200 space-y-2">
                  <div className="text-xs font-extrabold text-amber-950 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    <span>Chuyên đề cần củng cố (&lt; 55%)</span>
                  </div>
                  {weakTopics.length > 0 ? (
                    <div className="space-y-1">
                      {weakTopics.slice(0, 4).map((t) => (
                        <div key={t.topic} className="flex items-center justify-between text-xs text-amber-950">
                          <span className="truncate pr-2 font-medium">{t.topic}</span>
                          <span className="font-mono font-bold text-rose-700 shrink-0">{t.pct}%</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-amber-900/80">Tuyệt vời! Bạn chưa có chuyên đề nào dưới ngưỡng 55%.</p>
                  )}
                </div>
              </div>

              {/* Detailed topic progress bars */}
              {topicStats.length > 0 && (
                <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1 pt-1">
                  {topicStats.map((t) => (
                    <div key={t.topic} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-800 truncate pr-2">{t.topic}</span>
                        <span className="text-slate-500 font-mono shrink-0">
                          {Number(t.earned.toFixed(2))}/{Number(t.maxPoints.toFixed(2))}đ ({t.pct}%)
                        </span>
                      </div>
                      <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            t.pct >= 75
                              ? 'bg-emerald-500'
                              : t.pct >= 55
                              ? 'bg-blue-500'
                              : 'bg-rose-500'
                          }`}
                          style={{ width: `${t.pct}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Recent Score Progression Timeline */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-sm sm:text-base font-extrabold text-slate-900 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-blue-600" />
                  <span>Biểu đồ Tiến bộ Điểm số (10 bài gần nhất)</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">Nhấp vào từng cột để xem lại chi tiết bài làm và lời giải</p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-10 gap-2.5 items-end pt-2">
              {recentTimeline.map((res) => {
                const score = Number(
                  (res.scoreOnTenScale ?? res.score ?? (res.earnedPoints / (res.totalPoints || 10)) * 10).toFixed(1)
                );
                const heightPct = Math.max(12, Math.min(100, Math.round((score / 10) * 100)));
                const barColor =
                  score >= 8.0
                    ? 'bg-emerald-500 hover:bg-emerald-600'
                    : score >= 5.0
                    ? 'bg-blue-500 hover:bg-blue-600'
                    : 'bg-rose-500 hover:bg-rose-600';

                return (
                  <button
                    key={res.id}
                    type="button"
                    onClick={() => onSelectResult(res)}
                    className="group flex flex-col items-center gap-1.5 p-2 rounded-xl hover:bg-slate-50 border border-transparent hover:border-slate-200 transition-all cursor-pointer text-center"
                    title={`${res.examTitle} · ${score}/10 (${new Date(res.completedAt).toLocaleDateString('vi-VN')})`}
                  >
                    <span className="font-mono text-xs font-extrabold text-slate-900">{score}</span>
                    <div className="w-full h-28 bg-slate-100 rounded-lg flex items-end justify-center p-1 overflow-hidden">
                      <div
                        className={`w-full rounded-md transition-all ${barColor}`}
                        style={{ height: `${heightPct}%` }}
                      />
                    </div>
                    <span className="text-[10px] font-semibold text-slate-600 line-clamp-1 w-full">
                      {res.examTitle}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {new Date(res.completedAt).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Recent Detailed Results List */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
            <h2 className="text-sm sm:text-base font-extrabold text-slate-900">
              Danh sách bài thi gần đây của bạn ({filteredResults.length})
            </h2>
            <div className="divide-y divide-slate-100">
              {filteredResults.slice(0, 8).map((res) => {
                const score = Number(
                  (res.scoreOnTenScale ?? res.score ?? (res.earnedPoints / (res.totalPoints || 10)) * 10).toFixed(2)
                );
                return (
                  <div
                    key={res.id}
                    className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-slate-50/80 px-2 rounded-xl transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="font-bold text-sm text-slate-900 truncate">{res.examTitle}</div>
                      <div className="text-xs text-slate-500 flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                        <span>{getSubjectName(res.subject)}</span>
                        <span>Đúng {res.correctCount}/{res.totalQuestions} câu</span>
                        <span>{new Date(res.completedAt).toLocaleString('vi-VN')}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span
                        className={`font-mono text-sm font-extrabold px-3 py-1 rounded-lg border ${
                          score >= 8
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : score >= 5
                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : 'bg-rose-50 text-rose-700 border-rose-200'
                        }`}
                      >
                        {score} / 10
                      </span>
                      <button
                        type="button"
                        onClick={() => onSelectResult(res)}
                        className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg flex items-center gap-1 cursor-pointer"
                      >
                        <span>Xem bài</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* Personal SCORM Courses Progress Section */}
      {myCoursesProgress.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-sm sm:text-base font-extrabold text-slate-900 flex items-center gap-2">
              <GraduationCap className="w-4 h-4 text-purple-600" />
              <span>Tiến độ Khóa học & SCORM Cá nhân</span>
            </h2>
            <span className="text-xs text-slate-500">{myCoursesProgress.length} khóa học khả dụng</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {myCoursesProgress.map(({ course, pct, status }) => (
              <div
                key={course.id}
                className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col justify-between gap-3"
              >
                <div className="space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-bold text-sm text-slate-900">{course.title}</h3>
                    <span
                      className={`px-2 py-0.5 text-[10px] font-bold rounded border shrink-0 uppercase ${
                        status === 'passed' || status === 'completed'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : status === 'incomplete'
                          ? 'bg-blue-50 text-blue-700 border-blue-200'
                          : 'bg-slate-100 text-slate-600 border-slate-200'
                      }`}
                    >
                      {status === 'passed'
                        ? 'Đạt chuẩn'
                        : status === 'completed'
                        ? 'Hoàn thành'
                        : status === 'incomplete'
                        ? 'Đang học'
                        : 'Chưa học'}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500">
                    {getSubjectName(course.subject)} · {course.grade}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-600">Tiến độ SCORM</span>
                    <span className="font-mono font-bold text-purple-700">{pct}%</span>
                  </div>
                  <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-purple-600 rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenCourse(course)}
                    className="w-full py-2 px-3 bg-white hover:bg-purple-50 text-purple-700 border border-purple-200 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <span>{pct > 0 ? 'Tiếp tục học khóa này' : 'Bắt đầu học ngay'}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
