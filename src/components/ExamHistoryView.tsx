import React, { useMemo } from 'react';
import { Classroom, Exam, ExamResult, MicroCourse, UserAccount } from '../types/exam';
import {
  Trophy,
  Clock,
  Calendar,
  ArrowLeft,
  ExternalLink,
  BookOpen,
  Award,
  BarChart2,
  FileSpreadsheet,
  Trash2,
} from 'lucide-react';
import {
  doesResultBelongToStudent,
  exportResultsToExcel,
  exportStudentLearningResultsToExcel,
} from '../utils/exportFiles';
import {
  calculateCourseProgressPercentage,
  getStudentCourseProgress,
  isResultHiddenFromStudent,
  isStudentMemberOfClass,
  syncCourseScormState,
} from '../utils/storage';

interface ExamHistoryViewProps {
  results: ExamResult[];
  exams?: Exam[];
  currentUser?: UserAccount | null;
  isTeacher?: boolean;
  courses?: MicroCourse[];
  classrooms?: Classroom[];
  onSelectResult: (result: ExamResult) => void;
  onDeleteResult?: (result: ExamResult) => void;
  onClearResults?: () => void;
  onBack: () => void;
}

export const ExamHistoryView: React.FC<ExamHistoryViewProps> = ({
  results,
  exams = [],
  currentUser,
  isTeacher = false,
  courses = [],
  classrooms = [],
  onSelectResult,
  onDeleteResult,
  onClearResults,
  onBack,
}) => {
  const visibleResults = useMemo(() => {
    const base = isTeacher
      ? results
      : results.filter((r) => !isResultHiddenFromStudent(r, exams));

    if (currentUser && !isTeacher) {
      return base
        .filter((r) =>
          doesResultBelongToStudent(r, {
            id: currentUser.id,
            email: currentUser.email,
            studentCode: currentUser.studentCode,
            name: currentUser.fullName,
          })
        )
        .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());
    }
    return [...base].sort(
      (a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
    );
  }, [results, exams, currentUser, isTeacher]);

  const handleExportExcel = () => {
    if (currentUser && !isTeacher) {
      const enrolledClassNames = classrooms
        .filter((cls) => isStudentMemberOfClass(cls, currentUser))
        .map((cls) => cls.name)
        .join(', ');

      const coursesProgress = courses.map((course) => {
        const rawProg = getStudentCourseProgress(course.id, currentUser.id);
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
      });

      exportStudentLearningResultsToExcel({
        studentName: currentUser.fullName || currentUser.name || 'Học sinh',
        studentCode: currentUser.studentCode,
        studentEmail: currentUser.email,
        className: enrolledClassNames || 'Tự do',
        results: visibleResults,
        coursesProgress,
      });
      return;
    }

    if (!isTeacher) {
      exportStudentLearningResultsToExcel({
        studentName: visibleResults[0]?.studentName || 'Học sinh',
        studentCode: visibleResults[0]?.studentCode,
        results: visibleResults,
      });
      return;
    }

    exportResultsToExcel(visibleResults);
  };

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    if (m === 0) return `${s}s`;
    return `${m}m ${s > 0 ? `${s}s` : ''}`;
  };

  const avgScore =
    visibleResults.length > 0
      ? Number((visibleResults.reduce((acc, r) => acc + r.score, 0) / visibleResults.length).toFixed(1))
      : 0;

  const totalQuestionsDone = visibleResults.reduce((acc, r) => acc + r.totalQuestions, 0);

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 sm:px-6 font-sans">
      {/* Header */}
      <div className="flex items-center justify-between pb-6 border-b border-slate-200 mb-6 gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 text-slate-500 hover:text-slate-900 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            title="Quay lại"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              Lịch sử làm bài & Thống kê tiến độ
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              {isTeacher
                ? 'Theo dõi, xuất báo cáo và quản lý lịch sử kết quả các bài thi đã làm'
                : 'Theo dõi kết quả các bài thi đã làm, điểm số và sự tiến bộ qua từng ngày (lịch sử được lưu cố định)'}
            </p>
          </div>
        </div>

        {visibleResults.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleExportExcel}
              className="py-2 px-3.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
              title="Xuất kết quả học tập ra file Excel (.xlsx)"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>
                {isTeacher ? 'Xuất Excel kết quả (.xlsx)' : 'Xuất Excel kết quả học tập (.xlsx)'}
              </span>
            </button>
            {isTeacher && onClearResults && (
              <button
                type="button"
                onClick={onClearResults}
                className="py-2 px-3 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                title="Xóa toàn bộ lịch sử làm bài (Giáo viên)"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Xóa tất cả</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Aggregate Stats */}
      {visibleResults.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-700 border border-blue-100 flex items-center justify-center">
              <BookOpen className="w-6 h-6" />
            </div>
            <div>
              <div className="text-xs text-slate-500 font-semibold uppercase">Tổng bài đã thi</div>
              <div className="text-2xl font-bold font-mono text-slate-900 tabular-nums">
                {visibleResults.length} bài
              </div>
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-100 flex items-center justify-center">
              <Award className="w-6 h-6" />
            </div>
            <div>
              <div className="text-xs text-slate-500 font-semibold uppercase">Điểm trung bình</div>
              <div className="text-2xl font-bold font-mono text-emerald-800 tabular-nums">
                {avgScore} / 10
              </div>
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-700 border border-purple-100 flex items-center justify-center">
              <BarChart2 className="w-6 h-6" />
            </div>
            <div>
              <div className="text-xs text-slate-500 font-semibold uppercase">Số câu đã luyện</div>
              <div className="text-2xl font-bold font-mono text-slate-900 tabular-nums">
                {totalQuestionsDone} câu
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Results List */}
      {visibleResults.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-xs">
          <Trophy className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-900 mb-1">
            Chưa có lịch sử làm bài nào
          </h3>
          <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto mb-6">
            Hãy chọn một đề thi từ thư viện và bắt đầu thử sức ngay bây giờ. Mọi kết quả và bảng phân tích điểm sẽ được lưu tự động tại đây.
          </p>
          <button
            onClick={onBack}
            className="py-2 px-4 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors inline-flex items-center gap-1.5"
          >
            Khám phá danh sách đề thi
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="divide-y divide-slate-100">
            {visibleResults.map((res) => {
              const formattedDate = new Date(res.completedAt).toLocaleDateString('vi-VN');
              const formattedTime = new Date(res.completedAt).toLocaleTimeString('vi-VN', {
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <div
                  key={res.id}
                  className="p-4 sm:p-5 hover:bg-slate-50/80 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold text-blue-700">{res.grade}</span>
                      <span className="text-slate-300">·</span>
                      <span className="text-xs text-slate-500 flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-slate-400" />
                        {formattedDate} {formattedTime}
                      </span>
                    </div>

                    <h4 className="text-sm sm:text-base font-bold text-slate-900 truncate">
                      {res.examTitle}
                    </h4>

                    <div className="flex items-center gap-3 text-xs text-slate-500 mt-1 font-mono">
                      <span>
                        Đúng: {res.correctCount}/{res.totalQuestions} câu
                      </span>
                      <span>·</span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-400" />
                        {formatSeconds(res.timeSpentSeconds)}
                      </span>
                    </div>
                  </div>

                  {/* Score & Review Button */}
                  <div className="flex items-center gap-4 shrink-0 justify-between sm:justify-end">
                    <div className="text-right">
                      <div className="text-xs text-slate-400 font-medium">Điểm số</div>
                      <div className="text-xl sm:text-2xl font-bold font-mono text-slate-900 tabular-nums">
                        {res.score.toFixed(1)}
                        <span className="text-xs text-slate-400 font-normal">/10</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onSelectResult(res)}
                        className="py-2 px-3.5 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        <span>Xem lại</span>
                        <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
                      </button>
                      {isTeacher && onDeleteResult && (
                        <button
                          type="button"
                          onClick={() => onDeleteResult(res)}
                          className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer border border-transparent hover:border-rose-200"
                          title="Xóa kết quả thi này"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
