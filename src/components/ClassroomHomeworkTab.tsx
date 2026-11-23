import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Edit3,
  Eye,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  Lock,
  Paperclip,
  Plus,
  RefreshCw,
  RotateCw,
  Send,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react';
import {
  Classroom,
  ClassroomHomework,
  HomeworkAttachment,
  HomeworkSubmission,
  UserAccount,
} from '../types/exam';
import {
  deleteClassroomHomework,
  deleteHomeworkSubmission,
  formatVietnameseDateTime,
  getHomeworkSubmissionsByHomework,
  getHomeworksByClass,
  getStudentSubmissionForHomework,
  gradeHomeworkSubmission,
  isItemScheduleOpen,
  saveClassroomHomework,
  saveHomeworkSubmission,
} from '../utils/storage';
import { processImageFile } from '../utils/imageUpload';
import { MathToolbar } from './MathToolbar';
import { RichContentRenderer } from './RichContentRenderer';
import { ConfirmModal } from './ConfirmModal';
import { CopyContentButton } from './CopyContentButton';
import type { UnsavedNavigationGuard } from './UnsavedChangesModal';

interface ClassroomHomeworkTabProps {
  classroom: Classroom;
  currentUser: UserAccount | null;
  isTeacher: boolean;
  onToast: (msg: string) => void;
  onRegisterUnsavedGuard?: (guard: UnsavedNavigationGuard | null) => void;
}

const ACCEPTED_FILE_EXTENSIONS = '.pdf,.ppt,.pptx,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp';
const MAX_DOC_FILE_BYTES = 4.5 * 1024 * 1024;
const MAX_HOMEWORK_IMAGES = 10;

