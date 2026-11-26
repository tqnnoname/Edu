import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  Award,
  Bell,
  BookOpen,
  CheckCheck,
  ClipboardList,
  Gamepad2,
  GraduationCap,
  Layers,
  Link2,
  Megaphone,
  Plus,
  Send,
  ShieldCheck,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import type {
  AppNotification,
  Classroom,
  Exam,
  ExamBundle,
  MicroCourse,
  NotificationCategory,
  NotificationRecipientScope,
  NotificationTargetType,
  UserAccount,
} from '../types/exam';
import type { ClassroomTabRouteId } from '../utils/urlRouter';
import { normalizeRoomCode } from '../utils/gameRoomsFirestore';
import { deleteCloudNotification, publishCloudNotification } from '../utils/notificationsFirestore';

interface NotificationCenterModalProps {
  isOpen: boolean;
  notifications: AppNotification[];
  readIds: Set<string>;
  currentUser: UserAccount | null;
  canCompose: boolean;
  isMasterAdmin: boolean;
  exams: Exam[];
  bundles: ExamBundle[];
  courses: MicroCourse[];
  classrooms: Classroom[];
  onClose: () => void;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onNavigateNotification: (notification: AppNotification) => void;
  onCreatedNotification?: (notification: AppNotification) => void;
}

type PanelTab = 'all' | 'unread' | 'compose';

