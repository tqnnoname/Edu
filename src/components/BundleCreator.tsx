import React, { useEffect, useRef, useState } from 'react';
import { Exam, ExamBundle, BundleSelectionMode, ElectiveGroup, ExamStatus, BundleTimingMode, ExamVisibility } from '../types/exam';
import type { UnsavedNavigationGuard } from './UnsavedChangesModal';
import { 
  ArrowLeft, 
  Save, 
  Plus, 
  Trash2, 
  Clock, 
  Layers, 
  AlertCircle,
  MoveUp,
  MoveDown,
  Check, 
  HelpCircle,
  Settings,
  FolderPlus,
  Timer,
  Shuffle,
  Lock,
  Eye,
  Calendar,
  KeyRound,
  CheckCircle2,
  Sparkles,
  Globe,
  Users
} from 'lucide-react';
import {
  generate8DigitBundleCode,
  saveCustomBundle,
  getCurrentUser,
  getAllClassrooms,
  getVisibleClassrooms,
  isCreatorModeRestricted,
  isCreatorOfItem,
  isMasterAdminUser,
} from '../utils/storage';

interface BundleCreatorProps {
  availableExams: Exam[];
  initialBundle?: ExamBundle | null;
  onSave: (bundle: ExamBundle) => void;
  onCancel: () => void;
  onRegisterUnsavedGuard?: (guard: UnsavedNavigationGuard | null) => void;
}

