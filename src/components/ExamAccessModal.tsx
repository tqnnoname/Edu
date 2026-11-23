import React, { useState, useEffect, useMemo } from 'react';
import { Exam, ExamBundle, ExamResult, UserRole } from '../types/exam';
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
  Coffee,
  ShieldCheck,
} from 'lucide-react';
import {
  getCandidateProfile,
  saveCandidateProfile,
  isItemScheduleOpen,
  getAllClassrooms,
  getCurrentUser,
  canUserAccessProtectedItem,
  canShowInPublicLibrary,
  getUserAttemptCountForExam,
  getUserAttemptCountForBundle,
} from '../utils/storage';

interface ExamAccessModalProps {
  isOpen: boolean;
  allExams: Exam[];
  allBundles?: ExamBundle[];
  results?: ExamResult[];
  userRole: UserRole;
  targetExam?: Exam | null;
  targetBundle?: ExamBundle | null;
  lockedMode?: 'exam' | 'practice' | null;
  sourceClassId?: string | null;
  onClose: () => void;
  onEnterExam: (exam: Exam, candidateName: string, studentCode?: string, mode?: 'exam' | 'practice') => void;
  onEnterBundle?: (bundle: ExamBundle, candidateName: string, studentCode?: string) => void;
}

export const ExamAccessModal: React.FC<ExamAccessModalProps> = ({
  isOpen,
  allExams,
  allBundles = [],
  results = [],
  userRole,
  targetExam = null,
  targetBundle = null,
  lockedMode = null,
  sourceClassId = null,
  onClose,
  onEnterExam,
  onEnterBundle,
}) => {
  // Always initialize codes empty so candidates must manually enter them (no pre-filled digits)
  const [codeInputValue, setCodeInputValue] = useState('');
  const [entryCodeInput, setEntryCodeInput] = useState('');
  const [candidateName, setCandidateName] = useState('');
  const [mode, setMode] = useState<'exam' | 'practice'>('exam');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const currentUser = getCurrentUser();
  const allCls = getAllClassrooms();

  useEffect(() => {
    if (isOpen) {
      const savedProfile = getCandidateProfile();
      const user = getCurrentUser();
      if (user?.fullName) {
        setCandidateName(user.fullName);
      } else if (savedProfile.fullName && savedProfile.fullName !== 'Thí sinh tự do') {
        setCandidateName(savedProfile.fullName);
      } else {
        setCandidateName('');
      }
      // Strictly never pre-fill Mã đề thi or Mã dự thi
      setCodeInputValue('');
      setEntryCodeInput('');
      setMode(lockedMode || 'exam');
      setErrorMsg(null);
    }
  }, [isOpen, targetExam?.id, targetBundle?.id, lockedMode, sourceClassId]);

  const matchedExam = useMemo(() => {
    const clean = codeInputValue.trim();
    if (!clean) return null;
    if (targetExam) {
      const expected = (targetExam.examCode || '').trim();
      return clean.toLowerCase() === expected.toLowerCase() || clean === targetExam.id
        ? targetExam
        : null;
    }
    return (
      allExams.find(
        (e) =>
          (e.examCode || '').trim().toLowerCase() === clean.toLowerCase() || e.id === clean
      ) || null
    );
  }, [codeInputValue, allExams, targetExam]);

  const matchedBundle = useMemo(() => {
    const clean = codeInputValue.trim();
    if (!clean) return null;
    if (targetBundle) {
      const expected = (targetBundle.bundleCode || '').trim();
      return clean.toLowerCase() === expected.toLowerCase() || clean === targetBundle.id
        ? targetBundle
        : null;
    }
    if (targetExam) return null;
    return (
      allBundles.find(
        (b) =>
          (b.bundleCode || '').trim().toLowerCase() === clean.toLowerCase() || b.id === clean
      ) || null
    );
  }, [codeInputValue, allBundles, targetBundle, targetExam]);

  const activeExamForContext = targetExam || matchedExam;
  const activeBundleForContext = targetBundle || matchedBundle;

  // Determine whether this is a classroom exam so username auto-fills candidate name
  const isClassroomContext = useMemo(() => {
    if (sourceClassId) return true;
    const item = activeExamForContext || activeBundleForContext;
    if (!item) return false;
    if (item.visibility === 'class' || Boolean(item.assignedClassId)) return true;
    if (activeExamForContext) {
      return allCls.some((c) => c.assignedExamIds?.includes(activeExamForContext.id));
    }
    return false;
  }, [sourceClassId, activeExamForContext, activeBundleForContext, allCls]);

  const classroomAccountUsername = useMemo(() => {
    if (!currentUser) return '';
    return (
      currentUser.username?.trim() ||
      (currentUser.email ? currentUser.email.split('@')[0] : '') ||
      currentUser.fullName ||
      ''
    );
  }, [currentUser]);

  const useAutoClassroomUsername = Boolean(isClassroomContext && currentUser && classroomAccountUsername);

  // Attempt limit checks for active item
  const activeExamAttempts = useMemo(() => {
    if (!activeExamForContext) return 0;
    return getUserAttemptCountForExam(activeExamForContext.id, results, currentUser);
  }, [activeExamForContext, results, currentUser]);

  const activeBundleAttempts = useMemo(() => {
    if (!activeBundleForContext) return 0;
    return getUserAttemptCountForBundle(activeBundleForContext, results, currentUser);
  }, [activeBundleForContext, results, currentUser]);

  if (!isOpen) return null;

  const isMatchedExamAttemptsExceeded = Boolean(
    userRole === 'student' &&
      matchedExam &&
      matchedExam.maxAttempts &&
      matchedExam.maxAttempts > 0 &&
      activeExamAttempts >= matchedExam.maxAttempts
  );

  const isMatchedBundleAttemptsExceeded = Boolean(
    userRole === 'student' &&
      matchedBundle &&
      matchedBundle.maxAttempts &&
      matchedBundle.maxAttempts > 0 &&
      activeBundleAttempts >= matchedBundle.maxAttempts
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const cleanCode = codeInputValue.trim();
    const cleanEntryCode = entryCodeInput.trim();
    const cleanName = useAutoClassroomUsername
      ? classroomAccountUsername
      : candidateName.trim();

    if (!cleanCode) {
      setErrorMsg(
        targetBundle
          ? 'Vui lòng tự nhập Mã tổ hợp môn thi trước khi vào thi!'
          : 'Vui lòng tự nhập Mã đề thi trước khi bắt đầu làm bài!'
      );
      return;
    }

    if (!cleanEntryCode) {
      setErrorMsg('Vui lòng tự nhập Mã dự thi trước khi bắt đầu làm bài!');
      return;
    }

    if (!cleanName) {
      setErrorMsg('Vui lòng nhập họ và tên thí sinh để xác thực vào phòng thi!');
      return;
    }

    if (targetExam && !matchedExam) {
      setErrorMsg('Mã đề thi chưa chính xác với đề thi đã chọn. Vui lòng kiểm tra và tự nhập lại!');
      return;
    }

    if (targetBundle && !matchedBundle) {
      setErrorMsg('Mã tổ hợp môn chưa chính xác. Vui lòng kiểm tra và tự nhập lại!');
      return;
    }

    if (!matchedExam && !matchedBundle) {
      setErrorMsg(
        `Không tìm thấy đề thi hoặc tổ hợp với mã "${cleanCode}". Vui lòng kiểm tra lại mã do giáo viên cung cấp!`
      );
      return;
    }

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

        const attempts = getUserAttemptCountForExam(matchedExam.id, results, currentUser);
        if (matchedExam.maxAttempts && matchedExam.maxAttempts > 0 && attempts >= matchedExam.maxAttempts) {
          setErrorMsg(
            `Bạn đã hết lượt làm bài cho phép (${attempts}/${matchedExam.maxAttempts} lượt). Không thể vào thi hoặc nhập mã dự thi nữa!`
          );
          return;
        }
      }

      // Validate Mã dự thi against accessSecurityCode if teacher enabled requireAccessCode
      if (userRole === 'student' && matchedExam.requireAccessCode && matchedExam.accessSecurityCode) {
        if (cleanEntryCode.toLowerCase() !== matchedExam.accessSecurityCode.trim().toLowerCase()) {
          setErrorMsg('Mã dự thi không chính xác! Vui lòng tự nhập đúng mã dự thi do giáo viên cấp.');
          return;
        }
      }

      const resolvedMode: 'exam' | 'practice' =
        lockedMode || (matchedExam.modeType === 'exam_only' ? 'exam' : matchedExam.modeType === 'practice_only' ? 'practice' : mode);

      // Save candidate name only (never persist studentCode so Mã dự thi never auto-fills)
      saveCandidateProfile({
        fullName: cleanName,
        studentCode: '',
      });

      onEnterExam(matchedExam, cleanName, cleanEntryCode, resolvedMode);
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

        const attempts = getUserAttemptCountForBundle(matchedBundle, results, currentUser);
        if (matchedBundle.maxAttempts && matchedBundle.maxAttempts > 0 && attempts >= matchedBundle.maxAttempts) {
          setErrorMsg(
            `Bạn đã hết lượt làm bài cho phép (${attempts}/${matchedBundle.maxAttempts} lượt). Không thể vào thi hoặc nhập mã dự thi nữa!`
          );
          return;
        }
      }

      if (userRole === 'student' && matchedBundle.requireAccessCode && matchedBundle.accessSecurityCode) {
        if (cleanEntryCode.toLowerCase() !== matchedBundle.accessSecurityCode.trim().toLowerCase()) {
          setErrorMsg('Mã dự thi tổ hợp không chính xác! Vui lòng tự nhập đúng mã do giáo viên cấp.');
          return;
        }
      }

      saveCandidateProfile({
        fullName: cleanName,
        studentCode: '',
      });

      if (onEnterBundle) {
        onEnterBundle(matchedBundle, cleanName, cleanEntryCode);
      }
      onClose();
    }
  };

  const canPreviewMatchedExam = Boolean(
    matchedExam && canUserAccessProtectedItem(matchedExam, currentUser, userRole, allCls).allowed
  );
  const canPreviewMatchedBundle = Boolean(
    matchedBundle && canUserAccessProtectedItem(matchedBundle, currentUser, userRole, allCls).allowed
  );

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
              <h2 className="text-base font-bold">Xác Thực Mã Đề & Mã Dự Thi</h2>
              <p className="text-xs text-blue-200">
                Tự nhập mã đề thi và mã dự thi một lần trước khi bắt đầu làm bài
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} autoComplete="off" className="p-5 sm:p-6 space-y-4 overflow-y-auto">
          {errorMsg && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs sm:text-sm text-rose-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Selected Target Banner (Title & Info only — NEVER expose examCode/accessSecurityCode) */}
          {(targetExam || targetBundle) && (
            <div className="p-3.5 rounded-xl border border-blue-200 bg-blue-50/70 text-xs space-y-1">
              <div className="text-[11px] font-bold uppercase tracking-wider text-blue-800">
                {targetBundle ? 'Tổ hợp thi đã chọn:' : 'Đề thi đã chọn:'}
              </div>
              <div className="font-bold text-slate-900 text-sm">
                {(targetExam || targetBundle)?.title}
              </div>
              <div className="text-slate-600 flex items-center gap-2 flex-wrap pt-0.5">
                {targetExam && (
                  <>
                    <span>{targetExam.durationMinutes} phút</span>
                    <span>·</span>
                    <span>{targetExam.questions.length} câu hỏi</span>
                  </>
                )}
                {targetBundle && (
                  <span>{targetBundle.examIds.length} môn thi</span>
                )}
              </div>
            </div>
          )}

          {/* Input 1: Mã đề thi / Mã tổ hợp (NEVER pre-filled) */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              {targetBundle ? 'Mã tổ hợp môn' : 'Mã đề thi'} <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                name="exam_code_manual"
                autoComplete="off"
                maxLength={24}
                value={codeInputValue}
                onChange={(e) => {
                  const val = e.target.value.replace(/\s+/g, '');
                  setCodeInputValue(val);
                  setErrorMsg(null);
                }}
                placeholder={targetBundle ? 'Tự nhập mã tổ hợp...' : 'Tự nhập mã đề thi (VD: 8 chữ số)...'}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl font-mono text-base font-bold tracking-widest text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 transition-all uppercase"
                autoFocus
              />
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Không hiển thị sẵn số — thí sinh phải tự nhập đúng mã đề do giáo viên cung cấp.
            </p>
          </div>

          {/* Input 2: Mã dự thi (NEVER pre-filled) */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Mã dự thi <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <Hash className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                name="candidate_entry_code_manual"
                autoComplete="off"
                maxLength={32}
                value={entryCodeInput}
                onChange={(e) => {
                  setEntryCodeInput(e.target.value.trimStart());
                  setErrorMsg(null);
                }}
                placeholder="Tự nhập mã dự thi (không điền sẵn)..."
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl font-mono text-sm font-bold tracking-wider text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 transition-all"
              />
            </div>
            {(activeExamForContext?.requireAccessCode || activeBundleForContext?.requireAccessCode) && (
              <p className="text-[11px] text-amber-700 mt-1 flex items-center gap-1 font-medium">
                <Lock className="w-3 h-3 shrink-0" />
                <span>Đề thi yêu cầu nhập chính xác mã bảo mật dự thi do giáo viên cấp.</span>
              </p>
            )}
          </div>

          {/* Matched Exam Preview Banner (when opened via global portal) */}
          {!targetExam && matchedExam && canPreviewMatchedExam && (
            <div
              className={`p-3.5 rounded-xl border text-xs ${
                isMatchedExamAttemptsExceeded
                  ? 'border-rose-300 bg-rose-50'
                  : 'border-emerald-200 bg-emerald-50/70'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span
                  className={`font-semibold flex items-center gap-1 ${
                    isMatchedExamAttemptsExceeded ? 'text-rose-800' : 'text-emerald-800'
                  }`}
                >
                  {isMatchedExamAttemptsExceeded ? (
                    <Lock className="w-3.5 h-3.5 text-rose-600" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  )}
                  {isMatchedExamAttemptsExceeded ? 'Đã hết lượt thi cho phép:' : 'Đã tìm thấy đề thi:'}
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
                {matchedExam.maxAttempts && matchedExam.maxAttempts > 0 && (
                  <span
                    className={`px-1.5 py-0.5 rounded font-semibold ${
                      isMatchedExamAttemptsExceeded
                        ? 'text-rose-800 bg-rose-100'
                        : 'text-blue-800 bg-blue-100'
                    }`}
                  >
                    Lượt làm: {activeExamAttempts}/{matchedExam.maxAttempts}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Matched Bundle Preview Banner */}
          {!targetBundle && matchedBundle && canPreviewMatchedBundle && (
            <div
              className={`p-3.5 rounded-xl border text-xs ${
                isMatchedBundleAttemptsExceeded
                  ? 'border-rose-300 bg-rose-50'
                  : 'border-purple-200 bg-purple-50/70'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span
                  className={`font-semibold flex items-center gap-1 ${
                    isMatchedBundleAttemptsExceeded ? 'text-rose-800' : 'text-purple-800'
                  }`}
                >
                  {isMatchedBundleAttemptsExceeded ? (
                    <Lock className="w-3.5 h-3.5 text-rose-600" />
                  ) : (
                    <Layers className="w-3.5 h-3.5 text-purple-600" />
                  )}
                  {isMatchedBundleAttemptsExceeded ? 'Đã hết lượt thi tổ hợp:' : 'Đã tìm thấy tổ hợp môn thi:'}
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
                {matchedBundle.maxAttempts && matchedBundle.maxAttempts > 0 && (
                  <span
                    className={`px-1.5 py-0.5 rounded font-semibold ${
                      isMatchedBundleAttemptsExceeded
                        ? 'text-rose-800 bg-rose-100'
                        : 'text-purple-900 bg-purple-100'
                    }`}
                  >
                    Lượt làm: {activeBundleAttempts}/{matchedBundle.maxAttempts}
                  </span>
                )}
              </div>
            </div>
          )}

          {!targetExam &&
            !targetBundle &&
            ((!matchedExam && !matchedBundle) || (!canPreviewMatchedExam && !canPreviewMatchedBundle)) &&
            codeInputValue.trim().length >= 4 && (
              <div className="p-3 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-500 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-slate-400 shrink-0" />
                <span>
                  Chưa tìm thấy đề hoặc tổ hợp khả dụng với mã <strong>"{codeInputValue}"</strong>. Kiểm tra lại mã số hoặc quyền truy cập của bạn.
                </span>
              </div>
            )}

          {/* Input 3: Tên thí sinh (Auto-uses account username in classroom exams!) */}
          {useAutoClassroomUsername ? (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wide">
                    Thí sinh lớp học (Tên đăng nhập tự động)
                  </div>
                  <div className="text-sm font-bold text-slate-900 truncate font-mono">
                    {classroomAccountUsername}
                  </div>
                </div>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-white text-emerald-800 border border-emerald-200 shrink-0">
                Tự động
              </span>
            </div>
          ) : (
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
          )}

          {/* Mode Selector (only shown when entering via global portal without lockedMode and not exam_only/bundle) */}
          {!lockedMode && !targetExam && !targetBundle && !matchedBundle && matchedExam?.modeType !== 'exam_only' && (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Chế độ thi</label>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as 'exam' | 'practice')}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="exam">Thi thật (Tính giờ & Nộp bài đúng giờ)</option>
                <option value="practice">Luyện tập (Xem gợi ý)</option>
              </select>
            </div>
          )}

          {/* Quick Pick Open Exams or Bundles (Chỉ dành cho Giáo viên khi mở cổng chung) */}
          {userRole === 'teacher' && !targetExam && !targetBundle && !matchedExam && !matchedBundle && (
            <div className="pt-2 border-t border-slate-100 space-y-3">
              {availableOpenExams.length > 0 && (
                <div>
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">
                    Chọn nhanh đề thi (GV):
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
                        {ex.examCode && (
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
                    Hoặc chọn nhanh tổ hợp môn (GV):
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
                          <div className="font-semibold text-purple-900 truncate">{b.title}</div>
                          <div className="text-[10px] text-purple-600">
                            {b.examIds.length} môn · Nghỉ {b.intermissionMinutes}p
                          </div>
                        </div>
                        {b.bundleCode && (
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
              disabled={isMatchedExamAttemptsExceeded || isMatchedBundleAttemptsExceeded}
              className={`w-full py-3 px-4 font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2 ${
                isMatchedExamAttemptsExceeded || isMatchedBundleAttemptsExceeded
                  ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white cursor-pointer'
              }`}
            >
              {isMatchedExamAttemptsExceeded || isMatchedBundleAttemptsExceeded ? (
                <>
                  <Lock className="w-4 h-4" />
                  <span>Đã hết lượt thi cho phép</span>
                </>
              ) : (
                <>
                  <KeyRound className="w-4 h-4" />
                  <span>Xác nhận mã & Bắt đầu vào thi</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
