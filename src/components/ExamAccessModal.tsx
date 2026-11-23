import React, { useState, useEffect, useMemo } from 'react';
import { Exam, ExamBundle, UserRole } from '../types/exam';
import { 
  KeyRound, 
  User, 
  Hash, 
  Clock, 
  BookOpen, 
  CheckCircle2, 
  AlertCircle, 
  ArrowRight, 
  X, 
  Lock, 
  Layers,
  Calendar,
  Coffee
} from 'lucide-react';
import {
  getCandidateProfile,
  saveCandidateProfile,
  isItemScheduleOpen,
  getAllClassrooms,
  getCurrentUser,
  canUserAccessProtectedItem,
  canShowInPublicLibrary,
} from '../utils/storage';

interface ExamAccessModalProps {
  isOpen: boolean;
  allExams: Exam[];
  allBundles?: ExamBundle[];
  userRole: UserRole;
  initialExamCode?: string;
  onClose: () => void;
  onEnterExam: (exam: Exam, candidateName: string, studentCode?: string, mode?: 'exam' | 'practice') => void;
  onEnterBundle?: (bundle: ExamBundle, candidateName: string, studentCode?: string) => void;
}

export const ExamAccessModal: React.FC<ExamAccessModalProps> = ({
  isOpen,
  allExams,
  allBundles = [],
  userRole,
  initialExamCode = '',
  onClose,
  onEnterExam,
  onEnterBundle,
}) => {
  const [codeInputValue, setCodeInputValue] = useState(initialExamCode);
  const [candidateName, setCandidateName] = useState('');
  const [studentCode, setStudentCode] = useState('');
  const [mode, setMode] = useState<'exam' | 'practice'>('exam');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      const savedProfile = getCandidateProfile();
      if (savedProfile.fullName && savedProfile.fullName !== 'Thí sinh tự do') {
        setCandidateName(savedProfile.fullName);
      }
      if (savedProfile.studentCode) {
        setStudentCode(savedProfile.studentCode);
      }
      if (initialExamCode) {
        setCodeInputValue(initialExamCode);
      }
      setErrorMsg(null);
    }
  }, [isOpen, initialExamCode]);

  // Detected exam or bundle by 8-digit code or ID (Mã đề/mã tổ hợp chính là mã truy cập)
  const matchedExam = useMemo(() => {
    const clean = codeInputValue.trim();
    if (!clean) return null;
    return allExams.find((e) => e.examCode === clean || e.id === clean) || null;
  }, [codeInputValue, allExams]);

  const matchedBundle = useMemo(() => {
    const clean = codeInputValue.trim();
    if (!clean) return null;
    return allBundles.find((b) => b.bundleCode === clean || b.id === clean) || null;
  }, [codeInputValue, allBundles]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const cleanCode = codeInputValue.trim();
    const cleanName = candidateName.trim();
    const cleanSbd = studentCode.trim();

    if (!cleanCode) {
      setErrorMsg('Vui lòng nhập mã số đề thi hoặc mã tổ hợp môn (8 chữ số)!');
      return;
    }

    if (!cleanName) {
      setErrorMsg('Vui lòng nhập họ và tên thí sinh để xác thực vào phòng thi!');
      return;
    }

    if (!matchedExam && !matchedBundle) {
      setErrorMsg(`Không tìm thấy đề thi hoặc tổ hợp với mã "${cleanCode}". Vui lòng kiểm tra lại 8 chữ số do giáo viên cung cấp!`);
      return;
    }

    const currentUser = getCurrentUser();
    const allCls = getAllClassrooms();

    // Process Single Exam
    if (matchedExam) {
      const accessCheck = canUserAccessProtectedItem(matchedExam, currentUser, userRole, allCls);
      if (!accessCheck.allowed) {
        setErrorMsg(accessCheck.reason || 'Bạn không có quyền truy cập đề thi này!');
        return;
      }

      if (userRole === 'student') {
        const sched = isItemScheduleOpen({
          openTime: matchedExam.openTime,
          closeTime: matchedExam.closeTime,
          status: matchedExam.status,
        });
        if (!sched.isOpen) {
          setErrorMsg(sched.reason || 'Đề thi hiện tại không trong thời gian mở.');
          return;
        }
      }

      // Save profile for future tests
      saveCandidateProfile({
        fullName: cleanName,
        studentCode: cleanSbd || undefined,
      });

      onEnterExam(matchedExam, cleanName, cleanSbd || undefined, mode);
      onClose();
      return;
    }

    // Process Multi-Subject Bundle
    if (matchedBundle) {
      const accessCheck = canUserAccessProtectedItem(matchedBundle, currentUser, userRole, allCls);
      if (!accessCheck.allowed) {
        setErrorMsg(accessCheck.reason || 'Bạn không có quyền truy cập tổ hợp thi này!');
        return;
      }

      if (userRole === 'student') {
        const sched = isItemScheduleOpen({
          openTime: matchedBundle.openTime,
          closeTime: matchedBundle.closeTime,
          status: matchedBundle.status,
        });
        if (!sched.isOpen) {
          setErrorMsg(sched.reason || 'Tổ hợp thi hiện tại không trong thời gian mở.');
          return;
        }
      }

      saveCandidateProfile({
        fullName: cleanName,
        studentCode: cleanSbd || undefined,
      });

      if (onEnterBundle) {
        onEnterBundle(matchedBundle, cleanName, cleanSbd || undefined);
      }
      onClose();
    }
  };

  const currentUser = getCurrentUser();
  const allCls = getAllClassrooms();

  const canPreviewMatchedExam = Boolean(
    matchedExam && canUserAccessProtectedItem(matchedExam, currentUser, userRole, allCls).allowed
  );
  const canPreviewMatchedBundle = Boolean(
    matchedBundle && canUserAccessProtectedItem(matchedBundle, currentUser, userRole, allCls).allowed
  );

  // Quick pick available items visible to current user
  const availableOpenExams = allExams
    .filter((e) => canShowInPublicLibrary(e, currentUser, userRole, allCls))
    .slice(0, 4);

  const availableOpenBundles = (allBundles || [])
    .filter((b) => canShowInPublicLibrary(b, currentUser, userRole, allCls))
    .slice(0, 3);

  const handleQuickFillExam = (ex: Exam) => {
    setCodeInputValue(ex.examCode || ex.id);
    setErrorMsg(null);
  };

  const handleQuickFillBundle = (b: ExamBundle) => {
    setCodeInputValue(b.bundleCode || b.id);
    setErrorMsg(null);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150 max-h-[92vh]">
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-blue-900 via-slate-900 to-indigo-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20">
              <KeyRound className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <h2 className="text-base font-bold">Cổng Đăng Nhập Vào Thi Bằng Mã Số</h2>
              <p className="text-xs text-blue-200">
                Nhập mã 8 chữ số & Họ tên thí sinh để vào làm bài
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4 overflow-y-auto">
          {errorMsg && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs sm:text-sm text-rose-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Input 1: 8-digit Code for Exam or Bundle */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Mã số đề thi hoặc mã tổ hợp (8 chữ số) <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                maxLength={12}
                value={codeInputValue}
                onChange={(e) => {
                  const val = e.target.value.replace(/\s+/g, '');
                  setCodeInputValue(val);
                  setErrorMsg(null);
                }}
                placeholder="Nhập mã đề thi hoặc mã tổ hợp..."
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl font-mono text-base font-bold tracking-widest text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 transition-all uppercase"
                autoFocus
              />
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Nhập mã 8 chữ số do giáo viên hoặc giám thị cung cấp.
            </p>
          </div>

          {/* Matched Exam Preview Banner */}
          {matchedExam && canPreviewMatchedExam && (
            <div className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/70 text-xs">
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-emerald-800 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  Đã tìm thấy đề thi:
                </span>
                {userRole === 'teacher' && matchedExam.examCode && (
                  <span className="font-mono font-bold text-emerald-900 bg-emerald-100 px-2 py-0.5 rounded">
                    Mã đề: {matchedExam.examCode}
                  </span>
                )}
              </div>
              <div className="font-bold text-slate-900 text-sm mt-1">{matchedExam.title}</div>
              <div className="flex flex-wrap items-center gap-2.5 mt-2 text-slate-600">
                <span className="flex items-center gap-1 font-medium">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  {matchedExam.durationMinutes} phút
                </span>
                <span className="flex items-center gap-1 font-medium">
                  <BookOpen className="w-3.5 h-3.5 text-slate-400" />
                  {matchedExam.questions.length} câu hỏi
                </span>
                {matchedExam.minSubmitMinutes && matchedExam.minSubmitMinutes > 0 && (
                  <span className="text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded font-semibold">
                    Làm tối thiểu {matchedExam.minSubmitMinutes} phút
                  </span>
                )}
                {matchedExam.lockExitUntilTimeout && (
                  <span className="text-rose-800 bg-rose-100 px-1.5 py-0.5 rounded font-semibold">
                    Khóa giao diện đến khi hết giờ
                  </span>
                )}
                {matchedExam.showOnlyStudentAnswersAfterExam && (
                  <span className="text-slate-800 bg-slate-200 px-1.5 py-0.5 rounded font-semibold">
                    Chỉ xem câu đã làm sau thi
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Matched Bundle Preview Banner */}
          {matchedBundle && canPreviewMatchedBundle && (
            <div className="p-3.5 rounded-xl border border-purple-200 bg-purple-50/70 text-xs">
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-purple-800 flex items-center gap-1">
                  <Layers className="w-3.5 h-3.5 text-purple-600" />
                  Đã tìm thấy tổ hợp môn thi:
                </span>
                {userRole === 'teacher' && matchedBundle.bundleCode && (
                  <span className="font-mono font-bold text-purple-900 bg-purple-100 px-2 py-0.5 rounded">
                    Mã tổ hợp: {matchedBundle.bundleCode}
                  </span>
                )}
              </div>
              <div className="font-bold text-slate-900 text-sm mt-1">{matchedBundle.title}</div>
              <div className="flex flex-wrap items-center gap-2.5 mt-2 text-purple-800">
                <span className="flex items-center gap-1 font-medium">
                  <BookOpen className="w-3.5 h-3.5 text-purple-500" />
                  {matchedBundle.examIds.length} môn thi
                </span>
                <span className="flex items-center gap-1 font-medium">
                  <Coffee className="w-3.5 h-3.5 text-purple-500" />
                  Nghỉ giữa môn: {matchedBundle.intermissionMinutes} phút
                </span>
                {matchedBundle.minSubmitMinutes && matchedBundle.minSubmitMinutes > 0 && (
                  <span className="text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded font-semibold">
                    Tối thiểu {matchedBundle.minSubmitMinutes} phút/môn
                  </span>
                )}
                {matchedBundle.lockExitUntilTimeout && (
                  <span className="text-rose-800 bg-rose-100 px-1.5 py-0.5 rounded font-semibold">
                    Khóa phòng thi nghiêm ngặt
                  </span>
                )}
              </div>
            </div>
          )}

          {((!matchedExam && !matchedBundle) || (!canPreviewMatchedExam && !canPreviewMatchedBundle)) && codeInputValue.trim().length >= 4 && (
            <div className="p-3 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-500 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-slate-400 shrink-0" />
              <span>Chưa tìm thấy đề hoặc tổ hợp khả dụng với mã <strong>"{codeInputValue}"</strong>. Kiểm tra lại mã số hoặc quyền truy cập của bạn.</span>
            </div>
          )}


          {/* Input 2: Họ và tên thí sinh (BẮT BUỘC) */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Họ và tên thí sinh dự thi <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={candidateName}
                onChange={(e) => setCandidateName(e.target.value)}
                placeholder="Nhập họ và tên đầy đủ..."
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 transition-all"
              />
            </div>
          </div>

          {/* Input 3: Số báo danh / Lớp & Chế độ thi */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Số báo danh (SBD) / Mã SV
              </label>
              <div className="relative">
                <Hash className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={studentCode}
                  onChange={(e) => setStudentCode(e.target.value)}
                  placeholder="Nhập SBD hoặc mã sinh viên..."
                  className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Chế độ thi
              </label>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as 'exam' | 'practice')}
                disabled={Boolean(matchedBundle)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-60"
              >
                <option value="exam">Thi thật (Tính giờ & Nộp bài)</option>
                <option value="practice">Luyện tập (Xem gợi ý)</option>
              </select>
            </div>
          </div>

          {/* Quick Pick Open Exams or Bundles (Chỉ dành cho Giáo viên) */}
          {(userRole === 'teacher' && !matchedExam && !matchedBundle) && (
            <div className="pt-2 border-t border-slate-100 space-y-3">
              {availableOpenExams.length > 0 && (
                <div>
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">
                    Chọn nhanh đề thi:
                  </span>
                  <div className="space-y-1.5 max-h-28 overflow-y-auto pr-1">
                    {availableOpenExams.map((ex) => (
                      <button
                        key={ex.id}
                        type="button"
                        onClick={() => handleQuickFillExam(ex)}
                        className="w-full text-left p-2 rounded-lg bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 transition-colors flex items-center justify-between text-xs cursor-pointer group"
                      >
                        <div className="min-w-0 pr-2">
                          <div className="font-semibold text-slate-800 truncate group-hover:text-blue-900">
                            {ex.title}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {ex.durationMinutes} phút · {ex.questions.length} câu
                          </div>
                        </div>
                        {userRole === 'teacher' && ex.examCode && (
                          <span className="font-mono font-bold text-blue-700 bg-white border border-blue-200 px-2 py-0.5 rounded shrink-0">
                            {ex.examCode}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {availableOpenBundles.length > 0 && (
                <div>
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">
                    Hoặc chọn nhanh tổ hợp môn:
                  </span>
                  <div className="space-y-1.5 max-h-28 overflow-y-auto pr-1">
                    {availableOpenBundles.map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => handleQuickFillBundle(b)}
                        className="w-full text-left p-2 rounded-lg bg-purple-50/50 hover:bg-purple-50 border border-purple-200 hover:border-purple-300 transition-colors flex items-center justify-between text-xs cursor-pointer group"
                      >
                        <div className="min-w-0 pr-2">
                          <div className="font-semibold text-purple-900 truncate">
                            {b.title}
                          </div>
                          <div className="text-[10px] text-purple-600">
                            {b.examIds.length} môn · Nghỉ {b.intermissionMinutes}p
                          </div>
                        </div>
                        {userRole === 'teacher' && b.bundleCode && (
                          <span className="font-mono font-bold text-purple-700 bg-white border border-purple-200 px-2 py-0.5 rounded shrink-0">
                            {b.bundleCode}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Submit Button */}
          <div className="pt-2">
            <button
              type="submit"
              className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <KeyRound className="w-4 h-4" />
              <span>Xác nhận & Vào phòng thi ngay</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