function formatRelativeTimeVi(iso?: string): string {
  if (!iso) return 'Vừa xong';
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return 'Vừa xong';
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 60) return 'Vừa xong';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} phút trước`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} giờ trước`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay} ngày trước`;
  return new Date(ts).toLocaleDateString('vi-VN');
}

function getCategoryStyle(category: NotificationCategory) {
  switch (category) {
    case 'exam':
      return {
        label: 'Đề thi',
        bg: 'bg-blue-100 text-blue-700',
        badge: 'bg-blue-50 text-blue-700 border-blue-200',
        icon: <BookOpen className="w-4 h-4" />,
      };
    case 'bundle':
      return {
        label: 'Tổ hợp',
        bg: 'bg-purple-100 text-purple-700',
        badge: 'bg-purple-50 text-purple-700 border-purple-200',
        icon: <Layers className="w-4 h-4" />,
      };
    case 'course':
      return {
        label: 'Khóa học',
        bg: 'bg-indigo-100 text-indigo-700',
        badge: 'bg-indigo-50 text-indigo-700 border-indigo-200',
        icon: <GraduationCap className="w-4 h-4" />,
      };
    case 'homework':
      return {
        label: 'BTVN',
        bg: 'bg-amber-100 text-amber-800',
        badge: 'bg-amber-50 text-amber-800 border-amber-200',
        icon: <ClipboardList className="w-4 h-4" />,
      };
    case 'grade':
      return {
        label: 'Điểm số',
        bg: 'bg-emerald-100 text-emerald-700',
        badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        icon: <Award className="w-4 h-4" />,
      };
    case 'game':
      return {
        label: 'Trò chơi',
        bg: 'bg-teal-100 text-teal-800',
        badge: 'bg-teal-50 text-teal-800 border-teal-200',
        icon: <Gamepad2 className="w-4 h-4" />,
      };
    case 'classroom':
      return {
        label: 'Lớp học',
        bg: 'bg-sky-100 text-sky-700',
        badge: 'bg-sky-50 text-sky-700 border-sky-200',
        icon: <Users className="w-4 h-4" />,
      };
    case 'teacher_request':
      return {
        label: 'Phân quyền',
        bg: 'bg-rose-100 text-rose-700',
        badge: 'bg-rose-50 text-rose-700 border-rose-200',
        icon: <ShieldCheck className="w-4 h-4" />,
      };
    default:
      return {
        label: 'Thông báo',
        bg: 'bg-slate-100 text-slate-700',
        badge: 'bg-slate-50 text-slate-700 border-slate-200',
        icon: <Megaphone className="w-4 h-4" />,
      };
  }
}

function getTargetLinkText(n: AppNotification): string | null {
  if (n.targetLabel) return n.targetLabel;
  switch (n.targetType) {
    case 'exam':
      return 'Mở đề thi';
    case 'bundle':
      return 'Mở tổ hợp thi';
    case 'course':
      return 'Mở khóa học';
    case 'homework':
      return n.className ? `Mở BTVN · ${n.className}` : 'Mở bài tập về nhà';
    case 'grade':
      return n.className ? `Xem điểm · ${n.className}` : 'Xem điểm đã chấm';
    case 'classroom_requests':
      return n.className ? `Duyệt yêu cầu · ${n.className}` : 'Xem yêu cầu vào lớp';
    case 'classroom':
      return n.className ? `Đi tới lớp ${n.className}` : 'Mở lớp học';
    case 'game_room':
      return n.targetId ? `Vào phòng game ${n.targetId}` : 'Mở trò chơi';
    case 'teacher_requests':
      return 'Mở duyệt quyền Giáo viên';
    default:
      return null;
  }
}

export const NotificationCenterModal: React.FC<NotificationCenterModalProps> = ({
  isOpen,
  notifications,
  readIds,
  currentUser,
  canCompose,
  isMasterAdmin,
  exams,
  bundles,
  courses,
  classrooms,
  onClose,
  onMarkRead,
  onMarkAllRead,
  onNavigateNotification,
  onCreatedNotification,
}) => {
  const [panelTab, setPanelTab] = useState<PanelTab>('all');

  // Composer state
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [recipientScope, setRecipientScope] = useState<NotificationRecipientScope>('students');
  const [targetClassForAudience, setTargetClassForAudience] = useState<string>(
    classrooms[0]?.id || ''
  );
  const [linkType, setLinkType] = useState<NotificationTargetType>('exam');
  const [selectedExamId, setSelectedExamId] = useState<string>(exams[0]?.id || '');
  const [selectedBundleId, setSelectedBundleId] = useState<string>(bundles[0]?.id || '');
  const [selectedCourseId, setSelectedCourseId] = useState<string>(courses[0]?.id || '');
  const [selectedClassroomId, setSelectedClassroomId] = useState<string>(classrooms[0]?.id || '');
  const [selectedClassroomTab, setSelectedClassroomTab] =
    useState<ClassroomTabRouteId>('homework');
  const [gameRoomCodeInput, setGameRoomCodeInput] = useState<string>('');
  const [sending, setSending] = useState(false);
  const [composeError, setComposeError] = useState<string | null>(null);

  const unreadList = useMemo(
    () => notifications.filter((n) => !readIds.has(n.id)),
    [notifications, readIds]
  );

  const displayedList = panelTab === 'unread' ? unreadList : notifications;

  if (!isOpen) return null;

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    setComposeError(null);

    if (!title.trim()) {
      setComposeError('Vui lòng nhập tiêu đề thông báo.');
      return;
    }
    if (!message.trim()) {
      setComposeError('Vui lòng nhập nội dung thông báo.');
      return;
    }

    let category: NotificationCategory = 'system';
    let targetId: string | undefined;
    let secondaryId: string | undefined;
    let targetLabel: string | undefined;
    let classId: string | undefined;
    let className: string | undefined;
    let actionPath: string | undefined;

    if (linkType === 'exam') {
      const ex = exams.find((x) => x.id === selectedExamId);
      if (!ex) {
        setComposeError('Vui lòng chọn đề thi cần liên kết.');
        return;
      }
      category = 'exam';
      targetId = ex.id;
      classId = ex.assignedClassId;
      className = ex.assignedClassName;
      targetLabel = `Đề thi: ${ex.title}`;
    } else if (linkType === 'bundle') {
      const b = bundles.find((x) => x.id === selectedBundleId);
      if (!b) {
        setComposeError('Vui lòng chọn tổ hợp thi cần liên kết.');
        return;
      }
      category = 'bundle';
      targetId = b.id;
      classId = b.assignedClassId;
      className = b.assignedClassName;
      targetLabel = `Tổ hợp: ${b.title}`;
    } else if (linkType === 'course') {
      const c = courses.find((x) => x.id === selectedCourseId);
      if (!c) {
        setComposeError('Vui lòng chọn khóa học cần liên kết.');
        return;
      }
      category = 'course';
      targetId = c.id;
      classId = c.assignedClassId;
      className = c.assignedClassName;
      targetLabel = `Khóa học: ${c.title}`;
    } else if (linkType === 'classroom' || linkType === 'homework') {
      const cls = classrooms.find((x) => x.id === selectedClassroomId);
      if (!cls) {
        setComposeError('Vui lòng chọn lớp học cần liên kết.');
        return;
      }
      category = selectedClassroomTab === 'homework' ? 'homework' : 'classroom';
      targetId = cls.id;
      classId = cls.id;
      className = cls.name;
      secondaryId = selectedClassroomTab;
      const tabLabel =
        selectedClassroomTab === 'homework'
          ? 'Bài tập về nhà'
          : selectedClassroomTab === 'exams'
            ? 'Đề thi lớp'
            : selectedClassroomTab === 'courses'
              ? 'Khóa học lớp'
              : selectedClassroomTab === 'requests'
                ? 'Yêu cầu vào lớp'
                : 'Tổng quan lớp';
      targetLabel = `${tabLabel} · ${cls.name}`;
    } else if (linkType === 'game_room') {
      const code = normalizeRoomCode(gameRoomCodeInput);
      if (code.length !== 6) {
        setComposeError('Mã phòng trò chơi phải gồm đúng 6 ký tự chữ/số.');
        return;
      }
      category = 'game';
      targetId = code;
      actionPath = `/tro-choi/${code}`;
      targetLabel = `Vào phòng game ${code}`;
    }

    let recipientEmails: string[] | undefined;
    if (recipientScope === 'class') {
      const cls = classrooms.find((c) => c.id === targetClassForAudience);
      if (!cls) {
        setComposeError('Vui lòng chọn lớp học nhận thông báo.');
        return;
      }
      if (!classId) {
        classId = cls.id;
        className = cls.name;
      }
      recipientEmails = Array.from(
        new Set(
          (cls.students || [])
            .map((s) => (s.email || '').trim().toLowerCase())
            .filter(Boolean)
        )
      );
      if (recipientEmails.length === 0) {
        setComposeError(`Lớp "${cls.name}" chưa có học sinh có email để nhận thông báo.`);
        return;
      }
    }

    setSending(true);
    try {
      const created = await publishCloudNotification({
        title: title.trim(),
        message: message.trim(),
        category,
        targetType: linkType,
        targetId,
        secondaryId,
        targetLabel,
        classId,
        className,
        actionPath,
        recipientScope,
        recipientEmails,
        senderName: currentUser?.fullName || currentUser?.username || 'Giáo viên',
        senderEmail: currentUser?.email || '',
      });
      if (created && onCreatedNotification) {
        onCreatedNotification(created);
      }
      setTitle('');
      setMessage('');
      setPanelTab('all');
    } catch (err) {
      setComposeError(err instanceof Error ? err.message : 'Không thể gửi thông báo.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-900/45 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
      data-testid="notification-center-backdrop"
    >
      <div
        className="w-full max-w-lg bg-white h-full shadow-2xl border-l border-slate-200 flex flex-col"
        onClick={(e) => e.stopPropagation()}
        data-testid="notification-center-panel"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3 bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs shrink-0">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-900 leading-tight">
                Thông báo & Tin cần đến
              </h2>
              <p className="text-[11px] font-medium text-slate-500">
                Nhấn vào bất kỳ thông báo nào để mở trực tiếp nội dung liên kết
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-200/70 cursor-pointer"
            aria-label="Đóng thông báo"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sub-nav Tabs + Mark All Read */}
        <div className="px-5 py-2.5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2 bg-white">
          <div className="inline-flex p-1 rounded-xl bg-slate-100 gap-1">
            <button
              type="button"
              onClick={() => setPanelTab('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                panelTab === 'all'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Tất cả ({notifications.length})
            </button>
            <button
              type="button"
              onClick={() => setPanelTab('unread')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                panelTab === 'unread'
                  ? 'bg-white text-blue-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Chưa đọc ({unreadList.length})
            </button>
            {canCompose && (
              <button
                type="button"
                onClick={() => setPanelTab('compose')}
                data-testid="notification-compose-tab"
                className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors flex items-center gap-1 ${
                  panelTab === 'compose'
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'text-blue-700 hover:bg-blue-50'
                }`}
              >
                <Plus className="w-3.5 h-3.5" />
                Gửi thông báo
              </button>
            )}
          </div>

          {panelTab !== 'compose' && unreadList.length > 0 && (
            <button
              type="button"
              onClick={onMarkAllRead}
              className="inline-flex items-center gap-1 text-xs font-bold text-blue-700 hover:text-blue-800 hover:underline cursor-pointer"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              Đánh dấu đã đọc hết
            </button>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/40">
          {panelTab === 'compose' && canCompose ? (
            <form onSubmit={handlePublish} className="space-y-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
              <div className="text-sm font-extrabold text-slate-900">
                Tạo thông báo gắn liên kết trực tiếp
              </div>

              {composeError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-bold text-rose-700">
                  {composeError}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">Tiêu đề thông báo</label>
                <input
                  type="text"
                  value={title}
                  maxLength={180}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="VD: Kiểm tra giữa kỳ môn Toán lúc 19h30"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">Nội dung chi tiết</label>
                <textarea
                  rows={3}
                  value={message}
                  maxLength={900}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Nhập lời nhắn để học sinh/giáo viên nắm thông tin và bấm vào đường dẫn..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700">Đối tượng nhận</label>
                  <select
                    value={recipientScope}
                    onChange={(e) =>
                      setRecipientScope(e.target.value as NotificationRecipientScope)
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-800"
                  >
                    <option value="students">Tất cả Học sinh</option>
                    <option value="all">Toàn hệ thống (GV & HS)</option>
                    <option value="class">Một Lớp học cụ thể</option>
                    <option value="teachers">Chỉ Giáo viên</option>
                  </select>
                </div>

                {recipientScope === 'class' && (
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-700">Chọn lớp nhận</label>
                    <select
                      value={targetClassForAudience}
                      onChange={(e) => setTargetClassForAudience(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-800"
                    >
                      {classrooms.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.students.length} HS)
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Link Target Picker */}
              <div className="p-3.5 rounded-2xl bg-blue-50/70 border border-blue-200 space-y-3">
                <div className="flex items-center gap-1.5 text-xs font-extrabold text-blue-900">
                  <Link2 className="w-3.5 h-3.5 text-blue-600" />
                  <span>Liên kết đến tin cần đến</span>
                </div>

                <select
                  value={linkType}
                  onChange={(e) => setLinkType(e.target.value as NotificationTargetType)}
                  className="w-full px-3 py-2 rounded-xl border border-blue-200 bg-white text-xs font-bold text-slate-800"
                >
                  <option value="exam">Đề thi cụ thể</option>
                  <option value="bundle">Tổ hợp thi liên môn</option>
                  <option value="course">Khóa học</option>
                  <option value="classroom">Lớp học / Bài tập về nhà</option>
                  <option value="game_room">Phòng Trò chơi Vượt chướng ngại vật</option>
                  <option value="none">Chỉ thông báo văn bản (không liên kết)</option>
                </select>

                {linkType === 'exam' && (
                  <select
                    value={selectedExamId}
                    onChange={(e) => setSelectedExamId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold"
                  >
                    {exams.map((ex) => (
                      <option key={ex.id} value={ex.id}>
                        {ex.title}
                      </option>
                    ))}
                  </select>
                )}

                {linkType === 'bundle' && (
                  <select
                    value={selectedBundleId}
                    onChange={(e) => setSelectedBundleId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold"
                  >
                    {bundles.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.title}
                      </option>
                    ))}
                  </select>
                )}

                {linkType === 'course' && (
                  <select
                    value={selectedCourseId}
                    onChange={(e) => setSelectedCourseId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold"
                  >
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title}
                      </option>
                    ))}
                  </select>
                )}

                {(linkType === 'classroom' || linkType === 'homework') && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <select
                      value={selectedClassroomId}
                      onChange={(e) => setSelectedClassroomId(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold"
                    >
                      {classrooms.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <select
                      value={selectedClassroomTab}
                      onChange={(e) =>
                        setSelectedClassroomTab(e.target.value as ClassroomTabRouteId)
                      }
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold"
                    >
                      <option value="homework">Tab Bài tập về nhà</option>
                      <option value="exams">Tab Đề thi lớp</option>
                      <option value="courses">Tab Khóa học lớp</option>
                      <option value="requests">Tab Yêu cầu vào lớp</option>
                      <option value="overview">Tab Tổng quan lớp</option>
                    </select>
                  </div>
                )}

                {linkType === 'game_room' && (
                  <input
                    type="text"
                    maxLength={6}
                    value={gameRoomCodeInput}
                    onChange={(e) => setGameRoomCodeInput(normalizeRoomCode(e.target.value))}
                    placeholder="Nhập mã phòng 6 ký tự (VD: AB12CD)"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-extrabold uppercase tracking-widest"
                  />
                )}
              </div>

              <button
                type="submit"
                disabled={sending}
                className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2 shadow-xs cursor-pointer"
              >
                <Send className="w-4 h-4" />
                {sending ? 'Đang gửi thông báo...' : 'Phát thông báo ngay'}
              </button>
            </form>
          ) : displayedList.length === 0 ? (
            <div className="py-16 px-6 text-center space-y-2.5 bg-white rounded-2xl border border-slate-200">
              <Bell className="w-10 h-10 text-slate-300 mx-auto" />
              <div className="text-sm font-extrabold text-slate-800">
                {panelTab === 'unread' ? 'Bạn đã đọc tất cả thông báo' : 'Chưa có thông báo nào'}
              </div>
              <p className="text-xs text-slate-500 max-w-xs mx-auto">
                Khi có đề thi mới, bài tập về nhà, điểm chấm hoặc lời mời vào phòng trò chơi, thông báo sẽ hiện tại đây kèm liên kết mở nhanh.
              </p>
            </div>
          ) : (
            displayedList.map((n) => {
              const isRead = readIds.has(n.id);
              const style = getCategoryStyle(n.category);
              const linkText = getTargetLinkText(n);
              const canDelete =
                !n.isDerived &&
                Boolean(
                  currentUser &&
                    (isMasterAdmin || n.senderUid === currentUser.uid)
                );

              return (
                <div
                  key={n.id}
                  data-testid={`notification-item-${n.id}`}
                  onClick={() => {
                    onMarkRead(n.id);
                    onNavigateNotification(n);
                  }}
                  className={`group relative rounded-2xl border p-4 transition-all cursor-pointer ${
                    isRead
                      ? 'bg-white border-slate-200 hover:border-slate-300'
                      : 'bg-blue-50/60 border-blue-300 hover:border-blue-400 shadow-2xs'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${style.bg}`}
                    >
                      {style.icon}
                    </div>

                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className={`px-2 py-0.5 rounded-md border text-[10px] font-extrabold ${style.badge}`}
                          >
                            {style.label}
                          </span>
                          {n.className && (
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-bold truncate max-w-[140px]">
                              {n.className}
                            </span>
                          )}
                          <span className="text-[11px] font-medium text-slate-400">
                            · {formatRelativeTimeVi(n.createdAt)}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {!isRead && (
                            <span
                              className="w-2.5 h-2.5 rounded-full bg-blue-600"
                              title="Chưa đọc"
                            />
                          )}
                          {canDelete && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                void deleteCloudNotification(n.id).catch(() => {});
                              }}
                              className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                              title="Xóa thông báo"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="text-sm font-extrabold text-slate-900 leading-snug">
                        {n.title}
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed">{n.message}</p>

                      <div className="pt-1 flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-[11px] font-semibold text-slate-400">
                          Từ: {n.senderName}
                        </span>

                        {linkText && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-600/10 group-hover:bg-blue-600 text-blue-700 group-hover:text-white text-[11px] font-extrabold transition-colors">
                            <Link2 className="w-3 h-3" />
                            <span>{linkText}</span>
                            <ArrowRight className="w-3 h-3" />
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
