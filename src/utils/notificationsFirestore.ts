import {
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Unsubscribe,
  where,
} from 'firebase/firestore';
import {
  auth,
  db,
  handleFirestoreError,
  MASTER_ADMIN_EMAIL_LOWER,
  OperationType,
} from './firebase';
import type {
  AppNotification,
  Classroom,
  ClassroomHomework,
  HomeworkSubmission,
  NotificationCategory,
  NotificationRecipientScope,
  NotificationTargetType,
  TeacherRoleRequest,
  UserAccount,
  UserRole,
} from '../types/exam';

const READ_STORAGE_PREFIX = 'edutest_read_notifs_v1_';

function getReadStorageKey(user?: UserAccount | null): string {
  const id = (user?.uid || user?.email || user?.id || 'guest')
    .toLowerCase()
    .replace(/[^a-z0-9_@.-]/g, '_');
  return `${READ_STORAGE_PREFIX}${id}`;
}

export function getReadNotificationIds(user?: UserAccount | null): Set<string> {
  try {
    const raw = localStorage.getItem(getReadStorageKey(user));
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr.map(String)) : new Set();
  } catch {
    return new Set();
  }
}

export function markNotificationAsRead(
  notificationId: string,
  user?: UserAccount | null
): Set<string> {
  const next = getReadNotificationIds(user);
  next.add(notificationId);
  try {
    localStorage.setItem(
      getReadStorageKey(user),
      JSON.stringify(Array.from(next).slice(-500))
    );
  } catch {
    // ignore storage quota errors
  }
  return next;
}

export function markAllNotificationsAsRead(
  notificationIds: string[],
  user?: UserAccount | null
): Set<string> {
  const next = getReadNotificationIds(user);
  notificationIds.forEach((id) => {
    if (id) next.add(id);
  });
  try {
    localStorage.setItem(
      getReadStorageKey(user),
      JSON.stringify(Array.from(next).slice(-500))
    );
  } catch {
    // ignore storage quota errors
  }
  return next;
}