export const BundleCreator: React.FC<BundleCreatorProps> = ({
  availableExams,
  initialBundle,
  onSave,
  onCancel,
  onRegisterUnsavedGuard,
}) => {
  const isEditing = Boolean(initialBundle);
  const currentUser = getCurrentUser();
  const availableClassrooms = getVisibleClassrooms(getAllClassrooms(), currentUser);

  const [title, setTitle] = useState(initialBundle?.title || '');
  const [bundleCode, setBundleCode] = useState<string>(
    initialBundle?.bundleCode || generate8DigitBundleCode()
  );
  const [description, setDescription] = useState(initialBundle?.description || '');
  const [breakMinutes, setBreakMinutes] = useState(initialBundle?.breakMinutes ?? 5);

  // Visibility & Class restriction
  const [visibility, setVisibility] = useState<ExamVisibility>(initialBundle?.visibility || 'public');
  const [assignedClassId, setAssignedClassId] = useState<string>(
    initialBundle?.assignedClassId || availableClassrooms[0]?.id || ''
  );

  // Scheduling & Access Restrictions
  const [status, setStatus] = useState<ExamStatus>(initialBundle?.status || 'open');
  const [openTime, setOpenTime] = useState<string>(initialBundle?.openTime || '');
  const [closeTime, setCloseTime] = useState<string>(initialBundle?.closeTime || '');
  const [maxAttempts, setMaxAttempts] = useState<number>(initialBundle?.maxAttempts ?? 0);
  const [lockExitUntilTimeout, setLockExitUntilTimeout] = useState<boolean>(
    initialBundle?.lockExitUntilTimeout ?? false
  );
  const [showScoreAfterExam, setShowScoreAfterExam] = useState<boolean>(
    initialBundle?.showScoreAfterExam ?? true
  );
  const [showOnlyStudentAnswersAfterExam, setShowOnlyStudentAnswersAfterExam] = useState<boolean>(
    initialBundle?.showOnlyStudentAnswersAfterExam ?? false
  );
  const [minSubmitMinutes, setMinSubmitMinutes] = useState<number>(
    initialBundle?.minSubmitMinutes ?? 0
  );
  const [requireAccessCode, setRequireAccessCode] = useState<boolean>(
    initialBundle?.requireAccessCode ?? false
  );
  const [accessSecurityCode, setAccessSecurityCode] = useState<string>(
    initialBundle?.accessSecurityCode || ''
  );
  const [inPlaceSaveToast, setInPlaceSaveToast] = useState<string | null>(null);

  // Selection mode: 'all_compulsory' | 'has_electives'
  const [selectionMode, setSelectionMode] = useState<BundleSelectionMode>(
    initialBundle?.selectionMode || 'all_compulsory'
  );

  // Timing mode for compulsory sequential vs elective cluster max duration
  const [timingMode, setTimingMode] = useState<BundleTimingMode>(
    initialBundle?.timingMode || 'compulsory_seq_elective_cluster_max'
  );

  // Mode 1: All compulsory list
  const [selectedExamIds, setSelectedExamIds] = useState<string[]>(() => {
    if (initialBundle?.examIds && initialBundle.examIds.length > 0) {
      return [...initialBundle.examIds];
    }
    return availableExams.slice(0, 2).map((e) => e.id);
  });

  // Mode 2: Compulsory exams
  const [compulsoryExamIds, setCompulsoryExamIds] = useState<string[]>(() => {
    return initialBundle?.compulsoryExamIds || [];
  });

  // Mode 2: Elective groups
  const [electiveGroups, setElectiveGroups] = useState<ElectiveGroup[]>(() => {
    if (initialBundle?.electiveGroups && initialBundle.electiveGroups.length > 0) {
      return JSON.parse(JSON.stringify(initialBundle.electiveGroups));
    }
    return [
      {
        id: 'group_1_' + Date.now(),
        name: 'Nhóm 1: Khoa học Tự nhiên',
        description: 'Tự chọn các môn khoa học thực nghiệm',
        minSelectCount: 2,
        examIds: availableExams.slice(0, 3).map((e) => e.id),
      },
      {
        id: 'group_2_' + (Date.now() + 1),
        name: 'Nhóm 2: Khoa học Xã hội & Kỹ năng',
        description: 'Tự chọn các môn nhân văn hoặc ngoại ngữ',
        minSelectCount: 1,
        examIds: availableExams.slice(3, 5).map((e) => e.id),
      },
    ];
  });

  const [errorMsg, setErrorMsg] = useState('');

  // Mode 2: Min & Max elective groups candidate must/can choose
  const [minGroupsToSelect, setMinGroupsToSelect] = useState<number>(() => {
    return initialBundle?.minGroupsToSelect ?? 1;
  });
  const [maxGroupsToSelect, setMaxGroupsToSelect] = useState<number>(() => {
    return initialBundle?.maxGroupsToSelect ?? (initialBundle?.electiveGroups?.length || 2);
  });

  // Mode 2: Countdown time limit (in seconds) for candidate to choose subjects (0 = unlimited)
  const [selectionTimeLimitSeconds, setSelectionTimeLimitSeconds] = useState<number>(() => {
    return initialBundle?.selectionTimeLimitSeconds ?? 60;
  });

  // Random questions count per exam in bundle
  const [randomQuestionCountPerExam, setRandomQuestionCountPerExam] = useState<{ [examId: string]: number }>(() => {
    return initialBundle?.randomQuestionCountPerExam || {};
  });

  const handleSetRandomQuestionCount = (examId: string, count: number) => {
    setRandomQuestionCountPerExam((prev) => ({
      ...prev,
      [examId]: Math.max(0, count),
    }));
  };

  // Mode 1: Toggle exam
  const handleToggleExam = (examId: string) => {
    if (selectedExamIds.includes(examId)) {
      if (selectedExamIds.length <= 2) {
        setErrorMsg('Một tổ hợp cần có ít nhất 2 môn thi!');
        return;
      }
      setSelectedExamIds(selectedExamIds.filter((id) => id !== examId));
    } else {
      setSelectedExamIds([...selectedExamIds, examId]);
      setErrorMsg('');
    }
  };

  const handleMove = (index: number, direction: 'up' | 'down') => {
    const newIdx = direction === 'up' ? index - 1 : index + 1;
    if (newIdx < 0 || newIdx >= selectedExamIds.length) return;
    const copy = [...selectedExamIds];
    const temp = copy[index];
    copy[index] = copy[newIdx];
    copy[newIdx] = temp;
    setSelectedExamIds(copy);
  };

  // Mode 2: Toggle Compulsory Exam
  const handleToggleCompulsoryExam = (examId: string) => {
    setCompulsoryExamIds((prev) =>
      prev.includes(examId) ? prev.filter((id) => id !== examId) : [...prev, examId]
    );
  };

  // Mode 2: Add elective group
  const handleAddElectiveGroup = () => {
    const newGroupNum = electiveGroups.length + 1;
    const newGrp: ElectiveGroup = {
      id: 'grp_' + Date.now(),
      name: `Nhóm ${newGroupNum}: Tự chọn chuyên đề`,
      description: `Thí sinh chọn ít nhất 1 môn trong nhóm này`,
      minSelectCount: 1,
      examIds: [],
    };
    setElectiveGroups([...electiveGroups, newGrp]);
  };

  // Mode 2: Remove elective group
  const handleRemoveElectiveGroup = (groupId: string) => {
    if (electiveGroups.length <= 1) {
      setErrorMsg('Cần duy trì ít nhất 1 nhóm tự chọn trong chế độ này!');
      return;
    }
    setElectiveGroups(electiveGroups.filter((g) => g.id !== groupId));
  };

  // Mode 2: Update elective group field
  const handleUpdateGroup = (groupId: string, field: keyof ElectiveGroup, value: any) => {
    setElectiveGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, [field]: value } : g))
    );
  };

  // Mode 2: Toggle exam inside elective group
  const handleToggleExamInGroup = (groupId: string, examId: string) => {
    setElectiveGroups((prev) =>
      prev.map((g) => {
        if (g.id !== groupId) return g;
        const exists = g.examIds.includes(examId);
        const updatedIds = exists ? g.examIds.filter((id) => id !== examId) : [...g.examIds, examId];
        // If minSelectCount exceeds new length, adjust it
        const newMin = Math.min(g.minSelectCount, Math.max(1, updatedIds.length));
        return {
          ...g,
          examIds: updatedIds,
          minSelectCount: newMin,
        };
      })
    );
  };

  const handleSaveBundle = (stayInEditor: boolean = false): boolean => {
    if (!title.trim()) {
      setErrorMsg('Vui lòng nhập tên cho tổ hợp thi!');
      return false;
    }

    const chosenClass = availableClassrooms.find((c) => c.id === assignedClassId);
    if (visibility === 'class' && !chosenClass) {
      setErrorMsg('Bạn chưa có lớp học nào để gán tổ hợp thi! Hãy tạo lớp học trước hoặc chọn phạm vi khác.');
      return false;
    }

    if (selectionMode === 'all_compulsory') {
      if (selectedExamIds.length < 2) {
        setErrorMsg('Vui lòng chọn ít nhất 2 đề thi cho tổ hợp bắt buộc!');
        return false;
      }

      const newBundle: ExamBundle = {
        id: initialBundle?.id || ('bundle-custom-' + Date.now()),
        title: title.trim(),
        bundleCode: bundleCode.trim() || generate8DigitBundleCode(),
        description:
          description.trim() ||
          `Tổ hợp gồm ${selectedExamIds.length} môn thi bắt buộc với thời gian nghỉ ${breakMinutes} phút giữa các môn.`,
        breakMinutes: Number(breakMinutes) || 5,
        selectionMode: 'all_compulsory',
        timingMode: 'all_sequential_independent',
        examIds: selectedExamIds,
        randomQuestionCountPerExam: Object.keys(randomQuestionCountPerExam).length > 0 ? randomQuestionCountPerExam : undefined,
        visibility,
        assignedClassId: visibility === 'class' ? assignedClassId : undefined,
        assignedClassName: visibility === 'class' ? (chosenClass?.name || 'Lớp riêng') : undefined,
        creatorId: initialBundle?.creatorId || currentUser?.id,
        creatorEmail: initialBundle?.creatorEmail || currentUser?.email,
        creatorName: initialBundle?.creatorName || currentUser?.fullName,
        openTime: openTime || undefined,
        closeTime: closeTime || undefined,
        status,
        maxAttempts: maxAttempts > 0 ? Number(maxAttempts) : undefined,
        lockExitUntilTimeout,
        showScoreAfterExam,
        showOnlyStudentAnswersAfterExam,
        minSubmitMinutes: Number(minSubmitMinutes) > 0 ? Number(minSubmitMinutes) : undefined,
        requireAccessCode,
        accessSecurityCode: requireAccessCode
          ? accessSecurityCode.trim() || Math.floor(100000 + Math.random() * 900000).toString()
          : undefined,
        createdAt: initialBundle?.createdAt || new Date().toISOString().split('T')[0],
        isCustom: true,
      };

      savedSnapshotRef.current = currentSnapshot;
      if (stayInEditor) {
        saveCustomBundle(newBundle);
        const tStr = new Date().toLocaleTimeString('vi-VN');
        setInPlaceSaveToast(`✓ Đã lưu tổ hợp thi thành công tại đây lúc ${tStr}!`);
        setTimeout(() => setInPlaceSaveToast(null), 3500);
      } else {
        onSave(newBundle);
      }
      return true;
    } else {
      // Validate elective groups
      if (electiveGroups.length === 0) {
        setErrorMsg('Vui lòng tạo ít nhất 1 nhóm môn tự chọn!');
        return false;
      }

      for (let i = 0; i < electiveGroups.length; i++) {
        const grp = electiveGroups[i];
        if (!grp.name.trim()) {
          setErrorMsg(`Nhóm tự chọn số ${i + 1} chưa có tên gọi!`);
          return false;
        }
        if (grp.examIds.length === 0) {
          setErrorMsg(`Nhóm "${grp.name}" chưa có môn thi nào. Vui lòng chọn môn cho nhóm!`);
          return false;
        }
        if (grp.minSelectCount < 1 || grp.minSelectCount > grp.examIds.length) {
          setErrorMsg(
            `Nhóm "${grp.name}": Số môn tối thiểu yêu cầu (${grp.minSelectCount}) không hợp lệ (nhóm hiện có ${grp.examIds.length} môn)!`
          );
          return false;
        }
      }

      // Validate group limits
      const totalGroups = electiveGroups.length;
      const validMinGroups = Math.max(1, Math.min(Number(minGroupsToSelect) || 1, totalGroups));
      const validMaxGroups = Math.max(validMinGroups, Math.min(Number(maxGroupsToSelect) || totalGroups, totalGroups));

      if (Number(minGroupsToSelect) > totalGroups) {
        setErrorMsg(`Số nhóm tự chọn tối thiểu (${minGroupsToSelect}) không được vượt quá tổng số nhóm (${totalGroups})!`);
        return false;
      }

      if (Number(maxGroupsToSelect) < Number(minGroupsToSelect)) {
        setErrorMsg(`Số nhóm tự chọn tối đa (${maxGroupsToSelect}) không được nhỏ hơn số nhóm tối thiểu (${minGroupsToSelect})!`);
        return false;
      }

      // Collect all unique exam IDs involved in this bundle
      const allInvolvedIds = Array.from(
        new Set([...compulsoryExamIds, ...electiveGroups.flatMap((g) => g.examIds)])
      );

      const newBundle: ExamBundle = {
        id: initialBundle?.id || ('bundle-custom-' + Date.now()),
        title: title.trim(),
        bundleCode: bundleCode.trim() || generate8DigitBundleCode(),
        description:
          description.trim() ||
          `Tổ hợp có ${compulsoryExamIds.length} môn bắt buộc và ${electiveGroups.length} nhóm môn tự chọn (chọn ${validMinGroups}-${validMaxGroups} nhóm).`,
        breakMinutes: Number(breakMinutes) || 5,
        selectionMode: 'has_electives',
        timingMode: timingMode,
        examIds: allInvolvedIds,
        compulsoryExamIds,
        electiveGroups,
        minGroupsToSelect: validMinGroups,
        maxGroupsToSelect: validMaxGroups,
        selectionTimeLimitSeconds: Math.max(0, Number(selectionTimeLimitSeconds) || 0),
        randomQuestionCountPerExam: Object.keys(randomQuestionCountPerExam).length > 0 ? randomQuestionCountPerExam : undefined,
        visibility,
        assignedClassId: visibility === 'class' ? assignedClassId : undefined,
        assignedClassName: visibility === 'class' ? (chosenClass?.name || 'Lớp riêng') : undefined,
        creatorId: initialBundle?.creatorId || currentUser?.id,
        creatorEmail: initialBundle?.creatorEmail || currentUser?.email,
        creatorName: initialBundle?.creatorName || currentUser?.fullName,
        openTime: openTime || undefined,
        closeTime: closeTime || undefined,
        status,
        maxAttempts: maxAttempts > 0 ? Number(maxAttempts) : undefined,
        lockExitUntilTimeout,
        showScoreAfterExam,
        showOnlyStudentAnswersAfterExam,
        minSubmitMinutes: Number(minSubmitMinutes) > 0 ? Number(minSubmitMinutes) : undefined,
        requireAccessCode,
        accessSecurityCode: requireAccessCode
          ? accessSecurityCode.trim() || Math.floor(100000 + Math.random() * 900000).toString()
          : undefined,
        createdAt: initialBundle?.createdAt || new Date().toISOString().split('T')[0],
        isCustom: true,
      };

      savedSnapshotRef.current = currentSnapshot;
      if (stayInEditor) {
        saveCustomBundle(newBundle);
        const tStr = new Date().toLocaleTimeString('vi-VN');
        setInPlaceSaveToast(`✓ Đã lưu tổ hợp thi thành công tại đây lúc ${tStr}!`);
        setTimeout(() => setInPlaceSaveToast(null), 3500);
      } else {
        onSave(newBundle);
      }
      return true;
    }
  };

  const currentSnapshot = JSON.stringify({
    title,
    description,
    breakMinutes,
    visibility,
    assignedClassId,
    status,
    openTime,
    closeTime,
    maxAttempts,
    lockExitUntilTimeout,
    showScoreAfterExam,
    showOnlyStudentAnswersAfterExam,
    minSubmitMinutes,
    requireAccessCode,
    accessSecurityCode,
    selectionMode,
    timingMode,
    selectedExamIds,
    compulsoryExamIds,
    electiveGroups,
    minGroupsToSelect,
    maxGroupsToSelect,
    selectionTimeLimitSeconds,
    randomQuestionCountPerExam,
  });

  const savedSnapshotRef = useRef<string>(currentSnapshot);
  const latestSnapshotRef = useRef<string>(currentSnapshot);
  latestSnapshotRef.current = currentSnapshot;

  const saveBundleRef = useRef<() => boolean>(() => false);
  saveBundleRef.current = () => handleSaveBundle(true);

  useEffect(() => {
    savedSnapshotRef.current = latestSnapshotRef.current;
  }, [initialBundle?.id]);

  useEffect(() => {
    if (!onRegisterUnsavedGuard) return;
    onRegisterUnsavedGuard({
      title: isEditing ? 'Chưa lưu thay đổi tổ hợp môn' : 'Tổ hợp môn đang tạo chưa được lưu',
      message:
        'Bạn đang thiết lập hoặc chỉnh sửa tổ hợp môn. Bạn có muốn lưu lại dữ liệu trước khi chuyển sang mục khác không?',
      isDirty: () => latestSnapshotRef.current !== savedSnapshotRef.current,
      saveAndExit: () => saveBundleRef.current(),
    });
    return () => {
      onRegisterUnsavedGuard(null);
    };
  }, [onRegisterUnsavedGuard, isEditing]);

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 font-sans">
      {/* Top Header */}
      <div className="flex items-center justify-between pb-6 border-b border-slate-200 mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={onCancel}
            className="p-2 text-slate-500 hover:text-slate-900 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            title="Quay lại"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <span>{isEditing ? 'Chỉnh sửa tổ hợp thi liên môn' : 'Tạo tổ hợp nhóm đề thi liên môn'}</span>
              {isEditing && (
                <span className="text-xs font-mono font-medium text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                  Chế độ sửa
                </span>
              )}
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Hỗ trợ cả chế độ bắt buộc làm tất cả môn và chế độ phân nhóm tự chọn (chọn ít nhất N môn theo quy chế)
            </p>
          </div>
        </div>

        <button
          onClick={() => handleSaveBundle(false)}
          className="py-2.5 px-5 text-xs sm:text-sm font-semibold text-white bg-purple-700 hover:bg-purple-800 rounded-lg transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
        >
          <Save className="w-4 h-4" />
          <span>{isEditing ? 'Lưu thay đổi tổ hợp' : 'Lưu tổ hợp thi'}</span>
        </button>
      </div>

      {errorMsg && (
        <div className="mb-6 p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs sm:text-sm flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Basic Settings */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs mb-6 space-y-4">
        <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide flex items-center gap-2">
          <Layers className="w-4 h-4 text-purple-600" />
          <span>Thông tin đợt thi / Tổ hợp</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Tên tổ hợp đề thi <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Nhập tên tổ hợp đề thi..."
              className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Thời gian nghỉ giải lao giữa 2 môn (Phút)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                max="60"
                value={breakMinutes}
                onChange={(e) => setBreakMinutes(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-32 px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 font-mono"
              />
              <span className="text-xs text-slate-500">
                (Đồng hồ tự đếm ngược trước khi vào môn kế)
              </span>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-purple-600" />
                <span>Mã tổ hợp môn (8 chữ số - Chỉ GV thấy):</span>
              </label>
              <button
                type="button"
                onClick={() => setBundleCode(generate8DigitBundleCode())}
                className="text-[11px] font-bold text-purple-600 hover:text-purple-800 flex items-center gap-1 cursor-pointer"
                title="Tạo mã 8 số ngẫu nhiên mới"
              >
                <Shuffle className="w-3 h-3" />
                <span>Đổi mã</span>
              </button>
            </div>
            <input
              type="text"
              maxLength={8}
              value={bundleCode}
              onChange={(e) => setBundleCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
              placeholder="Nhập mã tổ hợp gồm 8 chữ số..."
              className="w-full px-3.5 py-2 text-sm font-mono font-bold tracking-widest bg-purple-50/60 border border-purple-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600 text-purple-950"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Mô tả ngắn gọn về tổ hợp
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ghi chú về quy chế thi, cách chọn môn, số lượng chỉ tiêu..."
              className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>

          {/* Visibility & Classroom Assignment */}
          <div className="md:col-span-2 pt-3 border-t border-slate-100">
            <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-purple-600" />
              <span>Phạm vi hiển thị tổ hợp thi:</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
              <button
                type="button"
                onClick={() => setVisibility('public')}
                className={`p-2.5 rounded-lg border text-left transition-colors cursor-pointer ${
                  visibility === 'public'
                    ? 'bg-blue-50 border-blue-500 text-blue-950 font-bold ring-1 ring-blue-500'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <span>Công khai trên web</span>
                </div>
                <p className="text-[10px] text-slate-500 font-normal mt-1">Hiển thị ra trang chủ cho mọi người.</p>
              </button>

              <button
                type="button"
                onClick={() => setVisibility('class')}
                className={`p-2.5 rounded-lg border text-left transition-colors cursor-pointer ${
                  visibility === 'class'
                    ? 'bg-indigo-50 border-indigo-500 text-indigo-950 font-bold ring-1 ring-indigo-500'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                  <span>Giới hạn theo Lớp học</span>
                </div>
                <p className="text-[10px] text-slate-500 font-normal mt-1">Chỉ hiển thị cho thành viên lớp được chọn.</p>
              </button>

              <button
                type="button"
                onClick={() => setVisibility('private')}
                className={`p-2.5 rounded-lg border text-left transition-colors cursor-pointer ${
                  visibility === 'private'
                    ? 'bg-rose-50 border-rose-500 text-rose-950 font-bold ring-1 ring-rose-500'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                  <span>Người ra đề (Riêng tư)</span>
                </div>
                <p className="text-[10px] text-slate-500 font-normal mt-1">Chỉ người ra đề và Quản trị viên tối cao nhìn thấy.</p>
              </button>
            </div>

            {visibility === 'class' && (
              <div className="mt-2.5 p-3 bg-indigo-50/60 rounded-lg border border-indigo-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span className="font-semibold text-indigo-950">Chọn lớp học được làm tổ hợp này:</span>
                {availableClassrooms.length === 0 ? (
                  <span className="text-rose-600 font-semibold">Bạn chưa có lớp học nào. Hãy tạo lớp trước.</span>
                ) : (
                  <select
                    value={assignedClassId}
                    onChange={(e) => setAssignedClassId(e.target.value)}
                    className="px-3 py-1.5 text-xs bg-white border border-indigo-300 rounded-lg font-semibold text-slate-900 focus:outline-none"
                  >
                    {availableClassrooms.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.grade} - {c.students?.length || 0} HS)
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}
          </div>

          {/* Schedule & Timing Controls */}
          <div className="md:col-span-2 pt-3 border-t border-slate-100">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Trạng thái tổ hợp:
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as ExamStatus)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 font-semibold"
                >
                  <option value="open">Đang mở (Thí sinh vào thi ngay)</option>
                  <option value="scheduled">Đã lên lịch (Mở theo giờ)</option>
                  <option value="closed">Đã đóng (Khóa không nhận bài)</option>
                  <option value="draft">Bản nháp (Chỉ giáo viên xem)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Thời gian bắt đầu mở:
                </label>
                <input
                  type="datetime-local"
                  value={openTime}
                  onChange={(e) => setOpenTime(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Thời gian kết thúc đóng:
                </label>
                <input
                  type="datetime-local"
                  value={closeTime}
                  onChange={(e) => setCloseTime(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>
            </div>
          </div>

          {/* Security & Strict Controls */}
          <div className="md:col-span-2 pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            {/* Lock exit */}
            <div className="p-3 rounded-lg border border-purple-200 bg-purple-50/50 flex items-start gap-3">
              <input
                type="checkbox"
                id="chk_bundle_lockExit"
                checked={lockExitUntilTimeout}
                onChange={(e) => setLockExitUntilTimeout(e.target.checked)}
                className="w-4 h-4 text-purple-600 rounded border-slate-300 mt-0.5 focus:ring-purple-600"
              />
              <div>
                <label htmlFor="chk_bundle_lockExit" className="font-bold text-purple-950 flex items-center gap-1.5 cursor-pointer">
                  <Lock className="w-3.5 h-3.5 text-purple-600" />
                  <span>Khóa phòng Toàn màn hình đến hết giờ</span>
                </label>
                <p className="text-[11px] text-purple-900/80 mt-0.5 leading-tight">
                  Bắt buộc Toàn màn hình ẩn thanh tab Chrome/Cốc Cốc & thanh Taskbar, khóa phím Esc/phím tắt và chặn thoát phòng thi cho toàn bộ các môn trong tổ hợp.
                </p>
              </div>
            </div>

            {/* Show score after full bundle */}
            <div className="p-3 rounded-lg border border-emerald-200 bg-emerald-50/50 flex items-start gap-3">
              <input
                type="checkbox"
                id="chk_bundle_showScore"
                checked={showScoreAfterExam}
                onChange={(e) => setShowScoreAfterExam(e.target.checked)}
                className="w-4 h-4 text-emerald-600 rounded border-slate-300 mt-0.5 focus:ring-emerald-600"
              />
              <div>
                <label htmlFor="chk_bundle_showScore" className="font-bold text-emerald-950 flex items-center gap-1.5 cursor-pointer">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                  <span>Công bố điểm tổng hợp sau khi thi xong toàn bộ tổ hợp</span>
                </label>
                <p className="text-[11px] text-emerald-900/80 mt-0.5 leading-tight">
                  Nếu tắt, điểm tổ hợp và điểm từng môn sẽ được ẩn với học sinh (không lưu vào lịch sử/đánh giá của HS).
                </p>
              </div>
            </div>

            {/* Review mode */}
            <div className="p-3 rounded-lg border border-cyan-200 bg-cyan-50/50 flex items-start gap-3">
              <input
                type="checkbox"
                id="chk_bundle_onlyStudent"
                checked={showOnlyStudentAnswersAfterExam}
                onChange={(e) => setShowOnlyStudentAnswersAfterExam(e.target.checked)}
                className="w-4 h-4 text-cyan-600 rounded border-slate-300 mt-0.5 focus:ring-cyan-600"
              />
              <div>
                <label htmlFor="chk_bundle_onlyStudent" className="font-bold text-cyan-950 flex items-center gap-1.5 cursor-pointer">
                  <Eye className="w-3.5 h-3.5 text-cyan-700" />
                  <span>Sau khi thi chỉ xem câu trả lời đã làm (Ẩn đáp án)</span>
                </label>
                <p className="text-[11px] text-cyan-900/80 mt-0.5 leading-tight">
                  Thí sinh nộp xong chỉ xem lại bài đã làm, không thấy đáp án và lời giải.
                </p>
              </div>
            </div>

            {/* Min submit duration */}
            <div className="p-3 rounded-lg border border-indigo-200 bg-indigo-50/50 flex flex-col justify-between gap-1.5">
              <label className="font-bold text-indigo-950 flex items-center gap-1.5 text-xs">
                <Clock className="w-3.5 h-3.5 text-indigo-600" />
                <span>Giới hạn thời gian nộp bài sau (phút):</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  value={minSubmitMinutes}
                  onChange={(e) => setMinSubmitMinutes(Math.max(0, Number(e.target.value)))}
                  placeholder="0 = nộp bất kỳ lúc nào"
                  className="w-24 px-2.5 py-1 text-xs bg-white border border-indigo-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-600 font-bold"
                />
                <span className="text-[11px] text-indigo-900">
                  {minSubmitMinutes > 0 ? `Làm tối thiểu ${minSubmitMinutes}p mới được nộp` : 'Tự do nộp bài bất kỳ lúc nào'}
                </span>
              </div>
            </div>

            {/* Candidate access code restriction */}
            <div className="p-3 rounded-lg border border-amber-200 bg-amber-50/50 flex flex-col justify-between gap-2">
              <div className="flex items-start gap-2.5">
                <input
                  type="checkbox"
                  id="chk_bundle_requireAccess"
                  checked={requireAccessCode}
                  onChange={(e) => {
                    setRequireAccessCode(e.target.checked);
                    if (e.target.checked && !accessSecurityCode) {
                      setAccessSecurityCode(Math.floor(100000 + Math.random() * 900000).toString());
                    }
                  }}
                  className="w-4 h-4 text-amber-600 rounded border-slate-300 mt-0.5 focus:ring-amber-600"
                />
                <div>
                  <label htmlFor="chk_bundle_requireAccess" className="font-bold text-amber-950 flex items-center gap-1 cursor-pointer">
                    <Lock className="w-3.5 h-3.5 text-amber-700" />
                    <span>Chỉ thí sinh có mã cung cấp mới được làm tổ hợp</span>
                  </label>
                  <p className="text-[11px] text-amber-900/80 mt-0.5 leading-tight">
                    Thí sinh phải nhập đúng mã bảo mật tổ hợp thi mới được vào thi.
                  </p>
                </div>
              </div>

              {requireAccessCode && (
                <div className="flex items-center gap-2 pl-6">
                  <span className="text-[11px] font-semibold text-amber-950 shrink-0">Mã bảo mật cấp cho HS:</span>
                  <input
                    type="text"
                    value={accessSecurityCode}
                    onChange={(e) => setAccessSecurityCode(e.target.value)}
                    placeholder="Nhập mã bảo mật hoặc PIN..."
                    className="px-2.5 py-1 text-xs bg-white border border-amber-300 rounded font-mono font-bold text-amber-950 w-36 uppercase tracking-wider"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Mode Selector: Bắt buộc vs Tự chọn phân nhóm */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs mb-6 space-y-5">
        <div>
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide mb-1 flex items-center gap-2">
            <Settings className="w-4 h-4 text-purple-600" />
            <span>Quy chế lựa chọn môn thi của thí sinh</span>
          </h2>
          <p className="text-xs text-slate-500">
            Người ra đề có toàn quyền quyết định thí sinh phải thi toàn bộ môn hay được tự chọn theo từng nhóm
          </p>
        </div>

        {/* 2 Big Options */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button
            type="button"
            onClick={() => setSelectionMode('all_compulsory')}
            className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
              selectionMode === 'all_compulsory'
                ? 'bg-purple-50/70 border-purple-500 ring-2 ring-purple-300 shadow-xs'
                : 'bg-white border-slate-200 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-bold text-sm text-slate-900">
                1. Bắt buộc làm toàn bộ
              </span>
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center border text-xs ${
                  selectionMode === 'all_compulsory'
                    ? 'bg-purple-600 text-white border-purple-600'
                    : 'border-slate-300'
                }`}
              >
                {selectionMode === 'all_compulsory' && '✓'}
              </span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Mọi thí sinh đều phải làm tất cả các môn đã chọn theo đúng thứ tự sắp xếp định sẵn.
            </p>
          </button>

          <button
            type="button"
            onClick={() => setSelectionMode('has_electives')}
            className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
              selectionMode === 'has_electives'
                ? 'bg-purple-50/70 border-purple-500 ring-2 ring-purple-300 shadow-xs'
                : 'bg-white border-slate-200 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-bold text-sm text-slate-900">
                2. Phân chia Bắt buộc & Tự chọn theo nhóm
              </span>
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center border text-xs ${
                  selectionMode === 'has_electives'
                    ? 'bg-purple-600 text-white border-purple-600'
                    : 'border-slate-300'
                }`}
              >
                {selectionMode === 'has_electives' && '✓'}
              </span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Thí sinh thi các môn bắt buộc và được tự chọn môn trong từng nhóm (với số lượng tối thiểu do người ra đề quyết định).
            </p>
          </button>
        </div>

        {/* ----------------- SUB-VIEW A: ALL COMPULSORY MODE ----------------- */}
        {selectionMode === 'all_compulsory' && (
          <div className="pt-4 border-t border-slate-100 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                Chọn danh sách các môn thi trong tổ hợp ({selectedExamIds.length} môn):
              </span>
              <span className="text-xs text-slate-500">
                Nhấp để chọn hoặc kéo/di chuyển thứ tự
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {availableExams.filter((ex) => !isCreatorModeRestricted(ex) || isCreatorOfItem(ex, currentUser) || isMasterAdminUser(currentUser)).map((exam) => {
                const isSelected = selectedExamIds.includes(exam.id);
                return (
                  <button
                    key={exam.id}
                    type="button"
                    onClick={() => handleToggleExam(exam.id)}
                    className={`text-left p-3 rounded-lg border transition-all flex items-start gap-3 cursor-pointer ${
                      isSelected
                        ? 'bg-purple-50 border-purple-400 text-purple-950 font-medium shadow-2xs'
                        : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded flex items-center justify-center shrink-0 border mt-0.5 ${
                        isSelected
                          ? 'bg-purple-600 text-white border-purple-600'
                          : 'bg-slate-100 border-slate-300'
                      }`}
                    >
                      {isSelected && <Check className="w-3.5 h-3.5" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold truncate">{exam.title}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {exam.grade} · {exam.durationMinutes}p · {exam.questions.length} câu
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Sequence arranger */}
            {selectedExamIds.length > 0 && (
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2 mt-4">
                <div className="text-xs font-bold text-slate-800">
                  Thứ tự ca thi liên tiếp (kèm thời gian nghỉ):
                </div>
                {selectedExamIds.map((id, idx) => {
                  const exam = availableExams.find((e) => e.id === id);
                  if (!exam) return null;
                  return (
                    <div
                      key={id}
                      className="flex items-center justify-between p-2.5 bg-white border border-slate-200 rounded-lg text-xs"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className="w-6 h-6 rounded-md bg-purple-100 text-purple-800 font-bold flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        <span className="font-semibold text-slate-900 truncate">
                          {exam.title}
                        </span>
                        <span className="text-slate-400 font-mono">({exam.durationMinutes}p)</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0 ml-2">
                        <button
                          type="button"
                          onClick={() => handleMove(idx, 'up')}
                          disabled={idx === 0}
                          className="p-1 hover:bg-slate-100 rounded text-slate-500 disabled:opacity-30 cursor-pointer"
                          title="Lên trước"
                        >
                          <MoveUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMove(idx, 'down')}
                          disabled={idx === selectedExamIds.length - 1}
                          className="p-1 hover:bg-slate-100 rounded text-slate-500 disabled:opacity-30 cursor-pointer"
                          title="Xuống sau"
                        >
                          <MoveDown className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ----------------- SUB-VIEW B: ELECTIVE GROUPS MODE ----------------- */}
        {selectionMode === 'has_electives' && (
          <div className="pt-4 border-t border-slate-100 space-y-6">
            {/* Step 1: Compulsory subjects */}
            <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/40 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-blue-950 uppercase tracking-wide">
                    1. Các môn Bắt buộc chung (Mọi thí sinh bắt buộc phải thi)
                  </h3>
                  <p className="text-[11px] text-blue-800/80 mt-0.5">
                    Có thể chọn 0, 1 hoặc nhiều môn. Nếu không có thì để trống.
                  </p>
                </div>
                <span className="text-xs font-mono font-bold text-blue-700 bg-white px-2 py-0.5 rounded border border-blue-200">
                  Đã chọn {compulsoryExamIds.length} môn
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {availableExams.filter((ex) => !isCreatorModeRestricted(ex) || isCreatorOfItem(ex, currentUser) || isMasterAdminUser(currentUser)).map((exam) => {
                  const isChecked = compulsoryExamIds.includes(exam.id);
                  return (
                    <button
                      key={exam.id}
                      type="button"
                      onClick={() => handleToggleCompulsoryExam(exam.id)}
                      className={`text-left p-2.5 rounded-lg border text-xs flex items-center gap-2.5 cursor-pointer ${
                        isChecked
                          ? 'bg-blue-600 text-white border-blue-600 font-semibold shadow-2xs'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div
                        className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border ${
                          isChecked ? 'bg-white text-blue-600 border-white' : 'border-slate-300'
                        }`}
                      >
                        {isChecked && <Check className="w-3 h-3" />}
                      </div>
                      <span className="truncate">{exam.title}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Step 2: Elective Groups Builder */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-purple-950 uppercase tracking-wide">
                    2. Thiết lập các Nhóm môn Tự chọn (Người ra đề quy định số môn tối thiểu)
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Thiết lập số lượng môn học tối thiểu cần chọn cho từng nhóm.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleAddElectiveGroup}
                  className="px-3 py-1.5 text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Thêm nhóm tự chọn</span>
                </button>
              </div>

              {/* Loop Groups */}
              <div className="space-y-4">
                {electiveGroups.map((group, gIdx) => (
                  <div
                    key={group.id}
                    className="p-5 rounded-xl border border-purple-200 bg-purple-50/20 space-y-4 shadow-2xs"
                  >
                    <div className="flex items-center justify-between gap-3 pb-3 border-b border-purple-100">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="w-7 h-7 rounded-lg bg-purple-700 text-white font-bold text-xs flex items-center justify-center shrink-0">
                          {gIdx + 1}
                        </span>
                        <input
                          type="text"
                          value={group.name}
                          onChange={(e) => handleUpdateGroup(group.id, 'name', e.target.value)}
                          placeholder={`Nhập tên nhóm ${gIdx + 1}...`}
                          className="font-bold text-sm text-slate-900 bg-white border border-purple-200 px-3 py-1.5 rounded-lg w-full max-w-sm focus:outline-none focus:ring-1 focus:ring-purple-600"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveElectiveGroup(group.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                        title="Xóa nhóm này"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Min Select Count Configuration (QUAN TRỌNG: Người ra đề quyết định) */}
                    <div className="flex flex-wrap items-center gap-3 bg-white p-3 rounded-lg border border-purple-100 text-xs">
                      <label className="font-bold text-slate-800">
                        Yêu cầu thí sinh nếu chọn nhóm này phải chọn ít nhất:
                      </label>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min="1"
                          max={Math.max(1, group.examIds.length)}
                          value={group.minSelectCount}
                          onChange={(e) =>
                            handleUpdateGroup(
                              group.id,
                              'minSelectCount',
                              Math.max(1, parseInt(e.target.value) || 1)
                            )
                          }
                          className="w-16 px-2.5 py-1 text-center font-bold text-purple-700 bg-purple-50 border border-purple-300 rounded focus:outline-none font-mono"
                        />
                        <span className="font-semibold text-slate-700">môn</span>
                      </div>
                      <span className="text-[11px] text-slate-400">
                        (Hiện nhóm có {group.examIds.length} môn khả dụng)
                      </span>
                    </div>

                    {/* Select Exams inside this group */}
                    <div className="space-y-2">
                      <div className="text-xs font-semibold text-slate-700">
                        Chọn các đề thi thuộc {group.name}:
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {availableExams.filter((ex) => !isCreatorModeRestricted(ex) || isCreatorOfItem(ex, currentUser) || isMasterAdminUser(currentUser)).map((exam) => {
                          const isInGroup = group.examIds.includes(exam.id);
                          return (
                            <button
                              key={exam.id}
                              type="button"
                              onClick={() => handleToggleExamInGroup(group.id, exam.id)}
                              className={`text-left p-2.5 rounded-lg border text-xs flex items-center gap-2.5 cursor-pointer ${
                                isInGroup
                                  ? 'bg-purple-100/70 border-purple-400 text-purple-950 font-semibold'
                                  : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                              }`}
                            >
                              <div
                                className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border ${
                                  isInGroup
                                    ? 'bg-purple-700 text-white border-purple-700'
                                    : 'border-slate-300'
                                }`}
                              >
                                {isInGroup && <Check className="w-3 h-3" />}
                              </div>
                              <span className="truncate">{exam.title}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Step 3: Group Selection Limits & Countdown Timer */}
            <div className="p-5 rounded-xl border border-amber-300 bg-amber-50/40 space-y-4 shadow-2xs">
              <div>
                <h3 className="text-xs font-bold text-amber-950 uppercase tracking-wide flex items-center gap-1.5">
                  <Timer className="w-4 h-4 text-amber-700" />
                  <span>3. Quy chế chọn số lượng nhóm & Giới hạn thời gian (Đếm ngược)</span>
                </h3>
                <p className="text-[11px] text-amber-900/80 mt-0.5">
                  Quy định thí sinh phải chọn từ bao nhiêu đến bao nhiêu nhóm, và thời gian tối đa để đưa ra lựa chọn trước khi hệ thống tự động bốc thăm ngẫu nhiên.
                </p>
              </div>

              {/* Group Limits: Min & Max */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-white p-4 rounded-xl border border-amber-200">
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    Số nhóm tự chọn TỐI THIỂU phải chọn:
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      max={electiveGroups.length}
                      value={minGroupsToSelect}
                      onChange={(e) => {
                        const val = Math.max(1, Math.min(electiveGroups.length, parseInt(e.target.value) || 1));
                        setMinGroupsToSelect(val);
                        if (val > maxGroupsToSelect) {
                          setMaxGroupsToSelect(val);
                        }
                      }}
                      className="w-24 px-3 py-1.5 font-bold font-mono text-center text-sm text-purple-700 bg-purple-50 border border-purple-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600"
                    />
                    <span className="text-xs font-medium text-slate-600">/ {electiveGroups.length} nhóm</span>
                  </div>
                  <span className="text-[11px] text-slate-400 block mt-1">
                    Thí sinh bắt buộc phải tham gia ít nhất số nhóm này.
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    Số nhóm tự chọn TỐI ĐA được chọn:
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={minGroupsToSelect}
                      max={electiveGroups.length}
                      value={maxGroupsToSelect}
                      onChange={(e) => {
                        const val = Math.max(minGroupsToSelect, Math.min(electiveGroups.length, parseInt(e.target.value) || minGroupsToSelect));
                        setMaxGroupsToSelect(val);
                      }}
                      className="w-24 px-3 py-1.5 font-bold font-mono text-center text-sm text-purple-700 bg-purple-50 border border-purple-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600"
                    />
                    <span className="text-xs font-medium text-slate-600">/ {electiveGroups.length} nhóm</span>
                  </div>
                  <span className="text-[11px] text-slate-400 block mt-1">
                    Thí sinh không được chọn vượt quá số nhóm này.
                  </span>
                </div>
              </div>

              {/* Countdown Time Limit */}
              <div className="bg-white p-4 rounded-xl border border-amber-200 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-amber-600" />
                    <span>Thời gian giới hạn chọn môn thi các nhóm (Giây):</span>
                  </label>
                  {/* Preset quick buttons */}
                  <div className="flex items-center gap-1 flex-wrap">
                    {[
                      { label: '0s (Vô hạn)', value: 0 },
                      { label: '30s', value: 30 },
                      { label: '60s', value: 60 },
                      { label: '90s', value: 90 },
                      { label: '120s', value: 120 },
                    ].map((btn) => (
                      <button
                        key={btn.value}
                        type="button"
                        onClick={() => setSelectionTimeLimitSeconds(btn.value)}
                        className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors cursor-pointer ${
                          selectionTimeLimitSeconds === btn.value
                            ? 'bg-amber-600 text-white shadow-2xs'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        {btn.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min="0"
                    max="600"
                    step="5"
                    value={selectionTimeLimitSeconds}
                    onChange={(e) => setSelectionTimeLimitSeconds(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-32 px-3 py-2 font-mono font-bold text-sm text-center bg-amber-50 text-amber-900 border border-amber-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-600"
                  />
                  <div className="text-xs text-slate-600">
                    {selectionTimeLimitSeconds === 0 ? (
                      <span className="text-slate-500 font-medium">Không giới hạn thời gian (thí sinh tự bấm hoàn tất khi chọn xong).</span>
                    ) : (
                      <span className="font-semibold text-amber-800">
                        {selectionTimeLimitSeconds} giây ({Math.floor(selectionTimeLimitSeconds / 60)} phút {selectionTimeLimitSeconds % 60} giây)
                      </span>
                    )}
                  </div>
                </div>

                {/* Auto Random Warning Note */}
                <div className="p-3 bg-amber-100/60 rounded-lg border border-amber-300/80 text-[11px] text-amber-950 flex items-start gap-2">
                  <Shuffle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <div className="leading-relaxed">
                    <strong>Cơ chế tự động bốc thăm ngẫu nhiên:</strong> Nếu thí sinh không kịp chọn trong thời gian đếm ngược, hệ thống sẽ <strong>tự động chọn ngẫu nhiên</strong> số nhóm thỏa mãn [Tối thiểu: {minGroupsToSelect}, Tối đa: {maxGroupsToSelect}] và các tổ hợp môn bất kỳ đủ chỉ tiêu quy định rồi lập tức chuyển vào phòng thi!
                  </div>
                </div>
              </div>
            </div>

            {/* Step 4: Bundle Timing Mode Configuration */}
            <div className="p-5 rounded-xl border border-indigo-200 bg-indigo-50/40 space-y-4 shadow-2xs">
              <div>
                <h3 className="text-xs font-bold text-indigo-950 uppercase tracking-wide flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-indigo-700" />
                  <span>4. Quy chế tính giờ làm bài (Môn bắt buộc & Cụm tự chọn)</span>
                </h3>
                <p className="text-[11px] text-indigo-900/80 mt-0.5">
                  Quy định cách tính thời gian cho môn bắt buộc và tổ hợp môn tự chọn theo yêu cầu thi cử.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* Option 1: Compulsory sequential, Elective cluster max duration */}
                <div
                  onClick={() => setTimingMode('compulsory_seq_elective_cluster_max')}
                  className={`p-4 rounded-xl border-2 transition-all cursor-pointer ${
                    timingMode === 'compulsory_seq_elective_cluster_max'
                      ? 'bg-white border-purple-600 ring-2 ring-purple-200 shadow-xs'
                      : 'bg-white/80 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-xs sm:text-sm text-purple-950 flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-purple-600 shrink-0" />
                      <span>Môn bắt buộc nối tiếp · Cụm tự chọn làm chung (Max 1 môn)</span>
                    </span>
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs shrink-0 ${
                      timingMode === 'compulsory_seq_elective_cluster_max' ? 'bg-purple-600 text-white font-bold' : 'border border-slate-300'
                    }`}>
                      {timingMode === 'compulsory_seq_elective_cluster_max' && '✓'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    Với các <strong>môn bắt buộc</strong> thì cứ <strong>nối tiếp</strong> thi theo giờ từng môn. Còn với <strong>tổ hợp môn tự chọn</strong> thì thời gian làm cụm đó bằng <strong>thời gian lớn nhất của một môn</strong> trong cụm. Thí sinh được linh hoạt chuyển đổi giữa các môn tự chọn trong thời gian đó.
                  </p>
                  <div className="mt-2.5 text-[10px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded inline-flex items-center gap-1 border border-purple-200">
                    <CheckCircle2 className="w-3 h-3 text-purple-600" />
                    <span>Chế độ chuẩn TN THPT & Khảo sát năng lực</span>
                  </div>
                </div>

                {/* Option 2: Sequential independent */}
                <div
                  onClick={() => setTimingMode('all_sequential_independent')}
                  className={`p-4 rounded-xl border-2 transition-all cursor-pointer ${
                    timingMode === 'all_sequential_independent'
                      ? 'bg-white border-slate-800 ring-2 ring-slate-200 shadow-xs'
                      : 'bg-white/80 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-xs sm:text-sm text-slate-900">
                      Tất cả các môn tính giờ riêng lẻ, thi nối tiếp
                    </span>
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs shrink-0 ${
                      timingMode === 'all_sequential_independent' ? 'bg-slate-900 text-white font-bold' : 'border border-slate-300'
                    }`}>
                      {timingMode === 'all_sequential_independent' && '✓'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    Mỗi môn thi (cả bắt buộc lẫn tự chọn) đều được thi riêng biệt, tính giờ độc lập theo thời lượng của môn đó và nối tiếp nhau với thời gian nghỉ giải lao ở giữa.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step: Random Question Count Per Subject (Cài đặt số câu bốc ngẫu nhiên cho từng môn) */}
        {((selectionMode === 'all_compulsory' && selectedExamIds.length > 0) ||
          (selectionMode === 'has_electives' && (compulsoryExamIds.length > 0 || electiveGroups.some((g) => g.examIds.length > 0)))) && (
          <div className="pt-6 border-t border-slate-200 space-y-4">
            <div className="flex items-center gap-2">
              <Shuffle className="w-4 h-4 text-purple-600" />
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                Cài đặt số câu chọn ngẫu nhiên trong mỗi môn thi (Ngân hàng đề)
              </h3>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Bạn có thể ra trước ngân hàng câu hỏi đầy đủ cho từng môn, sau đó chỉ định số câu máy sẽ bốc ngẫu nhiên cho thí sinh làm. Để 0 nếu muốn thí sinh thi toàn bộ ngân hàng câu hỏi của môn đó.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {Array.from(
                new Set(
                  selectionMode === 'all_compulsory'
                    ? selectedExamIds
                    : [...compulsoryExamIds, ...electiveGroups.flatMap((g) => g.examIds)]
                )
              ).map((examId) => {
                const ex = availableExams.find((e) => e.id === examId);
                if (!ex) return null;
                const currentRandomCount = randomQuestionCountPerExam[examId] ?? 0;

                return (
                  <div
                    key={examId}
                    className="p-3 bg-white border border-slate-200 rounded-xl flex items-center justify-between gap-3 shadow-2xs"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-slate-900 truncate">{ex.title}</div>
                      <div className="text-[11px] text-slate-500">
                        Ngân hàng hiện có: <strong className="text-slate-800">{ex.questions.length} câu</strong>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <label className="text-[11px] font-semibold text-purple-900">Bốc:</label>
                      <input
                        type="number"
                        min="0"
                        max={ex.questions.length}
                        value={currentRandomCount}
                        onChange={(e) =>
                          handleSetRandomQuestionCount(examId, parseInt(e.target.value) || 0)
                        }
                        className="w-16 px-2 py-1 text-center font-bold font-mono text-xs text-purple-700 bg-purple-50 border border-purple-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-600"
                      />
                      <span className="text-[11px] text-slate-500">câu</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Sticky Action Bar */}
      <div className="sticky bottom-4 z-30 mt-8 p-4 bg-white/95 backdrop-blur-md rounded-2xl border border-slate-300 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => handleSaveBundle(true)}
            className="py-2.5 px-4 text-xs sm:text-sm font-semibold text-purple-950 bg-purple-200 hover:bg-purple-300 rounded-xl transition-all flex items-center gap-2 shadow-xs cursor-pointer"
          >
            <Save className="w-4 h-4 text-purple-800" />
            <span>Lưu tổ hợp tại đây (Không thoát tab)</span>
          </button>

          {inPlaceSaveToast && (
            <span className="text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg animate-in fade-in">
              {inPlaceSaveToast}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="py-2.5 px-4 text-xs sm:text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
          >
            Hủy & Quay lại
          </button>
          <button
            type="button"
            onClick={() => handleSaveBundle(false)}
            className="py-2.5 px-5 text-xs sm:text-sm font-bold text-white bg-purple-700 hover:bg-purple-800 rounded-xl transition-colors flex items-center gap-2 shadow-md cursor-pointer"
          >
            <CheckCircle2 className="w-4 h-4 text-purple-200" />
            <span>{isEditing ? 'Lưu thay đổi tổ hợp' : 'Lưu & Xuất bản tổ hợp'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
