import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Exam, ExamBundle, ElectiveGroup } from '../types/exam';
import { 
  X, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  Play, 
  Layers, 
  Check, 
  Shuffle, 
  Timer, 
  Sparkles,
  AlertTriangle 
} from 'lucide-react';

interface BundleElectiveSelectorModalProps {
  isOpen: boolean;
  bundle: ExamBundle | null;
  allExams: Exam[];
  onConfirm: (selectedExams: Exam[]) => void;
  onClose: () => void;
}

export const BundleElectiveSelectorModal: React.FC<BundleElectiveSelectorModalProps> = ({
  isOpen,
  bundle,
  allExams,
  onConfirm,
  onClose,
}) => {
  if (!isOpen || !bundle) return null;

  const compulsoryExams = useMemo(() => {
    const ids = bundle.compulsoryExamIds || [];
    return ids.map((id) => allExams.find((e) => e.id === id)).filter(Boolean) as Exam[];
  }, [bundle, allExams]);

  const electiveGroups: ElectiveGroup[] = useMemo(() => {
    return bundle.electiveGroups || [];
  }, [bundle]);

  const totalGroups = electiveGroups.length;
  const minGroupsToSelect = Math.max(1, Math.min(bundle.minGroupsToSelect ?? 1, totalGroups));
  const maxGroupsToSelect = Math.max(minGroupsToSelect, Math.min(bundle.maxGroupsToSelect ?? totalGroups, totalGroups));
  const timeLimitSeconds = Math.max(0, bundle.selectionTimeLimitSeconds ?? 0);

  // Active groups state: groups that the candidate is participating in
  const [activeGroupIds, setActiveGroupIds] = useState<string[]>(() => {
    // By default, activate the first `minGroupsToSelect` groups
    return electiveGroups.slice(0, minGroupsToSelect).map((g) => g.id);
  });

  // Selected exams map per group
  const [selectedElectiveMap, setSelectedElectiveMap] = useState<Record<string, string[]>>(() => {
    const initialMap: Record<string, string[]> = {};
    electiveGroups.forEach((grp, idx) => {
      if (idx < minGroupsToSelect) {
        // Pre-select minSelectCount for initially active groups
        const available = grp.examIds.filter((id) => allExams.some((e) => e.id === id));
        initialMap[grp.id] = available.slice(0, grp.minSelectCount);
      } else {
        initialMap[grp.id] = [];
      }
    });
    return initialMap;
  });

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [autoNotice, setAutoNotice] = useState<string | null>(null);

  // Countdown timer state
  const [secondsRemaining, setSecondsRemaining] = useState<number>(timeLimitSeconds);
  const timerHasExpiredRef = useRef(false);

  // Helper to build random valid selection
  const generateRandomSelection = () => {
    if (electiveGroups.length === 0) return { pickedGroupIds: [], pickedExamMap: {} };

    // 1. Choose number of groups between minGroupsToSelect and maxGroupsToSelect
    const numGroups = Math.floor(
      Math.random() * (maxGroupsToSelect - minGroupsToSelect + 1)
    ) + minGroupsToSelect;

    // 2. Randomly pick groups
    const shuffledGroups = [...electiveGroups].sort(() => Math.random() - 0.5);
    const chosenGroups = shuffledGroups.slice(0, numGroups);
    const pickedGroupIds = chosenGroups.map((g) => g.id);

    // 3. For each chosen group, randomly pick minSelectCount exams
    const pickedExamMap: Record<string, string[]> = {};
    electiveGroups.forEach((grp) => {
      if (pickedGroupIds.includes(grp.id)) {
        const available = grp.examIds.filter((id) => allExams.some((e) => e.id === id));
        const shuffledExams = [...available].sort(() => Math.random() - 0.5);
        const countToPick = Math.min(grp.minSelectCount, shuffledExams.length);
        pickedExamMap[grp.id] = shuffledExams.slice(0, countToPick);
      } else {
        pickedExamMap[grp.id] = [];
      }
    });

    return { pickedGroupIds, pickedExamMap };
  };

  // Timer countdown effect
  useEffect(() => {
    if (timeLimitSeconds <= 0) return;

    timerHasExpiredRef.current = false;
    setSecondsRemaining(timeLimitSeconds);

    const intervalId = window.setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          window.clearInterval(intervalId);
          if (!timerHasExpiredRef.current) {
            timerHasExpiredRef.current = true;
            // Auto random selection when timer expires!
            handleAutoRandomSelectionOnExpire();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [timeLimitSeconds]);

  // When timer expires, auto-select randomly and immediately start
  const handleAutoRandomSelectionOnExpire = () => {
    const { pickedGroupIds, pickedExamMap } = generateRandomSelection();
    setActiveGroupIds(pickedGroupIds);
    setSelectedElectiveMap(pickedExamMap);

    const allChosenIds = [
      ...compulsoryExams.map((e) => e.id),
      ...Object.values(pickedExamMap).flat(),
    ];
    const uniqueIds = Array.from(new Set(allChosenIds));
    const finalExams = uniqueIds.map((id) => allExams.find((e) => e.id === id)).filter(Boolean) as Exam[];

    setAutoNotice('⏱ Đã hết thời gian chọn môn! Hệ thống đã tự động chọn ngẫu nhiên tổ hợp môn hợp lệ và đưa bạn vào phòng thi.');
    setTimeout(() => {
      onConfirm(finalExams);
    }, 1200);
  };

  // Manual random selection button handler (user clicks "Chọn ngẫu nhiên giúp tôi")
  const handleManualRandomSelect = () => {
    const { pickedGroupIds, pickedExamMap } = generateRandomSelection();
    setActiveGroupIds(pickedGroupIds);
    setSelectedElectiveMap(pickedExamMap);
    setErrorMessage(null);
    setAutoNotice('🎲 Đã tự động chọn ngẫu nhiên các nhóm và môn thi hợp lệ theo đúng quy chế!');
    setTimeout(() => setAutoNotice(null), 4000);
  };

  // Toggle active status of an elective group
  const toggleGroupActive = (groupId: string) => {
    const isActive = activeGroupIds.includes(groupId);
    if (isActive) {
      // Trying to deactivate
      if (activeGroupIds.length <= minGroupsToSelect) {
        setErrorMessage(
          `Quy chế yêu cầu bạn phải chọn ít nhất ${minGroupsToSelect} nhóm môn tự chọn!`
        );
        return;
      }
      setActiveGroupIds(activeGroupIds.filter((id) => id !== groupId));
      setSelectedElectiveMap((prev) => ({ ...prev, [groupId]: [] }));
      setErrorMessage(null);
    } else {
      // Trying to activate
      if (activeGroupIds.length >= maxGroupsToSelect) {
        setErrorMessage(
          `Bạn chỉ được chọn tối đa ${maxGroupsToSelect} nhóm môn tự chọn! Hãy bỏ chọn bớt một nhóm trước.`
        );
        return;
      }
      setActiveGroupIds([...activeGroupIds, groupId]);
      // Auto pre-select minSelectCount for convenience
      const group = electiveGroups.find((g) => g.id === groupId);
      if (group) {
        const available = group.examIds.filter((id) => allExams.some((e) => e.id === id));
        setSelectedElectiveMap((prev) => ({
          ...prev,
          [groupId]: available.slice(0, group.minSelectCount),
        }));
      }
      setErrorMessage(null);
    }
  };

  // Toggle exam inside an elective group
  const toggleElectiveExam = (groupId: string, examId: string) => {
    // If group is not active, activate it first if allowed
    if (!activeGroupIds.includes(groupId)) {
      if (activeGroupIds.length >= maxGroupsToSelect) {
        setErrorMessage(
          `Bạn chỉ được chọn tối đa ${maxGroupsToSelect} nhóm môn tự chọn! Hãy bỏ chọn một nhóm khác trước.`
        );
        return;
      }
      setActiveGroupIds([...activeGroupIds, groupId]);
    }

    setSelectedElectiveMap((prev) => {
      const currentList = prev[groupId] || [];
      const isSelected = currentList.includes(examId);
      const updated = isSelected
        ? currentList.filter((id) => id !== examId)
        : [...currentList, examId];
      return { ...prev, [groupId]: updated };
    });
    setErrorMessage(null);
  };

  // Validation status
  const groupCountValid =
    activeGroupIds.length >= minGroupsToSelect && activeGroupIds.length <= maxGroupsToSelect;

  const validationStatus = useMemo(() => {
    const activeGroupsList = electiveGroups.filter((g) => activeGroupIds.includes(g.id));
    const activeGroupStatus = activeGroupsList.map((grp) => {
      const selected = selectedElectiveMap[grp.id] || [];
      const isMet = selected.length >= grp.minSelectCount;
      const missingCount = Math.max(0, grp.minSelectCount - selected.length);
      return {
        group: grp,
        selectedCount: selected.length,
        isMet,
        missingCount,
      };
    });

    const isAllActiveGroupsMet = activeGroupStatus.every((s) => s.isMet);
    const isOverallValid = groupCountValid && isAllActiveGroupsMet;

    return { activeGroupStatus, isOverallValid, isAllActiveGroupsMet };
  }, [electiveGroups, activeGroupIds, selectedElectiveMap, groupCountValid]);

  // Calculate final list of selected exams in order
  const finalSelectedExams = useMemo(() => {
    const activeElectiveExamIds = activeGroupIds.flatMap((gId) => selectedElectiveMap[gId] || []);
    const allSelectedIds: string[] = [
      ...compulsoryExams.map((e) => e.id),
      ...activeElectiveExamIds,
    ];
    const uniqueIds = Array.from(new Set(allSelectedIds));
    return uniqueIds.map((id) => allExams.find((e) => e.id === id)).filter(Boolean) as Exam[];
  }, [compulsoryExams, activeGroupIds, selectedElectiveMap, allExams]);

  const totalExamMinutes = finalSelectedExams.reduce((acc, e) => acc + e.durationMinutes, 0);
  const totalBreakMinutes = Math.max(0, finalSelectedExams.length - 1) * bundle.breakMinutes;
  const totalSessionMinutes = totalExamMinutes + totalBreakMinutes;

  const handleStart = () => {
    if (!groupCountValid) {
      if (activeGroupIds.length < minGroupsToSelect) {
        setErrorMessage(
          `Vui lòng chọn tham gia ít nhất ${minGroupsToSelect} nhóm tự chọn (hiện đã chọn ${activeGroupIds.length} nhóm)!`
        );
      } else {
        setErrorMessage(
          `Bạn chỉ được chọn tối đa ${maxGroupsToSelect} nhóm tự chọn (hiện đã chọn ${activeGroupIds.length} nhóm)!`
        );
      }
      return;
    }

    if (!validationStatus.isAllActiveGroupsMet) {
      const invalidGroup = validationStatus.activeGroupStatus.find((s) => !s.isMet);
      if (invalidGroup) {
        setErrorMessage(
          `Vui lòng chọn thêm ít nhất ${invalidGroup.missingCount} môn ở "${invalidGroup.group.name}" để đạt quy chế!`
        );
      }
      return;
    }

    if (finalSelectedExams.length === 0) {
      setErrorMessage('Bạn chưa chọn bất kỳ môn thi nào!');
      return;
    }

    onConfirm(finalSelectedExams);
  };

  // Timer format
  const timerPercent = timeLimitSeconds > 0 ? (secondsRemaining / timeLimitSeconds) * 100 : 100;
  const isTimerCritical = timeLimitSeconds > 0 && secondsRemaining <= 15;
  const isTimerWarning = timeLimitSeconds > 0 && secondsRemaining <= 30 && secondsRemaining > 15;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto font-sans">
      <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="p-4 sm:p-5 bg-purple-900 text-white flex items-center justify-between gap-4 shrink-0">
          <div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-400 text-purple-950 uppercase tracking-wider">
                Quy chế tự chọn môn thi
              </span>
              <span className="text-xs text-purple-200">
                Tổ hợp thi liên môn
              </span>
              <span className="text-xs font-semibold text-purple-300 bg-purple-800/80 px-2 py-0.5 rounded">
                Yêu cầu: Chọn từ {minGroupsToSelect} đến {maxGroupsToSelect} nhóm
              </span>
            </div>
            <h2 className="text-base sm:text-lg font-bold text-white">
              {bundle.title}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-purple-300 hover:text-white rounded-lg transition-colors cursor-pointer"
            title="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Countdown Timer Banner (if enabled) */}
        {timeLimitSeconds > 0 && (
          <div
            className={`px-4 sm:px-6 py-2.5 border-b transition-colors flex flex-col sm:flex-row items-center justify-between gap-2 text-xs shrink-0 ${
              isTimerCritical
                ? 'bg-rose-50 text-rose-950 border-rose-200 animate-pulse'
                : isTimerWarning
                ? 'bg-amber-50 text-amber-950 border-amber-200'
                : 'bg-emerald-50 text-emerald-950 border-emerald-200'
            }`}
          >
            <div className="flex items-center gap-2 font-bold">
              <Timer
                className={`w-4 h-4 ${
                  isTimerCritical
                    ? 'text-rose-600 animate-bounce'
                    : isTimerWarning
                    ? 'text-amber-600'
                    : 'text-emerald-600'
                }`}
              />
              <span>
                Thời gian còn lại để chọn môn:{' '}
                <span className="font-mono text-sm px-1.5 py-0.5 rounded bg-white/80 border border-current shadow-2xs">
                  {Math.floor(secondsRemaining / 60)
                    .toString()
                    .padStart(2, '0')}
                  :{(secondsRemaining % 60).toString().padStart(2, '0')}
                </span>
              </span>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
              <span className="text-[11px] text-slate-500">
                {secondsRemaining === 0
                  ? 'Đang chuyển vào phòng thi...'
                  : 'Hết giờ sẽ tự động bốc thăm ngẫu nhiên'}
              </span>
              {/* Manual random button */}
              <button
                type="button"
                onClick={handleManualRandomSelect}
                className="px-2.5 py-1 text-[11px] font-bold bg-white hover:bg-slate-100 text-purple-700 border border-purple-300 rounded-lg shadow-2xs transition-all flex items-center gap-1 cursor-pointer"
                title="Bốc thăm ngẫu nhiên nhóm và môn thi hợp lệ ngay"
              >
                <Shuffle className="w-3 h-3 text-purple-600" />
                <span>Chọn ngẫu nhiên</span>
              </button>
            </div>

            {/* Progress bar line */}
            <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden sm:hidden mt-1">
              <div
                className={`h-full transition-all duration-1000 ${
                  isTimerCritical ? 'bg-rose-600' : isTimerWarning ? 'bg-amber-500' : 'bg-emerald-600'
                }`}
                style={{ width: `${timerPercent}%` }}
              />
            </div>
          </div>
        )}

        {/* Instructions banner */}
        <div className="px-4 sm:px-6 py-2.5 bg-purple-50 border-b border-purple-100 text-xs text-purple-950 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-purple-700 shrink-0" />
            <div className="leading-relaxed">
              <strong>Quy chế:</strong> Thi môn bắt buộc (nếu có) và chọn từ{' '}
              <span className="font-bold text-purple-900 bg-purple-100 px-1 py-0.2 rounded">
                {minGroupsToSelect} đến {maxGroupsToSelect} nhóm
              </span>
              . Trong mỗi nhóm đã chọn, phải tích đủ số môn tối thiểu.
            </div>
          </div>

          {timeLimitSeconds === 0 && (
            <button
              type="button"
              onClick={handleManualRandomSelect}
              className="px-2.5 py-1 text-[11px] font-bold bg-white hover:bg-purple-100 text-purple-700 border border-purple-300 rounded-lg shadow-2xs transition-all flex items-center gap-1 shrink-0 cursor-pointer"
              title="Bốc thăm ngẫu nhiên nhóm và môn thi hợp lệ ngay"
            >
              <Shuffle className="w-3 h-3 text-purple-600" />
              <span>Chọn ngẫu nhiên giúp tôi</span>
            </button>
          )}
        </div>

        {/* Error / Alert notice */}
        {errorMessage && (
          <div className="mx-4 sm:mx-6 mt-3 p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span className="font-medium">{errorMessage}</span>
          </div>
        )}

        {autoNotice && (
          <div className="mx-4 sm:mx-6 mt-3 p-3 bg-indigo-50 border border-indigo-200 text-indigo-900 rounded-xl text-xs flex items-center gap-2 animate-in fade-in">
            <Sparkles className="w-4 h-4 text-indigo-600 shrink-0" />
            <span className="font-medium">{autoNotice}</span>
          </div>
        )}

        {/* Content list */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6 flex-1 bg-slate-50/50">
          
          {/* Section 1: Compulsory Exams */}
          {compulsoryExams.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-600"></span>
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
                    Môn Bắt buộc phải thi ({compulsoryExams.length} môn)
                  </h3>
                </div>
                <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                  Tất cả thí sinh đều phải làm
                </span>
              </div>

              <div className="space-y-2">
                {compulsoryExams.map((exam, idx) => (
                  <div
                    key={exam.id}
                    className="p-3 rounded-lg border border-blue-200 bg-blue-50/40 flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-5 h-5 rounded-md bg-blue-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
                        <Check className="w-3.5 h-3.5" />
                      </span>
                      <div className="min-w-0">
                        <span className="font-bold text-slate-900 block truncate">
                          {idx + 1}. {exam.title}
                        </span>
                        <span className="text-slate-500 text-[11px]">
                          {exam.grade} · {exam.totalPoints || 10} điểm · {exam.questions.length} câu
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 font-mono text-slate-600">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span>{exam.durationMinutes}p</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section 2: Elective Groups */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-600"></span>
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
                  Các nhóm môn Tự chọn ({totalGroups} nhóm)
                </h3>
              </div>
              <span
                className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${
                  groupCountValid
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                    : 'bg-amber-100 text-amber-900 border-amber-300'
                }`}
              >
                Đã chọn tham gia: {activeGroupIds.length}/{minGroupsToSelect}-{maxGroupsToSelect} nhóm
              </span>
            </div>

            {electiveGroups.map((group, grpIdx) => {
              const isActive = activeGroupIds.includes(group.id);
              const selectedList = selectedElectiveMap[group.id] || [];
              const isMet = isActive && selectedList.length >= group.minSelectCount;
              const diff = Math.max(0, group.minSelectCount - selectedList.length);
              const groupExams = group.examIds
                .map((id) => allExams.find((e) => e.id === id))
                .filter(Boolean) as Exam[];

              return (
                <div
                  key={group.id}
                  className={`rounded-xl border p-4 shadow-2xs space-y-3 transition-all ${
                    !isActive
                      ? 'bg-slate-100/60 border-slate-300 opacity-75'
                      : isMet
                      ? 'bg-white border-emerald-300 ring-1 ring-emerald-200'
                      : 'bg-amber-50/30 border-amber-300 ring-1 ring-amber-200'
                  }`}
                >
                  {/* Group header with activation toggle */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-slate-200/80">
                    <div className="flex items-center gap-3">
                      {/* Checkbox to participate in this group */}
                      <button
                        type="button"
                        onClick={() => toggleGroupActive(group.id)}
                        className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 border transition-all cursor-pointer ${
                          isActive
                            ? 'bg-purple-700 text-white border-purple-700 shadow-2xs'
                            : 'bg-white border-slate-300 hover:border-purple-400'
                        }`}
                        title={isActive ? 'Bỏ chọn nhóm này' : 'Chọn tham gia nhóm này'}
                      >
                        {isActive && <Check className="w-4 h-4" />}
                      </button>

                      <div>
                        <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                          <span className="w-5 h-5 rounded bg-purple-100 text-purple-800 text-xs flex items-center justify-center font-bold">
                            {grpIdx + 1}
                          </span>
                          <span>{group.name}</span>
                          {!isActive && (
                            <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">
                              (Chưa chọn nhóm này)
                            </span>
                          )}
                        </h4>
                        {group.description && (
                          <p className="text-xs text-slate-500 mt-0.5">{group.description}</p>
                        )}
                      </div>
                    </div>

                    {/* Status badge */}
                    <div className="flex items-center gap-2">
                      {isActive ? (
                        <span
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 ${
                            isMet
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-300'
                              : 'bg-amber-100 text-amber-900 border border-amber-300'
                          }`}
                        >
                          {isMet ? (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Đã chọn {selectedList.length}/{group.minSelectCount} môn (Đạt yêu cầu)</span>
                            </>
                          ) : (
                            <>
                              <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                              <span>Cần chọn ≥ {group.minSelectCount} môn (Còn thiếu {diff} môn)</span>
                            </>
                          )}
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => toggleGroupActive(group.id)}
                          className="px-2.5 py-1 rounded-lg text-xs font-semibold text-purple-700 bg-white border border-purple-200 hover:bg-purple-50 transition-colors cursor-pointer"
                        >
                          + Chọn tham gia nhóm này
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Exams inside this group */}
                  <div className={`grid grid-cols-1 sm:grid-cols-2 gap-2 ${!isActive ? 'pointer-events-none opacity-50' : ''}`}>
                    {groupExams.map((exam) => {
                      const isChecked = selectedList.includes(exam.id);
                      return (
                        <button
                          key={exam.id}
                          type="button"
                          onClick={() => toggleElectiveExam(group.id, exam.id)}
                          disabled={!isActive}
                          className={`text-left p-3 rounded-lg border transition-all flex items-start gap-3 cursor-pointer ${
                            isChecked
                              ? 'bg-purple-50 border-purple-400 text-purple-950 ring-1 ring-purple-300'
                              : 'bg-white border-slate-200 hover:border-slate-300 text-slate-800'
                          }`}
                        >
                          <div
                            className={`w-5 h-5 rounded flex items-center justify-center shrink-0 border mt-0.5 transition-colors ${
                              isChecked
                                ? 'bg-purple-700 text-white border-purple-700'
                                : 'bg-slate-100 border-slate-300'
                            }`}
                          >
                            {isChecked && <Check className="w-3.5 h-3.5" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <span className="font-semibold text-xs block truncate leading-snug">
                              {exam.title}
                            </span>
                            <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-1">
                              <span className="flex items-center gap-0.5 font-mono">
                                <Clock className="w-3 h-3" />
                                {exam.durationMinutes}p
                              </span>
                              <span>·</span>
                              <span>{exam.questions.length} câu</span>
                              <span>·</span>
                              <span>{exam.totalPoints || 10}đ</span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer info & CTA */}
        <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-600 flex items-center gap-3 flex-wrap">
            <span>
              Đã chọn: <strong className="text-slate-900 font-bold">{finalSelectedExams.length} môn thi</strong> ({activeGroupIds.length} nhóm tự chọn)
            </span>
            <span aria-hidden="true" className="text-slate-300">·</span>
            <span className="flex items-center gap-1 font-mono">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              Tổng: {totalSessionMinutes} phút (Nghỉ {totalBreakMinutes}p)
            </span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-initial px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleStart}
              disabled={!validationStatus.isOverallValid || finalSelectedExams.length === 0}
              className={`flex-1 sm:flex-initial px-5 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 shadow-xs cursor-pointer ${
                validationStatus.isOverallValid && finalSelectedExams.length > 0
                  ? 'bg-purple-700 hover:bg-purple-800 text-white active:bg-purple-900'
                  : 'bg-slate-300 text-slate-500 cursor-not-allowed'
              }`}
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Vào phòng thi ({finalSelectedExams.length} môn)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