function sanitizeNotificationId(raw?: string): string {
  const clean = String(raw || '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 120);
  if (clean) return clean;
  return `notif_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function mapDocToNotification(raw: Record<string, any>): AppNotification {
  let createdAtStr = typeof raw.createdAtStr === 'string' ? raw.createdAtStr : '';
  if (!createdAtStr && raw.createdAt && typeof raw.createdAt?.toDate === 'function') {
    createdAtStr = raw.createdAt.toDate().toISOString();
  }
  if (!createdAtStr) {
    createdAtStr = new Date().toISOString();
  }
  let updatedAtStr: string | undefined;
  if (raw.updatedAt && typeof raw.updatedAt?.toDate === 'function') {
    updatedAtStr = raw.updatedAt.toDate().toISOString();
  }
  return {
    id: String(raw.id || ''),
    title: String(raw.title || 'Thông báo'),
    message: String(raw.message || ''),
    category: (raw.category || 'system') as NotificationCategory,
    targetType: (raw.targetType || 'none') as NotificationTargetType,
    targetId: raw.targetId ? String(raw.targetId) : undefined,
    secondaryId: raw.secondaryId ? String(raw.secondaryId) : undefined,
    targetLabel: raw.targetLabel ? String(raw.targetLabel) : undefined,
    classId: raw.classId ? String(raw.classId) : undefined,
    className: raw.className ? String(raw.className) : undefined,
    actionPath: raw.actionPath ? String(raw.actionPath) : undefined,
    recipientScope: (raw.recipientScope || 'all') as NotificationRecipientScope,
    recipientEmails: Array.isArray(raw.recipientEmails)
      ? raw.recipientEmails.map((e: any) => String(e).trim().toLowerCase()).filter(Boolean)
      : undefined,
    senderUid: String(raw.senderUid || ''),
    senderName: String(raw.senderName || 'Hệ thống'),
    senderEmail: String(raw.senderEmail || ''),
    createdAt: createdAtStr,
    updatedAt: updatedAtStr,
    isDerived: false,
  };
}

export interface PublishNotificationInput {
  id?: string;
  title: string;
  message: string;
  category: NotificationCategory;
  targetType: NotificationTargetType;
  targetId?: string;
  secondaryId?: string;
  targetLabel?: string;
  classId?: string;
  className?: string;
  actionPath?: string;
  recipientScope: NotificationRecipientScope;
  recipientEmails?: string[];
  senderName?: string;
  senderEmail?: string;
}

export async function publishCloudNotification(
  input: PublishNotificationInput
): Promise<AppNotification | null> {
  const fbUser = auth.currentUser;
  if (!fbUser) return null;

  const id = sanitizeNotificationId(input.id);
  const nowIso = new Date().toISOString();
  const senderEmail = (
    fbUser.email ||
    input.senderEmail ||
    'system@edutest.local'
  )
    .trim()
    .toLowerCase()
    .slice(0, 180);
  const senderName = (
    input.senderName ||
    fbUser.displayName ||
    senderEmail.split('@')[0] ||
    'Giáo viên'
  )
    .trim()
    .slice(0, 150);

  const cleanRecipientEmails = Array.from(
    new Set(
      (input.recipientEmails || [])
        .map((e) => String(e || '').trim().toLowerCase())
        .filter((e) => e.length >= 3)
    )
  ).slice(0, 500);

  const payload: Record<string, any> = {
    id,
    title: String(input.title || 'Thông báo').trim().slice(0, 200),
    message: String(input.message || '').trim().slice(0, 1000) || 'Có cập nhật mới.',
    category: input.category,
    targetType: input.targetType,
    recipientScope: input.recipientScope,
    senderUid: fbUser.uid.slice(0, 128),
    senderName: senderName || 'Giáo viên',
    senderEmail: senderEmail.length >= 3 ? senderEmail : 'system@edutest.local',
    createdAtStr: nowIso,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (input.targetId) payload.targetId = String(input.targetId).slice(0, 128);
  if (input.secondaryId) payload.secondaryId = String(input.secondaryId).slice(0, 128);
  if (input.targetLabel) payload.targetLabel = String(input.targetLabel).slice(0, 200);
  if (input.classId) payload.classId = String(input.classId).slice(0, 128);
  if (input.className) payload.className = String(input.className).slice(0, 200);
  if (input.actionPath) payload.actionPath = String(input.actionPath).slice(0, 300);
  if (cleanRecipientEmails.length > 0) payload.recipientEmails = cleanRecipientEmails;

  try {
    await setDoc(doc(db, 'notifications', id), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `notifications/${id}`);
  }

  return {
    id,
    title: payload.title,
    message: payload.message,
    category: input.category,
    targetType: input.targetType,
    targetId: payload.targetId,
    secondaryId: payload.secondaryId,
    targetLabel: payload.targetLabel,
    classId: payload.classId,
    className: payload.className,
    actionPath: payload.actionPath,
    recipientScope: input.recipientScope,
    recipientEmails: cleanRecipientEmails.length > 0 ? cleanRecipientEmails : undefined,
    senderUid: payload.senderUid,
    senderName: payload.senderName,
    senderEmail: payload.senderEmail,
    createdAt: nowIso,
    isDerived: false,
  };
}

export async function deleteCloudNotification(notificationId: string): Promise<void> {
  const fbUser = auth.currentUser;
  if (!fbUser || !notificationId) return;
  const cleanId = sanitizeNotificationId(notificationId);
  try {
    await deleteDoc(doc(db, 'notifications', cleanId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `notifications/${cleanId}`);
  }
}

export function subscribeUserNotifications(params: {
  user: UserAccount | null;
  isTeacher: boolean;
  isAdmin: boolean;
  onUpdate: (items: AppNotification[]) => void;
  onError?: (err: unknown) => void;
}): () => void {
  const fbUser = auth.currentUser;
  if (!fbUser || fbUser.isAnonymous || !params.user) {
    params.onUpdate([]);
    return () => {};
  }

  const email = (fbUser.email || params.user.email || '').trim().toLowerCase();
  const bucketMap = new Map<string, Map<string, AppNotification>>();
  const unsubs: Unsubscribe[] = [];

  const emitMerged = () => {
    const merged = new Map<string, AppNotification>();
    bucketMap.forEach((subMap) => {
      subMap.forEach((item, id) => {
        merged.set(id, item);
      });
    });
    const sorted = Array.from(merged.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    params.onUpdate(sorted);
  };

  const attachBucket = (bucketKey: string, q: ReturnType<typeof query>) => {
    try {
      const u = onSnapshot(
        q,
        (snap) => {
          const map = new Map<string, AppNotification>();
          snap.docs.forEach((d) => {
            const rawData = (d.data() || {}) as Record<string, any>;
            const item = mapDocToNotification({ ...rawData, id: d.id });
            if (item.id) map.set(item.id, item);
          });
          bucketMap.set(bucketKey, map);
          emitMerged();
        },
        (err) => {
          if (params.onError) {
            params.onError(err);
          } else {
            try {
              handleFirestoreError(err, OperationType.LIST, 'notifications');
            } catch {
              // handled silently so UI doesn't crash on background listeners
            }
          }
        }
      );
      unsubs.push(u);
    } catch {
      // ignore setup errors
    }
  };

  if (params.isAdmin) {
    attachBucket('admin_all', query(collection(db, 'notifications'), limit(60)));
  } else {
    attachBucket(
      'scope_all',
      query(collection(db, 'notifications'), where('recipientScope', '==', 'all'), limit(30))
    );
    attachBucket(
      'scope_role',
      query(
        collection(db, 'notifications'),
        where('recipientScope', '==', params.isTeacher ? 'teachers' : 'students'),
        limit(30)
      )
    );
    if (email) {
      attachBucket(
        'recipient_email',
        query(
          collection(db, 'notifications'),
          where('recipientEmails', 'array-contains', email),
          limit(40)
        )
      );
    }
    if (params.isTeacher) {
      attachBucket(
        'sent_own',
        query(collection(db, 'notifications'), where('senderUid', '==', fbUser.uid), limit(25))
      );
    }
  }

  return () => {
    unsubs.forEach((u) => {
      try {
        u();
      } catch {
        // ignore
      }
    });
  };
}

export function buildDerivedNotifications(params: {
  currentUser: UserAccount | null;
  userRole: UserRole;
  isActualTeacher: boolean;
  isMasterAdmin: boolean;
  classrooms: Classroom[];
  homeworks: ClassroomHomework[];
  submissions: HomeworkSubmission[];
  teacherRequests: TeacherRoleRequest[];
}): AppNotification[] {
  const {
    currentUser,
    userRole,
    isActualTeacher,
    isMasterAdmin,
    classrooms,
    homeworks,
    submissions,
    teacherRequests,
  } = params;

  if (!currentUser) return [];

  const out: AppNotification[] = [];
  const emailLower = (currentUser.email || '').trim().toLowerCase();
  const uid = currentUser.uid || currentUser.id;
  const isTeacherActor = isActualTeacher && userRole === 'teacher';

  // 1. Master Admin / Teacher: pending teacher role elevation requests
  if (isTeacherActor && (isMasterAdmin || emailLower === MASTER_ADMIN_EMAIL_LOWER)) {
    const pendingTeacherReqs = teacherRequests.filter((r) => r.status === 'pending');
    if (pendingTeacherReqs.length > 0) {
      const latest = pendingTeacherReqs[0];
      out.push({
        id: `derived_teacher_reqs_${pendingTeacherReqs.length}_${latest.id}`,
        title: `${pendingTeacherReqs.length} yêu cầu xin quyền Giáo viên đang chờ duyệt`,
        message: `${latest.userName} (${latest.userEmail}) vừa gửi yêu cầu nâng quyền Giáo viên.`,
        category: 'teacher_request',
        targetType: 'teacher_requests',
        targetLabel: 'Mở danh sách duyệt quyền GV',
        recipientScope: 'teachers',
        senderUid: latest.userId || uid,
        senderName: latest.userName || 'Học viên',
        senderEmail: latest.userEmail || emailLower,
        createdAt: latest.createdAt || new Date().toISOString(),
        isDerived: true,
      });
    }
  }

  // 2. Teacher: pending classroom join requests & ungraded student homework submissions
  if (isTeacherActor) {
    const managedClasses = classrooms.filter(
      (c) =>
        isMasterAdmin ||
        c.teacherId === currentUser.id ||
        (c.teacherEmail && c.teacherEmail.toLowerCase() === emailLower)
    );

    managedClasses.forEach((cls) => {
      const pending = (cls.pendingRequests || []).filter((r) => r.status === 'pending');
      if (pending.length > 0) {
        const latestReq = pending[0];
        out.push({
          id: `derived_cls_req_${cls.id}_${pending.length}_${latestReq.id}`,
          title: `${pending.length} yêu cầu xin vào lớp ${cls.name}`,
          message: `${latestReq.studentName} đang chờ duyệt tham gia lớp ${cls.name}.`,
          category: 'classroom',
          targetType: 'classroom_requests',
          targetId: cls.id,
          secondaryId: 'requests',
          targetLabel: `Duyệt yêu cầu · ${cls.name}`,
          classId: cls.id,
          className: cls.name,
          recipientScope: 'teachers',
          senderUid: latestReq.studentId || uid,
          senderName: latestReq.studentName,
          senderEmail: latestReq.studentEmail || emailLower,
          createdAt: latestReq.createdAt || cls.updatedAt || cls.createdAt,
          isDerived: true,
        });
      }

      const clsHomeworks = homeworks.filter((h) => h.classId === cls.id);
      const clsHwIds = new Set(clsHomeworks.map((h) => h.id));
      const ungraded = submissions.filter(
        (s) =>
          (s.classId === cls.id || (s.homeworkId && clsHwIds.has(s.homeworkId))) &&
          !s.gradedAt
      );
      if (ungraded.length > 0) {
        const latestSub = ungraded[0];
        out.push({
          id: `derived_ungraded_${cls.id}_${ungraded.length}_${latestSub.id}`,
          title: `${ungraded.length} bài BTVN chờ chấm điểm · ${cls.name}`,
          message: `${latestSub.studentName} đã nộp "${latestSub.homeworkTitle || 'Bài tập về nhà'}".`,
          category: 'homework',
          targetType: 'homework',
          targetId: latestSub.homeworkId || cls.id,
          secondaryId: 'homework',
          targetLabel: `Chấm BTVN · ${cls.name}`,
          classId: cls.id,
          className: cls.name,
          recipientScope: 'teachers',
          senderUid: latestSub.studentId || uid,
          senderName: latestSub.studentName,
          senderEmail: latestSub.studentEmail || emailLower,
          createdAt: latestSub.submittedAt || new Date().toISOString(),
          isDerived: true,
        });
      }
    });
  }

  // 3. Student: enrolled class homeworks due / unsubmitted + graded homeworks
  if (!isTeacherActor) {
    const myClasses = classrooms.filter((cls) =>
      (cls.students || []).some(
        (s) =>
          s.id === currentUser.id ||
          (s.email && s.email.toLowerCase() === emailLower)
      )
    );
    const myClassMap = new Map(myClasses.map((c) => [c.id, c]));

    homeworks.forEach((hw) => {
      const cls = myClassMap.get(hw.classId);
      if (!cls) return;
      const mySub = submissions.find(
        (s) =>
          s.homeworkId === hw.id &&
          (s.studentId === currentUser.id ||
            (s.studentEmail && s.studentEmail.toLowerCase() === emailLower))
      );

      if (!mySub) {
        out.push({
          id: `derived_hw_todo_${hw.id}`,
          title: `Bài tập về nhà mới: ${hw.title}`,
          message: `Lớp ${cls.name} có bài tập về nhà cần hoàn thành${hw.closeTime ? ` (hạn ${hw.closeTime.replace('T', ' ')})` : ''}.`,
          category: 'homework',
          targetType: 'homework',
          targetId: hw.id,
          secondaryId: 'homework',
          targetLabel: `Mở BTVN · ${cls.name}`,
          classId: cls.id,
          className: cls.name,
          recipientScope: 'class',
          senderUid: cls.teacherId || uid,
          senderName: cls.teacherName || 'Giáo viên',
          senderEmail: cls.teacherEmail || emailLower,
          createdAt: hw.createdAt || new Date().toISOString(),
          isDerived: true,
        });
      } else if (mySub.gradedAt) {
        out.push({
          id: `derived_hw_graded_${mySub.id}_${mySub.gradedAt}`,
          title: `Đã có điểm BTVN: ${hw.title}`,
          message:
            typeof mySub.score === 'number'
              ? `Điểm của bạn: ${mySub.score}/${mySub.maxScore || hw.maxScore || 10}${mySub.teacherFeedback ? ` — "${mySub.teacherFeedback}"` : ''}`
              : `Giáo viên đã nhận xét bài làm của bạn.`,
          category: 'grade',
          targetType: 'grade',
          targetId: hw.id,
          secondaryId: 'homework',
          targetLabel: `Xem điểm · ${cls.name}`,
          classId: cls.id,
          className: cls.name,
          recipientScope: 'user',
          senderUid: cls.teacherId || uid,
          senderName: mySub.gradedBy || cls.teacherName || 'Giáo viên',
          senderEmail: cls.teacherEmail || emailLower,
          createdAt: mySub.gradedAt || mySub.submittedAt,
          isDerived: true,
        });
      }
    });
  }

  return out;
}
