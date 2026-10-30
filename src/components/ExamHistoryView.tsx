import React from 'react';
import { ExamResult } from '../types/exam';
import { 
  Trophy, 
  Clock, 
  Calendar, 
  Trash2, 
  ArrowLeft, 
  ExternalLink,
  BookOpen,
  Award,
  BarChart2
} from 'lucide-react';

interface ExamHistoryViewProps {
  results: ExamResult[];
  onSelectResult: (result: ExamResult) => void;
  onClearHistory: () => void;
  onDeleteResult?: (resultId: string) => void;
  onBack: () => void;
}

export const ExamHistoryView: React.FC<ExamHistoryViewProps> = ({
  results,
  onSelectResult,
  onClearHistory,
  onDeleteResult,
  onBack,
}) => {
  const [isConfirmingClear, setIsConfirmingClear] = React.useState(false);

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    if (m === 0) return `${s}s`;
    return `${m}m ${s > 0 ? `${s}s` : ''}`;
  };

  const avgScore = results.length > 0 
    ? Number((results.reduce((acc, r) => acc + r.score, 0) / results.length).toFixed(1))
    : 0;

  const totalQuestionsDone = results.reduce((acc, r) => acc + r.totalQuestions, 0);

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
              Theo dõi kết quả các bài thi đã làm, điểm số và sự tiến bộ qua từng ngày
            </p>
          </div>
        </div>

        {results.length > 0 && (
          <div>
            {!isConfirmingClear ? (
              <button
                onClick={() => setIsConfirmingClear(true)}
                className="py-2 px-3 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                title="Xóa toàn bộ lịch sử thi đã lưu"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Xóa lịch sử</span>
              </button>
            ) : (
              <div className="flex items-center gap-1.5 animate-in fade-in duration-150">
                <button
                  onClick={() => {
                    setIsConfirmingClear(false);
                    onClearHistory();
                  }}
                  className="py-2 px-3 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Xác nhận xóa hết</span>
                </button>
                <button
                  onClick={() => setIsConfirmingClear(false)}
                  className="py-2 px-2.5 text-xs text-slate-600 hover:bg-slate-200 rounded-lg cursor-pointer"
                >
                  Hủy
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Aggregate Stats */}
      {results.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-700 border border-blue-100 flex items-center justify-center">
              <BookOpen className="w-6 h-6" />
            </div>
            <div>
              <div className="text-xs text-slate-500 font-semibold uppercase">Tổng bài đã thi</div>
              <div className="text-2xl font-bold font-mono text-slate-900 tabular-nums">
                {results.length} bài
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
      {results.length === 0 ? (
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
            {results.map((res) => {
              const formattedDate = new Date(res.completedAt).toLocaleDateString('vi-VN');
              const formattedTime = new Date(res.completedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

              return (
                <div
                  key={res.id}
                  className="p-4 sm:p-5 hover:bg-slate-50/80 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold text-blue-700">
                        {res.grade}
                      </span>
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
                      <span>Đúng: {res.correctCount}/{res.totalQuestions} câu</span>
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
                        onClick={() => onSelectResult(res)}
                        className="py-2 px-3.5 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        <span>Xem lại</span>
                        <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
                      </button>

                      {onDeleteResult && (
                        <button
                          onClick={() => onDeleteResult(res.id)}
                          className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          title="Xóa bài thi này khỏi lịch sử"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
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