function formatFileSize(bytes: number): string {
  if (!bytes || bytes < 1024) return `${bytes || 0} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function getFileExtensionLabel(name: string): string {
  const parts = name.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toUpperCase() : 'FILE';
}

function isImageFile(file: File): boolean {
  if (file.type.startsWith('image/')) return true;
  return /\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name);
}

function isAllowedHomeworkFile(file: File): boolean {
  if (isImageFile(file)) return true;
  return /\.(pdf|ppt|pptx|doc|docx|xls|xlsx)$/i.test(file.name);
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error(`Không thể đọc tệp "${file.name}"`));
    reader.readAsDataURL(file);
  });
}

export const ClassroomHomeworkTab: React.FC<ClassroomHomeworkTabProps> = ({
  classroom,
  currentUser,
  isTeacher,
  onToast,
  onRegisterUnsavedGuard,
}) => {
  const currentUserId = currentUser?.id || 'guest_user';
  const [homeworks, setHomeworks] = useState<ClassroomHomework[]>(() =>
    getHomeworksByClass(classroom.id)
  );
  const [selectedHomeworkId, setSelectedHomeworkId] = useState<string>(() => {
    const list = getHomeworksByClass(classroom.id);
    return list[0]?.id || '';
  });

  // Refresh homeworks when switching class
  useEffect(() => {
    const list = getHomeworksByClass(classroom.id);
    setHomeworks(list);
    setSelectedHomeworkId((prev) => (list.some((h) => h.id === prev) ? prev : list[0]?.id || ''));
  }, [classroom.id]);

  // Live schedule tick every 30s
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNowTick(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  const selectedHomework = useMemo(
    () => homeworks.find((h) => h.id === selectedHomeworkId) || homeworks[0] || null,
    [homeworks, selectedHomeworkId]
  );

  // Teacher Assignment Modal state
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingHwId, setEditingHwId] = useState<string | null>(null);
  const [hwTitle, setHwTitle] = useState('');
  const [hwInstructions, setHwInstructions] = useState('');
  const [hwOpenTime, setHwOpenTime] = useState('');
  const [hwCloseTime, setHwCloseTime] = useState('');
  const [hwMaxScore, setHwMaxScore] = useState<number>(10);
  const [hwAttachments, setHwAttachments] = useState<HomeworkAttachment[]>([]);
  const [editorError, setEditorError] = useState<string | null>(null);
  const teacherInstrRef = useRef<HTMLTextAreaElement>(null);

  // Student Submission state
  const [mySubmission, setMySubmission] = useState<HomeworkSubmission | undefined>(undefined);
  const [draftTextAnswer, setDraftTextAnswer] = useState('');
  const [draftNote, setDraftNote] = useState('');
  const [draftImages, setDraftImages] = useState<string[]>([]);
  const [draftAttachments, setDraftAttachments] = useState<HomeworkAttachment[]>([]);
  const [isProcessingUpload, setIsProcessingUpload] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showEssayPreview, setShowEssayPreview] = useState(true);
  const studentEssayRef = useRef<HTMLTextAreaElement>(null);

  // Teacher submissions view & grading drafts
  const [hwSubmissions, setHwSubmissions] = useState<HomeworkSubmission[]>([]);
  const [gradeDrafts, setGradeDrafts] = useState<
    Record<string, { score: string; feedback: string }>
  >({});

  // Lightbox / PDF preview / Camera modals
  const [lightboxState, setLightboxState] = useState<{
    images: string[];
    index: number;
    title: string;
    rotation: number;
  } | null>(null);
  const [previewPdfAttachment, setPreviewPdfAttachment] = useState<HomeworkAttachment | null>(null);

  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraFacingMode, setCameraFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const getStudentDraftKey = (hwId: string) =>
    `edutest_hw_draft_${classroom.id}_${hwId}_${currentUserId}`;
  const teacherEditorDraftKey = `edutest_hw_teacher_draft_${classroom.id}`;
  const lastLoadedStudentHwKeyRef = useRef<string>('');
  const restoredTeacherDraftRef = useRef<boolean>(false);

  // Sync student submission whenever classroom, selected homework, or user changes (KHÔNG reset khi đổi chế độ isTeacher)
  useEffect(() => {
    const hwId = selectedHomework?.id || '';
    const loadKey = `${classroom.id}::${hwId}::${currentUserId}`;
    if (!hwId) {
      lastLoadedStudentHwKeyRef.current = '';
      setMySubmission(undefined);
      return;
    }
    if (lastLoadedStudentHwKeyRef.current === loadKey) return;
    lastLoadedStudentHwKeyRef.current = loadKey;

    const sub = getStudentSubmissionForHomework(hwId, currentUserId);
    setMySubmission(sub);

    let restoredDraft: { textAnswer?: string; note?: string } | null = null;
    try {
      const raw = sessionStorage.getItem(getStudentDraftKey(hwId));
      if (raw) {
        restoredDraft = JSON.parse(raw);
      }
    } catch {
      // ignore storage errors
    }

    setDraftTextAnswer(
      restoredDraft && typeof restoredDraft.textAnswer === 'string'
        ? restoredDraft.textAnswer
        : sub?.textAnswer || ''
    );
    setDraftNote(
      restoredDraft && typeof restoredDraft.note === 'string'
        ? restoredDraft.note
        : sub?.note || ''
    );
    setDraftImages(sub?.imageUrls || []);
    setDraftAttachments(sub?.attachments || []);
    setUploadError(null);
  }, [classroom.id, selectedHomework?.id, currentUserId]);

  // Bảo toàn bản nháp bài tự luận của học sinh khi chuyển tab trong lớp hoặc đổi chế độ
  useEffect(() => {
    const hwId = selectedHomework?.id || '';
    if (!hwId) return;
    const timer = setTimeout(() => {
      try {
        const baselineText = mySubmission?.textAnswer || '';
        const baselineNote = mySubmission?.note || '';
        if (draftTextAnswer === baselineText && draftNote === baselineNote) {
          sessionStorage.removeItem(getStudentDraftKey(hwId));
          return;
        }
        sessionStorage.setItem(
          getStudentDraftKey(hwId),
          JSON.stringify({ textAnswer: draftTextAnswer, note: draftNote })
        );
      } catch {
        // ignore quota errors
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [classroom.id, selectedHomework?.id, currentUserId, draftTextAnswer, draftNote, mySubmission]);

  // Khôi phục bản nháp giao bài tập của giáo viên nếu quay lại tab Bài tập
  useEffect(() => {
    if (!isTeacher || restoredTeacherDraftRef.current || isEditorOpen) return;
    restoredTeacherDraftRef.current = true;
    try {
      const raw = sessionStorage.getItem(teacherEditorDraftKey);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (!d || typeof d !== 'object') return;
      setEditingHwId(d.editingHwId ?? null);
      setHwTitle(d.hwTitle || '');
      setHwInstructions(d.hwInstructions || '');
      setHwOpenTime(d.hwOpenTime || '');
      setHwCloseTime(d.hwCloseTime || '');
      setHwMaxScore(typeof d.hwMaxScore === 'number' ? d.hwMaxScore : 10);
      if (Array.isArray(d.hwAttachments)) setHwAttachments(d.hwAttachments);
      setIsEditorOpen(true);
    } catch {
      // ignore parse errors
    }
  }, [isTeacher, teacherEditorDraftKey, isEditorOpen]);

  // Tự động lưu nháp modal giao/sửa BTVN của giáo viên
  useEffect(() => {
    if (!isEditorOpen) return;
    const timer = setTimeout(() => {
      try {
        const hasDraft = Boolean(
          editingHwId || hwTitle.trim() || hwInstructions.trim() || hwAttachments.length > 0
        );
        if (!hasDraft) {
          sessionStorage.removeItem(teacherEditorDraftKey);
          return;
        }
        sessionStorage.setItem(
          teacherEditorDraftKey,
          JSON.stringify({
            editingHwId,
            hwTitle,
            hwInstructions,
            hwOpenTime,
            hwCloseTime,
            hwMaxScore,
            hwAttachments,
          })
        );
      } catch {
        // ignore quota errors
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [
    isEditorOpen,
    teacherEditorDraftKey,
    editingHwId,
    hwTitle,
    hwInstructions,
    hwOpenTime,
    hwCloseTime,
    hwMaxScore,
    hwAttachments,
  ]);

  // Sync teacher submissions view when teacher opens/updates homework
  const reloadSubmissionsForSelected = (hwId: string) => {
    if (!hwId) {
      setHwSubmissions([]);
      return;
    }
    const sub = getStudentSubmissionForHomework(hwId, currentUserId);
    setMySubmission(sub);

    if (isTeacher) {
      const subs = getHomeworkSubmissionsByHomework(hwId);
      setHwSubmissions(subs);
      const nextDrafts: Record<string, { score: string; feedback: string }> = {};
      subs.forEach((s) => {
        nextDrafts[s.id] = {
          score: s.score !== undefined ? String(s.score) : '',
          feedback: s.teacherFeedback || '',
        };
      });
      setGradeDrafts(nextDrafts);
    }
  };

  useEffect(() => {
    if (!isTeacher || !selectedHomework?.id) {
      setHwSubmissions([]);
      return;
    }
    const subs = getHomeworkSubmissionsByHomework(selectedHomework.id);
    setHwSubmissions(subs);
    const nextDrafts: Record<string, { score: string; feedback: string }> = {};
    subs.forEach((s) => {
      nextDrafts[s.id] = {
        score: s.score !== undefined ? String(s.score) : '',
        feedback: s.teacherFeedback || '',
      };
    });
    setGradeDrafts(nextDrafts);
  }, [selectedHomework?.id, isTeacher]);

  // Live Camera lifecycle
  const stopCameraStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  useEffect(() => {
    if (!isCameraOpen) {
      stopCameraStream();
      return;
    }
    let cancelled = false;
    const startCam = async () => {
      setCameraError(null);
      stopCameraStream();
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setCameraError('Trình duyệt không hỗ trợ bật camera trực tiếp. Vui lòng dùng nút Chọn tệp ảnh.');
          return;
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: cameraFacingMode },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch {
        setCameraError('Không thể truy cập camera (chưa cấp quyền hoặc không có thiết bị camera).');
      }
    };
    void startCam();
    return () => {
      cancelled = true;
      stopCameraStream();
    };
  }, [isCameraOpen, cameraFacingMode]);

  const handleCapturePhotoFromCamera = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;
    if (draftImages.length >= MAX_HOMEWORK_IMAGES) {
      setUploadError(`Tối đa ${MAX_HOMEWORK_IMAGES} ảnh cho mỗi bài nộp.`);
      setIsCameraOpen(false);
      return;
    }
    try {
      const canvas = document.createElement('canvas');
      const maxDim = 1280;
      let w = video.videoWidth;
      let h = video.videoHeight;
      if (w > maxDim || h > maxDim) {
        if (w >= h) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        } else {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }
      }
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, w, h);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      setDraftImages((prev) => [...prev, dataUrl]);
      setIsCameraOpen(false);
      onToast('✓ Đã chụp ảnh bài làm!');
    } catch {
      setCameraError('Không thể chụp ảnh từ camera.');
    }
  };

  // Teacher: Open Create / Edit modal
  const openCreateModal = () => {
    setEditingHwId(null);
    setHwTitle('');
    setHwInstructions('');
    setHwOpenTime('');
    setHwCloseTime('');
    setHwMaxScore(10);
    setHwAttachments([]);
    setEditorError(null);
    setIsEditorOpen(true);
  };

  const openEditModal = (hw: ClassroomHomework) => {
    setEditingHwId(hw.id);
    setHwTitle(hw.title);
    setHwInstructions(hw.instructions || '');
    setHwOpenTime(hw.openTime || '');
    setHwCloseTime(hw.closeTime || '');
    setHwMaxScore(hw.maxScore || 10);
    setHwAttachments(hw.attachments ? [...hw.attachments] : []);
    setEditorError(null);
    setIsEditorOpen(true);
  };

  const handleTeacherUploadAttachment = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setEditorError(null);
    const added: HomeworkAttachment[] = [];
    for (const file of Array.from(files)) {
      if (!isAllowedHomeworkFile(file)) {
        setEditorError(`Định dạng "${file.name}" không được hỗ trợ. Hỗ trợ: PDF, PPT, DOC, XLSX, PNG, JPG.`);
        continue;
      }
      if (file.size > MAX_DOC_FILE_BYTES && !isImageFile(file)) {
        setEditorError(`Tệp "${file.name}" vượt quá 4.5MB.`);
        continue;
      }
      try {
        const dataUrl = isImageFile(file)
          ? await processImageFile(file)
          : await readFileAsDataUrl(file);
        added.push({
          id: 'att_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
          name: file.name,
          mimeType: file.type || 'application/octet-stream',
          sizeBytes: file.size,
          dataUrl,
        });
      } catch (err: any) {
        setEditorError(err?.message || `Lỗi đọc tệp "${file.name}"`);
      }
    }
    if (added.length > 0) {
      setHwAttachments((prev) => [...prev, ...added]);
    }
  };

  const handleSaveHomework = (): boolean => {
    if (!hwTitle.trim()) {
      setEditorError('Vui lòng nhập tiêu đề bài tập về nhà.');
      return false;
    }
    const hwId = editingHwId || 'hw_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5);
    const saved = saveClassroomHomework({
      id: hwId,
      classId: classroom.id,
      title: hwTitle.trim(),
      instructions: hwInstructions.trim() || undefined,
      attachments: hwAttachments.length > 0 ? hwAttachments : undefined,
      openTime: hwOpenTime || undefined,
      closeTime: hwCloseTime || undefined,
      maxScore: hwMaxScore > 0 ? Number(hwMaxScore) : 10,
      createdBy: currentUser?.fullName || currentUser?.email || 'Giáo viên',
      createdAt: new Date().toISOString(),
    });
    try {
      sessionStorage.removeItem(teacherEditorDraftKey);
    } catch {
      // ignore storage errors
    }
    const nextList = getHomeworksByClass(classroom.id);
    setHomeworks(nextList);
    setSelectedHomeworkId(saved.id);
    setIsEditorOpen(false);
    onToast(editingHwId ? '✓ Đã cập nhật bài tập về nhà!' : '✓ Đã giao bài tập về nhà mới cho lớp!');
    return true;
  };

  const handleCloseTeacherEditorExplicitly = () => {
    try {
      sessionStorage.removeItem(teacherEditorDraftKey);
    } catch {
      // ignore storage errors
    }
    setIsEditorOpen(false);
  };

  const hwGuardRef = useRef<{ isDirty: () => boolean; saveAndExit: () => boolean }>({
    isDirty: () => false,
    saveAndExit: () => true,
  });
  hwGuardRef.current = {
    isDirty: () =>
      Boolean(
        isEditorOpen &&
          (editingHwId || hwTitle.trim() || hwInstructions.trim() || hwAttachments.length > 0)
      ),
    saveAndExit: () => handleSaveHomework(),
  };

  useEffect(() => {
    if (!onRegisterUnsavedGuard) return;
    onRegisterUnsavedGuard({
      title: 'Bài tập về nhà đang soạn chưa được lưu',
      message:
        'Bạn đang soạn bài tập về nhà trong lớp học. Bạn có muốn lưu lại dữ liệu trước khi thoát không?',
      isDirty: () => hwGuardRef.current.isDirty(),
      saveAndExit: () => hwGuardRef.current.saveAndExit(),
      discardChanges: () => {
        try {
          sessionStorage.removeItem(teacherEditorDraftKey);
        } catch {
          // ignore
        }
      },
    });
    return () => {
      onRegisterUnsavedGuard(null);
    };
  }, [onRegisterUnsavedGuard, teacherEditorDraftKey]);

  const handleDeleteHomework = (hw: ClassroomHomework) => {
    setConfirmState({
      isOpen: true,
      title: 'Xóa bài tập về nhà',
      message: `Bạn có chắc muốn xóa bài tập "${hw.title}" khỏi lớp học?`,
      onConfirm: () => {
        deleteClassroomHomework(hw.id);
        const nextList = getHomeworksByClass(classroom.id);
        setHomeworks(nextList);
        setSelectedHomeworkId(nextList[0]?.id || '');
        onToast(`✓ Đã xóa bài tập "${hw.title}".`);
      },
    });
  };

  // Student file/image upload
  const handleStudentUploadFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadError(null);
    setIsProcessingUpload(true);
    try {
      const nextImages: string[] = [];
      const nextDocs: HomeworkAttachment[] = [];

      for (const file of Array.from(files)) {
        if (!isAllowedHomeworkFile(file)) {
          setUploadError(
            `Tệp "${file.name}" không đúng định dạng. Hệ thống hỗ trợ: PDF, PPT, PPTX, DOC, DOCX, XLS, XLSX, PNG, JPG.`
          );
          continue;
        }

        if (isImageFile(file)) {
          if (draftImages.length + nextImages.length >= MAX_HOMEWORK_IMAGES) {
            setUploadError(`Tối đa ${MAX_HOMEWORK_IMAGES} ảnh bài làm.`);
            continue;
          }
          const compressed = await processImageFile(file);
          nextImages.push(compressed);
        } else {
          if (file.size > MAX_DOC_FILE_BYTES) {
            setUploadError(`Tệp "${file.name}" quá lớn (${formatFileSize(file.size)}). Giới hạn 4.5 MB/tệp.`);
            continue;
          }
          const dataUrl = await readFileAsDataUrl(file);
          nextDocs.push({
            id: 'subatt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            name: file.name,
            mimeType: file.type || 'application/octet-stream',
            sizeBytes: file.size,
            dataUrl,
          });
        }
      }

      if (nextImages.length > 0) setDraftImages((prev) => [...prev, ...nextImages]);
      if (nextDocs.length > 0) setDraftAttachments((prev) => [...prev, ...nextDocs]);
    } catch (err: any) {
      setUploadError(err?.message || 'Không thể xử lý tệp tải lên.');
    } finally {
      setIsProcessingUpload(false);
    }
  };

  const handleSubmitStudentHomework = () => {
    if (!selectedHomework) return;
    const sched = isItemScheduleOpen(
      { openTime: selectedHomework.openTime, closeTime: selectedHomework.closeTime, status: 'open' },
      'homework'
    );
    if (!sched.isOpen) {
      setUploadError(sched.reason || 'Hiện không trong thời gian cho phép nộp bài.');
      return;
    }

    const hasContent =
      draftTextAnswer.trim().length > 0 ||
      draftImages.length > 0 ||
      draftAttachments.length > 0;

    if (!hasContent) {
      setUploadError('Vui lòng soạn bài làm online, tải tệp (PDF/PPT/DOC/XLSX) hoặc chụp/chọn ít nhất 1 ảnh trước khi nộp.');
      return;
    }

    const maxScore = selectedHomework.maxScore && selectedHomework.maxScore > 0 ? selectedHomework.maxScore : 10;
    const saved = saveHomeworkSubmission({
      id: mySubmission?.id || `hwsub_${selectedHomework.id}_${currentUserId}_${Date.now()}`,
      classId: classroom.id,
      homeworkId: selectedHomework.id,
      homeworkTitle: selectedHomework.title,
      studentId: currentUserId,
      studentName: currentUser?.fullName || currentUser?.name || 'Học sinh',
      studentEmail: currentUser?.email,
      studentCode: currentUser?.studentCode,
      imageUrls: draftImages,
      attachments: draftAttachments,
      textAnswer: draftTextAnswer.trim() || undefined,
      note: draftNote.trim() || undefined,
      maxScore,
      submittedAt: mySubmission?.submittedAt || new Date().toISOString(),
    });
    setMySubmission(saved);
    try {
      sessionStorage.removeItem(getStudentDraftKey(selectedHomework.id));
    } catch {
      // ignore storage errors
    }
    setUploadError(null);
    if (isTeacher) {
      setHwSubmissions(getHomeworkSubmissionsByHomework(selectedHomework.id));
    }
    onToast(mySubmission ? '✓ Đã cập nhật bài tập về nhà!' : '✓ Đã nộp bài tập về nhà thành công!');
  };

  const handleTeacherSaveGrade = (sub: HomeworkSubmission) => {
    if (!selectedHomework) return;
    const maxScore = selectedHomework.maxScore && selectedHomework.maxScore > 0 ? selectedHomework.maxScore : 10;
    const draft = gradeDrafts[sub.id] || { score: '', feedback: '' };
    const parsedScore = draft.score.trim() === '' ? undefined : Number(draft.score.replace(',', '.'));
    if (parsedScore !== undefined && (Number.isNaN(parsedScore) || parsedScore < 0 || parsedScore > maxScore)) {
      onToast(`Điểm phải nằm trong khoảng 0 – ${maxScore}.`);
      return;
    }
    gradeHomeworkSubmission(
      sub.id,
      parsedScore,
      draft.feedback,
      currentUser?.fullName || currentUser?.email || 'Giáo viên'
    );
    reloadSubmissionsForSelected(selectedHomework.id);
    onToast(`✓ Đã lưu điểm cho ${sub.studentName}!`);
  };

  const handleTeacherDeleteSubmission = (sub: HomeworkSubmission) => {
    if (!selectedHomework) return;
    setConfirmState({
      isOpen: true,
      title: 'Xóa bài nộp BTVN',
      message: `Bạn có chắc muốn xóa bài nộp của học sinh "${sub.studentName}"?`,
      onConfirm: () => {
        deleteHomeworkSubmission(sub.id);
        reloadSubmissionsForSelected(selectedHomework.id);
        onToast(`✓ Đã xóa bài nộp của ${sub.studentName}.`);
      },
    });
  };

  const selectedSchedule = useMemo(() => {
    void nowTick;
    if (!selectedHomework) return null;
    return isItemScheduleOpen(
      { openTime: selectedHomework.openTime, closeTime: selectedHomework.closeTime, status: 'open' },
      'homework'
    );
  }, [selectedHomework, nowTick]);

  // Missing students list for teacher view
  const missingStudents = useMemo(() => {
    if (!isTeacher || !selectedHomework) return [];
    const submittedIdSet = new Set(hwSubmissions.map((s) => s.studentId));
    const submittedEmailSet = new Set(
      hwSubmissions.map((s) => (s.studentEmail || '').trim().toLowerCase()).filter(Boolean)
    );
    return (classroom.students || []).filter((st) => {
      if (submittedIdSet.has(st.id)) return false;
      if (st.email && submittedEmailSet.has(st.email.trim().toLowerCase())) return false;
      return true;
    });
  }, [isTeacher, selectedHomework, hwSubmissions, classroom.students]);

  return (
    <div className="space-y-6 font-sans">
      {/* Header Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xs">
        <div>
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <FileCheck2 className="w-5 h-5 text-indigo-600" />
            <span>Bài tập về nhà lớp {classroom.name}</span>
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            {isTeacher
              ? 'Giao bài tập có thời hạn nộp, đính kèm tài liệu, xem bài làm (PDF, PPT, Word, Excel, ảnh hoặc soạn thảo công thức) và chấm điểm.'
              : 'Xem đề bài tập về nhà và nộp bài bằng chụp ảnh, tải tệp (PDF, PPT, DOC, XLSX, PNG, JPG) hoặc soạn thảo trực tuyến có công thức toán.'}
          </p>
        </div>

        {isTeacher && (
          <button
            type="button"
            onClick={openCreateModal}
            className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 shadow-xs cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Thêm bài tập về nhà</span>
          </button>
        )}
      </div>

      {/* Main Content */}
      {homeworks.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center space-y-3">
          <FileCheck2 className="w-10 h-10 text-slate-300 mx-auto" />
          <div className="text-sm font-bold text-slate-700">
            Lớp chưa có bài tập về nhà nào
          </div>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            {isTeacher
              ? 'Nhấn "Thêm bài tập về nhà" để tạo bài tập, cài đặt hạn nộp và thu bài của học sinh.'
              : 'Giáo viên chưa giao bài tập về nhà trong lớp học này.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Assignment List */}
          <div className="lg:col-span-4 space-y-2.5">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500 px-1">
              Danh sách bài tập ({homeworks.length})
            </div>
            {homeworks.map((hw) => {
              const isSelected = selectedHomework?.id === hw.id;
              const sched = isItemScheduleOpen(
                { openTime: hw.openTime, closeTime: hw.closeTime, status: 'open' },
                'homework'
              );
              const mySub = getStudentSubmissionForHomework(hw.id, currentUserId);
              const totalSubs = isTeacher ? getHomeworkSubmissionsByHomework(hw.id).length : 0;

              return (
                <button
                  key={hw.id}
                  type="button"
                  onClick={() => setSelectedHomeworkId(hw.id)}
                  className={`w-full text-left p-4 rounded-xl border transition-all cursor-pointer space-y-2 ${
                    isSelected
                      ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                      : 'bg-white text-slate-800 border-slate-200 hover:border-indigo-300 hover:bg-slate-50/70'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-bold text-sm leading-snug line-clamp-2">{hw.title}</div>
                    <span
                      className={`text-[11px] font-bold shrink-0 ${
                        isSelected
                          ? sched.isOpen
                            ? 'text-emerald-300'
                            : 'text-amber-300'
                          : sched.isOpen
                          ? 'text-emerald-700'
                          : 'text-rose-700'
                      }`}
                    >
                      {sched.statusLabel}
                    </span>
                  </div>

                  <div
                    className={`flex items-center justify-between text-[11px] tabular-nums ${
                      isSelected ? 'text-slate-300' : 'text-slate-500'
                    }`}
                  >
                    <span>Thang {hw.maxScore || 10}đ</span>
                    {isTeacher ? (
                      <span className="font-semibold">
                        Đã nộp: {totalSubs}/{classroom.students?.length || 0}
                      </span>
                    ) : mySub ? (
                      <span className={isSelected ? 'text-emerald-300 font-bold' : 'text-emerald-700 font-bold'}>
                        {mySub.score !== undefined ? `Đã chấm: ${mySub.score}đ` : '✓ Đã nộp'}
                      </span>
                    ) : (
                      <span>Chưa nộp</span>
                    )}
                  </div>

                  {hw.closeTime && (
                    <div
                      className={`text-[11px] flex items-center gap-1 tabular-nums ${
                        isSelected ? 'text-slate-300' : 'text-slate-500'
                      }`}
                    >
                      <Clock className="w-3 h-3 shrink-0" />
                      <span>Hạn: {formatVietnameseDateTime(hw.closeTime)}</span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Right Column: Selected Assignment Workspace */}
          {selectedHomework && selectedSchedule && (
            <div className="lg:col-span-8 space-y-6">
              {/* Assignment Prompt Card */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-2xs space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-slate-100">
                  <div>
                    <div className="flex items-center gap-2 text-xs font-semibold mb-1.5 flex-wrap">
                      <span
                        className={`font-bold ${
                          selectedSchedule.isOpen ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        {selectedSchedule.statusLabel}
                      </span>
                      <span className="text-slate-300">·</span>
                      <span className="font-mono text-slate-600 tabular-nums">
                        Thang điểm: {selectedHomework.maxScore || 10} điểm
                      </span>
                    </div>
                    <h4 className="text-lg font-extrabold text-slate-900">
                      {selectedHomework.title}
                    </h4>
                  </div>

                  {isTeacher && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => openEditModal(selectedHomework)}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Sửa BTVN</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteHomework(selectedHomework)}
                        className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Xóa</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Open/Close Schedule Info */}
                {(selectedHomework.openTime || selectedHomework.closeTime) && (
                  <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 bg-slate-50 px-3.5 py-2.5 rounded-xl border border-slate-200 tabular-nums">
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <strong>Mở nộp:</strong>{' '}
                      {selectedHomework.openTime
                        ? formatVietnameseDateTime(selectedHomework.openTime)
                        : 'Mở ngay'}
                    </span>
                    <span className="text-slate-300">|</span>
                    <span>
                      <strong>Hạn đóng:</strong>{' '}
                      {selectedHomework.closeTime
                        ? formatVietnameseDateTime(selectedHomework.closeTime)
                        : 'Không giới hạn'}
                    </span>
                  </div>
                )}

                {/* Instructions */}
                {selectedHomework.instructions ? (
                  <div className="text-sm text-slate-800 leading-relaxed bg-slate-50/70 p-4 rounded-xl border border-slate-200">
                    <RichContentRenderer content={selectedHomework.instructions} />
                  </div>
                ) : (
                  <div className="text-xs italic text-slate-400">
                    Không có mô tả chi tiết bổ sung.
                  </div>
                )}

                {/* Teacher Reference Attachments */}
                {selectedHomework.attachments && selectedHomework.attachments.length > 0 && (
                  <div className="space-y-2 pt-1">
                    <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <Paperclip className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Tài liệu đính kèm từ giáo viên ({selectedHomework.attachments.length}):</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {selectedHomework.attachments.map((att) => (
                        <div
                          key={att.id}
                          className="flex items-center gap-2 px-3 py-2 bg-indigo-50/70 border border-indigo-200 rounded-xl text-xs"
                        >
                          <span className="px-1.5 py-0.5 rounded bg-indigo-600 text-white font-mono text-[10px] font-bold">
                            {getFileExtensionLabel(att.name)}
                          </span>
                          <span className="font-semibold text-slate-800 max-w-[180px] truncate">
                            {att.name}
                          </span>
                          <span className="text-[10px] text-slate-500">
                            ({formatFileSize(att.sizeBytes)})
                          </span>
                          {att.mimeType === 'application/pdf' || /\.pdf$/i.test(att.name) ? (
                            <button
                              type="button"
                              onClick={() => setPreviewPdfAttachment(att)}
                              className="text-indigo-700 hover:underline font-bold cursor-pointer"
                            >
                              Xem
                            </button>
                          ) : att.mimeType.startsWith('image/') && att.dataUrl ? (
                            <button
                              type="button"
                              onClick={() =>
                                setLightboxState({
                                  images: att.dataUrl ? [att.dataUrl] : [],
                                  index: 0,
                                  title: att.name,
                                  rotation: 0,
                                })
                              }
                              className="text-indigo-700 hover:underline font-bold cursor-pointer"
                            >
                              Xem ảnh
                            </button>
                          ) : null}
                          <a
                            href={att.dataUrl}
                            download={att.name}
                            className="text-slate-700 hover:text-indigo-700 p-1 rounded hover:bg-white transition-colors"
                            title="Tải xuống tệp"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* STUDENT SUBMISSION WORKSPACE */}
              {!isTeacher && (
                <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-2xs space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
                    <h5 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <Send className="w-4 h-4 text-indigo-600" />
                      <span>Bài nộp của bạn</span>
                    </h5>
                    {mySubmission && (
                      <div className="text-xs text-emerald-700 font-semibold flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>
                          Đã nộp lúc {formatVietnameseDateTime(mySubmission.updatedAt || mySubmission.submittedAt)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Teacher Grade & Feedback if graded */}
                  {mySubmission && (mySubmission.score !== undefined || mySubmission.teacherFeedback) && (
                    <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 space-y-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-bold text-emerald-900 uppercase tracking-wide">
                          Kết quả chấm bài của giáo viên
                        </span>
                        {mySubmission.score !== undefined && (
                          <span className="text-sm font-extrabold font-mono text-emerald-800 bg-white px-2.5 py-0.5 rounded border border-emerald-300 tabular-nums">
                            {mySubmission.score} / {selectedHomework.maxScore || 10} điểm
                          </span>
                        )}
                      </div>
                      {mySubmission.teacherFeedback && (
                        <p className="text-xs sm:text-sm text-emerald-950 leading-relaxed">
                          <strong>Nhận xét:</strong> {mySubmission.teacherFeedback}
                        </p>
                      )}
                    </div>
                  )}

                  {!selectedSchedule.isOpen ? (
                    <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-950 flex items-start gap-2.5">
                      <Lock className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-bold">{selectedSchedule.statusLabel}</div>
                        <p className="mt-0.5 text-amber-900">{selectedSchedule.reason}</p>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* 1. Online Rich-Text / Essay Answer with Cursor-Aware MathToolbar */}
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <label className="text-xs font-bold text-slate-800">
                            1. Soạn thảo bài làm tự luận trực tuyến (Hỗ trợ đầy đủ công thức toán $\LaTeX$):
                          </label>
                          <div className="flex items-center gap-2">
                            <CopyContentButton compact getText={() => draftTextAnswer} />
                            <button
                              type="button"
                              onClick={() => setShowEssayPreview((v) => !v)}
                              className="text-xs font-semibold text-indigo-700 hover:underline flex items-center gap-1 cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>{showEssayPreview ? 'Ẩn xem trước' : 'Xem trước công thức'}</span>
                            </button>
                          </div>
                        </div>

                        <MathToolbar
                          targetRef={studentEssayRef}
                          onInsert={(snippet) => {
                            const isBlock = snippet.trim().startsWith('|') || snippet.includes('\n');
                            setDraftTextAnswer((prev) =>
                              prev ? (isBlock ? `${prev}\n${snippet}` : `${prev} ${snippet}`) : snippet
                            );
                          }}
                        />

                        <textarea
                          ref={studentEssayRef}
                          rows={6}
                          value={draftTextAnswer}
                          onChange={(e) => setDraftTextAnswer(e.target.value)}
                          placeholder="Nhập lời giải tự luận trực tiếp tại đây... Đặt con trỏ ở vị trí bất kỳ rồi bấm nút trên thanh công thức để chèn ngay tại đó."
                          className="w-full p-3.5 text-sm bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600 font-mono leading-relaxed"
                        />

                        {showEssayPreview && draftTextAnswer.trim() && (
                          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                              Xem trước bài soạn thảo:
                            </div>
                            <div className="text-sm text-slate-900 leading-relaxed">
                              <RichContentRenderer content={draftTextAnswer} />
                            </div>
                          </div>
                        )}
                      </div>

                      {/* 2. Upload Files (PDF, PPT, DOC, XLSX, PNG, JPG) & Camera */}
                      <div className="space-y-3 pt-2 border-t border-slate-100">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <label className="text-xs font-bold text-slate-800">
                            2. Hoặc tải tệp (PDF, PPT, DOC, XLSX, PNG, JPG) / Chụp ảnh bài làm:
                          </label>
                          <span className="text-[11px] text-slate-500">
                            Hỗ trợ đính kèm nhiều tệp & ảnh cùng lúc
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-2.5">
                          <button
                            type="button"
                            onClick={() => setIsCameraOpen(true)}
                            disabled={isProcessingUpload}
                            className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs cursor-pointer disabled:opacity-50"
                          >
                            <Camera className="w-4 h-4" />
                            <span>Chụp ảnh bài làm</span>
                          </button>

                          <label className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs">
                            <Upload className="w-4 h-4 text-indigo-600" />
                            <span>
                              {isProcessingUpload
                                ? 'Đang xử lý...'
                                : 'Chọn tệp (PDF, PPT, Word, Excel, PNG, JPG)'}
                            </span>
                            <input
                              type="file"
                              accept={ACCEPTED_FILE_EXTENSIONS}
                              multiple
                              className="hidden"
                              onChange={(e) => {
                                void handleStudentUploadFiles(e.target.files);
                                e.target.value = '';
                              }}
                            />
                          </label>

                          <label className="sm:hidden px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer">
                            <Camera className="w-4 h-4" />
                            <span>Camera điện thoại</span>
                            <input
                              type="file"
                              accept="image/*"
                              capture="environment"
                              className="hidden"
                              onChange={(e) => {
                                void handleStudentUploadFiles(e.target.files);
                                e.target.value = '';
                              }}
                            />
                          </label>
                        </div>

                        {uploadError && (
                          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">
                            {uploadError}
                          </div>
                        )}

                        {/* Attached Document Files List */}
                        {draftAttachments.length > 0 && (
                          <div className="space-y-2">
                            <div className="text-xs font-semibold text-slate-600">
                              Tệp tài liệu đã chọn ({draftAttachments.length}):
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {draftAttachments.map((att) => (
                                <div
                                  key={att.id}
                                  className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs"
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="px-1.5 py-0.5 rounded bg-slate-800 text-white font-mono text-[10px] font-bold shrink-0">
                                      {getFileExtensionLabel(att.name)}
                                    </span>
                                    <div className="min-w-0">
                                      <div className="font-semibold text-slate-800 truncate">
                                        {att.name}
                                      </div>
                                      <div className="text-[10px] text-slate-500">
                                        {formatFileSize(att.sizeBytes)}
                                      </div>
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setDraftAttachments((prev) =>
                                        prev.filter((item) => item.id !== att.id)
                                      )
                                    }
                                    className="p-1 text-rose-600 hover:bg-rose-50 rounded cursor-pointer shrink-0"
                                    title="Gỡ tệp này"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Uploaded Photos Preview */}
                        {draftImages.length > 0 && (
                          <div className="space-y-2">
                            <div className="text-xs font-semibold text-slate-600">
                              Ảnh bài làm đã chọn ({draftImages.length}):
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                              {draftImages.map((imgUrl, idx) => (
                                <div
                                  key={idx}
                                  className="relative group rounded-xl overflow-hidden border border-slate-200 bg-slate-50 aspect-[4/3]"
                                >
                                  <img
                                    src={imgUrl}
                                    alt={`Ảnh bài làm ${idx + 1}`}
                                    onClick={() =>
                                      setLightboxState({
                                        images: draftImages,
                                        index: idx,
                                        title: 'Bài làm của bạn',
                                        rotation: 0,
                                      })
                                    }
                                    className="w-full h-full object-cover cursor-zoom-in"
                                  />
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setDraftImages((prev) => prev.filter((_, i) => i !== idx))
                                    }
                                    className="absolute top-1.5 right-1.5 p-1 bg-slate-900/80 hover:bg-rose-600 text-white rounded-lg cursor-pointer"
                                    title="Xóa ảnh này"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Note & Submit */}
                      <div className="space-y-3 pt-2 border-t border-slate-100">
                        <div>
                          <label className="text-xs font-semibold text-slate-700 block mb-1">
                            Ghi chú gửi giáo viên (Tùy chọn):
                          </label>
                          <input
                            type="text"
                            value={draftNote}
                            onChange={(e) => setDraftNote(e.target.value)}
                            placeholder="Ví dụ: Em nộp file PDF kèm phần giải thích chi tiết..."
                            className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600"
                          />
                        </div>

                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={handleSubmitStudentHomework}
                            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-xs cursor-pointer"
                          >
                            <Send className="w-4 h-4" />
                            <span>{mySubmission ? 'Cập nhật bài nộp BTVN' : 'Nộp bài tập về nhà'}</span>
                          </button>
                        </div>
                      </div>
                    </>
                  )}

                  {/* Read-only view when closed if already submitted */}
                  {!selectedSchedule.isOpen && mySubmission && (
                    <div className="space-y-4 pt-2">
                      {mySubmission.textAnswer && (
                        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                          <div className="text-xs font-bold text-slate-700">Bài làm trực tuyến đã nộp:</div>
                          <div className="text-sm text-slate-900">
                            <RichContentRenderer content={mySubmission.textAnswer} />
                          </div>
                        </div>
                      )}
                      {mySubmission.attachments && mySubmission.attachments.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {mySubmission.attachments.map((att) => (
                            <a
                              key={att.id}
                              href={att.dataUrl}
                              download={att.name}
                              className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-800 flex items-center gap-2 hover:bg-slate-100"
                            >
                              <FileText className="w-3.5 h-3.5 text-indigo-600" />
                              <span>{att.name}</span>
                              <Download className="w-3.5 h-3.5 text-slate-500" />
                            </a>
                          ))}
                        </div>
                      )}
                      {mySubmission.imageUrls.length > 0 && (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                          {mySubmission.imageUrls.map((url, idx) => (
                            <img
                              key={idx}
                              src={url}
                              alt={`Bài nộp ${idx + 1}`}
                              onClick={() =>
                                setLightboxState({
                                  images: mySubmission.imageUrls,
                                  index: idx,
                                  title: 'Bài nộp của bạn',
                                  rotation: 0,
                                })
                              }
                              className="w-full aspect-[4/3] object-cover rounded-xl border border-slate-200 cursor-zoom-in"
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* TEACHER SUBMISSIONS & GRADING PANEL */}
              {isTeacher && (
                <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-2xs space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
                    <div>
                      <h5 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                        <Users className="w-4 h-4 text-indigo-600" />
                        <span>
                          Bài nộp của học sinh ({hwSubmissions.length}/{classroom.students?.length || 0})
                        </span>
                      </h5>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Đã chấm:{' '}
                        <strong>
                          {hwSubmissions.filter((s) => s.score !== undefined).length}/{hwSubmissions.length}
                        </strong>{' '}
                        bài nộp
                      </p>
                    </div>
                  </div>

                  {hwSubmissions.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                      Chưa có học sinh nào nộp bài tập này.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {hwSubmissions.map((sub) => {
                        const draft = gradeDrafts[sub.id] || {
                          score: sub.score !== undefined ? String(sub.score) : '',
                          feedback: sub.teacherFeedback || '',
                        };
                        const hwMax = selectedHomework.maxScore || 10;

                        return (
                          <div
                            key={sub.id}
                            className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200/70">
                              <div>
                                <div className="font-bold text-sm text-slate-900">
                                  {sub.studentName}
                                  {sub.studentCode && (
                                    <span className="ml-2 text-xs font-mono text-slate-500">
                                      ({sub.studentCode})
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-slate-500 tabular-nums">
                                  Nộp lúc: {formatVietnameseDateTime(sub.updatedAt || sub.submittedAt)}
                                  {sub.note && ` · Ghi chú: "${sub.note}"`}
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                {sub.score !== undefined && (
                                  <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 font-mono text-xs font-bold tabular-nums">
                                    {sub.score} / {hwMax}đ
                                  </span>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleTeacherDeleteSubmission(sub)}
                                  className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg cursor-pointer"
                                  title="Xóa bài nộp này"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>

                            {/* Online Text Answer */}
                            {sub.textAnswer && (
                              <div className="p-3.5 rounded-xl bg-white border border-slate-200 space-y-1">
                                <div className="text-[11px] font-bold uppercase tracking-wider text-indigo-700">
                                  Bài làm tự luận trực tuyến:
                                </div>
                                <div className="text-sm text-slate-900 leading-relaxed">
                                  <RichContentRenderer content={sub.textAnswer} />
                                </div>
                              </div>
                            )}

                            {/* Attached Document Files */}
                            {sub.attachments && sub.attachments.length > 0 && (
                              <div className="flex flex-wrap gap-2">
                                {sub.attachments.map((att) => (
                                  <div
                                    key={att.id}
                                    className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs"
                                  >
                                    <span className="px-1.5 py-0.5 rounded bg-indigo-600 text-white font-mono text-[10px] font-bold">
                                      {getFileExtensionLabel(att.name)}
                                    </span>
                                    <span className="font-semibold text-slate-800 max-w-[200px] truncate">
                                      {att.name}
                                    </span>
                                    <span className="text-[10px] text-slate-500">
                                      ({formatFileSize(att.sizeBytes)})
                                    </span>
                                    {att.mimeType === 'application/pdf' || /\.pdf$/i.test(att.name) ? (
                                      <button
                                        type="button"
                                        onClick={() => setPreviewPdfAttachment(att)}
                                        className="text-indigo-700 hover:underline font-bold cursor-pointer"
                                      >
                                        Xem PDF
                                      </button>
                                    ) : null}
                                    <a
                                      href={att.dataUrl}
                                      download={att.name}
                                      className="text-slate-700 hover:text-indigo-700 p-1 rounded hover:bg-slate-100"
                                      title="Tải về"
                                    >
                                      <Download className="w-3.5 h-3.5" />
                                    </a>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Submitted Photos */}
                            {sub.imageUrls.length > 0 && (
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                {sub.imageUrls.map((imgUrl, idx) => (
                                  <img
                                    key={idx}
                                    src={imgUrl}
                                    alt={`${sub.studentName} - ảnh ${idx + 1}`}
                                    onClick={() =>
                                      setLightboxState({
                                        images: sub.imageUrls,
                                        index: idx,
                                        title: `Bài làm của ${sub.studentName}`,
                                        rotation: 0,
                                      })
                                    }
                                    className="w-full aspect-[4/3] object-cover rounded-lg border border-slate-200 bg-white cursor-zoom-in hover:opacity-90 transition-opacity"
                                  />
                                ))}
                              </div>
                            )}

                            {/* Grading Controls */}
                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-2">
                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className="text-xs font-semibold text-slate-700">Điểm:</span>
                                <input
                                  type="number"
                                  step="0.25"
                                  min={0}
                                  max={hwMax}
                                  value={draft.score}
                                  onChange={(e) =>
                                    setGradeDrafts((prev) => ({
                                      ...prev,
                                      [sub.id]: { ...draft, score: e.target.value },
                                    }))
                                  }
                                  placeholder={`0 - ${hwMax}`}
                                  className="w-20 px-2.5 py-1.5 text-xs font-mono font-bold bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600"
                                />
                              </div>
                              <input
                                type="text"
                                value={draft.feedback}
                                onChange={(e) =>
                                  setGradeDrafts((prev) => ({
                                    ...prev,
                                    [sub.id]: { ...draft, feedback: e.target.value },
                                  }))
                                }
                                placeholder="Nhập nhận xét cho học sinh..."
                                className="flex-1 px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600"
                              />
                              <button
                                type="button"
                                onClick={() => handleTeacherSaveGrade(sub)}
                                className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg cursor-pointer shrink-0"
                              >
                                Lưu điểm
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Missing Students Summary */}
                  {missingStudents.length > 0 && (
                    <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200 space-y-1.5">
                      <div className="text-xs font-bold text-amber-900">
                        Học sinh chưa nộp bài ({missingStudents.length}):
                      </div>
                      <div className="text-xs text-amber-950 leading-relaxed">
                        {missingStudents.map((st) => st.name).join(', ')}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Teacher Create / Edit Homework Modal */}
      {isEditorOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h4 className="text-base font-bold text-slate-900">
                {editingHwId ? 'Chỉnh sửa bài tập về nhà' : 'Giao bài tập về nhà mới'}
              </h4>
              <button
                type="button"
                onClick={handleCloseTeacherEditorExplicitly}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {editorError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">
                {editorError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="sm:col-span-2">
                <label className="font-bold text-slate-700 block mb-1">
                  Tiêu đề bài tập <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={hwTitle}
                  onChange={(e) => setHwTitle(e.target.value)}
                  placeholder="Ví dụ: BTVN Tuần 4 - Phương trình lượng giác"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Thang điểm tối đa:</label>
                <input
                  type="number"
                  min={1}
                  step="0.5"
                  value={hwMaxScore}
                  onChange={(e) => setHwMaxScore(parseFloat(e.target.value) || 10)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-mono text-sm font-bold"
                />
              </div>
            </div>

            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <label className="font-bold text-slate-700 block">
                  Nội dung / Yêu cầu chi tiết (Hỗ trợ chèn công thức tại vị trí con trỏ):
                </label>
                <CopyContentButton compact getText={() => hwInstructions} />
              </div>
              <MathToolbar
                targetRef={teacherInstrRef}
                onInsert={(snippet) => {
                  const isBlock = snippet.trim().startsWith('|') || snippet.includes('\n');
                  setHwInstructions((prev) =>
                    prev ? (isBlock ? `${prev}\n${snippet}` : `${prev} ${snippet}`) : snippet
                  );
                }}
              />
              <textarea
                ref={teacherInstrRef}
                rows={4}
                value={hwInstructions}
                onChange={(e) => setHwInstructions(e.target.value)}
                placeholder="Nhập đề bài hoặc hướng dẫn làm bài cho học sinh..."
                className="w-full p-3 bg-white border border-slate-300 rounded-xl font-mono text-xs sm:text-sm leading-relaxed"
              />
              {hwInstructions.trim() && (
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                  <div className="font-bold text-slate-500 uppercase text-[10px] mb-1">
                    Xem trước hiển thị:
                  </div>
                  <RichContentRenderer content={hwInstructions} />
                </div>
              )}
            </div>

            {/* Open & Close Schedule */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold text-slate-700">Thời gian mở nộp (Tùy chọn):</label>
                  {hwOpenTime && (
                    <button
                      type="button"
                      onClick={() => setHwOpenTime('')}
                      className="text-rose-600 hover:underline cursor-pointer"
                    >
                      Xóa
                    </button>
                  )}
                </div>
                <input
                  type="datetime-local"
                  value={hwOpenTime}
                  onChange={(e) => setHwOpenTime(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-mono text-xs"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold text-slate-700">Thời gian đóng nộp / Hạn chót:</label>
                  {hwCloseTime && (
                    <button
                      type="button"
                      onClick={() => setHwCloseTime('')}
                      className="text-rose-600 hover:underline cursor-pointer"
                    >
                      Xóa
                    </button>
                  )}
                </div>
                <input
                  type="datetime-local"
                  value={hwCloseTime}
                  onChange={(e) => setHwCloseTime(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-mono text-xs"
                />
              </div>
            </div>

            {/* Teacher Reference Attachments */}
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <label className="font-bold text-slate-700">
                  Đính kèm tệp đề / tài liệu (PDF, PPT, DOC, XLSX, PNG, JPG):
                </label>
                <label className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg font-bold flex items-center gap-1.5 cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Chọn tệp</span>
                  <input
                    type="file"
                    accept={ACCEPTED_FILE_EXTENSIONS}
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      void handleTeacherUploadAttachment(e.target.files);
                      e.target.value = '';
                    }}
                  />
                </label>
              </div>
              {hwAttachments.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {hwAttachments.map((att) => (
                    <div
                      key={att.id}
                      className="flex items-center gap-2 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg"
                    >
                      <span className="font-semibold text-slate-800 max-w-[180px] truncate">
                        {att.name}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setHwAttachments((prev) => prev.filter((item) => item.id !== att.id))
                        }
                        className="text-rose-600 hover:bg-rose-50 p-0.5 rounded cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={handleCloseTeacherEditorExplicitly}
                className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleSaveHomework}
                className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold cursor-pointer"
              >
                {editingHwId ? 'Lưu cập nhật BTVN' : 'Giao BTVN cho lớp'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Live Camera Capture Modal */}
      {isCameraOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between text-white">
              <div className="font-bold text-sm flex items-center gap-2">
                <Camera className="w-4 h-4 text-indigo-400" />
                <span>Chụp ảnh bài làm BTVN</span>
              </div>
              <button
                type="button"
                onClick={() => setIsCameraOpen(false)}
                className="p-1 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              {cameraError ? (
                <div className="p-4 rounded-xl bg-rose-950/60 border border-rose-700 text-xs text-rose-200">
                  {cameraError}
                </div>
              ) : (
                <div className="rounded-xl overflow-hidden bg-black aspect-[4/3]">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />
                </div>
              )}

              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setCameraFacingMode((prev) =>
                      prev === 'environment' ? 'user' : 'environment'
                    )
                  }
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Đổi camera</span>
                </button>
                <button
                  type="button"
                  disabled={Boolean(cameraError)}
                  onClick={handleCapturePhotoFromCamera}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Camera className="w-4 h-4" />
                  <span>Chụp & Đính kèm</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Image Lightbox Modal */}
      {lightboxState && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 flex flex-col items-center justify-center p-4">
          <div className="w-full max-w-4xl flex items-center justify-between text-white pb-3">
            <div className="text-sm font-bold truncate">{lightboxState.title}</div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setLightboxState((prev) =>
                    prev ? { ...prev, rotation: (prev.rotation + 90) % 360 } : null
                  )
                }
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer"
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>Xoay ảnh</span>
              </button>
              <button
                type="button"
                onClick={() => setLightboxState(null)}
                className="p-1.5 text-slate-300 hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="relative flex-1 w-full max-w-4xl flex items-center justify-center overflow-hidden">
            {lightboxState.images.length > 1 && (
              <button
                type="button"
                onClick={() =>
                  setLightboxState((prev) =>
                    prev
                      ? {
                          ...prev,
                          index: (prev.index - 1 + prev.images.length) % prev.images.length,
                          rotation: 0,
                        }
                      : null
                  )
                }
                className="absolute left-2 z-10 p-2 bg-slate-900/80 text-white rounded-full hover:bg-slate-800 cursor-pointer"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}

            <img
              src={lightboxState.images[lightboxState.index]}
              alt="Xem ảnh bài làm"
              style={{ transform: `rotate(${lightboxState.rotation}deg)` }}
              className="max-h-[78vh] max-w-full object-contain rounded-xl transition-transform"
            />

            {lightboxState.images.length > 1 && (
              <button
                type="button"
                onClick={() =>
                  setLightboxState((prev) =>
                    prev
                      ? {
                          ...prev,
                          index: (prev.index + 1) % prev.images.length,
                          rotation: 0,
                        }
                      : null
                  )
                }
                className="absolute right-2 z-10 p-2 bg-slate-900/80 text-white rounded-full hover:bg-slate-800 cursor-pointer"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* PDF In-App Viewer Modal */}
      {previewPdfAttachment && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full h-[85vh] flex flex-col overflow-hidden shadow-2xl border border-slate-200">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-3">
              <div className="font-bold text-sm text-slate-900 truncate">
                {previewPdfAttachment.name}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={previewPdfAttachment.dataUrl}
                  download={previewPdfAttachment.name}
                  className="px-3 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-bold flex items-center gap-1"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Tải về</span>
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewPdfAttachment(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <iframe
              src={previewPdfAttachment.dataUrl}
              title={previewPdfAttachment.name}
              className="flex-1 w-full bg-slate-100"
            />
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={confirmState.isOpen}
        title={confirmState.title}
        message={confirmState.message}
        onConfirm={confirmState.onConfirm}
        onClose={() => setConfirmState((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};
