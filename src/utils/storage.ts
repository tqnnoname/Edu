import { 
  Exam, 
  ExamBundle, 
  ExamResult, 
  UserExamState, 
  Classroom, 
  MicroCourse,
  CourseChapter,
  CourseLesson,
  LessonBlock,
  StudentCourseProgress,
  CustomSubject, 
  NavTabItem,
  FeedbackItem,
  UserAccount,
  TeacherRoleRequest,
  ClassJoinRequest,
  UserRole,
  StudentMember,
  HomeworkSubmission,
  ClassroomHomework,
  Scoreboard,
} from '../types/exam';
import { PRESET_EXAMS, PRESET_BUNDLES, SAMPLE_DEMO_EXAM } from '../data/presetExams';
import {
  clearCloudSyncCursor,
  clearCoursesFromCloudTombstones,
  computeStudentTeacherEmails,
  DirtyPushScope,
  fetchAllUsersAndCredentialsFromFirestore,
  fetchLiveUsersForDirectoryFromFirestore,
  fetchTeacherStudentCredentialsFromFirestore,
  FirestoreSyncSnapshot,
  getFirebaseAuthProviderIds,
  getFirebaseAuthUser,
  invalidateCourseDetailsCache,
  isCourseLegacyOrBloated,
  linkExistingStudentToTeacherCredentialsFirestore,
  linkGoogleAccountFirebase,
  loadCourseFullDetailsFromFirestore,
  lookupClassroomCodeInFirestore,
  migrateLegacyCourseToSubcollections,
  patchHomeworkSubmissionGradeInFirestore,
  provisionOrUpdateStudentFirebaseAuth,
  pullAuthenticatedDataFromFirestore,
  pullPublicDataFromFirestore,
  pushAuthorizedDataToFirestore,
  resolveEmailByIdentifierInFirestore,
  resolveOrCreateUnifiedUserProfile,
  safeDeleteFirestoreDoc,
  sanitizeDocId,
  scanRecoverableCloudCourses,
  sendPasswordResetEmailFirebase,
  signInWithEmailPasswordFirebase,
  signInWithGooglePopup,
  signOutFirebase,
  signUpWithEmailPasswordFirebase,
  submitJoinRequestToFirestore,
  syncJoinRequestDecisionToFirestore,
  syncSingleClassroomToFirestoreNow,
  syncSingleExamToFirestoreNow,
  syncUserCredentialToFirestore,
  updatePasswordFirebase,
} from './firebase';

const STORAGE_KEY_CUSTOM_EXAMS = 'edutest_custom_exams_v1';
const STORAGE_KEY_CUSTOM_BUNDLES = 'edutest_custom_bundles_v1';
const STORAGE_KEY_DELETED_EXAMS = 'edutest_deleted_exam_ids_v1';
const STORAGE_KEY_DELETED_BUNDLES = 'edutest_deleted_bundle_ids_v1';
const STORAGE_KEY_RESULTS = 'edutest_results_v1';
const STORAGE_KEY_ACTIVE_SESSION = 'edutest_active_session_v1';
const STORAGE_KEY_CLASSROOMS = 'edutest_classrooms_v1';
const STORAGE_KEY_COURSES = 'edutest_courses_v1';
const STORAGE_KEY_CUSTOM_SUBJECTS = 'edutest_custom_subjects_v1';
const STORAGE_KEY_NAV_TABS = 'edutest_nav_tabs_v1';
const STORAGE_KEY_ACTIVE_CLASS_ID = 'edutest_active_class_id_v1';
const STORAGE_KEY_FEEDBACKS = 'edutest_feedbacks_v1';
const LEGACY_STORAGE_KEY_USERS = 'edutest_users_v1';
const STORAGE_KEY_CURRENT_USER = 'edutest_current_user_v1';
const STORAGE_KEY_TEACHER_REQUESTS = 'edutest_teacher_requests_v1';
const STORAGE_KEY_DELETED_CLASSROOMS = 'edutest_deleted_classroom_ids_v1';
const STORAGE_KEY_DELETED_COURSES = 'edutest_deleted_course_ids_v1';
const LEGACY_STORAGE_KEY_DELETED_USERS = 'edutest_deleted_user_ids_v1';
const STORAGE_KEY_DELETED_RESULTS = 'edutest_deleted_result_ids_v1';
const STORAGE_KEY_HOMEWORK_SUBMISSIONS = 'edutest_homework_submissions_v1';
const STORAGE_KEY_DELETED_HOMEWORK = 'edutest_deleted_homework_ids_v1';
const STORAGE_KEY_CLASSROOM_HOMEWORKS = 'edutest_classroom_homeworks_v1';
const STORAGE_KEY_DELETED_CLASSROOM_HOMEWORKS = 'edutest_deleted_classroom_homework_ids_v1';
const STORAGE_KEY_DELETED_SUBJECTS = 'edutest_deleted_subject_ids_v1';
const STORAGE_KEY_SCOREBOARDS = 'edutest_scoreboards_v1';
const STORAGE_KEY_DELETED_SCOREBOARDS = 'edutest_deleted_scoreboard_ids_v1';
const STORAGE_KEY_MY_JOIN_REQUESTS = 'edutest_my_join_requests_v1';
const STORAGE_KEY_NAV_TABS_UPDATED_AT = 'edutest_nav_tabs_updated_at_v1';
const STORAGE_KEY_LIVE_TEXT_UPDATED_AT = 'edutest_live_text_updated_at_v1';

// --- Deleted IDs ---
function getDeletedIdsByKey(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function addDeletedIdByKey(key: string, id: string): void {
  try {
    const updated = Array.from(new Set([...getDeletedIdsByKey(key), id]));
    localStorage.setItem(key, JSON.stringify(updated));
  } catch {}
}

function removeDeletedIdByKey(key: string, id: string): void {
  try {
    const updated = getDeletedIdsByKey(key).filter((item) => item !== id);
    localStorage.setItem(key, JSON.stringify(updated));
  } catch {}
}

function getDeletedExamIds(): string[] {
  return getDeletedIdsByKey(STORAGE_KEY_DELETED_EXAMS);
}

function getDeletedBundleIds(): string[] {
  return getDeletedIdsByKey(STORAGE_KEY_DELETED_BUNDLES);
}

function getDeletedClassroomIds(): string[] {
  return getDeletedIdsByKey(STORAGE_KEY_DELETED_CLASSROOMS);
}

function getDeletedCourseIds(): string[] {
  return getDeletedIdsByKey(STORAGE_KEY_DELETED_COURSES);
}

function getDeletedResultIds(): string[] {
  return getDeletedIdsByKey(STORAGE_KEY_DELETED_RESULTS);
}

function getDeletedHomeworkIds(): string[] {
  return getDeletedIdsByKey(STORAGE_KEY_DELETED_HOMEWORK);
}

function getDeletedClassroomHomeworkIds(): string[] {
  return getDeletedIdsByKey(STORAGE_KEY_DELETED_CLASSROOM_HOMEWORKS);
}

function getDeletedSubjectIds(): string[] {
  return getDeletedIdsByKey(STORAGE_KEY_DELETED_SUBJECTS);
}

function getDeletedScoreboardIds(): string[] {
  return getDeletedIdsByKey(STORAGE_KEY_DELETED_SCOREBOARDS);
}

// --- 8-Digit Exam Code & Random Sampler Helpers ---
export function generate8DigitExamCode(): string {
  return Math.floor(10000000 + Math.random() * 90000000).toString();
}

export function generate8DigitBundleCode(): string {
  return Math.floor(50000000 + Math.random() * 40000000).toString();
}

export function ensureExamCode(exam: Exam): string {
  if (exam.examCode && /^\d{8}$/.test(exam.examCode)) {
    return exam.examCode;
  }
  let hash = 0;
  for (let i = 0; i < exam.id.length; i++) {
    hash = (hash * 31 + exam.id.charCodeAt(i)) % 90000000;
  }
  return (10000000 + Math.abs(hash)).toString();
}

export function ensureBundleCode(bundle: ExamBundle): string {
  if (bundle.bundleCode && /^\d{8}$/.test(bundle.bundleCode)) {
    return bundle.bundleCode;
  }
  let hash = 0;
  for (let i = 0; i < bundle.id.length; i++) {
    hash = (hash * 33 + bundle.id.charCodeAt(i)) % 40000000;
  }
  return (50000000 + Math.abs(hash)).toString();
}

/**
 * Định dạng Ngày Tháng Năm chuẩn Việt Nam: dd/MM/yyyy
 */
export function formatVietnameseDate(dateInput?: string | number | Date): string {
  if (!dateInput) return '';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return String(dateInput);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Định dạng Ngày Tháng Năm và Giờ chuẩn Việt Nam: dd/MM/yyyy HH:mm
 */
export function formatVietnameseDateTime(dateInput?: string | number | Date): string {
  if (!dateInput) return '';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return String(dateInput);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const mins = String(d.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${mins}`;
}

export function isItemScheduleOpen(
  item: { openTime?: string; closeTime?: string; status?: string },
  entityType: 'exam' | 'course' | 'homework' = 'exam'
): {
  isOpen: boolean;
  statusLabel: string;
  reason?: string;
} {
  const draftReason =
    entityType === 'course'
      ? 'Khóa học đang ở chế độ Bản nháp, chưa công bố.'
      : entityType === 'homework'
      ? 'Bài tập về nhà chưa được mở nộp.'
      : 'Đề/tổ hợp đang ở chế độ Bản nháp, chưa công bố.';

  const closedReason =
    entityType === 'course'
      ? 'Khóa học đã kết thúc / đã đóng.'
      : entityType === 'homework'
      ? 'Bài tập về nhà đã đóng nộp bài.'
      : 'Kỳ thi đã kết thúc / phòng thi đã đóng.';

  if (item.status === 'draft') {
    return { isOpen: false, statusLabel: 'Bản nháp', reason: draftReason };
  }
  if (item.status === 'closed') {
    return { isOpen: false, statusLabel: 'Đã đóng', reason: closedReason };
  }

  const now = new Date().getTime();
  if (item.openTime) {
    const openTs = new Date(item.openTime).getTime();
    if (!isNaN(openTs) && now < openTs) {
      const formatted = formatVietnameseDateTime(item.openTime);
      const beforeOpenReason =
        entityType === 'course'
          ? `Chưa đến thời điểm mở khóa học (Mở lúc: ${formatted}). Học sinh vui lòng quay lại đúng giờ!`
          : entityType === 'homework'
          ? `Chưa đến thời gian mở nộp bài tập về nhà (Mở lúc: ${formatted}).`
          : `Chưa đến thời điểm mở đề thi (Mở lúc: ${formatted}). Thí sinh vui lòng quay lại đúng giờ!`;
      return {
        isOpen: false,
        statusLabel: 'Chưa mở',
        reason: beforeOpenReason,
      };
    }
  }

  if (item.closeTime) {
    const closeTs = new Date(item.closeTime).getTime();
    if (!isNaN(closeTs) && now > closeTs) {
      const formatted = formatVietnameseDateTime(item.closeTime);
      const afterCloseReason =
        entityType === 'course'
          ? `Thời hạn mở khóa học đã kết thúc (Đóng lúc: ${formatted}).`
          : entityType === 'homework'
          ? `Đã hết hạn nộp bài tập về nhà (Đóng lúc: ${formatted}).`
          : `Thời hạn làm bài đã kết thúc (Đóng lúc: ${formatted}).`;
      return {
        isOpen: false,
        statusLabel: 'Đã hết hạn',
        reason: afterCloseReason,
      };
    }
  }

  return { isOpen: true, statusLabel: 'Đang mở' };
}

// Picks a random subset of questions while maintaining consistent point totals
export function instantiateExamWithRandomQuestions(exam: Exam, customCount?: number): Exam {
  const targetCount = customCount !== undefined && customCount > 0 
    ? customCount 
    : (exam.randomQuestionCount && exam.randomQuestionCount > 0 ? exam.randomQuestionCount : exam.questions.length);

  if (targetCount >= exam.questions.length || targetCount <= 0) {
    return exam;
  }

  // Shuffle and pick targetCount
  const shuffled = [...exam.questions].sort(() => 0.5 - Math.random());
  const selectedQuestions = shuffled.slice(0, targetCount);

  // Recalculate points so each question is weighted proportionally or evenly
  const originalTotal = exam.totalPoints || 10.0;
  const scaledQuestions = selectedQuestions.map((q) => ({
    ...q,
    points: Number((originalTotal / targetCount).toFixed(2)),
  }));

  return {
    ...exam,
    title: `${exam.title} (Bốc ${targetCount}/${exam.questions.length} câu ngẫu nhiên)`,
    questions: scaledQuestions,
    totalQuestions: targetCount,
    totalPoints: originalTotal,
  };
}

// Candidate Profile Storage
const STORAGE_KEY_CANDIDATE_PROFILE = 'edutest_candidate_profile_v1';

export interface CandidateProfile {
  fullName: string;
  studentCode?: string;
  classroom?: string;
  schoolName?: string;
}

export function getCandidateProfile(): CandidateProfile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CANDIDATE_PROFILE);
    return raw ? JSON.parse(raw) : { fullName: 'Thí sinh tự do', studentCode: '' };
  } catch {
    return { fullName: 'Thí sinh tự do', studentCode: '' };
  }
}

export function saveCandidateProfile(profile: CandidateProfile): void {
  try {
    localStorage.setItem(STORAGE_KEY_CANDIDATE_PROFILE, JSON.stringify(profile));
    markDirtyUserProfile();
    scheduleCloudSync();
  } catch (err) {
    console.error('Error saving candidate profile', err);
  }
}

export function doesResultBelongToUser(
  result: ExamResult,
  user: UserAccount | null,
  fallbackProfile?: CandidateProfile | null
): boolean {
  if (user) {
    const uid = user.id || user.uid;
    const uEmail = (user.email || '').trim().toLowerCase();
    if (result.userId && uid && result.userId === uid) return true;
    if (result.userEmail && uEmail && result.userEmail.trim().toLowerCase() === uEmail) return true;
    if (!result.userId && !result.userEmail) {
      if (user.studentCode && result.studentCode && result.studentCode.trim() === user.studentCode.trim()) return true;
      if (user.username && result.studentName && result.studentName.trim().toLowerCase() === user.username.trim().toLowerCase()) return true;
      if (user.fullName && result.studentName && result.studentName.trim().toLowerCase() === user.fullName.trim().toLowerCase()) return true;
    }
    return false;
  }
  if (!result.userId && !result.userEmail) {
    return true;
  }
  if (fallbackProfile?.studentCode && result.studentCode && result.studentCode === fallbackProfile.studentCode) {
    return true;
  }
  return false;
}

export function getUserAttemptCountForExam(
  examId: string,
  results: ExamResult[],
  user: UserAccount | null,
  fallbackProfile?: CandidateProfile | null
): number {
  return results.filter(
    (r) => r.examId === examId && doesResultBelongToUser(r, user, fallbackProfile)
  ).length;
}

export function getUserAttemptCountForBundle(
  bundle: ExamBundle,
  results: ExamResult[],
  user: UserAccount | null,
  fallbackProfile?: CandidateProfile | null
): number {
  const userResults = results.filter((r) => doesResultBelongToUser(r, user, fallbackProfile));
  if (userResults.length === 0) return 0;

  const taggedAttemptIds = new Set<string>();
  userResults.forEach((r) => {
    if (r.bundleId === bundle.id && r.bundleAttemptId) {
      taggedAttemptIds.add(r.bundleAttemptId);
    }
  });

  const legacyResults = userResults.filter((r) => !r.bundleAttemptId);
  let legacyCount = 0;
  if (bundle.compulsoryExamIds && bundle.compulsoryExamIds.length > 0) {
    const firstCompId = bundle.compulsoryExamIds[0];
    legacyCount = legacyResults.filter((r) => r.examId === firstCompId).length;
  } else if (bundle.examIds && bundle.examIds.length > 0) {
    if (bundle.selectionMode !== 'has_electives') {
      legacyCount = legacyResults.filter((r) => r.examId === bundle.examIds[0]).length;
    } else {
      legacyCount = Math.max(
        0,
        ...bundle.examIds.map((exId) => legacyResults.filter((r) => r.examId === exId).length)
      );
    }
  }

  return taggedAttemptIds.size + legacyCount;
}

// --- Exams Storage ---
export function getAllExams(): Exam[] {
  try {
    const deletedIds = new Set(getDeletedExamIds());
    const rawCustom = localStorage.getItem(STORAGE_KEY_CUSTOM_EXAMS);
    const customExams: Exam[] = rawCustom ? JSON.parse(rawCustom) : [];
    const all = [...PRESET_EXAMS, ...customExams];
    return all
      .filter((e) => !deletedIds.has(e.id))
      .map((e) => ({
        ...e,
        examCode: ensureExamCode(e),
      }));
  } catch (err) {
    console.error('Error reading custom exams from localStorage', err);
    return PRESET_EXAMS.map((e) => ({ ...e, examCode: ensureExamCode(e) }));
  }
}

export function getExamByCode(code: string): Exam | undefined {
  const cleanCode = code.trim();
  const all = getAllExams();
  return all.find((e) => e.examCode === cleanCode || e.id === cleanCode);
}

export function loadSampleDemoExam(): void {
  try {
    const deleted = getDeletedExamIds().filter((id) => id !== SAMPLE_DEMO_EXAM.id);
    localStorage.setItem(STORAGE_KEY_DELETED_EXAMS, JSON.stringify(deleted));
  } catch (e) {
    console.error(e);
  }
  saveCustomExam(SAMPLE_DEMO_EXAM);
}

export function deleteAllExams(): void {
  try {
    localStorage.removeItem(STORAGE_KEY_CUSTOM_EXAMS);
    const allPresetIds = PRESET_EXAMS.map((e) => e.id);
    if (SAMPLE_DEMO_EXAM) allPresetIds.push(SAMPLE_DEMO_EXAM.id);
    const curr = getDeletedExamIds();
    const updated = Array.from(new Set([...curr, ...allPresetIds]));
    localStorage.setItem(STORAGE_KEY_DELETED_EXAMS, JSON.stringify(updated));
    markDirtySiteConfig('tombstones');
    scheduleCloudSync();
  } catch (err) {
    console.error('Error deleting all exams', err);
  }
}

export function saveCustomExam(newExam: Exam): void {
  try {
    const wasDeleted = getDeletedExamIds().includes(newExam.id);
    if (wasDeleted) {
      removeDeletedIdByKey(STORAGE_KEY_DELETED_EXAMS, newExam.id);
      markDirtySiteConfig('tombstones');
    }
    const curUser = getCurrentUser();
    const stampedExam: Exam = {
      ...newExam,
      creatorId: newExam.creatorId || curUser?.id,
      creatorEmail: newExam.creatorEmail || curUser?.email,
      creatorName: newExam.creatorName || curUser?.fullName,
      updatedAt: new Date().toISOString(),
    };

    const raw = localStorage.getItem(STORAGE_KEY_CUSTOM_EXAMS);
    const customExams: Exam[] = raw ? JSON.parse(raw) : [];
    const updated = [stampedExam, ...customExams.filter((e) => e.id !== stampedExam.id)];
    localStorage.setItem(STORAGE_KEY_CUSTOM_EXAMS, JSON.stringify(updated));
    if (getFirebaseAuthUser()) {
      void syncSingleExamToFirestoreNow(stampedExam, getAllClassrooms(), curUser);
      try {
        saveSnapshotToIndexedDB(buildFullSyncPayload());
      } catch {}
      if (wasDeleted) {
        scheduleCloudSync();
      }
    } else {
      markDirtyCloudEntity('exams', stampedExam.id);
      scheduleCloudSync();
    }
  } catch (err) {
    console.error('Error saving custom exam', err);
  }
}

export function deleteCustomExam(examId: string): void {
  try {
    const deleted = Array.from(new Set([...getDeletedExamIds(), examId]));
    localStorage.setItem(STORAGE_KEY_DELETED_EXAMS, JSON.stringify(deleted));

    const raw = localStorage.getItem(STORAGE_KEY_CUSTOM_EXAMS);
    if (raw) {
      const customExams: Exam[] = JSON.parse(raw);
      const updated = customExams.filter((e) => e.id !== examId);
      localStorage.setItem(STORAGE_KEY_CUSTOM_EXAMS, JSON.stringify(updated));
    }
    void safeDeleteFirestoreDoc('exams', examId).catch(() => {});
    markDirtySiteConfig('tombstones');
    scheduleCloudSync();
  } catch (err) {
    console.error('Error deleting custom exam', err);
  }
}

// --- Bundles Storage ---
export function getAllBundles(): ExamBundle[] {
  try {
    const deletedIds = new Set(getDeletedBundleIds());
    const rawCustom = localStorage.getItem(STORAGE_KEY_CUSTOM_BUNDLES);
    const customBundles: ExamBundle[] = rawCustom ? JSON.parse(rawCustom) : [];
    const all = [...PRESET_BUNDLES, ...customBundles];
    return all
      .filter((b) => !deletedIds.has(b.id))
      .map((b) => ({
        ...b,
        bundleCode: ensureBundleCode(b),
      }));
  } catch (err) {
    console.error('Error reading bundles from localStorage', err);
    return PRESET_BUNDLES.map((b) => ({ ...b, bundleCode: ensureBundleCode(b) }));
  }
}

export function getBundleByCode(code: string): ExamBundle | undefined {
  const cleanCode = code.trim();
  const all = getAllBundles();
  return all.find((b) => b.bundleCode === cleanCode || b.id === cleanCode);
}

export function saveCustomBundle(newBundle: ExamBundle): void {
  try {
    const wasDeleted = getDeletedBundleIds().includes(newBundle.id);
    if (wasDeleted) {
      removeDeletedIdByKey(STORAGE_KEY_DELETED_BUNDLES, newBundle.id);
      markDirtySiteConfig('tombstones');
    }
    const curUser = getCurrentUser();
    const stampedBundle: ExamBundle = {
      ...newBundle,
      creatorId: newBundle.creatorId || curUser?.id,
      creatorEmail: newBundle.creatorEmail || curUser?.email,
      creatorName: newBundle.creatorName || curUser?.fullName,
      updatedAt: new Date().toISOString(),
    };

    const raw = localStorage.getItem(STORAGE_KEY_CUSTOM_BUNDLES);
    const customBundles: ExamBundle[] = raw ? JSON.parse(raw) : [];
    const updated = [stampedBundle, ...customBundles.filter((b) => b.id !== stampedBundle.id)];
    localStorage.setItem(STORAGE_KEY_CUSTOM_BUNDLES, JSON.stringify(updated));
    markDirtyCloudEntity('bundles', stampedBundle.id);
    scheduleCloudSync();
  } catch (err) {
    console.error('Error saving custom bundle', err);
  }
}

export function deleteCustomBundle(bundleId: string): void {
  try {
    const deleted = Array.from(new Set([...getDeletedBundleIds(), bundleId]));
    localStorage.setItem(STORAGE_KEY_DELETED_BUNDLES, JSON.stringify(deleted));

    const raw = localStorage.getItem(STORAGE_KEY_CUSTOM_BUNDLES);
    if (raw) {
      const customBundles: ExamBundle[] = JSON.parse(raw);
      const updated = customBundles.filter((b) => b.id !== bundleId);
      localStorage.setItem(STORAGE_KEY_CUSTOM_BUNDLES, JSON.stringify(updated));
    }
    void safeDeleteFirestoreDoc('bundles', bundleId).catch(() => {});
    markDirtySiteConfig('tombstones');
    scheduleCloudSync();
  } catch (err) {
    console.error('Error deleting custom bundle', err);
  }
}

// --- Exam Results Storage ---
export function getExamResults(): ExamResult[] {
  try {
    const deletedSet = new Set(getDeletedResultIds());
    const raw = localStorage.getItem(STORAGE_KEY_RESULTS);
    const list: ExamResult[] = raw ? JSON.parse(raw) : [];
    return list.filter((r) => !deletedSet.has(r.id));
  } catch (err) {
    console.error('Error reading exam results', err);
    return [];
  }
}

export function saveExamResult(result: ExamResult): void {
  try {
    const wasDeleted = getDeletedResultIds().includes(result.id);
    if (wasDeleted) {
      removeDeletedIdByKey(STORAGE_KEY_DELETED_RESULTS, result.id);
      markDirtySiteConfig('tombstones');
    }
    const stamped: ExamResult = {
      ...result,
      updatedAt: new Date().toISOString(),
    };
    const results = getExamResults();
    localStorage.setItem(STORAGE_KEY_RESULTS, JSON.stringify([stamped, ...results.filter((r) => r.id !== stamped.id)]));
    markDirtyCloudEntity('results', stamped.id);
    scheduleCloudSync();
  } catch (err) {
    console.error('Error saving exam result', err);
  }
}

export function deleteExamResult(resultId: string): void {
  try {
    addDeletedIdByKey(STORAGE_KEY_DELETED_RESULTS, resultId);
    const results = getExamResults();
    const updated = results.filter((r) => r.id !== resultId);
    localStorage.setItem(STORAGE_KEY_RESULTS, JSON.stringify(updated));
    void safeDeleteFirestoreDoc('results', resultId).catch(() => {});
    markDirtySiteConfig('tombstones');
    scheduleCloudSync();
  } catch (err) {
    console.error('Error deleting exam result', err);
  }
}

export function clearExamResults(): void {
  try {
    const existing = getExamResults();
    existing.forEach((r) => addDeletedIdByKey(STORAGE_KEY_DELETED_RESULTS, r.id));
    localStorage.removeItem(STORAGE_KEY_RESULTS);
    markDirtySiteConfig('tombstones');
    scheduleCloudSync();
  } catch (err) {
    console.error('Error clearing results', err);
  }
}

// --- Active Session ---
export function saveActiveSession(session: UserExamState | null): void {
  try {
    if (session) {
      localStorage.setItem(STORAGE_KEY_ACTIVE_SESSION, JSON.stringify(session));
    } else {
      localStorage.removeItem(STORAGE_KEY_ACTIVE_SESSION);
    }
  } catch (err) {
    console.error('Error saving active session', err);
  }
}

export function getActiveSession(): UserExamState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ACTIVE_SESSION);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    return null;
  }
}

// --- Custom Subjects Management ---
export const DEFAULT_SUBJECTS: CustomSubject[] = [
  { id: 'math', name: 'Toán học', code: 'TOAN', color: 'blue', iconName: 'Calculator', createdAt: '2026-01-01' },
  { id: 'english', name: 'Tiếng Anh', code: 'ANH', color: 'indigo', iconName: 'Languages', createdAt: '2026-01-01' },
  { id: 'physics', name: 'Vật lý', code: 'LY', color: 'teal', iconName: 'Atom', createdAt: '2026-01-01' },
  { id: 'chemistry', name: 'Hóa học', code: 'HOA', color: 'amber', iconName: 'FlaskConical', createdAt: '2026-01-01' },
  { id: 'biology', name: 'Sinh học', code: 'SINH', color: 'green', iconName: 'Dna', createdAt: '2026-01-01' },
  { id: 'history', name: 'Lịch sử', code: 'SU', color: 'rose', iconName: 'Landmark', createdAt: '2026-01-01' },
  { id: 'it', name: 'Tin học & CNTT', code: 'TIN', color: 'emerald', iconName: 'Terminal', createdAt: '2026-01-01' },
  { id: 'general', name: 'Khoa học Xã hội & Tổng hợp', code: 'TH', color: 'slate', iconName: 'BookOpen', createdAt: '2026-01-01' },
];

export function getAllSubjects(): CustomSubject[] {
  try {
    const deletedSet = new Set(getDeletedSubjectIds());
    const raw = localStorage.getItem(STORAGE_KEY_CUSTOM_SUBJECTS);
    if (!raw) {
      const initial = DEFAULT_SUBJECTS.filter((s) => !deletedSet.has(s.id));
      localStorage.setItem(STORAGE_KEY_CUSTOM_SUBJECTS, JSON.stringify(initial));
      return initial;
    }
    const parsed: CustomSubject[] = JSON.parse(raw);
    return parsed.filter((s) => s && s.id && !deletedSet.has(s.id));
  } catch (e) {
    console.error(e);
    return DEFAULT_SUBJECTS;
  }
}

export function saveSubject(subject: CustomSubject): void {
  try {
    const wasDeleted = getDeletedSubjectIds().includes(subject.id);
    if (wasDeleted) {
      removeDeletedIdByKey(STORAGE_KEY_DELETED_SUBJECTS, subject.id);
      markDirtySiteConfig('tombstones');
    }
    const list = getAllSubjects();
    const stamped: CustomSubject = {
      ...subject,
      updatedAt: new Date().toISOString(),
    };
    const updated = [stamped, ...list.filter((s) => s.id !== subject.id)];
    localStorage.setItem(STORAGE_KEY_CUSTOM_SUBJECTS, JSON.stringify(updated));
    markDirtySiteConfig('subjects');
    scheduleCloudSync();
  } catch (e) {
    console.error(e);
  }
}

export function updateSubjectName(subjectId: string, newName: string): void {
  try {
    const nowIso = new Date().toISOString();
    const list = getAllSubjects();
    const updated = list.map((s) => (s.id === subjectId ? { ...s, name: newName, updatedAt: nowIso } : s));
    localStorage.setItem(STORAGE_KEY_CUSTOM_SUBJECTS, JSON.stringify(updated));
    markDirtySiteConfig('subjects');
    scheduleCloudSync();
  } catch (e) {
    console.error(e);
  }
}

export function deleteSubject(subjectId: string): void {
  try {
    addDeletedIdByKey(STORAGE_KEY_DELETED_SUBJECTS, subjectId);
    const list = getAllSubjects();
    const updated = list.filter((s) => s.id !== subjectId);
    localStorage.setItem(STORAGE_KEY_CUSTOM_SUBJECTS, JSON.stringify(updated));
    markDirtySiteConfig('subjects');
    markDirtySiteConfig('tombstones');
    scheduleCloudSync();
  } catch (e) {
    console.error(e);
  }
}

// --- Customizable Navigation Tabs ---
const STORAGE_KEY_GAMES_TAB_MIGRATED = 'edutest_games_tab_migrated_v1';

export const DEFAULT_NAV_TABS: NavTabItem[] = [
  { id: 'tab_single', label: 'Đề thi theo môn', iconName: 'book', targetView: 'single', isDefault: true },
  { id: 'tab_bundle', label: 'Tổ hợp liên môn', iconName: 'layers', targetView: 'bundle', isDefault: true },
  { id: 'tab_classes', label: 'Lớp học & Xếp hạng', iconName: 'users', targetView: 'classrooms', isDefault: true },
  { id: 'tab_courses', label: 'Khóa học lý thuyết', iconName: 'graduation', targetView: 'courses', isDefault: true },
  { id: 'tab_games', label: 'Trò chơi', iconName: 'gamepad', targetView: 'games', badgeText: 'MỚI', isDefault: true },
  { id: 'tab_analytics', label: 'Năng lực cá nhân', iconName: 'chart', targetView: 'analytics', isDefault: true },
  { id: 'tab_history', label: 'Lịch sử thi', iconName: 'clock', targetView: 'history', isDefault: true },
];

const DEFAULT_GAMES_TAB: NavTabItem = {
  id: 'tab_games',
  label: 'Trò chơi',
  iconName: 'gamepad',
  targetView: 'games',
  badgeText: 'MỚI',
  isDefault: true,
};

function injectGamesTabIfNeeded(tabs: NavTabItem[]): { tabs: NavTabItem[]; injected: boolean } {
  const hasGames = tabs.some((t) => t.targetView === 'games' || t.id === 'tab_games');
  if (hasGames || localStorage.getItem(STORAGE_KEY_GAMES_TAB_MIGRATED) === '1') {
    if (hasGames) {
      localStorage.setItem(STORAGE_KEY_GAMES_TAB_MIGRATED, '1');
    }
    return { tabs, injected: false };
  }
  const next = [...tabs];
  const coursesIdx = next.findIndex((t) => t.targetView === 'courses' || t.id === 'tab_courses');
  if (coursesIdx >= 0) {
    next.splice(coursesIdx + 1, 0, DEFAULT_GAMES_TAB);
  } else {
    next.push(DEFAULT_GAMES_TAB);
  }
  localStorage.setItem(STORAGE_KEY_GAMES_TAB_MIGRATED, '1');
  return { tabs: next, injected: true };
}

export function getNavTabs(): NavTabItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_NAV_TABS);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY_NAV_TABS, JSON.stringify(DEFAULT_NAV_TABS));
      localStorage.setItem(STORAGE_KEY_GAMES_TAB_MIGRATED, '1');
      return DEFAULT_NAV_TABS;
    }
    const parsed: NavTabItem[] = JSON.parse(raw);
    // Bỏ lập trình thi đấu (oj) và đấu trường 1-1 (battle), cập nhật tên tab Năng lực cá nhân
    let changed = false;
    const filtered = parsed
      .filter((t) => {
        const tv = (t as any).targetView;
        const keep = tv !== 'oj' && t.id !== 'tab_oj' && tv !== 'battle' && t.id !== 'tab_battle';
        if (!keep) changed = true;
        return keep;
      })
      .map((t) => {
        if (t.id === 'tab_analytics' && t.label === 'Thống kê học lực') {
          changed = true;
          return { ...t, label: 'Năng lực cá nhân' };
        }
        return t;
      });
    const migrated = injectGamesTabIfNeeded(filtered);
    if (changed || migrated.injected) {
      localStorage.setItem(STORAGE_KEY_NAV_TABS, JSON.stringify(migrated.tabs));
    }
    return migrated.tabs.length > 0 ? migrated.tabs : DEFAULT_NAV_TABS;
  } catch (e) {
    console.error(e);
    return DEFAULT_NAV_TABS;
  }
}

export function saveNavTabs(tabs: NavTabItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_NAV_TABS, JSON.stringify(tabs));
    localStorage.setItem(STORAGE_KEY_NAV_TABS_UPDATED_AT, new Date().toISOString());
    markDirtySiteConfig('navTabs');
    scheduleCloudSync();
  } catch (e) {
    console.error(e);
  }
}

export function resetDefaultNavTabs(): NavTabItem[] {
  localStorage.setItem(STORAGE_KEY_NAV_TABS, JSON.stringify(DEFAULT_NAV_TABS));
  localStorage.setItem(STORAGE_KEY_NAV_TABS_UPDATED_AT, new Date().toISOString());
  markDirtySiteConfig('navTabs');
  scheduleCloudSync();
  return DEFAULT_NAV_TABS;
}

// --- Classrooms Storage ---
export const DEFAULT_CLASSROOMS: Classroom[] = [];

function sanitizeClassroomStudents(cls: Classroom): Classroom {
  if (!cls || !Array.isArray(cls.students)) return cls;
  let changed = false;
  const cleanStudents = cls.students.map((s) => {
    if (s && ('password' in (s as any) || 'username' in (s as any))) {
      changed = true;
      const copy: any = { ...s };
      delete copy.password;
      delete copy.username;
      return copy as StudentMember;
    }
    return s;
  });

  let cleanPending = cls.pendingRequests;
  if (Array.isArray(cls.pendingRequests) && cls.pendingRequests.length > 0) {
    const memberIds = new Set(cleanStudents.map((s) => String(s?.id || '').trim()).filter(Boolean));
    const memberEmails = new Set(
      cleanStudents.map((s) => String(s?.email || '').trim().toLowerCase()).filter(Boolean)
    );
    const memberCodes = new Set(
      cleanStudents.map((s) => String(s?.studentCode || '').trim().toUpperCase()).filter(Boolean)
    );
    const filteredPending = cls.pendingRequests.filter((r) => {
      if (!r) return false;
      if (r.status && r.status !== 'pending') return false;
      const rId = String(r.studentId || '').trim();
      const rEmail = String(r.studentEmail || '').trim().toLowerCase();
      const rCode = String(r.studentCode || '').trim().toUpperCase();
      if (rId && memberIds.has(rId)) return false;
      if (rEmail && memberEmails.has(rEmail)) return false;
      if (rCode && memberCodes.has(rCode)) return false;
      return true;
    });
    if (filteredPending.length !== cls.pendingRequests.length) {
      changed = true;
      cleanPending = filteredPending;
    }
  }

  return changed ? { ...cls, students: cleanStudents, pendingRequests: cleanPending } : cls;
}

function purgeLegacyLocalCredentials(): void {
  try {
    localStorage.removeItem(LEGACY_STORAGE_KEY_USERS);
    localStorage.removeItem(LEGACY_STORAGE_KEY_DELETED_USERS);
  } catch {}
}

export function getAllClassrooms(): Classroom[] {
  try {
    purgeLegacyLocalCredentials();
    const raw = localStorage.getItem(STORAGE_KEY_CLASSROOMS);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY_CLASSROOMS, JSON.stringify([]));
      return [];
    }
    const deletedIds = new Set(getDeletedClassroomIds());
    const parsed: Classroom[] = JSON.parse(raw);
    const filtered = parsed
      .filter((c) => c.id !== 'class_12a1' && c.id !== 'class_11b2' && !deletedIds.has(c.id))
      .map(sanitizeClassroomStudents);
    if (filtered.length !== parsed.length || filtered.some((c, idx) => c !== parsed[idx])) {
      localStorage.setItem(STORAGE_KEY_CLASSROOMS, JSON.stringify(filtered));
    }
    return filtered;
  } catch (e) {
    console.error(e);
    return [];
  }
}

export function saveClassroom(
  classroom: Classroom,
  options?: { skipCloudSync?: boolean }
): void {
  try {
    const wasDeleted = getDeletedClassroomIds().includes(classroom.id);
    if (wasDeleted) {
      removeDeletedIdByKey(STORAGE_KEY_DELETED_CLASSROOMS, classroom.id);
      markDirtySiteConfig('tombstones');
    }
    const curUser = getCurrentUser();
    const stampedClassroom: Classroom = sanitizeClassroomStudents({
      ...classroom,
      teacherId: classroom.teacherId || curUser?.id,
      teacherEmail: classroom.teacherEmail || curUser?.email,
      teacherName: classroom.teacherName || curUser?.fullName || '',
      updatedAt: new Date().toISOString(),
    });
    const list = getAllClassrooms();
    const updated = [stampedClassroom, ...list.filter((c) => c.id !== stampedClassroom.id)];
    localStorage.setItem(STORAGE_KEY_CLASSROOMS, JSON.stringify(updated));
    if (!options?.skipCloudSync) {
      markDirtyCloudEntity('classrooms', stampedClassroom.id);
      scheduleCloudSync();
    } else {
      try {
        saveSnapshotToIndexedDB(buildFullSyncPayload());
      } catch {}
    }
  } catch (e) {
    console.error(e);
  }
}

export function deleteClassroom(classroomId: string): void {
  try {
    addDeletedIdByKey(STORAGE_KEY_DELETED_CLASSROOMS, classroomId);
    const list = getAllClassrooms();
    const updated = list.filter((c) => c.id !== classroomId);
    localStorage.setItem(STORAGE_KEY_CLASSROOMS, JSON.stringify(updated));
    if (getActiveClassId() === classroomId) {
      setActiveClassId(updated[0]?.id || '');
    }
    void safeDeleteFirestoreDoc('classrooms', classroomId).catch(() => {});
    markDirtySiteConfig('tombstones');
    scheduleCloudSync();
  } catch (e) {
    console.error(e);
  }
}

export function getActiveClassId(): string {
  return localStorage.getItem(STORAGE_KEY_ACTIVE_CLASS_ID) || '';
}

export function setActiveClassId(classId: string): void {
  localStorage.setItem(STORAGE_KEY_ACTIVE_CLASS_ID, classId);
}

const STORAGE_KEY_COURSE_PROGRESS = 'edutest_course_progress_v2';

// --- Micro-Courses (Khóa học: Chương, Bài học & Câu hỏi tương tác + SCORM) Storage ---
export const DEFAULT_COURSES: MicroCourse[] = [];

export function getAllCourses(): MicroCourse[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_COURSES);
    if (!raw) {
      return [];
    }
    const deletedIds = new Set(getDeletedCourseIds());
    const parsed: MicroCourse[] = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const withoutPresets = parsed.filter(
      (c) => c && c.id && c.id !== 'course_ham_so_12' && c.id !== 'course_grammar_fast'
    );
    if (withoutPresets.length !== parsed.length) {
      localStorage.setItem(STORAGE_KEY_COURSES, JSON.stringify(withoutPresets));
    }
    const filtered = withoutPresets.filter((c) => !deletedIds.has(c.id));
    return filtered.map((c) => {
      if (c.schemaVersion === 2 && c.detailsLoaded === false) {
        return {
          ...c,
          chapters: Array.isArray(c.chapters) ? c.chapters : [],
          lessons: Array.isArray(c.lessons) ? c.lessons : [],
        };
      }
      if (!c.chapters || c.chapters.length === 0) {
        if (c.lessons && c.lessons.length > 0) {
          return {
            ...c,
            chapters: [
              {
                id: 'chap_' + c.id + '_default',
                title: 'Chương 1: Các bài học trọng tâm',
                order: 1,
                lessons: c.lessons,
              },
            ],
          };
        }
      }
      return c;
    });
  } catch (e) {
    console.error(e);
    return [];
  }
}

export function saveCourse(course: MicroCourse): void {
  try {
    const wasDeleted = getDeletedCourseIds().includes(course.id);
    if (wasDeleted) {
      removeDeletedIdByKey(STORAGE_KEY_DELETED_COURSES, course.id);
      markDirtySiteConfig('tombstones');
    }
    const curUser = getCurrentUser();
    const chapters = Array.isArray(course.chapters) ? course.chapters : [];
    const chapCount = chapters.length > 0 ? chapters.length : course.lessons?.length ? 1 : 0;
    const lesCount =
      chapters.length > 0
        ? chapters.reduce((sum, ch) => sum + (ch.lessons?.length || 0), 0)
        : course.lessons?.length || 0;

    const stampedCourse: MicroCourse = {
      ...course,
      schemaVersion: 2,
      chapterCount: chapCount,
      lessonCount: lesCount,
      detailsLoaded: true,
      creatorId: course.creatorId || curUser?.id,
      creatorEmail: course.creatorEmail || curUser?.email,
      creatorName: course.creatorName || curUser?.fullName,
      updatedAt: new Date().toISOString(),
    };
    const list = getAllCourses();
    const updated = [stampedCourse, ...list.filter((c) => c.id !== stampedCourse.id)];
    localStorage.setItem(STORAGE_KEY_COURSES, JSON.stringify(updated));
    invalidateCourseDetailsCache(stampedCourse.id);
    if (stampedCourse.visibility === 'class' && stampedCourse.assignedClassId) {
      syncClassAssignmentForItem('course', stampedCourse.id, stampedCourse.visibility, stampedCourse.assignedClassId);
      markDirtyCloudEntity('classrooms', stampedCourse.assignedClassId);
    }
    markDirtyCloudEntity('courses', stampedCourse.id);
    scheduleCloudSync();
  } catch (e) {
    console.error(e);
  }
}

export function applyHydratedCourseToLocalCache(hydratedCourse: MicroCourse): void {
  try {
    if (!hydratedCourse?.id) return;
    const list = getAllCourses();
    const exists = list.some((c) => c.id === hydratedCourse.id);
    const updated = exists
      ? list.map((c) => (c.id === hydratedCourse.id ? hydratedCourse : c))
      : [hydratedCourse, ...list];
    localStorage.setItem(STORAGE_KEY_COURSES, JSON.stringify(updated));
    try {
      saveSnapshotToIndexedDB(buildFullSyncPayload());
    } catch {}
  } catch (e) {
    console.warn('[applyHydratedCourseToLocalCache] error:', e);
  }
}

export async function ensureCourseHydrated(
  courseId: string,
  baseCourse?: MicroCourse | null,
  forceRefresh?: boolean
): Promise<MicroCourse | null> {
  const localCourse = baseCourse || getAllCourses().find((c) => c.id === courseId) || null;
  if (!forceRefresh && localCourse && localCourse.detailsLoaded === true) {
    return localCourse;
  }
  const fbUser = getFirebaseAuthUser();
  if (!fbUser) {
    if (localCourse) {
      return { ...localCourse, detailsLoaded: true };
    }
    return null;
  }
  const hydrated = await loadCourseFullDetailsFromFirestore(courseId, localCourse, { forceRefresh });
  if (hydrated) {
    applyHydratedCourseToLocalCache(hydrated);
  }
  return hydrated || localCourse;
}

export async function migrateCourseToV2Subcollections(
  course: MicroCourse
): Promise<{ ok: boolean; course: MicroCourse; migratedMediaCount: number; error?: string }> {
  const res = await migrateLegacyCourseToSubcollections(course, getAllClassrooms(), getCurrentUser());
  if (res.ok && res.course) {
    applyHydratedCourseToLocalCache(res.course);
  }
  return res;
}

export async function migrateAllLegacyCourses(): Promise<{
  total: number;
  migrated: number;
  failed: number;
  errors: string[];
}> {
  const curUser = getCurrentUser();
  const isAdmin = isMasterAdminUser(curUser);
  const candidates = getAllCourses().filter((c) => {
    if (!isCourseLegacyOrBloated(c)) return false;
    if (isAdmin) return true;
    const ue = (curUser?.email || '').trim().toLowerCase();
    return Boolean(
      (curUser?.id && c.creatorId === curUser.id) ||
        (ue && c.creatorEmail && c.creatorEmail.trim().toLowerCase() === ue)
    );
  });
  let migrated = 0;
  let failed = 0;
  const errors: string[] = [];
  for (const c of candidates) {
    const res = await migrateCourseToV2Subcollections(c);
    if (res.ok) {
      migrated++;
    } else {
      failed++;
      if (res.error) errors.push(`${c.title}: ${res.error}`);
    }
  }
  return { total: candidates.length, migrated, failed, errors };
}

export function deleteCourse(courseId: string): void {
  try {
    addDeletedIdByKey(STORAGE_KEY_DELETED_COURSES, courseId);
    invalidateCourseDetailsCache(courseId);
    const list = getAllCourses();
    const updated = list.filter((c) => c.id !== courseId);
    localStorage.setItem(STORAGE_KEY_COURSES, JSON.stringify(updated));

    // Remove courseId from all classrooms
    const classes = getAllClassrooms();
    let changedClasses = false;
    const nextClasses = classes.map((c) => {
      if (c.assignedCourseIds?.includes(courseId)) {
        changedClasses = true;
        markDirtyCloudEntity('classrooms', c.id);
        return {
          ...c,
          assignedCourseIds: c.assignedCourseIds.filter((id) => id !== courseId),
        };
      }
      return c;
    });
    if (changedClasses) {
      localStorage.setItem(STORAGE_KEY_CLASSROOMS, JSON.stringify(nextClasses));
    }
    void safeDeleteFirestoreDoc('courses', courseId).catch(() => {});
    markDirtySiteConfig('tombstones');
    scheduleCloudSync();
  } catch (e) {
    console.error(e);
  }
}

export function syncClassAssignmentForItem(
  type: 'exam' | 'course',
  itemId: string,
  visibility?: string,
  assignedClassId?: string
): void {
  try {
    const classes = getAllClassrooms();
    let changed = false;
    const updated = classes.map((c) => {
      const isTarget = visibility === 'class' && assignedClassId === c.id;
      if (type === 'exam') {
        const list = c.assignedExamIds || [];
        if (isTarget && !list.includes(itemId)) {
          changed = true;
          return { ...c, assignedExamIds: [...list, itemId] };
        }
      } else {
        const list = c.assignedCourseIds || [];
        if (isTarget && !list.includes(itemId)) {
          changed = true;
          return { ...c, assignedCourseIds: [...list, itemId] };
        }
      }
      return c;
    });
    if (changed) {
      localStorage.setItem(STORAGE_KEY_CLASSROOMS, JSON.stringify(updated));
    }
  } catch (e) {
    console.error(e);
  }
}

// --- Helper lấy toàn bộ bài học & khối nội dung trong khóa học (SCORM) ---
export function getAllLessonsFromCourse(course: MicroCourse): CourseLesson[] {
  const allLessons: CourseLesson[] = [];
  if (course.chapters && course.chapters.length > 0) {
    course.chapters.forEach((chap) => {
      (chap.lessons || []).forEach((les) => allLessons.push(les));
    });
  } else if (course.lessons && course.lessons.length > 0) {
    allLessons.push(...course.lessons);
  }
  return allLessons;
}

export function getCourseTrackingUnits(course: MicroCourse): { unitId: string; lessonId: string; isQuestion: boolean }[] {
  const lessons = getAllLessonsFromCourse(course);
  const units: { unitId: string; lessonId: string; isQuestion: boolean }[] = [];
  lessons.forEach((les) => {
    const blocks = les.blocks || [];
    if (blocks.length > 0) {
      blocks.forEach((blk) => {
        units.push({
          unitId: blk.id,
          lessonId: les.id,
          isQuestion: blk.type === 'question',
        });
      });
    } else {
      // Bài học chưa có khối nội dung vẫn tính là 1 đơn vị
      units.push({
        unitId: `lesson_unit_${les.id}`,
        lessonId: les.id,
        isQuestion: false,
      });
    }
  });
  return units;
}

export function syncCourseScormState(
  course: MicroCourse,
  progress: StudentCourseProgress
): StudentCourseProgress {
  if (course.schemaVersion === 2 && course.detailsLoaded === false) {
    return progress;
  }
  const units = getCourseTrackingUnits(course);
  const completedBlockSet = new Set(progress.completedBlockIds || []);
  const completedLessonsSet = new Set(progress.completedLessonIds || []);

  // Đối với khối câu hỏi: chỉ công nhận hoàn thành khi ĐÃ KIỂM TRA ĐÚNG HẾT (isCorrect === true)
  // Đối với bài học không có khối nội dung: giữ hoàn thành nếu lesson đã hoàn thành
  units.forEach((u) => {
    if (u.isQuestion) {
      const ans = progress.interactiveAnswers?.[u.unitId];
      if (ans?.isCorrect === true) {
        completedBlockSet.add(u.unitId);
      } else if (ans && ans.isCorrect === false) {
        completedBlockSet.delete(u.unitId);
      }
    } else if (u.unitId.startsWith('lesson_unit_') && completedLessonsSet.has(u.lessonId)) {
      completedBlockSet.add(u.unitId);
    }
  });

  // Chỉ công nhận hoàn thành bài học khi TẤT CẢ các khối trong bài học đã hoàn thành
  const allLessons = getAllLessonsFromCourse(course);
  const syncedCompletedLessons = new Set<string>();
  allLessons.forEach((les) => {
    const blocks = les.blocks || [];
    if (blocks.length > 0) {
      if (blocks.every((b) => completedBlockSet.has(b.id))) {
        syncedCompletedLessons.add(les.id);
      }
    } else if (
      completedLessonsSet.has(les.id) ||
      completedBlockSet.has(`lesson_unit_${les.id}`)
    ) {
      syncedCompletedLessons.add(les.id);
    }
  });

  const totalUnits = units.length;
  const completedCount = units.filter((u) => completedBlockSet.has(u.unitId)).length;
  const pct = totalUnits > 0 ? Math.min(100, Math.round((completedCount / totalUnits) * 100)) : 0;

  // Điểm câu hỏi tương tác
  const answerVals = Object.values(progress.interactiveAnswers || {});
  const scoreRaw =
    answerVals.length > 0
      ? Math.round((answerVals.filter((a) => a.isCorrect).length / answerVals.length) * 100)
      : pct;

  let lessonStatus: 'not attempted' | 'incomplete' | 'completed' | 'passed' = 'not attempted';
  if (pct >= 100) {
    lessonStatus = answerVals.length > 0 && scoreRaw >= 50 ? 'passed' : 'completed';
  } else if (pct > 0 || completedCount > 0) {
    lessonStatus = 'incomplete';
  }

  return {
    ...progress,
    completedBlockIds: Array.from(completedBlockSet),
    completedLessonIds: Array.from(syncedCompletedLessons),
    scormData: {
      lessonStatus,
      lessonLocation: progress.currentLessonId || allLessons[0]?.id || '',
      scoreRaw,
      totalBlocksCompleted: completedCount,
      totalBlocksCount: totalUnits,
      suspendData: JSON.stringify({
        completedBlocks: Array.from(completedBlockSet),
        completedLessons: Array.from(syncedCompletedLessons),
        pct,
      }),
    },
  };
}

// --- Tiến độ học tập của học sinh trong khóa học (Course Progress Tracking + SCORM) ---
export function getStudentCourseProgress(courseId: string, studentId: string): StudentCourseProgress {
  try {
    const key = `${STORAGE_KEY_COURSE_PROGRESS}_${studentId}_${courseId}`;
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        completedBlockIds: [],
        ...parsed,
      };
    }
  } catch (e) {
    console.error(e);
  }

  return {
    courseId,
    studentId,
    completedLessonIds: [],
    completedBlockIds: [],
    currentBlockIdsByLesson: {},
    interactiveAnswers: {},
    completedExamIds: [],
    scormData: {
      lessonStatus: 'not attempted',
      scoreRaw: 0,
      totalBlocksCompleted: 0,
      totalBlocksCount: 0,
    },
    lastStudiedAt: new Date().toISOString(),
  };
}

export function saveStudentCourseProgress(
  progress: StudentCourseProgress,
  options?: { isLocationOnly?: boolean }
): void {
  try {
    const key = `${STORAGE_KEY_COURSE_PROGRESS}_${progress.studentId}_${progress.courseId}`;
    localStorage.setItem(key, JSON.stringify(progress));
    markDirtyCloudEntity('courseProgress', key);
    if (options?.isLocationOnly) {
      scheduleLocationCloudSync();
    } else {
      scheduleCloudSync();
    }
  } catch (e) {
    console.error(e);
  }
}

export function setStudentCourseLocation(
  course: MicroCourse,
  studentId: string,
  chapterId?: string,
  lessonId?: string,
  blockId?: string
): StudentCourseProgress {
  const current = getStudentCourseProgress(course.id, studentId);
  const nextBlockMap = { ...(current.currentBlockIdsByLesson || {}) };
  if (lessonId && blockId) {
    nextBlockMap[lessonId] = blockId;
  }
  const next = syncCourseScormState(course, {
    ...current,
    currentChapterId: chapterId ?? current.currentChapterId,
    currentLessonId: lessonId ?? current.currentLessonId,
    currentBlockIdsByLesson: nextBlockMap,
    lastStudiedAt: new Date().toISOString(),
  });
  saveStudentCourseProgress(next, { isLocationOnly: true });
  return next;
}

export function markBlockCompleted(
  course: MicroCourse,
  studentId: string,
  blockId: string,
  lessonId?: string,
  chapterId?: string,
  completed: boolean = true
): StudentCourseProgress {
  const current = getStudentCourseProgress(course.id, studentId);
  const blockSet = new Set(current.completedBlockIds || []);
  const lessonSet = new Set(current.completedLessonIds || []);

  if (completed) {
    blockSet.add(blockId);
  } else {
    blockSet.delete(blockId);
    if (lessonId) lessonSet.delete(lessonId);
  }

  const nextBlockMap = { ...(current.currentBlockIdsByLesson || {}) };
  if (lessonId && blockId) {
    nextBlockMap[lessonId] = blockId;
  }

  const next = syncCourseScormState(course, {
    ...current,
    completedBlockIds: Array.from(blockSet),
    completedLessonIds: Array.from(lessonSet),
    currentLessonId: lessonId || current.currentLessonId,
    currentChapterId: chapterId || current.currentChapterId,
    currentBlockIdsByLesson: nextBlockMap,
    lastStudiedAt: new Date().toISOString(),
  });

  saveStudentCourseProgress(next);
  return next;
}

export function markLessonCompleted(
  courseId: string,
  studentId: string,
  lessonId: string,
  completed: boolean = true
): StudentCourseProgress {
  const current = getStudentCourseProgress(courseId, studentId);
  const course = getAllCourses().find((c) => c.id === courseId);
  const lessonSet = new Set(current.completedLessonIds || []);
  const blockSet = new Set(current.completedBlockIds || []);

  const targetLesson = course
    ? getAllLessonsFromCourse(course).find((l) => l.id === lessonId)
    : undefined;

  if (completed) {
    lessonSet.add(lessonId);
    (targetLesson?.blocks || []).forEach((b) => blockSet.add(b.id));
    if (!targetLesson?.blocks || targetLesson.blocks.length === 0) {
      blockSet.add(`lesson_unit_${lessonId}`);
    }
  } else {
    lessonSet.delete(lessonId);
    (targetLesson?.blocks || []).forEach((b) => blockSet.delete(b.id));
    blockSet.delete(`lesson_unit_${lessonId}`);
  }

  const base: StudentCourseProgress = {
    ...current,
    completedLessonIds: Array.from(lessonSet),
    completedBlockIds: Array.from(blockSet),
    currentLessonId: lessonId,
    lastStudiedAt: new Date().toISOString(),
  };

  const next = course ? syncCourseScormState(course, base) : base;
  saveStudentCourseProgress(next);
  return next;
}

export function recordInteractiveAnswer(
  courseId: string,
  studentId: string,
  blockId: string,
  answer: any,
  isCorrect: boolean,
  lessonId?: string,
  chapterId?: string,
  inlineImages?: Record<string, string>
): StudentCourseProgress {
  const current = getStudentCourseProgress(courseId, studentId);
  const course = getAllCourses().find((c) => c.id === courseId);
  const blockSet = new Set(current.completedBlockIds || []);
  if (isCorrect) {
    blockSet.add(blockId);
  } else {
    blockSet.delete(blockId);
  }

  const nextBlockMap = { ...(current.currentBlockIdsByLesson || {}) };
  if (lessonId) {
    nextBlockMap[lessonId] = blockId;
  }

  const base: StudentCourseProgress = {
    ...current,
    completedBlockIds: Array.from(blockSet),
    currentLessonId: lessonId || current.currentLessonId,
    currentChapterId: chapterId || current.currentChapterId,
    currentBlockIdsByLesson: nextBlockMap,
    interactiveAnswers: {
      ...current.interactiveAnswers,
      [blockId]: {
        selectedAnswer: answer,
        isCorrect,
        answeredAt: new Date().toISOString(),
        ...(inlineImages && Object.keys(inlineImages).length > 0 ? { inlineImages } : {}),
      },
    },
    lastStudiedAt: new Date().toISOString(),
  };

  const next = course ? syncCourseScormState(course, base) : base;
  saveStudentCourseProgress(next);
  return next;
}

export function recordCourseExamCompletion(courseId: string, studentId: string, examId: string): StudentCourseProgress {
  const current = getStudentCourseProgress(courseId, studentId);
  if (!current.completedExamIds.includes(examId)) {
    current.completedExamIds = [...current.completedExamIds, examId];
  }
  current.lastStudiedAt = new Date().toISOString();
  saveStudentCourseProgress(current);
  return current;
}

export function calculateCourseProgressPercentage(course: MicroCourse, progress: StudentCourseProgress): number {
  if (course.schemaVersion === 2 && course.detailsLoaded === false) {
    const totalBlk = progress.scormData?.totalBlocksCount || 0;
    const doneBlk = progress.scormData?.totalBlocksCompleted || 0;
    if (totalBlk > 0) {
      return Math.min(100, Math.max(0, Math.round((doneBlk / totalBlk) * 100)));
    }
    const lesTotal = course.lessonCount || 0;
    if (lesTotal > 0 && progress.completedLessonIds?.length) {
      return Math.min(100, Math.max(0, Math.round((progress.completedLessonIds.length / lesTotal) * 100)));
    }
    return Math.min(100, Math.max(0, Number(progress.scormData?.scoreRaw) || 0));
  }
  const units = getCourseTrackingUnits(course);
  if (units.length === 0) return 0;

  const completedBlockSet = new Set(progress.completedBlockIds || []);
  const completedLessonsSet = new Set(progress.completedLessonIds || []);

  let doneCount = 0;
  units.forEach((u) => {
    const isDone = u.isQuestion
      ? progress.interactiveAnswers?.[u.unitId]?.isCorrect === true || completedBlockSet.has(u.unitId)
      : completedBlockSet.has(u.unitId) ||
        (u.unitId.startsWith('lesson_unit_') && completedLessonsSet.has(u.lessonId));
    if (isDone) doneCount++;
  });

  const pct = Math.round((doneCount / units.length) * 100);
  return Math.min(100, Math.max(0, pct));
}

// --- Classroom Homework Assignments (Bài tập về nhà trong lớp học) ---
export function getAllClassroomHomeworks(): ClassroomHomework[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CLASSROOM_HOMEWORKS);
    if (!raw) return [];
    const deletedIds = new Set(getDeletedClassroomHomeworkIds());
    const parsed: ClassroomHomework[] = JSON.parse(raw);
    return parsed
      .filter((hw) => hw && hw.id && !deletedIds.has(hw.id))
      .sort(
        (a, b) =>
          new Date(b.updatedAt || b.createdAt).getTime() -
          new Date(a.updatedAt || a.createdAt).getTime()
      );
  } catch (e) {
    console.error(e);
    return [];
  }
}

export function getHomeworksByClass(classId: string): ClassroomHomework[] {
  return getAllClassroomHomeworks().filter((hw) => hw.classId === classId);
}

export function saveClassroomHomework(hw: ClassroomHomework): ClassroomHomework {
  try {
    removeDeletedIdByKey(STORAGE_KEY_DELETED_CLASSROOM_HOMEWORKS, hw.id);
    const list = getAllClassroomHomeworks();
    const existing = list.find((item) => item.id === hw.id);
    const nowIso = new Date().toISOString();
    const merged: ClassroomHomework = existing
      ? {
          ...existing,
          ...hw,
          createdAt: existing.createdAt || hw.createdAt || nowIso,
          updatedAt: nowIso,
        }
      : {
          ...hw,
          createdAt: hw.createdAt || nowIso,
          updatedAt: nowIso,
        };
    const updated = [merged, ...list.filter((item) => item.id !== merged.id)];
    localStorage.setItem(STORAGE_KEY_CLASSROOM_HOMEWORKS, JSON.stringify(updated));
    markDirtyCloudEntity('classroomHomeworks', merged.id);
    scheduleCloudSync();
    return merged;
  } catch (e) {
    console.error('Failed to save classroom homework:', e);
    return hw;
  }
}

export function deleteClassroomHomework(homeworkId: string): void {
  try {
    addDeletedIdByKey(STORAGE_KEY_DELETED_CLASSROOM_HOMEWORKS, homeworkId);
    const list = getAllClassroomHomeworks();
    const updated = list.filter((item) => item.id !== homeworkId);
    localStorage.setItem(STORAGE_KEY_CLASSROOM_HOMEWORKS, JSON.stringify(updated));
    void safeDeleteFirestoreDoc('classroomHomeworks', homeworkId).catch(() => {});
    markDirtySiteConfig('tombstones');
    scheduleCloudSync();
  } catch (e) {
    console.error('Failed to delete classroom homework:', e);
  }
}

// --- Homework Submissions (Nộp bài tập về nhà: tệp, ảnh, soạn thảo online) ---
export function getAllHomeworkSubmissions(): HomeworkSubmission[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_HOMEWORK_SUBMISSIONS);
    if (!raw) return [];
    const deletedIds = new Set(getDeletedHomeworkIds());
    const parsed: HomeworkSubmission[] = JSON.parse(raw);
    return parsed.filter((s) => s && s.id && !deletedIds.has(s.id));
  } catch (e) {
    console.error(e);
    return [];
  }
}

export function getHomeworkSubmissionsByClass(classId: string): HomeworkSubmission[] {
  return getAllHomeworkSubmissions().filter((s) => s.classId === classId);
}

export function getHomeworkSubmissionsByHomework(homeworkId: string): HomeworkSubmission[] {
  return getAllHomeworkSubmissions()
    .filter((s) => s.homeworkId === homeworkId)
    .sort((a, b) => new Date(b.updatedAt || b.submittedAt).getTime() - new Date(a.updatedAt || a.submittedAt).getTime());
}

export function getStudentSubmissionForHomework(
  homeworkId: string,
  studentId: string
): HomeworkSubmission | undefined {
  return getAllHomeworkSubmissions().find(
    (s) => s.homeworkId === homeworkId && s.studentId === studentId
  );
}

export function getHomeworkSubmissionsByCourse(courseId: string): HomeworkSubmission[] {
  return getAllHomeworkSubmissions().filter((s) => s.courseId === courseId);
}

export function getHomeworkSubmissionsByLesson(courseId: string, lessonId: string): HomeworkSubmission[] {
  return getAllHomeworkSubmissions()
    .filter((s) => s.courseId === courseId && s.lessonId === lessonId)
    .sort((a, b) => new Date(b.updatedAt || b.submittedAt).getTime() - new Date(a.updatedAt || a.submittedAt).getTime());
}

export function getStudentHomeworkSubmission(
  courseId: string,
  lessonId: string,
  studentId: string
): HomeworkSubmission | undefined {
  return getAllHomeworkSubmissions().find(
    (s) => s.courseId === courseId && s.lessonId === lessonId && s.studentId === studentId
  );
}

function isSameStudentHomeworkSubmission(a: HomeworkSubmission, b: HomeworkSubmission): boolean {
  if (a.id === b.id) return true;
  if (a.homeworkId && b.homeworkId) {
    return a.homeworkId === b.homeworkId && a.studentId === b.studentId;
  }
  if (a.courseId && b.courseId && a.lessonId && b.lessonId) {
    return a.courseId === b.courseId && a.lessonId === b.lessonId && a.studentId === b.studentId;
  }
  return false;
}

export function saveHomeworkSubmission(submission: HomeworkSubmission): HomeworkSubmission {
  try {
    removeDeletedIdByKey(STORAGE_KEY_DELETED_HOMEWORK, submission.id);
    const list = getAllHomeworkSubmissions();
    const existingSameStudent = list.find((s) => isSameStudentHomeworkSubmission(s, submission));
    const nowIso = new Date().toISOString();
    const merged: HomeworkSubmission = existingSameStudent
      ? {
          ...existingSameStudent,
          ...submission,
          id: existingSameStudent.id,
          submittedAt: existingSameStudent.submittedAt || submission.submittedAt || nowIso,
          updatedAt: nowIso,
        }
      : {
          ...submission,
          submittedAt: submission.submittedAt || nowIso,
          updatedAt: nowIso,
        };

    const updated = [
      merged,
      ...list.filter((s) => !isSameStudentHomeworkSubmission(s, merged)),
    ];
    localStorage.setItem(STORAGE_KEY_HOMEWORK_SUBMISSIONS, JSON.stringify(updated));
    markDirtyCloudEntity('homeworkSubmissions', merged.id);
    scheduleCloudSync();
    return merged;
  } catch (e) {
    console.error('Failed to save homework submission:', e);
    return submission;
  }
}

export function gradeHomeworkSubmission(
  submissionId: string,
  score: number | undefined,
  teacherFeedback: string,
  gradedBy: string
): HomeworkSubmission | null {
  try {
    const list = getAllHomeworkSubmissions();
    const target = list.find((s) => s.id === submissionId);
    if (!target) return null;

    const nowIso = new Date().toISOString();
    const updatedItem: HomeworkSubmission = {
      ...target,
      score,
      teacherFeedback: teacherFeedback.trim() || undefined,
      gradedAt: nowIso,
      updatedAt: nowIso,
      gradedBy,
    };
    const updatedList = list.map((s) => (s.id === submissionId ? updatedItem : s));
    localStorage.setItem(STORAGE_KEY_HOMEWORK_SUBMISSIONS, JSON.stringify(updatedList));
    if (getFirebaseAuthUser()) {
      try {
        saveSnapshotToIndexedDB(buildFullSyncPayload());
      } catch {}
      void patchHomeworkSubmissionGradeInFirestore(submissionId, {
        score,
        teacherFeedback: updatedItem.teacherFeedback,
        gradedAt: nowIso,
        gradedBy,
      }).then((patched) => {
        if (!patched) {
          markDirtyCloudEntity('homeworkSubmissions', submissionId);
          scheduleCloudSync();
        }
      });
    } else {
      markDirtyCloudEntity('homeworkSubmissions', submissionId);
      scheduleCloudSync();
    }
    return updatedItem;
  } catch (e) {
    console.error('Failed to grade homework submission:', e);
    return null;
  }
}

export function deleteHomeworkSubmission(submissionId: string): void {
  try {
    addDeletedIdByKey(STORAGE_KEY_DELETED_HOMEWORK, submissionId);
    const list = getAllHomeworkSubmissions();
    const updated = list.filter((s) => s.id !== submissionId);
    localStorage.setItem(STORAGE_KEY_HOMEWORK_SUBMISSIONS, JSON.stringify(updated));
    void safeDeleteFirestoreDoc('homeworkSubmissions', submissionId).catch(() => {});
    markDirtySiteConfig('tombstones');
    scheduleCloudSync();
  } catch (e) {
    console.error('Failed to delete homework submission:', e);
  }
}

// --- Live Text Overrides ---
const STORAGE_KEY_LIVE_TEXT = 'edutest_live_text_overrides_v1';

export function getLiveTextOverrides(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_LIVE_TEXT);
    return raw ? JSON.parse(raw) : {};
  } catch (err) {
    return {};
  }
}

export function saveLiveTextOverride(key: string, text: string): void {
  try {
    const curr = getLiveTextOverrides();
    curr[key] = text;
    localStorage.setItem(STORAGE_KEY_LIVE_TEXT, JSON.stringify(curr));
    localStorage.setItem(STORAGE_KEY_LIVE_TEXT_UPDATED_AT, new Date().toISOString());
    markDirtySiteConfig('liveText');
    scheduleCloudSync();
  } catch (err) {
    console.error('Error saving live text override', err);
  }
}

export function clearLiveTextOverrides(): void {
  try {
    localStorage.removeItem(STORAGE_KEY_LIVE_TEXT);
    localStorage.setItem(STORAGE_KEY_LIVE_TEXT_UPDATED_AT, new Date().toISOString());
    markDirtySiteConfig('liveText');
    scheduleCloudSync();
  } catch (err) {
    console.error('Error clearing live text overrides', err);
  }
}

// --- Góp ý & Nhận xét Web ---
export function getAllFeedbacks(): FeedbackItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_FEEDBACKS);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveFeedback(fb: FeedbackItem): void {
  try {
    const list = getAllFeedbacks();
    const stamped: FeedbackItem = { ...fb, updatedAt: fb.updatedAt || new Date().toISOString() };
    list.unshift(stamped);
    localStorage.setItem(STORAGE_KEY_FEEDBACKS, JSON.stringify(list));
    markDirtyCloudEntity('feedbacks', stamped.id);
    scheduleCloudSync();
  } catch (err) {
    console.error('Error saving feedback', err);
  }
}

export function deleteFeedback(id: string): void {
  try {
    const list = getAllFeedbacks().filter((f) => f.id !== id);
    localStorage.setItem(STORAGE_KEY_FEEDBACKS, JSON.stringify(list));
    void safeDeleteFirestoreDoc('feedbacks', id).catch(() => {});
    markDirtyCloudEntity('feedbacks', id);
    scheduleCloudSync();
  } catch (err) {
    console.error('Error deleting feedback', err);
  }
}

// =========================================================================
// 1. TÀI KHOẢN NGƯỜI DÙNG & PHÂN QUYỀN (AUTHENTICATION & RBAC - BACKEND FIRST)
// =========================================================================

export const MASTER_ADMIN_EMAIL = 'tranquangnhat418@gmail.com';

const STORAGE_KEY_GMAIL_NOTIFICATIONS = 'edutest_gmail_inbox_notifs_v2';

export function generateSecure8CharPassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnpqrstuvwxyz';
  const digits = '23456789';
  const special = '@#$%&*!';
  const all = upper + lower + digits + special;
  const pick = (pool: string): string => {
    if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
      const buf = new Uint32Array(1);
      window.crypto.getRandomValues(buf);
      return pool[buf[0] % pool.length];
    }
    return pool[Math.floor(Math.random() * pool.length)];
  };
  const chars = [pick(upper), pick(lower), pick(digits), pick(special)];
  while (chars.length < 8) {
    chars.push(pick(all));
  }
  for (let i = chars.length - 1; i > 0; i--) {
    const j =
      typeof window !== 'undefined' && window.crypto?.getRandomValues
        ? window.crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1)
        : Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

export function isMasterAdminUser(user: UserAccount | null | undefined): boolean {
  if (!user) return false;
  return Boolean(
    user.isMasterAdmin ||
      (user.email && user.email.toLowerCase() === MASTER_ADMIN_EMAIL.toLowerCase())
  );
}

function sanitizeClientSessionUser(user: UserAccount | null): UserAccount | null {
  if (!user) return null;
  const copy: any = { ...user };
  delete copy.password;
  delete copy.passwordHash;
  delete copy.visiblePassword;
  return copy as UserAccount;
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  try {
    const fbUser = getFirebaseAuthUser();
    if (fbUser && !fbUser.isAnonymous) {
      const token = await fbUser.getIdToken();
      if (token) {
        return { Authorization: `Bearer ${token}` };
      }
    }
  } catch {}
  return {};
}

export function getCurrentUser(): UserAccount | null {
  try {
    purgeLegacyLocalCredentials();
    if (localStorage.getItem(STORAGE_KEY_CURRENT_USER)) {
      localStorage.removeItem(STORAGE_KEY_CURRENT_USER);
    }
    const raw = sessionStorage.getItem(STORAGE_KEY_CURRENT_USER);
    if (!raw) {
      return null;
    }
    return sanitizeClientSessionUser(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function setCurrentUser(user: UserAccount | null): void {
  try {
    purgeLegacyLocalCredentials();
    localStorage.removeItem(STORAGE_KEY_CURRENT_USER);
  } catch {}
  const cleanUser = sanitizeClientSessionUser(user);
  if (cleanUser) {
    try {
      sessionStorage.setItem(STORAGE_KEY_CURRENT_USER, JSON.stringify(cleanUser));
      localStorage.setItem('edutest_user_role', cleanUser.role);
    } catch {}
  } else {
    try {
      sessionStorage.removeItem(STORAGE_KEY_CURRENT_USER);
      localStorage.setItem('edutest_user_role', 'student');
    } catch {}
  }
}

export function buildOptimisticUserFromFirebase(
  fbUser: {
    uid: string;
    email?: string | null;
    displayName?: string | null;
    photoURL?: string | null;
    providerData?: { providerId: string }[];
  },
  hints?: Partial<UserAccount>
): UserAccount {
  const email = String(fbUser.email || hints?.email || '')
    .trim()
    .toLowerCase();
  const cachedCurrent = getCurrentUser();
  const matched =
    hints ||
    (cachedCurrent &&
    (cachedCurrent.uid === fbUser.uid ||
      cachedCurrent.id === fbUser.uid ||
      (email && cachedCurrent.email.toLowerCase() === email))
      ? cachedCurrent
      : undefined);

  const isMaster =
    email === MASTER_ADMIN_EMAIL.toLowerCase() || Boolean(matched?.isMasterAdmin);
  const fullName = String(
    matched?.fullName ||
      fbUser.displayName ||
      (email ? email.split('@')[0] : '') ||
      'Thành viên EduTest'
  ).trim();
  const username = String(
    matched?.username || (email ? email.split('@')[0] : fbUser.uid.slice(0, 10))
  )
    .trim()
    .toLowerCase();

  return {
    id: fbUser.uid,
    uid: fbUser.uid,
    legacyUserIds: Array.from(
      new Set([
        ...(matched?.legacyUserIds || []),
        ...(matched?.id && matched.id !== fbUser.uid ? [matched.id] : []),
        ...(isMaster ? ['usr_master_teacher'] : []),
      ])
    ),
    email: email || matched?.email || '',
    username,
    fullName,
    name: fullName,
    role: isMaster || matched?.role === 'teacher' ? 'teacher' : 'student',
    isMasterAdmin: isMaster,
    school: matched?.school || 'Trường THPT',
    schoolOrOrg: matched?.school || 'Trường THPT',
    studentCode: matched?.studentCode,
    avatar: matched?.avatar || fbUser.photoURL || undefined,
    isGoogleAuth:
      Boolean(matched?.isGoogleAuth) ||
      Boolean(fbUser.providerData?.some((p) => p.providerId === 'google.com')),
    createdAt: matched?.createdAt || new Date().toISOString().split('T')[0],
    updatedAt: new Date().toISOString(),
  };
}

async function syncProfileWithBackend(
  fbUser: any,
  hints?: Partial<UserAccount>,
  options?: { markActivated?: boolean; password?: string }
): Promise<UserAccount | null> {
  try {
    if (!fbUser || fbUser.isAnonymous) return null;
    const token = await fbUser.getIdToken?.().catch(() => null);
    if (!token) return null;

    const res = await fetch('/api/auth/session-profile', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        email: fbUser.email || hints?.email,
        username: hints?.username,
        fullName: hints?.fullName || fbUser.displayName,
        school: hints?.school,
        studentCode: hints?.studentCode,
        avatar: hints?.avatar || fbUser.photoURL,
        isGoogleAuth:
          Boolean(hints?.isGoogleAuth) ||
          Boolean(fbUser.providerData?.some((p: any) => p.providerId === 'google.com')),
        legacyUserIds: hints?.legacyUserIds,
        role: hints?.role,
        markActivated: Boolean(options?.markActivated),
        ...(options?.password ? { password: options.password } : {}),
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.success && data.user) {
      return sanitizeClientSessionUser(data.user);
    }
    return null;
  } catch {
    return null;
  }
}

function reconcileUserProfileInBackground(
  fbUser: any,
  hints?: Partial<UserAccount>,
  options?: { markActivated?: boolean; password?: string }
): void {
  void (async () => {
    try {
      const backendProfile = await syncProfileWithBackend(fbUser, hints, options);
      const mergedHints: Partial<UserAccount> = {
        ...(hints || {}),
        ...(backendProfile
          ? {
              username: backendProfile.username,
              fullName: backendProfile.fullName,
              role: backendProfile.role,
              isMasterAdmin: backendProfile.isMasterAdmin,
              school: backendProfile.school,
              studentCode: backendProfile.studentCode,
              legacyUserIds: backendProfile.legacyUserIds,
            }
          : {}),
      };
      const unified = await resolveOrCreateUnifiedUserProfile(fbUser, mergedHints);
      const finalUser = sanitizeClientSessionUser(
        backendProfile
          ? {
              ...unified,
              role: backendProfile.role,
              isMasterAdmin: backendProfile.isMasterAdmin,
              username: backendProfile.username || unified.username,
              legacyUserIds: Array.from(
                new Set([...(unified.legacyUserIds || []), ...(backendProfile.legacyUserIds || [])])
              ),
            }
          : unified
      );
      if (finalUser) {
        setCurrentUser(finalUser);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('edutest-auth-profile-synced', { detail: finalUser }));
        }
      }
    } catch {}
    void pullDataFromServer({ minIntervalMs: 25000 });
  })();
}

export async function registerUserAccount(data: {
  email: string;
  username?: string;
  fullName: string;
  password?: string;
  school?: string;
  studentCode?: string;
}): Promise<{ success: boolean; user?: UserAccount; error?: string }> {
  const normalizedEmail = data.email.trim().toLowerCase();
  const normalizedUsername = data.username
    ? data.username.trim().toLowerCase()
    : normalizedEmail.split('@')[0];
  const effectivePassword = data.password ? data.password.trim() : '';

  if (!normalizedEmail || !data.fullName.trim()) {
    return { success: false, error: 'Vui lòng nhập đầy đủ họ tên và email!' };
  }
  if (!effectivePassword) {
    return { success: false, error: 'Vui lòng nhập mật khẩu!' };
  }
  if (effectivePassword.length < 6) {
    return { success: false, error: 'Mật khẩu phải có ít nhất 6 ký tự!' };
  }

  const authRes = await signUpWithEmailPasswordFirebase({
    email: normalizedEmail,
    password: effectivePassword,
    fullName: data.fullName.trim(),
  });

  if (!authRes.success || !authRes.user) {
    return { success: false, error: authRes.error || 'Đăng ký tài khoản thất bại!' };
  }

  const hints: Partial<UserAccount> = {
    username: normalizedUsername,
    fullName: data.fullName.trim(),
    school: data.school?.trim() || 'Trường THPT',
    studentCode: data.studentCode?.trim() || 'HS-' + Math.floor(1000 + Math.random() * 9000),
    role: normalizedEmail === MASTER_ADMIN_EMAIL.toLowerCase() ? 'teacher' : 'student',
    isMasterAdmin: normalizedEmail === MASTER_ADMIN_EMAIL.toLowerCase(),
  };

  const optimisticUser =
    (await syncProfileWithBackend(authRes.user, hints, {
      markActivated: true,
      password: effectivePassword,
    })) || buildOptimisticUserFromFirebase(authRes.user, hints);

  void syncUserCredentialToFirestore({
    uid: authRes.user.uid,
    email: normalizedEmail,
    username: optimisticUser.username || normalizedUsername,
    fullName: optimisticUser.fullName || data.fullName.trim(),
    role: optimisticUser.role,
    isMasterAdmin: optimisticUser.isMasterAdmin,
    school: optimisticUser.school,
    studentCode: optimisticUser.studentCode,
    visiblePassword: effectivePassword,
    isGoogleAuth: false,
    pendingActivation: false,
    classrooms: getAllClassrooms(),
  });

  setCurrentUser(optimisticUser);
  reconcileUserProfileInBackground(authRes.user, hints, { markActivated: true });
  return { success: true, user: optimisticUser };
}

export async function loginUserAccount(
  identifier: string,
  pass: string
): Promise<{ success: boolean; user?: UserAccount; error?: string }> {
  const queryId = identifier.trim().toLowerCase();
  const inputPass = pass.trim();

  if (!queryId || !inputPass) {
    return { success: false, error: 'Vui lòng nhập email/tên đăng nhập và mật khẩu!' };
  }

  let resolvedEmail = queryId.includes('@') ? queryId : '';
  let needsFirebaseProvision = false;
  let prefillFullName: string | undefined;

  try {
    const lookupRes = await fetch('/api/auth/login-lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: queryId, password: inputPass }),
    });
    const lookupData = await lookupRes.json().catch(() => ({}));
    if (lookupRes.ok && lookupData.success) {
      if (lookupData.email) resolvedEmail = String(lookupData.email).toLowerCase();
      needsFirebaseProvision = Boolean(lookupData.needsFirebaseProvision);
      prefillFullName = lookupData.fullName;
    } else if (!resolvedEmail) {
      // Cross-container fallback: username may have been registered on Shared URL vs Dev URL via Cloud Firestore
      const cloudEmail = await resolveEmailByIdentifierInFirestore(queryId);
      if (cloudEmail) {
        resolvedEmail = cloudEmail;
      } else {
        return {
          success: false,
          error: lookupData.error || 'Tên đăng nhập hoặc mật khẩu không chính xác!',
        };
      }
    }
  } catch {
    if (!resolvedEmail) {
      const cloudEmail = await resolveEmailByIdentifierInFirestore(queryId);
      if (cloudEmail) resolvedEmail = cloudEmail;
    }
  }

  if (!resolvedEmail) {
    return {
      success: false,
      error: 'Không tìm thấy email tương ứng với tên đăng nhập này. Vui lòng nhập trực tiếp địa chỉ Email!',
    };
  }

  let verifiedPassword = inputPass;
  let authRes: any;
  if (needsFirebaseProvision) {
    authRes = await signUpWithEmailPasswordFirebase({
      email: resolvedEmail,
      password: inputPass,
      fullName: prefillFullName || resolvedEmail.split('@')[0],
    });
    if (!authRes.success && authRes.code === 'auth/email-already-in-use') {
      authRes = await signInWithEmailPasswordFirebase({
        email: resolvedEmail,
        password: inputPass,
      });
    }
  } else {
    authRes = await signInWithEmailPasswordFirebase({
      email: resolvedEmail,
      password: inputPass,
    });
    if (
      !authRes.success &&
      pass !== inputPass &&
      (authRes.code === 'auth/invalid-credential' || authRes.code === 'auth/wrong-password')
    ) {
      verifiedPassword = pass;
      authRes = await signInWithEmailPasswordFirebase({
        email: resolvedEmail,
        password: pass,
      });
    }
  }

  if (!authRes.success || !authRes.user) {
    return {
      success: false,
      error: authRes.error || 'Email hoặc mật khẩu không chính xác!',
    };
  }

  const syncedUser =
    (await syncProfileWithBackend(
      authRes.user,
      { fullName: prefillFullName },
      { markActivated: true, password: verifiedPassword }
    )) || buildOptimisticUserFromFirebase(authRes.user, { fullName: prefillFullName });

  void syncUserCredentialToFirestore({
    uid: authRes.user.uid,
    email: syncedUser.email || resolvedEmail,
    username: syncedUser.username || (!queryId.includes('@') ? queryId : resolvedEmail.split('@')[0]),
    fullName: syncedUser.fullName || prefillFullName || resolvedEmail.split('@')[0],
    role: syncedUser.role,
    isMasterAdmin: syncedUser.isMasterAdmin,
    school: syncedUser.school,
    studentCode: syncedUser.studentCode,
    visiblePassword: verifiedPassword,
    isGoogleAuth: syncedUser.isGoogleAuth,
    pendingActivation: false,
    classrooms: getAllClassrooms(),
  });

  setCurrentUser(syncedUser);
  reconcileUserProfileInBackground(authRes.user, syncedUser, {
    markActivated: true,
  });
  return { success: true, user: syncedUser };
}

export async function loginWithGoogleAccount(): Promise<{
  success: boolean;
  user?: UserAccount;
  error?: string;
}> {
  const res = await signInWithGooglePopup();
  if (!res.success || !res.user) {
    return {
      success: false,
      error: res.error || 'Đăng nhập Google không thành công, vui lòng thử lại!',
    };
  }

  const hints: Partial<UserAccount> = {
    isGoogleAuth: true,
  };

  const optimisticUser =
    (await syncProfileWithBackend(res.user, hints, { markActivated: true })) ||
    buildOptimisticUserFromFirebase(res.user, hints);

  void syncUserCredentialToFirestore({
    uid: res.user.uid,
    email: optimisticUser.email || res.user.email || '',
    username: optimisticUser.username,
    fullName: optimisticUser.fullName || optimisticUser.name || 'Thành viên EduTest',
    role: optimisticUser.role,
    isMasterAdmin: optimisticUser.isMasterAdmin,
    school: optimisticUser.school,
    studentCode: optimisticUser.studentCode,
    isGoogleAuth: true,
    pendingActivation: false,
    classrooms: getAllClassrooms(),
  });

  setCurrentUser(optimisticUser);
  reconcileUserProfileInBackground(res.user, optimisticUser, { markActivated: true });
  return { success: true, user: optimisticUser };
}

export async function linkCurrentAccountWithGoogle(): Promise<{
  success: boolean;
  user?: UserAccount;
  error?: string;
}> {
  const res = await linkGoogleAccountFirebase();
  if (!res.success || !res.user) {
    return { success: false, error: res.error || 'Liên kết Google thất bại!' };
  }
  const backendUser = await syncProfileWithBackend(res.user, {
    ...(getCurrentUser() || {}),
    isGoogleAuth: true,
  });
  const unifiedUser = await resolveOrCreateUnifiedUserProfile(res.user, {
    ...(getCurrentUser() || {}),
    ...(backendUser || {}),
    isGoogleAuth: true,
  });
  const cleanUser = sanitizeClientSessionUser(
    backendUser
      ? { ...unifiedUser, role: backendUser.role, isMasterAdmin: backendUser.isMasterAdmin }
      : unifiedUser
  )!;
  setCurrentUser(cleanUser);
  return { success: true, user: cleanUser };
}

export function getActiveAuthProviders(): string[] {
  return getFirebaseAuthProviderIds();
}

export async function syncUserSessionFromFirebaseAuth(
  fbUser: any
): Promise<UserAccount | null> {
  if (!fbUser || fbUser.isAnonymous || !fbUser.uid) return null;
  const optimistic = buildOptimisticUserFromFirebase(fbUser);
  setCurrentUser(optimistic);

  try {
    const backendProfile = await syncProfileWithBackend(fbUser, optimistic, { markActivated: true });
    const unified = await resolveOrCreateUnifiedUserProfile(fbUser, {
      ...optimistic,
      ...(backendProfile || {}),
    });
    const finalUser = sanitizeClientSessionUser(
      backendProfile
        ? {
            ...unified,
            role: backendProfile.role,
            isMasterAdmin: backendProfile.isMasterAdmin,
            username: backendProfile.username || unified.username,
            legacyUserIds: Array.from(
              new Set([...(unified.legacyUserIds || []), ...(backendProfile.legacyUserIds || [])])
            ),
          }
        : unified
    );
    if (finalUser) {
      setCurrentUser(finalUser);
      return finalUser;
    }
    return optimistic;
  } catch {
    return optimistic;
  }
}

export interface GmailNotificationItem {
  id: string;
  type: 'password_reset' | 'otp_verification';
  email: string;
  title: string;
  username?: string;
  newPassword?: string;
  otpCode?: string;
  fullName: string;
  sentAt: string;
}

export function saveGmailNotification(notif: Omit<GmailNotificationItem, 'id'>) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_GMAIL_NOTIFICATIONS);
    const list: GmailNotificationItem[] = raw ? JSON.parse(raw) : [];
    const item: GmailNotificationItem = { ...notif, id: 'gmail_' + Date.now() };
    const updated = [item, ...list].slice(0, 10);
    localStorage.setItem(STORAGE_KEY_GMAIL_NOTIFICATIONS, JSON.stringify(updated));
  } catch {}
}

export function getLatestGmailNotification(): GmailNotificationItem | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_GMAIL_NOTIFICATIONS);
    const list: GmailNotificationItem[] = raw ? JSON.parse(raw) : [];
    return list[0] || null;
  } catch {
    return null;
  }
}

/**
 * Đổi mật khẩu (hoặc đặt mật khẩu lần đầu cho tài khoản Google để đăng nhập song song Email/Mật khẩu)
 */
export async function changePasswordDirectly(
  _identifier: string,
  currentPassword: string,
  newPassword: string
): Promise<{ success: boolean; linkedNewPassword?: boolean; error?: string }> {
  const nextPass = newPassword.trim();
  const currPass = currentPassword.trim();

  if (nextPass.length < 6) {
    return { success: false, error: 'Mật khẩu mới phải có ít nhất 6 ký tự!' };
  }

  const res = await updatePasswordFirebase(currPass, nextPass);
  if (!res.success) {
    return { success: false, error: res.error || 'Không thể cập nhật mật khẩu!' };
  }

  const active = getCurrentUser();
  if (active) {
    const updated = { ...active, updatedAt: new Date().toISOString() };
    setCurrentUser(updated);
  }
  const fbUser = getFirebaseAuthUser();
  if (fbUser) {
    // Sync Firestore credential vault & live memory cache immediately; Express mirror runs non-blocking in parallel
    void syncProfileWithBackend(fbUser, active || undefined, {
      markActivated: true,
      password: nextPass,
    }).catch(() => {});
    await syncUserCredentialToFirestore({
      uid: fbUser.uid,
      email: fbUser.email || active?.email || '',
      username: active?.username || (fbUser.email ? fbUser.email.split('@')[0] : fbUser.uid.slice(0, 8)),
      fullName: active?.fullName || fbUser.displayName || 'Thành viên EduTest',
      role: active?.role || 'student',
      isMasterAdmin: active?.isMasterAdmin,
      school: active?.school,
      studentCode: active?.studentCode,
      visiblePassword: nextPass,
      isGoogleAuth: active?.isGoogleAuth,
      pendingActivation: false,
      classrooms: getAllClassrooms(),
    });
  }
  return { success: true, linkedNewPassword: res.linkedNewPassword };
}

/**
 * Gửi email đặt lại mật khẩu chính thức qua Firebase Authentication SDK (tra cứu tên đăng nhập ở backend)
 */
export async function resetPasswordDirectly(
  identifier: string,
  _unusedNewPassword?: string
): Promise<{ success: boolean; username?: string; error?: string }> {
  const queryId = identifier.trim().toLowerCase();
  if (!queryId) {
    return { success: false, error: 'Vui lòng nhập Email hoặc Tên đăng nhập tài khoản!' };
  }

  let targetEmail = queryId.includes('@') ? queryId : '';
  if (!targetEmail) {
    try {
      const res = await fetch('/api/auth/resolve-identifier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: queryId }),
      });
      const data = await res.json().catch(() => ({}));
      if (data?.found && data.email) {
        targetEmail = String(data.email).toLowerCase();
      }
    } catch {}
  }
  if (!targetEmail) {
    const cloudEmail = await resolveEmailByIdentifierInFirestore(queryId);
    if (cloudEmail) targetEmail = cloudEmail;
  }

  if (!targetEmail) {
    return {
      success: false,
      error: 'Không tìm thấy địa chỉ email cho tên đăng nhập này. Hãy nhập trực tiếp Email đã đăng ký!',
    };
  }

  const res = await sendPasswordResetEmailFirebase(targetEmail);
  if (!res.success) {
    return { success: false, error: res.error || 'Không thể gửi email khôi phục mật khẩu!' };
  }

  return { success: true, username: targetEmail };
}

// --- Backend Admin & Classroom Roster Account Management APIs ---

async function raceWithTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), ms);
      }),
    ]);
  } catch {
    return fallback;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function fetchAdminUsersFromBackend(): Promise<{
  success: boolean;
  users?: UserAccount[];
  error?: string;
}> {
  try {
    const allClassrooms = getAllClassrooms();
    const cloudPromise = fetchAllUsersAndCredentialsFromFirestore(allClassrooms).catch(
      () => [] as UserAccount[]
    );
    const backendPromise = getAuthHeaders()
      .then((headers) =>
        fetch('/api/admin/users', { headers })
          .then(async (res) => {
            const data = await res.json().catch(() => ({}));
            return res.ok && data.success ? (data.users as UserAccount[]) : null;
          })
          .catch(() => null)
      )
      .catch(() => null);

    // Wait for Firestore live cache (<1ms when warmed), and give Express at most 280ms so UI never stalls
    const [cloudUsers, backendResult] = await Promise.all([
      cloudPromise,
      raceWithTimeout(backendPromise, 280, null),
    ]);

    if (!backendResult && cloudUsers.length === 0) {
      return { success: false, error: 'Không thể tải danh sách tài khoản.' };
    }

    const byEmail = new Map<string, UserAccount>();
    const mergeUser = (u: UserAccount) => {
      if (!u || !u.email) return;
      const key = u.email.trim().toLowerCase();
      const prev = byEmail.get(key);
      if (!prev) {
        byEmail.set(key, { ...u, email: key });
        return;
      }
      byEmail.set(key, {
        ...prev,
        ...u,
        id: u.uid || prev.uid || u.id || prev.id,
        uid: u.uid || prev.uid,
        email: key,
        username: u.username || prev.username,
        fullName: u.fullName || prev.fullName,
        name: u.fullName || u.name || prev.name,
        role:
          key === MASTER_ADMIN_EMAIL.toLowerCase() || u.role === 'teacher' || prev.role === 'teacher'
            ? 'teacher'
            : 'student',
        isMasterAdmin:
          key === MASTER_ADMIN_EMAIL.toLowerCase() || Boolean(u.isMasterAdmin || prev.isMasterAdmin),
        studentCode: u.studentCode || prev.studentCode,
        school: u.school || prev.school,
        schoolOrOrg: u.schoolOrOrg || u.school || prev.schoolOrOrg,
        isGoogleAuth: Boolean(u.isGoogleAuth || prev.isGoogleAuth),
        visiblePassword: u.visiblePassword || prev.visiblePassword,
      });
    };

    (backendResult || []).forEach(mergeUser);
    cloudUsers.forEach(mergeUser);

    return { success: true, users: Array.from(byEmail.values()) };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Lỗi kết nối máy chủ.' };
  }
}

export async function adminChangeUserRoleOnBackend(
  userId: string,
  newRole: UserRole
): Promise<{ success: boolean; user?: UserAccount; error?: string }> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/role`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ newRole }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      return { success: false, error: data.error || 'Không thể cập nhật vai trò.' };
    }
    const current = getCurrentUser();
    if (current && (current.id === userId || current.uid === userId)) {
      setCurrentUser({ ...current, role: newRole, updatedAt: new Date().toISOString() });
    }
    return { success: true, user: data.user };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Lỗi kết nối máy chủ.' };
  }
}

export async function adminResetUserPasswordOnBackend(
  userId: string,
  customPassword?: string,
  emailForResetLink?: string,
  accountMeta?: {
    username?: string;
    fullName?: string;
    role?: UserRole;
    studentCode?: string;
    school?: string;
    previousPassword?: string;
  }
): Promise<{
  success: boolean;
  oneTimePassword?: string;
  sentResetEmail?: boolean;
  email?: string;
  username?: string;
  error?: string;
}> {
  try {
    const nextPassword =
      customPassword && customPassword.trim().length >= 6
        ? customPassword.trim()
        : generateSecure8CharPassword();
    const targetEmail = String(emailForResetLink || '').trim().toLowerCase();
    const cleanUsername = String(accountMeta?.username || (targetEmail ? targetEmail.split('@')[0] : ''))
      .trim()
      .toLowerCase();

    if (targetEmail && getFirebaseAuthUser()) {
      const provRes = await provisionOrUpdateStudentFirebaseAuth({
        email: targetEmail,
        password: nextPassword,
        previousPassword: accountMeta?.previousPassword,
        fullName: accountMeta?.fullName || targetEmail.split('@')[0],
        username: cleanUsername || targetEmail.split('@')[0],
        studentCode: accountMeta?.studentCode,
        school: accountMeta?.school,
        role: accountMeta?.role || 'student',
      });

      if (provRes.needsEmailReset) {
        const emailSent = await sendPasswordResetEmailFirebase(targetEmail);
        return {
          success: false,
          sentResetEmail: emailSent.success,
          email: targetEmail,
          error: emailSent.success
            ? `Tài khoản ${targetEmail} đã tự đăng ký từ trước nên cần chính người dùng đặt lại mật khẩu. Hệ thống đã gửi liên kết đặt lại mật khẩu qua Email; ngay khi họ đổi hoặc đăng nhập lại, mật khẩu mới sẽ tự động đồng bộ về cho Admin.`
            : emailSent.error || 'Không thể đổi mật khẩu trực tiếp cho tài khoản Firebase này.',
        };
      }
      if (!provRes.success && provRes.error) {
        return { success: false, error: provRes.error };
      }

      // Non-blocking Express container mirror (Firestore & live cache already updated by provisionOrUpdateStudentFirebaseAuth)
      void getAuthHeaders().then((headers) => {
        void fetch(`/api/admin/users/${encodeURIComponent(userId)}/reset-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify({
            customPassword: nextPassword,
            email: targetEmail,
            username: cleanUsername,
            fullName: accountMeta?.fullName,
            role: accountMeta?.role,
            school: accountMeta?.school,
            studentCode: accountMeta?.studentCode,
          }),
        }).catch(() => {});
      });

      return {
        success: true,
        oneTimePassword: nextPassword,
        email: targetEmail,
        username: cleanUsername || targetEmail.split('@')[0],
      };
    }

    const headers = await getAuthHeaders();
    const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({
        customPassword: nextPassword,
        email: targetEmail || undefined,
        username: accountMeta?.username,
        fullName: accountMeta?.fullName,
        role: accountMeta?.role,
        school: accountMeta?.school,
        studentCode: accountMeta?.studentCode,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      return { success: false, error: data.error || 'Không thể cấp lại mật khẩu.' };
    }
    return {
      success: true,
      oneTimePassword: data.oneTimePassword || nextPassword,
      email: data.email || targetEmail,
      username: data.username || accountMeta?.username,
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Lỗi kết nối máy chủ.' };
  }
}

export async function adminDeleteUserOnBackend(
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
      headers,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      return { success: false, error: data.error || 'Không thể xóa tài khoản.' };
    }

    const classes = getAllClassrooms();
    const nowIso = new Date().toISOString();
    let changedCls = false;
    const nextClasses = classes.map((c) => {
      const prevLen = (c.students || []).length;
      const prevReqLen = (c.pendingRequests || []).length;
      const nextStudents = (c.students || []).filter((s) => s.id !== userId);
      const nextReqs = (c.pendingRequests || []).filter((r) => r.studentId !== userId);
      if (nextStudents.length !== prevLen || nextReqs.length !== prevReqLen) {
        changedCls = true;
        return { ...c, students: nextStudents, pendingRequests: nextReqs, updatedAt: nowIso };
      }
      return c;
    });
    if (changedCls) {
      localStorage.setItem(STORAGE_KEY_CLASSROOMS, JSON.stringify(nextClasses));
      nextClasses.forEach((c) => markDirtyCloudEntity('classrooms', c.id));
    }

    void safeDeleteFirestoreDoc('users', userId).catch(() => {});
    void safeDeleteFirestoreDoc('userCredentials', userId).catch(() => {});
    if (changedCls) {
      scheduleCloudSync();
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Lỗi kết nối máy chủ.' };
  }
}

export async function fetchClassRosterAccountsFromBackend(classId: string): Promise<{
  success: boolean;
  accountsByStudentId: Record<
    string,
    { username: string; email: string; visiblePassword?: string; isGoogleOnly?: boolean; uid?: string }
  >;
  teacherIds: string[];
  teacherEmails: string[];
  error?: string;
}> {
  try {
    const cls = getAllClassrooms().find((c) => c.id === classId);
    const fbUser = getFirebaseAuthUser();
    const callerEmail = String(fbUser?.email || getCurrentUser()?.email || cls?.teacherEmail || '')
      .trim()
      .toLowerCase();

    type RosterAccountEntry = {
      username: string;
      email: string;
      visiblePassword?: string;
      isGoogleOnly?: boolean;
      uid?: string;
    };

    const cloudPromise =
      callerEmail && cls?.students
        ? fetchTeacherStudentCredentialsFromFirestore(callerEmail, cls.students).catch(
            (): Record<string, RosterAccountEntry> => ({})
          )
        : Promise.resolve({} as Record<string, RosterAccountEntry>);

    const backendPromise = getAuthHeaders()
      .then((headers) =>
        fetch(`/api/classrooms/${encodeURIComponent(classId)}/roster-accounts`, { headers })
          .then(async (res) => {
            const d = await res.json().catch(() => ({}));
            return res.ok && d.success ? d : null;
          })
          .catch(() => null)
      )
      .catch(() => null);

    // Live Firestore credential stream resolves instantaneously; Express fallback bounded at 250ms
    const [cloudMap, backendData] = await Promise.all([
      cloudPromise,
      raceWithTimeout(backendPromise, 250, null),
    ]);

    const mergedMap: Record<string, RosterAccountEntry> = {
      ...(backendData?.accountsByStudentId || {}),
    };

    for (const [stuId, info] of Object.entries(cloudMap || {})) {
      const prev = mergedMap[stuId];
      mergedMap[stuId] = {
        uid: info.uid || prev?.uid,
        username: info.username || prev?.username || '',
        email: info.email || prev?.email || '',
        ...(info.visiblePassword || prev?.visiblePassword
          ? { visiblePassword: info.visiblePassword || prev?.visiblePassword }
          : {}),
        ...(info.isGoogleOnly && !prev?.visiblePassword ? { isGoogleOnly: true } : {}),
      };
    }

    return {
      success: Boolean(backendData || Object.keys(mergedMap).length > 0 || cls),
      accountsByStudentId: mergedMap,
      teacherIds: backendData?.teacherIds || [],
      teacherEmails: Array.from(
        new Set([...(backendData?.teacherEmails || []), ...(callerEmail ? [callerEmail] : [])])
      ),
    };
  } catch {
    return {
      success: false,
      accountsByStudentId: {},
      teacherIds: [],
      teacherEmails: [],
    };
  }
}

function buildGeneratedStudentIdentity(studentData: {
  name: string;
  studentCode?: string;
  email?: string;
}) {
  const cleanName = studentData.name.trim();
  const sbd =
    (studentData.studentCode || '').trim() ||
    `SBD-${Math.floor(100000 + Math.random() * 900000)}`;
  const normalizedCode = sbd.toLowerCase().replace(/[^a-z0-9]/g, '');
  const slugName = cleanName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 10);
  const suffix = Math.floor(100 + Math.random() * 900);
  const username = `hs_${normalizedCode || slugName || 'hocvien'}_${suffix}`.slice(0, 48);
  const email = (studentData.email || `${username}@edutest.vn`).trim().toLowerCase();
  return { cleanName, sbd, username, email };
}

export async function createClassStudentOnBackend(
  classId: string,
  studentData: { name: string; studentCode?: string; email?: string; className?: string }
): Promise<{
  success: boolean;
  studentMember?: StudentMember;
  accountUsername?: string;
  email?: string;
  oneTimePassword?: string;
  error?: string;
}> {
  try {
    const cls = getAllClassrooms().find((c) => c.id === classId);
    const fbUser = getFirebaseAuthUser();
    const teacherEmails = Array.from(
      new Set(
        [cls?.teacherEmail, fbUser?.email, getCurrentUser()?.email]
          .filter((x): x is string => Boolean(x))
          .map((e) => e.trim().toLowerCase())
      )
    );

    if (fbUser) {
      const { cleanName, sbd, username, email } = buildGeneratedStudentIdentity(studentData);
      const oneTimePassword = generateSecure8CharPassword();
      const provRes = await provisionOrUpdateStudentFirebaseAuth({
        email,
        password: oneTimePassword,
        fullName: cleanName,
        username,
        studentCode: sbd,
        school: cls?.name || studentData.className || 'Lớp học EduTest',
        role: 'student',
        classId,
        teacherEmails,
      });

      if (!provRes.success || !provRes.uid) {
        return {
          success: false,
          error: provRes.error || 'Không thể tạo tài khoản học sinh trên Cloud Firebase.',
        };
      }

      const studentMember: StudentMember = {
        id: provRes.uid,
        name: cleanName,
        studentCode: sbd,
        email,
        joinedAt: new Date().toISOString().split('T')[0],
      };

      // Non-blocking Express container mirror
      void getAuthHeaders().then((headers) => {
        void fetch(`/api/classrooms/${encodeURIComponent(classId)}/students`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify({
            ...studentData,
            studentCode: sbd,
            email,
            customUid: provRes.uid,
            customUsername: username,
            customPassword: oneTimePassword,
          }),
        }).catch(() => {});
      });

      return {
        success: true,
        studentMember,
        accountUsername: username,
        email,
        oneTimePassword,
      };
    }

    const headers = await getAuthHeaders();
    const res = await fetch(`/api/classrooms/${encodeURIComponent(classId)}/students`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(studentData),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success || !data.studentMember) {
      return { success: false, error: data.error || 'Không thể thêm học sinh.' };
    }

    return {
      success: true,
      studentMember: data.studentMember,
      accountUsername: data.accountUsername,
      email: data.email || data.studentMember.email,
      oneTimePassword: data.oneTimePassword,
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Lỗi kết nối máy chủ.' };
  }
}

export async function resetClassStudentPasswordOnBackend(
  classId: string,
  student: StudentMember,
  previousPassword?: string
): Promise<{
  success: boolean;
  accountUsername?: string;
  email?: string;
  oneTimePassword?: string;
  sentResetEmail?: boolean;
  error?: string;
}> {
  try {
    const cls = getAllClassrooms().find((c) => c.id === classId);
    const fbUser = getFirebaseAuthUser();
    const teacherEmails = Array.from(
      new Set(
        [cls?.teacherEmail, fbUser?.email, getCurrentUser()?.email]
          .filter((x): x is string => Boolean(x))
          .map((e) => e.trim().toLowerCase())
      )
    );

    const nextPassword = generateSecure8CharPassword();
    const fallbackUname = `hs_${String(student.studentCode || student.id || 'hocvien')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')}`;
    const targetEmail = String(student.email || `${fallbackUname}@edutest.vn`)
      .trim()
      .toLowerCase();

    if (fbUser && targetEmail) {
      const provRes = await provisionOrUpdateStudentFirebaseAuth({
        email: targetEmail,
        password: nextPassword,
        previousPassword,
        fullName: student.name,
        username: fallbackUname || targetEmail.split('@')[0],
        studentCode: student.studentCode,
        school: cls?.name || 'Lớp học EduTest',
        role: 'student',
        classId,
        teacherEmails,
      });

      if (provRes.needsEmailReset) {
        const emailSent = await sendPasswordResetEmailFirebase(targetEmail);
        return {
          success: false,
          sentResetEmail: emailSent.success,
          email: targetEmail,
          error: emailSent.success
            ? `Học sinh "${student.name}" tự đăng ký từ trước nên cần tự đổi qua Email. Hệ thống đã gửi liên kết đặt lại mật khẩu vào ${targetEmail}; khi học sinh đăng nhập lại, mật khẩu mới sẽ tự đồng bộ cho bạn!`
            : emailSent.error || 'Không thể cập nhật mật khẩu Firebase Auth cho tài khoản này.',
        };
      }
      if (!provRes.success && provRes.error) {
        return { success: false, error: provRes.error };
      }

      // Non-blocking Express container mirror
      void getAuthHeaders().then((headers) => {
        void fetch(
          `/api/classrooms/${encodeURIComponent(classId)}/students/${encodeURIComponent(student.id)}/reset-password`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...headers },
            body: JSON.stringify({
              studentEmail: targetEmail,
              studentCode: student.studentCode,
              studentName: student.name,
              customPassword: nextPassword,
            }),
          }
        ).catch(() => {});
      });

      return {
        success: true,
        accountUsername: fallbackUname || targetEmail.split('@')[0],
        email: targetEmail,
        oneTimePassword: nextPassword,
      };
    }

    const headers = await getAuthHeaders();
    const res = await fetch(
      `/api/classrooms/${encodeURIComponent(classId)}/students/${encodeURIComponent(student.id)}/reset-password`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
          studentEmail: student.email,
          studentCode: student.studentCode,
          studentName: student.name,
          customPassword: nextPassword,
        }),
      }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      return { success: false, error: data.error || 'Không thể cấp lại mật khẩu học sinh.' };
    }

    return {
      success: true,
      accountUsername: data.accountUsername || fallbackUname,
      email: data.email || targetEmail,
      oneTimePassword: data.oneTimePassword || nextPassword,
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Lỗi kết nối máy chủ.' };
  }
}

export async function fetchExistingStudentDirectory(): Promise<UserAccount[]> {
  try {
    const cloudUsers = await fetchLiveUsersForDirectoryFromFirestore().catch(() => [] as UserAccount[]);
    const byEmail = new Map<string, UserAccount>();
    for (const u of cloudUsers) {
      if (!u || !u.email) continue;
      const email = u.email.trim().toLowerCase();
      if (email === MASTER_ADMIN_EMAIL.toLowerCase()) continue;
      if (u.role === 'teacher') continue;
      byEmail.set(email, { ...u, email });
    }
    return Array.from(byEmail.values()).sort((a, b) =>
      (a.fullName || a.name || a.email).localeCompare(b.fullName || b.name || b.email, 'vi')
    );
  } catch {
    return [];
  }
}

export async function addExistingStudentsToClassroom(
  classId: string,
  accounts: UserAccount[]
): Promise<{
  success: boolean;
  addedStudents: StudentMember[];
  updatedClassroom?: Classroom;
  linkedCredentials: Record<
    string,
    { username: string; email: string; visiblePassword?: string; isGoogleOnly?: boolean; uid?: string }
  >;
  message: string;
}> {
  const allClassrooms = getAllClassrooms();
  const targetClass = allClassrooms.find((c) => c.id === classId);
  if (!targetClass) {
    return {
      success: false,
      addedStudents: [],
      linkedCredentials: {},
      message: 'Không tìm thấy lớp học!',
    };
  }

  const cleanAccounts = (accounts || []).filter(
    (a) => a && a.email && a.email.trim().toLowerCase() !== MASTER_ADMIN_EMAIL.toLowerCase()
  );
  if (cleanAccounts.length === 0) {
    return {
      success: false,
      addedStudents: [],
      linkedCredentials: {},
      message: 'Vui lòng chọn ít nhất 1 tài khoản học sinh để thêm vào lớp!',
    };
  }

  const existingStudents = [...(targetClass.students || [])];
  const addedStudents: StudentMember[] = [];
  const addedIds = new Set<string>();
  const addedEmails = new Set<string>();
  const today = new Date().toISOString().split('T')[0];

  for (const acc of cleanAccounts) {
    const accId = acc.uid || acc.id;
    const accEmail = acc.email.trim().toLowerCase();
    const alreadyIn = existingStudents.some(
      (s) =>
        s.id === accId ||
        (s.email && s.email.trim().toLowerCase() === accEmail) ||
        (acc.studentCode && s.studentCode && s.studentCode.trim().toUpperCase() === acc.studentCode.trim().toUpperCase())
    );
    if (alreadyIn) continue;

    const newStu: StudentMember = {
      id: accId,
      name: (acc.fullName || acc.name || acc.username || accEmail.split('@')[0]).trim(),
      studentCode: acc.studentCode || `SBD-${Math.floor(100000 + Math.random() * 900000)}`,
      email: accEmail,
      joinedAt: today,
    };
    existingStudents.push(newStu);
    addedStudents.push(newStu);
    addedIds.add(accId);
    addedEmails.add(accEmail);
  }

  if (addedStudents.length === 0) {
    return {
      success: false,
      addedStudents: [],
      linkedCredentials: {},
      message: 'Tất cả học sinh được chọn đều đã có mặt trong lớp này.',
    };
  }

  // Strip any pending requests for students added directly so they never sit waiting in "Yêu cầu vào lớp"
  const prevPending = targetClass.pendingRequests || [];
  const removedRequests = prevPending.filter((r) => {
    const rId = String(r.studentId || '').trim();
    const rEmail = String(r.studentEmail || '').trim().toLowerCase();
    return addedIds.has(rId) || (rEmail && addedEmails.has(rEmail));
  });
  const remainingRequests = prevPending.filter((r) => !removedRequests.includes(r));

  const nowIso = new Date().toISOString();
  const updatedClass: Classroom = {
    ...targetClass,
    students: existingStudents,
    pendingRequests: remainingRequests,
    updatedAt: nowIso,
  };

  saveClassroom(updatedClass, { skipCloudSync: true });

  // Sync classroom doc first so Firestore rules see the student / teacher relationship on userCredentials
  await syncSingleClassroomToFirestoreNow(updatedClass, getCurrentUser()).catch(() => false);

  for (const req of removedRequests) {
    void syncJoinRequestDecisionToFirestore(classId, req.id, 'approved').catch(() => {});
  }

  const fbUser = getFirebaseAuthUser();
  const teacherEmails = Array.from(
    new Set(
      [targetClass.teacherEmail, fbUser?.email, getCurrentUser()?.email]
        .filter((x): x is string => Boolean(x))
        .map((e) => e.trim().toLowerCase())
    )
  );

  const linkedCredentials: Record<
    string,
    { username: string; email: string; visiblePassword?: string; isGoogleOnly?: boolean; uid?: string }
  > = {};

  if (fbUser && teacherEmails.length > 0) {
    await Promise.all(
      cleanAccounts
        .filter((acc) => addedEmails.has(acc.email.trim().toLowerCase()))
        .map(async (acc) => {
          const stuId = acc.uid || acc.id;
          const entry = await linkExistingStudentToTeacherCredentialsFirestore({
            uid: stuId,
            email: acc.email,
            username: acc.username || acc.email.split('@')[0],
            fullName: acc.fullName || acc.name || acc.email.split('@')[0],
            studentCode: acc.studentCode,
            school: targetClass.name,
            classId,
            teacherEmails,
          });
          if (entry) {
            linkedCredentials[stuId] = {
              uid: entry.uid,
              username: entry.username,
              email: entry.email,
              ...(entry.visiblePassword ? { visiblePassword: entry.visiblePassword } : {}),
              ...(entry.isGoogleAuth && !entry.visiblePassword ? { isGoogleOnly: true } : {}),
            };
          }
        })
    );
  }

  return {
    success: true,
    addedStudents,
    updatedClassroom: updatedClass,
    linkedCredentials,
    message: `✓ Đã thêm trực tiếp ${addedStudents.length} học sinh vào lớp "${targetClass.name}" (vào lớp ngay, không cần duyệt)!`,
  };
}

export function logoutUserAccount(alsoSignOutFirebase: boolean = true): void {
  clearDirtyCloudTracking();
  initialPullCompleted = false;
  lastPullCompletedAtMs = 0;
  lastPullAuthUid = '';
  offlineMigrationTriggered = false;
  setCurrentUser(null);
  clearCloudSyncCursor();
  if (alsoSignOutFirebase) {
    void signOutFirebase();
  }
}

// =========================================================================
// 2. YÊU CẦU NÂNG QUYỀN GIÁO VIÊN (TEACHER ROLE REQUESTS)
// =========================================================================

export function getAllTeacherRequests(): TeacherRoleRequest[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_TEACHER_REQUESTS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveTeacherRequest(req: TeacherRoleRequest): void {
  try {
    const list = getAllTeacherRequests();
    const stamped: TeacherRoleRequest = { ...req, updatedAt: req.updatedAt || new Date().toISOString() };
    const updated = [stamped, ...list.filter((r) => r.id !== stamped.id)];
    localStorage.setItem(STORAGE_KEY_TEACHER_REQUESTS, JSON.stringify(updated));
    markDirtyCloudEntity('teacherRequests', stamped.id);
    void triggerCloudSync();
  } catch (e) {
    console.error(e);
  }
}

export async function fetchTeacherRequestsFromBackend(): Promise<TeacherRoleRequest[]> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch('/api/admin/teacher-requests', { headers });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.success && Array.isArray(data.requests)) {
      localStorage.setItem(STORAGE_KEY_TEACHER_REQUESTS, JSON.stringify(data.requests));
      return data.requests;
    }
  } catch {}
  return getAllTeacherRequests();
}

export async function submitTeacherRoleRequest(data: {
  userId: string;
  userEmail: string;
  userName: string;
  schoolName: string;
  subject: string;
  reason: string;
}): Promise<{ success: boolean; request?: TeacherRoleRequest; error?: string }> {
  const requests = getAllTeacherRequests();
  const pending = requests.find((r) => r.userId === data.userId && r.status === 'pending');
  if (pending) {
    return { success: false, error: 'Bạn đã có một yêu cầu nâng quyền đang chờ Quản trị viên duyệt!' };
  }

  const nowIso = new Date().toISOString();
  let newReq: TeacherRoleRequest = {
    id: 'req_tea_' + Date.now(),
    userId: data.userId,
    userEmail: data.userEmail,
    userName: data.userName,
    schoolName: data.schoolName,
    subject: data.subject,
    reason: data.reason,
    status: 'pending',
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  try {
    const headers = await getAuthHeaders();
    const res = await fetch('/api/auth/request-teacher', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(data),
    });
    const resData = await res.json().catch(() => ({}));
    if (res.ok && resData.success && resData.request) {
      newReq = resData.request;
    }
  } catch {}

  saveTeacherRequest(newReq);
  return { success: true, request: newReq };
}

export async function reviewTeacherRoleRequest(
  requestId: string,
  action: 'approve' | 'reject',
  reviewerEmail?: string
): Promise<{ success: boolean; error?: string }> {
  const requests = getAllTeacherRequests();
  const target = requests.find((r) => r.id === requestId);
  if (!target) {
    return { success: false, error: 'Không tìm thấy yêu cầu này!' };
  }

  const nowIso = new Date().toISOString();
  target.status = action === 'approve' ? 'approved' : 'rejected';
  target.reviewedAt = nowIso;
  target.updatedAt = nowIso;
  target.reviewedBy = reviewerEmail || MASTER_ADMIN_EMAIL;

  saveTeacherRequest(target);

  if (action === 'approve') {
    const currentUser = getCurrentUser();
    if (
      currentUser &&
      (currentUser.id === target.userId ||
        currentUser.uid === target.userId ||
        currentUser.email.toLowerCase() === target.userEmail.toLowerCase())
    ) {
      setCurrentUser({ ...currentUser, role: 'teacher', updatedAt: nowIso });
    }
  }

  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/admin/teacher-requests/${encodeURIComponent(requestId)}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ action, reviewerEmail }),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      return { success: false, error: errData.error || 'Không thể phê duyệt yêu cầu.' };
    }
  } catch {}

  return { success: true };
}

// =========================================================================
// 3. BẢO MẬT, QUYỀN SỞ HỮU & HIỂN THỊ NỘI DUNG (ISOLATION & VISIBILITY)
// =========================================================================

/**
 * Kiểm tra người dùng hiện tại có phải là người tạo ra Đề thi / Tổ hợp / Khóa học này không.
 * Dữ liệu cũ không có creatorId/creatorEmail mặc định thuộc về Quản trị viên tối cao.
 */
export function isCreatorOfItem(
  item: { creatorId?: string; creatorEmail?: string } | null | undefined,
  user: UserAccount | null
): boolean {
  if (!item || !user) return false;
  const userIds = new Set(
    [user.id, user.uid, ...(user.legacyUserIds || [])].filter((x): x is string => Boolean(x))
  );
  if (item.creatorId && userIds.has(item.creatorId)) return true;
  if (item.creatorEmail && user.email && item.creatorEmail.toLowerCase() === user.email.toLowerCase()) {
    return true;
  }
  if (!item.creatorId && !item.creatorEmail) {
    return isMasterAdminUser(user);
  }
  return false;
}

/**
 * Chế độ Người ra đề / Riêng tư:
 * Chỉ người ra đề tạo ra nội dung đó và Quản trị viên tối cao (khi đang ở chế độ Giáo viên) mới nhìn thấy.
 */
export function isCreatorModeRestricted(
  item: {
    visibility?: string;
    teacherMode?: string;
    isCreatorOnlyMode?: boolean;
  } | null | undefined
): boolean {
  if (!item) return false;
  return (
    item.teacherMode === 'creator' ||
    Boolean(item.isCreatorOnlyMode) ||
    item.visibility === 'private'
  );
}

/**
 * Quy tắc ẩn đề thi khỏi Học sinh:
 * Bất kỳ nội dung nào đang ở chế độ Người ra đề / Riêng tư / Bản nháp đều tuyệt đối KHÔNG hiển thị cho học sinh.
 */
export function isExamHiddenFromStudents(
  item: {
    visibility?: string;
    status?: string;
    teacherMode?: string;
    isCreatorOnlyMode?: boolean;
  } | null | undefined
): boolean {
  if (!item) return true;
  return isCreatorModeRestricted(item) || item.status === 'draft';
}

/**
 * Kiểm tra xem một kết quả thi có bị ẩn điểm / ẩn kết quả với học sinh hay không.
 */
export function isResultHiddenFromStudent(
  result: ExamResult | null | undefined,
  exams?: Exam[]
): boolean {
  if (!result) return false;
  if (result.showScoreAfterExam === false) return true;
  if (exams && exams.length > 0 && result.examId) {
    const matchedExam = exams.find((e) => e.id === result.examId);
    if (
      matchedExam &&
      (matchedExam.showScoreAfterExam === false ||
        matchedExam.settings?.showScoreAfterExam === false)
    ) {
      return true;
    }
  }
  return false;
}

export function isTeacherOfClass(classroom: Classroom, user: UserAccount | null): boolean {
  if (!user || !classroom) return false;
  if (isMasterAdminUser(user)) return true;
  if (user.role !== 'teacher') return false;
  const userIds = new Set(
    [user.id, user.uid, ...(user.legacyUserIds || [])].filter((x): x is string => Boolean(x))
  );
  return Boolean(
    (classroom.teacherId && userIds.has(classroom.teacherId)) ||
      (classroom.teacherEmail &&
        user.email &&
        classroom.teacherEmail.toLowerCase() === user.email.toLowerCase()) ||
      (!classroom.teacherId && !classroom.teacherEmail && classroom.teacherName === user.fullName)
  );
}

export function isApprovedStudentInClass(classroom: Classroom, user: UserAccount | null): boolean {
  if (!user || !classroom) return false;
  const userIds = new Set(
    [user.id, user.uid, ...(user.legacyUserIds || [])].filter((x): x is string => Boolean(x))
  );
  const students = classroom.students || [];
  return students.some(
    (s) =>
      userIds.has(s.id) ||
      (user.email && s.email && s.email.toLowerCase() === user.email.toLowerCase()) ||
      (user.studentCode && s.studentCode && s.studentCode.toUpperCase() === user.studentCode.toUpperCase())
  );
}

/**
 * Quy tắc hiển thị trên các danh sách (Trang chủ / Thư viện đề / Tổ hợp / Khóa học / Đấu trường):
 * 1. Chế độ Người ra đề / Riêng tư / Bản nháp: CHỈ người ra đề đó và Quản trị viên tối cao (ở chế độ Giáo viên) mới thấy.
 * 2. Công khai web (`visibility === 'public'`): Ai cũng thấy (kể cả khách, học sinh, mọi giáo viên).
 * 3. Chế độ Lớp học (`visibility === 'class'` / `assignedClassId`): Học sinh đã được duyệt vào lớp đó, giáo viên lớp đó, người ra đề và QTV tối cao đều thấy; ẩn với lớp khác & khách.
 */
export function canShowInPublicLibrary(
  item: {
    visibility?: string;
    status?: string;
    teacherMode?: string;
    isCreatorOnlyMode?: boolean;
    assignedClassId?: string;
    creatorId?: string;
    creatorEmail?: string;
  },
  user: UserAccount | null,
  userRole: UserRole,
  classrooms: Classroom[] = getAllClassrooms()
): boolean {
  const isTeacherView =
    Boolean(user) &&
    userRole === 'teacher' &&
    (user?.role === 'teacher' || isMasterAdminUser(user));

  if (isCreatorModeRestricted(item) || item.status === 'draft') {
    return isTeacherView && (isCreatorOfItem(item, user) || isMasterAdminUser(user));
  }

  const vis = item.visibility || 'public';
  if (vis === 'public') {
    return true;
  }

  if (vis === 'class' || item.assignedClassId) {
    if (!user) return false;
    const targetClass = classrooms.find((c) => c.id === item.assignedClassId);
    if (isTeacherView) {
      return (
        isMasterAdminUser(user) ||
        isCreatorOfItem(item, user) ||
        Boolean(targetClass && isTeacherOfClass(targetClass, user))
      );
    }
    return Boolean(targetClass && isApprovedStudentInClass(targetClass, user));
  }

  if (vis === 'exam_only' || vis === 'bundle_only') {
    return isTeacherView && (isCreatorOfItem(item, user) || isMasterAdminUser(user));
  }

  return false;
}

/**
 * Kiểm tra quyền mở/làm bài trực tiếp đối với một Đề thi / Tổ hợp / Khóa học
 */
export function canUserAccessProtectedItem(
  item: {
    visibility?: string;
    status?: string;
    teacherMode?: string;
    isCreatorOnlyMode?: boolean;
    assignedClassId?: string;
    creatorId?: string;
    creatorEmail?: string;
  },
  user: UserAccount | null,
  userRole: UserRole,
  classrooms: Classroom[] = getAllClassrooms()
): { allowed: boolean; reason?: string } {
  const isTeacherView =
    Boolean(user) &&
    userRole === 'teacher' &&
    (user?.role === 'teacher' || isMasterAdminUser(user));

  if (isCreatorModeRestricted(item) || item.status === 'draft') {
    if (isTeacherView && (isCreatorOfItem(item, user) || isMasterAdminUser(user))) {
      return { allowed: true };
    }
    return {
      allowed: false,
      reason:
        'Nội dung này đang ở chế độ Người ra đề / Riêng tư / Bản nháp. Chỉ người ra đề và Quản trị viên tối cao mới có quyền xem.',
    };
  }

  const vis = item.visibility || 'public';
  if (vis === 'class' || item.assignedClassId) {
    if (!user) {
      return {
        allowed: false,
        reason: 'Nội dung này thuộc về một lớp học riêng. Vui lòng đăng nhập và được duyệt vào lớp để truy cập.',
      };
    }
    const targetClass = classrooms.find((c) => c.id === item.assignedClassId);
    const allowedTeacher =
      isTeacherView &&
      (isMasterAdminUser(user) ||
        isCreatorOfItem(item, user) ||
        Boolean(targetClass && isTeacherOfClass(targetClass, user)));
    const allowedStudent = Boolean(targetClass && isApprovedStudentInClass(targetClass, user));
    if (!allowedTeacher && !allowedStudent) {
      return {
        allowed: false,
        reason: `Nội dung này chỉ hiển thị và cho phép thành viên của lớp "${targetClass?.name || 'Lớp riêng'}" truy cập.`,
      };
    }
    return { allowed: true };
  }

  return { allowed: true };
}

/**
 * Kiểm tra xem người dùng hiện tại có phải là thành viên chính thức / giáo viên phụ trách của lớp học này không
 */
export function isStudentMemberOfClass(classroom: Classroom, user: UserAccount | null): boolean {
  if (!user) return false;
  if (isMasterAdminUser(user)) return true;
  if (isTeacherOfClass(classroom, user)) return true;
  return isApprovedStudentInClass(classroom, user);
}

/**
 * Lọc danh sách lớp học hiển thị theo quyền người dùng:
 * - Học sinh CHỈ nhìn thấy những lớp mình ĐÃ ĐƯỢC DUYỆT tham gia (ẩn hoàn toàn các lớp khác)
 * - Giáo viên CHỈ nhìn thấy các lớp do chính mình tạo và quản lý (Master Admin xem được toàn hệ thống)
 */
export function getVisibleClassrooms(allClassrooms: Classroom[], user: UserAccount | null): Classroom[] {
  if (!user) return [];
  if (user.role === 'student') {
    return allClassrooms.filter((c) => isApprovedStudentInClass(c, user));
  }
  if (isMasterAdminUser(user)) {
    return allClassrooms;
  }
  return allClassrooms.filter((c) => isTeacherOfClass(c, user));
}

function makeDeterministicJoinReqId(classId: string, user: UserAccount): string {
  const rawUid = String(user.uid || user.id || user.email || 'student')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_');
  const rawCls = String(classId)
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_');
  return `req_${rawCls}_${rawUid}`.slice(0, 120);
}

function doesRequestBelongToUser(req: ClassJoinRequest, user: UserAccount): boolean {
  const uids = new Set([user.id, user.uid, ...(user.legacyUserIds || [])].filter(Boolean));
  if (req.studentId && uids.has(req.studentId)) return true;
  if (
    user.email &&
    req.studentEmail &&
    req.studentEmail.trim().toLowerCase() === user.email.trim().toLowerCase()
  ) {
    return true;
  }
  return false;
}

export function getMyTrackedJoinRequests(): ClassJoinRequest[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_MY_JOIN_REQUESTS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function upsertMyTrackedJoinRequest(req: ClassJoinRequest): void {
  try {
    const list = getMyTrackedJoinRequests();
    const updated = [
      req,
      ...list.filter(
        (r) =>
          !(
            r.id === req.id ||
            (r.classId === req.classId &&
              r.studentEmail?.toLowerCase() === req.studentEmail?.toLowerCase())
          )
      ),
    ];
    localStorage.setItem(STORAGE_KEY_MY_JOIN_REQUESTS, JSON.stringify(updated.slice(0, 100)));
  } catch {}
}

export function clearTrackedJoinRequestForClass(
  classIdOrCode: string,
  user?: UserAccount | null
): void {
  const target = classIdOrCode.trim().toUpperCase();
  if (!target) return;
  try {
    const list = getMyTrackedJoinRequests();
    const next = list.filter((r) => {
      const sameClass =
        r.classId.toUpperCase() === target || (r.classCode || '').trim().toUpperCase() === target;
      if (!sameClass) return true;
      if (!user) return false;
      return !doesRequestBelongToUser(r, user);
    });
    localStorage.setItem(STORAGE_KEY_MY_JOIN_REQUESTS, JSON.stringify(next));
  } catch {}
}

/**
 * Kiểm tra xem học sinh hiện tại đang có yêu cầu xin vào lớp ở trạng thái CHỜ DUYỆT ('pending') hay không.
 * - Chỉ trả về nếu đang 'pending' và học sinh chưa vào lớp & chưa bị giáo viên từ chối.
 */
export function getPendingJoinRequestForClass(
  classIdOrCode: string,
  user: UserAccount | null,
  classrooms?: Classroom[]
): ClassJoinRequest | null {
  if (!user || !classIdOrCode.trim()) return null;
  const cleanKey = classIdOrCode.trim();
  const cleanUpper = cleanKey.toUpperCase();
  const allCls = classrooms || getAllClassrooms();
  const targetClass = allCls.find(
    (c) => c.id === cleanKey || c.code.trim().toUpperCase() === cleanUpper
  );

  if (targetClass && isStudentMemberOfClass(targetClass, user)) {
    return null;
  }

  // 1. Check live pendingRequests attached to the Classroom doc
  if (targetClass) {
    const inClassPending = (targetClass.pendingRequests || []).find(
      (r) => doesRequestBelongToUser(r, user) && (!r.status || r.status === 'pending')
    );
    if (inClassPending) {
      return inClassPending;
    }
  }

  // 2. Check tracked requests (from collectionGroup / local submission)
  const tracked = getMyTrackedJoinRequests().find(
    (r) =>
      (r.classId === cleanKey || (r.classCode || '').trim().toUpperCase() === cleanUpper) &&
      doesRequestBelongToUser(r, user)
  );
  if (!tracked || tracked.status !== 'pending') {
    return null;
  }

  // If teacher already synced an updated classroom doc AFTER tracked.createdAt that no longer holds
  // this request in pendingRequests (and didn't approve), the request was processed (e.g., rejected)
  if (targetClass && targetClass.updatedAt && tracked.createdAt) {
    const clsTs = new Date(targetClass.updatedAt).getTime();
    const reqTs = new Date(tracked.createdAt).getTime();
    if (Number.isFinite(clsTs) && Number.isFinite(reqTs) && clsTs > reqTs + 2000) {
      return null;
    }
  }

  return tracked;
}

export async function submitClassJoinRequestAsync(
  classCode: string,
  user: UserAccount,
  note?: string
): Promise<{ success: boolean; alreadyPending?: boolean; message: string; classroom?: Classroom }> {
  const cleanCode = classCode.trim().toUpperCase();
  if (!cleanCode) {
    return { success: false, message: 'Vui lòng nhập mã lớp học!' };
  }

  let allClassrooms = getAllClassrooms();
  let targetClass = allClassrooms.find((c) => c.code.trim().toUpperCase() === cleanCode);

  if (!targetClass) {
    try {
      await pullDataFromServer();
      allClassrooms = getAllClassrooms();
      targetClass = allClassrooms.find((c) => c.code.trim().toUpperCase() === cleanCode);
    } catch {}
  }

  // Kiểm tra chống spam ngay tại thời điểm bấm nút
  const existingLocalPending = getPendingJoinRequestForClass(
    targetClass?.id || cleanCode,
    user,
    allClassrooms
  );
  if (existingLocalPending) {
    return {
      success: false,
      alreadyPending: true,
      message: `Bạn đã gửi yêu cầu gia nhập lớp "${targetClass?.name || existingLocalPending.className || cleanCode}". Đang chờ giáo viên duyệt!`,
      classroom: targetClass,
    };
  }

  // Fallback qua Firestore classroomCodes subcollection khi học sinh ở máy/tài khoản khác
  if (!targetClass) {
    const fsInfo = await lookupClassroomCodeInFirestore(cleanCode);
    if (fsInfo && fsInfo.classroomId) {
      const nowIso = new Date().toISOString();
      const deterministicId = makeDeterministicJoinReqId(fsInfo.classroomId, user);
      const joinReq: ClassJoinRequest = {
        id: deterministicId,
        classId: fsInfo.classroomId,
        className: fsInfo.className,
        classCode: fsInfo.code,
        teacherEmail: fsInfo.teacherEmail,
        studentId: user.uid || user.id,
        studentName: user.fullName,
        studentEmail: user.email,
        studentCode: user.studentCode,
        note: note || 'Xin tham gia lớp học để làm bài thi',
        status: 'pending',
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      // Lưu trạng thái pending cục bộ ngay để vô hiệu hóa nút tức thì
      upsertMyTrackedJoinRequest(joinReq);
      try {
        const fsRes = await submitJoinRequestToFirestore(fsInfo.classroomId, joinReq, user);
        if (fsRes.alreadyApproved) {
          clearTrackedJoinRequestForClass(fsInfo.classroomId, user);
          return {
            success: true,
            message: `Bạn đã được duyệt vào lớp "${fsInfo.className}" trước đó!`,
          };
        }
        if (fsRes.alreadyPending) {
          return {
            success: false,
            alreadyPending: true,
            message: `Bạn đã gửi yêu cầu tham gia lớp "${fsInfo.className}" trước đó. Vui lòng chờ giáo viên duyệt!`,
          };
        }
        return {
          success: true,
          message: `Đã gửi yêu cầu tham gia lớp "${fsInfo.className}" lên Cloud! Vui lòng chờ giáo viên duyệt vào lớp.`,
        };
      } catch (err: any) {
        clearTrackedJoinRequestForClass(fsInfo.classroomId, user);
        return {
          success: false,
          message: err?.message || 'Không thể gửi yêu cầu vào lớp lúc này.',
        };
      }
    }
    return {
      success: false,
      message: 'Mã lớp không hợp lệ hoặc lớp học chưa được đồng bộ (vui lòng đăng nhập trước khi nhập mã lớp)!',
    };
  }

  if (isStudentMemberOfClass(targetClass, user)) {
    return {
      success: true,
      message: `Bạn đã là thành viên chính thức của lớp "${targetClass.name}"!`,
      classroom: targetClass,
    };
  }

  const pendingRequests = targetClass.pendingRequests || [];
  const existingPending = pendingRequests.find(
    (r) => doesRequestBelongToUser(r, user) && (!r.status || r.status === 'pending')
  );

  if (existingPending) {
    upsertMyTrackedJoinRequest(existingPending);
    return {
      success: false,
      alreadyPending: true,
      message: `Bạn đã gửi yêu cầu gia nhập lớp "${targetClass.name}". Vui lòng chờ giáo viên phụ trách phê duyệt!`,
      classroom: targetClass,
    };
  }

  const nowIso = new Date().toISOString();
  const deterministicId = makeDeterministicJoinReqId(targetClass.id, user);
  const newJoinRequest: ClassJoinRequest = {
    id: deterministicId,
    classId: targetClass.id,
    className: targetClass.name,
    classCode: targetClass.code,
    teacherId: targetClass.teacherId,
    teacherEmail: targetClass.teacherEmail,
    studentId: user.uid || user.id,
    studentName: user.fullName,
    studentEmail: user.email,
    studentCode: user.studentCode,
    note: note || 'Xin tham gia lớp học để làm bài thi',
    status: 'pending',
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  upsertMyTrackedJoinRequest(newJoinRequest);
  const updatedClass: Classroom = {
    ...targetClass,
    pendingRequests: [
      newJoinRequest,
      ...pendingRequests.filter((r) => !doesRequestBelongToUser(r, user)),
    ],
    updatedAt: nowIso,
  };

  const hasFbUser = Boolean(getFirebaseAuthUser());
  saveClassroom(updatedClass, { skipCloudSync: hasFbUser });
  const fsRes = await submitJoinRequestToFirestore(targetClass.id, newJoinRequest, user).catch(
    () => ({ alreadyPending: false, requestId: deterministicId })
  );
  if (fsRes.alreadyPending) {
    return {
      success: false,
      alreadyPending: true,
      message: `Yêu cầu vào lớp "${targetClass.name}" đã được ghi nhận và đang chờ giáo viên duyệt!`,
      classroom: updatedClass,
    };
  }
  if (!hasFbUser) {
    await triggerCloudSync();
  }

  return {
    success: true,
    message: `Đã gửi yêu cầu tham gia lớp "${targetClass.name}" thành công! Vui lòng chờ giáo viên duyệt vào lớp.`,
    classroom: updatedClass,
  };
}

/**
 * Học sinh gửi yêu cầu xin gia nhập lớp học bằng Mã Lớp
 */
export function submitClassJoinRequest(
  classCode: string,
  user: UserAccount,
  note?: string
): { success: boolean; alreadyPending?: boolean; message: string; classroom?: Classroom } {
  const cleanCode = classCode.trim().toUpperCase();
  if (!cleanCode) {
    return { success: false, message: 'Vui lòng nhập mã lớp học!' };
  }

  const allClassrooms = getAllClassrooms();
  const targetClass = allClassrooms.find((c) => c.code.trim().toUpperCase() === cleanCode);

  if (!targetClass) {
    return { success: false, message: 'Mã lớp không hợp lệ hoặc lớp học không tồn tại trên hệ thống!' };
  }

  // 1. Kiểm tra nếu học sinh đã là thành viên chính thức
  if (isStudentMemberOfClass(targetClass, user)) {
    return {
      success: true,
      message: `Bạn đã là thành viên chính thức của lớp "${targetClass.name}"!`,
      classroom: targetClass,
    };
  }

  // 2. Kiểm tra nếu học sinh đã gửi yêu cầu và đang chờ duyệt (chống spam)
  const existingTracked = getPendingJoinRequestForClass(targetClass.id, user, allClassrooms);
  if (existingTracked) {
    return {
      success: false,
      alreadyPending: true,
      message: `Bạn đã gửi yêu cầu gia nhập lớp "${targetClass.name}". Vui lòng chờ giáo viên phụ trách phê duyệt!`,
      classroom: targetClass,
    };
  }

  // 3. Tạo yêu cầu tham gia lớp mới với ID xác định theo (lớp, học sinh)
  const pendingRequests = targetClass.pendingRequests || [];
  const nowIso = new Date().toISOString();
  const deterministicId = makeDeterministicJoinReqId(targetClass.id, user);
  const newJoinRequest: ClassJoinRequest = {
    id: deterministicId,
    classId: targetClass.id,
    className: targetClass.name,
    classCode: targetClass.code,
    teacherId: targetClass.teacherId,
    teacherEmail: targetClass.teacherEmail,
    studentId: user.uid || user.id,
    studentName: user.fullName,
    studentEmail: user.email,
    studentCode: user.studentCode,
    note: note || 'Xin tham gia lớp học để làm bài thi',
    status: 'pending',
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  upsertMyTrackedJoinRequest(newJoinRequest);
  const updatedClass: Classroom = {
    ...targetClass,
    pendingRequests: [
      newJoinRequest,
      ...pendingRequests.filter((r) => !doesRequestBelongToUser(r, user)),
    ],
    updatedAt: nowIso,
  };

  const hasFbUser = Boolean(getFirebaseAuthUser());
  saveClassroom(updatedClass, { skipCloudSync: hasFbUser });
  void submitJoinRequestToFirestore(targetClass.id, newJoinRequest, user).catch(() => {});
  if (!hasFbUser) {
    void triggerCloudSync();
  }

  return {
    success: true,
    message: `Đã gửi yêu cầu tham gia lớp "${targetClass.name}" thành công! Vui lòng chờ giáo viên duyệt vào lớp.`,
    classroom: targetClass,
  };
}

/**
 * Giáo viên phê duyệt hoặc từ chối yêu cầu xin gia nhập lớp của học sinh (Chỉ duyệt 1 lần duy nhất)
 */
export function reviewClassJoinRequest(
  classId: string,
  requestId: string,
  action: 'approve' | 'reject'
): { success: boolean; message: string } {
  const allClassrooms = getAllClassrooms();
  const targetClass = allClassrooms.find((c) => c.id === classId);
  if (!targetClass) {
    return { success: false, message: 'Không tìm thấy lớp học!' };
  }

  const pendingRequests = targetClass.pendingRequests || [];
  const targetRequest = pendingRequests.find((r) => r.id === requestId);
  if (!targetRequest) {
    return { success: false, message: 'Yêu cầu này đã được xử lý trước đó!' };
  }

  const targetReqEmail = String(targetRequest.studentEmail || '').trim().toLowerCase();
  const targetReqCode = String(targetRequest.studentCode || '').trim().toUpperCase();

  // Loại bỏ yêu cầu vừa xử lý VÀ mọi yêu cầu trùng của cùng học sinh này
  const matchingRequests = pendingRequests.filter((r) => {
    if (r.id === requestId) return true;
    if (r.studentId && r.studentId === targetRequest.studentId) return true;
    if (targetReqEmail && r.studentEmail && r.studentEmail.trim().toLowerCase() === targetReqEmail) return true;
    if (targetReqCode && r.studentCode && r.studentCode.trim().toUpperCase() === targetReqCode) return true;
    return false;
  });
  const matchingIds = new Set(matchingRequests.map((r) => r.id));
  const remainingRequests = pendingRequests.filter((r) => !matchingIds.has(r.id));

  let updatedStudents = targetClass.students || [];

  if (action === 'approve') {
    const newStudent: StudentMember = {
      id: targetRequest.studentId,
      name: targetRequest.studentName,
      studentCode: targetRequest.studentCode || `SBD-${Math.floor(1000 + Math.random() * 9000)}`,
      email: targetRequest.studentEmail,
      joinedAt: new Date().toISOString().split('T')[0],
    };

    if (
      !updatedStudents.some(
        (s) =>
          s.id === newStudent.id ||
          (targetReqEmail && s.email && s.email.trim().toLowerCase() === targetReqEmail)
      )
    ) {
      updatedStudents = [...updatedStudents, newStudent];
    }
  }

  const nowIso = new Date().toISOString();
  const updatedClass: Classroom = {
    ...targetClass,
    students: updatedStudents,
    pendingRequests: remainingRequests,
    updatedAt: nowIso,
  };

  upsertMyTrackedJoinRequest({
    ...targetRequest,
    status: action === 'approve' ? 'approved' : 'rejected',
    updatedAt: nowIso,
  });

  saveClassroom(updatedClass, { skipCloudSync: Boolean(getFirebaseAuthUser()) });

  // Sync updated parent classroom immediately + update subcollection requests so approved requests NEVER reappear
  const nextStatus = action === 'approve' ? 'approved' : 'rejected';
  void syncSingleClassroomToFirestoreNow(updatedClass, getCurrentUser()).then(() => {
    if (action === 'approve' && targetRequest.studentId && targetRequest.studentEmail) {
      const fbUser = getFirebaseAuthUser();
      const teacherEmails = Array.from(
        new Set(
          [targetClass.teacherEmail, fbUser?.email, getCurrentUser()?.email]
            .filter((x): x is string => Boolean(x))
            .map((e) => e.trim().toLowerCase())
        )
      );
      if (fbUser && teacherEmails.length > 0) {
        void linkExistingStudentToTeacherCredentialsFirestore({
          uid: targetRequest.studentId,
          email: targetRequest.studentEmail,
          username: targetRequest.studentEmail.split('@')[0],
          fullName: targetRequest.studentName,
          studentCode: targetRequest.studentCode,
          school: targetClass.name,
          classId,
          teacherEmails,
        }).catch(() => {});
      }
    }
  });
  matchingRequests.forEach((reqItem) => {
    void syncJoinRequestDecisionToFirestore(classId, reqItem.id, nextStatus).catch(() => {});
  });

  return {
    success: true,
    message:
      action === 'approve'
        ? `Đã duyệt học sinh ${targetRequest.studentName} vào lớp (chỉ duyệt 1 lần)!`
        : `Đã từ chối yêu cầu của ${targetRequest.studentName}.`,
  };
}

// =========================================================================
// 3b. QUẢN LÝ BẢNG ĐIỂM & VINH DANH (TEACHER SCOREBOARDS)
// =========================================================================

export function getAllScoreboards(): Scoreboard[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SCOREBOARDS);
    const list: Scoreboard[] = raw ? JSON.parse(raw) : [];
    const deletedSet = new Set(getDeletedScoreboardIds());
    return list.filter((s) => s && s.id && !deletedSet.has(s.id));
  } catch {
    return [];
  }
}

export function saveScoreboard(sb: Scoreboard, options?: { skipCloudSync?: boolean }): void {
  try {
    const wasDeleted = getDeletedScoreboardIds().includes(sb.id);
    if (wasDeleted) {
      removeDeletedIdByKey(STORAGE_KEY_DELETED_SCOREBOARDS, sb.id);
      markDirtySiteConfig('tombstones');
    }
    const list = getAllScoreboards();
    const stamped: Scoreboard = {
      ...sb,
      updatedAt: new Date().toISOString(),
    };
    const updated = [stamped, ...list.filter((item) => item.id !== stamped.id)];
    localStorage.setItem(STORAGE_KEY_SCOREBOARDS, JSON.stringify(updated));
    if (!options?.skipCloudSync) {
      markDirtyCloudEntity('scoreboards', stamped.id);
      scheduleCloudSync();
    } else {
      try {
        saveSnapshotToIndexedDB(buildFullSyncPayload());
      } catch {}
    }
  } catch (e) {
    console.error('Failed to save scoreboard:', e);
  }
}

export function deleteScoreboard(scoreboardId: string): void {
  try {
    addDeletedIdByKey(STORAGE_KEY_DELETED_SCOREBOARDS, scoreboardId);
    const updated = getAllScoreboards().filter((s) => s.id !== scoreboardId);
    localStorage.setItem(STORAGE_KEY_SCOREBOARDS, JSON.stringify(updated));
    void safeDeleteFirestoreDoc('scoreboards', scoreboardId).catch(() => {});
    markDirtySiteConfig('tombstones');
    scheduleCloudSync();
  } catch (e) {
    console.error('Failed to delete scoreboard:', e);
  }
}

/**
 * Giáo viên chủ động thêm trực tiếp học sinh vào lớp học
 */
export function addStudentDirectlyToClass(
  classId: string,
  studentData: { name: string; studentCode?: string; email?: string }
): { success: boolean; message: string } {
  const allClassrooms = getAllClassrooms();
  const targetClass = allClassrooms.find((c) => c.id === classId);
  if (!targetClass) {
    return { success: false, message: 'Không tìm thấy lớp học!' };
  }

  const newStudent: StudentMember = {
    id: 'hs_' + Date.now() + '_' + Math.random().toString(36).substring(2, 5),
    name: studentData.name.trim(),
    studentCode: studentData.studentCode?.trim() || `SBD-${Math.floor(1000 + Math.random() * 9000)}`,
    email: studentData.email?.trim() || undefined,
    joinedAt: new Date().toISOString().split('T')[0],
  };

  const updatedClass: Classroom = {
    ...targetClass,
    students: [...(targetClass.students || []), newStudent],
  };

  saveClassroom(updatedClass);
  void triggerCloudSync();

  return { success: true, message: `Đã thêm học sinh "${newStudent.name}" vào lớp thành công!` };
}

// =========================================================================
// 4. ĐỒNG BỘ DỮ LIỆU ĐÁM MÂY & BẢO TOÀN DỮ LIỆU KHI PUBLISH (MULTI-LAYER SYNC)
// =========================================================================

const IDB_NAME = 'EduTestResilientDB';
const IDB_STORE = 'snapshots';
const IDB_KEY = 'latest_full_state';

function getAllCourseProgressMap(): Record<string, StudentCourseProgress> {
  const map: Record<string, StudentCourseProgress> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(STORAGE_KEY_COURSE_PROGRESS + '_')) {
        const raw = localStorage.getItem(k);
        if (raw) {
          map[k] = JSON.parse(raw);
        }
      }
    }
  } catch {}
  return map;
}

function restoreCourseProgressMap(serverMap: Record<string, StudentCourseProgress>): void {
  try {
    Object.entries(serverMap).forEach(([key, val]) => {
      if (!key.startsWith(STORAGE_KEY_COURSE_PROGRESS + '_')) return;
      const existingRaw = localStorage.getItem(key);
      if (!existingRaw) {
        localStorage.setItem(key, JSON.stringify(val));
      } else {
        const localVal: StudentCourseProgress = JSON.parse(existingRaw);
        const localTs = new Date(localVal.lastStudiedAt || 0).getTime();
        const serverTs = new Date(val.lastStudiedAt || 0).getTime();
        if (serverTs > localTs) {
          localStorage.setItem(key, JSON.stringify(val));
        }
      }
    });
  } catch {}
}

export function buildFullSyncPayload() {
  const navTabsUpdatedAt = localStorage.getItem(STORAGE_KEY_NAV_TABS_UPDATED_AT) || undefined;
  const liveTextUpdatedAt = localStorage.getItem(STORAGE_KEY_LIVE_TEXT_UPDATED_AT) || undefined;
  return {
    teacherRequests: getAllTeacherRequests(),
    customExams: getAllExams().filter((e) => e.isCustom),
    customBundles: getAllBundles().filter((b) => b.isCustom),
    courses: getAllCourses(),
    classrooms: getAllClassrooms().map(sanitizeClassroomStudents),
    results: getExamResults(),
    courseProgress: getAllCourseProgressMap(),
    classroomHomeworks: getAllClassroomHomeworks(),
    homeworkSubmissions: getAllHomeworkSubmissions(),
    scoreboards: getAllScoreboards(),
    subjects: getAllSubjects(),
    navTabs: getNavTabs(),
    navTabsUpdatedAt,
    feedbacks: getAllFeedbacks(),
    liveTextOverrides: getLiveTextOverrides(),
    liveTextUpdatedAt,
    deletedExamIds: getDeletedExamIds(),
    deletedBundleIds: getDeletedBundleIds(),
    deletedClassroomIds: getDeletedClassroomIds(),
    deletedCourseIds: getDeletedCourseIds(),
    deletedResultIds: getDeletedResultIds(),
    deletedHomeworkIds: getDeletedHomeworkIds(),
    deletedClassroomHomeworkIds: getDeletedClassroomHomeworkIds(),
    deletedSubjectIds: getDeletedSubjectIds(),
    deletedScoreboardIds: getDeletedScoreboardIds(),
    lastSyncedAt: new Date().toISOString(),
  };
}

const IDB_COURSES_ARCHIVE_KEY = 'edutest_courses_archive_v1';

function saveSnapshotToIndexedDB(payload: any): void {
  try {
    if (typeof indexedDB === 'undefined') return;
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => {
      try {
        const db = req.result;
        const tx = db.transaction(IDB_STORE, 'readwrite');
        const store = tx.objectStore(IDB_STORE);
        const coursesArr: MicroCourse[] = Array.isArray(payload?.courses) ? payload.courses : [];
        if (coursesArr.length > 0) {
          store.put(payload, IDB_KEY);
          const archReq = store.get(IDB_COURSES_ARCHIVE_KEY);
          archReq.onsuccess = () => {
            try {
              const prevArch: MicroCourse[] = Array.isArray(archReq.result) ? archReq.result : [];
              const mergedMap = new Map<string, MicroCourse>();
              prevArch.forEach((c) => {
                if (c?.id) mergedMap.set(c.id, c);
              });
              coursesArr.forEach((c) => {
                if (c?.id) mergedMap.set(c.id, c);
              });
              store.put(Array.from(mergedMap.values()), IDB_COURSES_ARCHIVE_KEY);
            } catch {}
          };
        } else {
          // Never erase existing courses inside IDB_KEY snapshot with an empty array
          const prevReq = store.get(IDB_KEY);
          prevReq.onsuccess = () => {
            try {
              const prevSnap = prevReq.result;
              const prevCourses = Array.isArray(prevSnap?.courses) ? prevSnap.courses : [];
              const nextPayload =
                prevCourses.length > 0 && !initialPullCompleted
                  ? { ...payload, courses: prevCourses }
                  : payload;
              store.put(nextPayload, IDB_KEY);
            } catch {
              store.put(payload, IDB_KEY);
            }
          };
        }
      } catch {}
    };
  } catch {}
}

function loadSnapshotFromIndexedDB(): Promise<any | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') {
        resolve(null);
        return;
      }
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => {
        try {
          const db = req.result;
          const tx = db.transaction(IDB_STORE, 'readonly');
          const getReq = tx.objectStore(IDB_STORE).get(IDB_KEY);
          getReq.onsuccess = () => resolve(getReq.result || null);
          getReq.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export function loadCoursesArchiveFromIndexedDB(): Promise<MicroCourse[]> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') {
        resolve([]);
        return;
      }
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => {
        try {
          const db = req.result;
          const tx = db.transaction(IDB_STORE, 'readonly');
          const store = tx.objectStore(IDB_STORE);
          const archReq = store.get(IDB_COURSES_ARCHIVE_KEY);
          const snapReq = store.get(IDB_KEY);
          let archCourses: MicroCourse[] = [];
          let snapCourses: MicroCourse[] = [];
          let done = 0;
          const finish = () => {
            done++;
            if (done < 2) return;
            const map = new Map<string, MicroCourse>();
            [...snapCourses, ...archCourses].forEach((c) => {
              if (c && c.id && c.id !== 'course_ham_so_12' && c.id !== 'course_grammar_fast') {
                map.set(c.id, c);
              }
            });
            resolve(Array.from(map.values()));
          };
          archReq.onsuccess = () => {
            archCourses = Array.isArray(archReq.result) ? archReq.result : [];
            finish();
          };
          archReq.onerror = finish;
          snapReq.onsuccess = () => {
            snapCourses = Array.isArray(snapReq.result?.courses) ? snapReq.result.courses : [];
            finish();
          };
          snapReq.onerror = finish;
        } catch {
          resolve([]);
        }
      };
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

export interface CloudSyncState {
  status: 'idle' | 'syncing' | 'synced' | 'error';
  error?: string;
  lastSyncedAt?: string;
}

let currentSyncState: CloudSyncState = { status: 'idle' };
const syncStatusListeners = new Set<(state: CloudSyncState) => void>();

function updateSyncState(next: CloudSyncState): void {
  currentSyncState = next;
  syncStatusListeners.forEach((cb) => {
    try {
      cb(next);
    } catch {}
  });
}

export function getCloudSyncStatus(): CloudSyncState {
  return currentSyncState;
}

export function subscribeCloudSyncStatus(cb: (state: CloudSyncState) => void): () => void {
  syncStatusListeners.add(cb);
  cb(currentSyncState);
  return () => {
    syncStatusListeners.delete(cb);
  };
}

let syncDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let locationSyncTimer: ReturnType<typeof setTimeout> | null = null;
let autoSyncInitialized = false;
let initialPullCompleted = false;
let lastPullCompletedAtMs = 0;
let lastPullAuthUid = '';
let hasLocalMutations = false;
let lastLocalMutationMs = 0;
const dirtyEntityKeys = new Set<string>();
const dirtySiteConfigKeys = new Set<string>();
let dirtyUserProfile = false;

export function markDirtyCloudEntity(col: string, id: string): void {
  if (!col || !id) return;
  dirtyEntityKeys.add(`${col}/${id}`);
  const sanitized = sanitizeDocId(id);
  if (sanitized && sanitized !== id) {
    dirtyEntityKeys.add(`${col}/${sanitized}`);
  }
}

export function markDirtySiteConfig(key: 'tombstones' | 'subjects' | 'navTabs' | 'liveText'): void {
  dirtySiteConfigKeys.add(key);
}

export function markDirtyUserProfile(): void {
  dirtyUserProfile = true;
}

function clearDirtyCloudTracking(): void {
  dirtyEntityKeys.clear();
  dirtySiteConfigKeys.clear();
  dirtyUserProfile = false;
  if (syncDebounceTimer) {
    clearTimeout(syncDebounceTimer);
    syncDebounceTimer = null;
  }
  if (locationSyncTimer) {
    clearTimeout(locationSyncTimer);
    locationSyncTimer = null;
  }
}

function consumeDirtyCloudScope(): { scope: DirtyPushScope | null; hasAny: boolean } {
  const hasAny =
    dirtyEntityKeys.size > 0 || dirtySiteConfigKeys.size > 0 || dirtyUserProfile;
  if (!hasAny) return { scope: null, hasAny: false };
  const scope: DirtyPushScope = {
    entities: Array.from(dirtyEntityKeys),
    siteConfig: Array.from(dirtySiteConfigKeys),
    userProfile: dirtyUserProfile,
  };
  dirtyEntityKeys.clear();
  dirtySiteConfigKeys.clear();
  dirtyUserProfile = false;
  return { scope, hasAny: true };
}

function restoreDirtyCloudScope(scope: DirtyPushScope | null): void {
  if (!scope) return;
  scope.entities?.forEach((k) => dirtyEntityKeys.add(k));
  scope.siteConfig?.forEach((k) => dirtySiteConfigKeys.add(k));
  if (scope.userProfile) dirtyUserProfile = true;
}

let pushInFlightPromise: Promise<{
  success: boolean;
  lastSyncedAt?: string;
  firestoreSynced?: boolean;
  error?: string;
}> | null = null;
let pendingPushQueued = false;
let pullInFlightPromise: Promise<{
  success: boolean;
  mergedCount?: number;
  firestoreConnected?: boolean;
  error?: string;
}> | null = null;
let pendingPullQueued = false;
let offlineMigrationTriggered = false;

function getStoredArrayCount(key: string): number {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return 0;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

export function hasLocalCoursesCached(): boolean {
  return getStoredArrayCount(STORAGE_KEY_COURSES) > 0;
}

export function hasLocalCachedLibraryData(): boolean {
  return (
    getStoredArrayCount(STORAGE_KEY_CUSTOM_EXAMS) > 0 ||
    getStoredArrayCount(STORAGE_KEY_CUSTOM_BUNDLES) > 0 ||
    getStoredArrayCount(STORAGE_KEY_COURSES) > 0 ||
    getStoredArrayCount(STORAGE_KEY_CLASSROOMS) > 0
  );
}

export function scheduleCloudSync(debounceMs: number = 600): void {
  hasLocalMutations = true;
  lastLocalMutationMs = Date.now();
  try {
    const snapshot = buildFullSyncPayload();
    saveSnapshotToIndexedDB(snapshot);
  } catch {}

  if (locationSyncTimer) {
    clearTimeout(locationSyncTimer);
    locationSyncTimer = null;
  }
  if (syncDebounceTimer) {
    clearTimeout(syncDebounceTimer);
  }
  syncDebounceTimer = setTimeout(() => {
    syncDebounceTimer = null;
    void triggerCloudSync();
  }, Math.max(50, debounceMs));
}

function scheduleLocationCloudSync(): void {
  hasLocalMutations = true;
  lastLocalMutationMs = Date.now();
  try {
    const snapshot = buildFullSyncPayload();
    saveSnapshotToIndexedDB(snapshot);
  } catch {}

  if (syncDebounceTimer) return; // A regular sync is already pending and will flush location too
  if (locationSyncTimer) {
    clearTimeout(locationSyncTimer);
  }
  locationSyncTimer = setTimeout(() => {
    locationSyncTimer = null;
    void triggerCloudSync();
  }, 4000);
}

export function flushCloudSyncBeacon(): void {
  if (!initialPullCompleted || !hasLocalMutations) return;
  try {
    const payload = buildFullSyncPayload();
    saveSnapshotToIndexedDB(payload);
    void getAuthHeaders().then((headers) => {
      if (!headers.Authorization) return;
      void fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        keepalive: true,
        body: JSON.stringify(payload),
      }).catch(() => {});
    });
  } catch {}
}

export function initAutoSyncLifecycle(): void {
  if (autoSyncInitialized || typeof window === 'undefined') return;
  autoSyncInitialized = true;

  window.addEventListener('pagehide', flushCloudSyncBeacon);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flushCloudSyncBeacon();
    }
  });
}

export async function triggerCloudSync(options?: { forceFull?: boolean }): Promise<{
  success: boolean;
  lastSyncedAt?: string;
  firestoreSynced?: boolean;
  error?: string;
}> {
  if (pushInFlightPromise) {
    pendingPushQueued = true;
    return await pushInFlightPromise;
  }

  const runPush = async (): Promise<{
    success: boolean;
    lastSyncedAt?: string;
    firestoreSynced?: boolean;
    error?: string;
  }> => {
    let serverOk = false;
    let firestoreOk = false;
    let lastSyncedAt: string | undefined;
    let errorMsg: string | undefined;

    if (syncDebounceTimer) {
      clearTimeout(syncDebounceTimer);
      syncDebounceTimer = null;
    }
    if (locationSyncTimer) {
      clearTimeout(locationSyncTimer);
      locationSyncTimer = null;
    }

    const payload = buildFullSyncPayload();
    saveSnapshotToIndexedDB(payload);

    const fbUser = getFirebaseAuthUser();
    const currentWebUser = getCurrentUser();
    const hasCloudSession = Boolean(fbUser && !fbUser.isAnonymous);

    const { scope: dirtySnapshot, hasAny } = consumeDirtyCloudScope();

    // When nothing dirty exists in Firestore session and not forced, skip unnecessary cloud roundtrip
    if (hasCloudSession && !options?.forceFull && !hasAny && !hasLocalMutations) {
      return {
        success: true,
        firestoreSynced: true,
        lastSyncedAt: currentSyncState.lastSyncedAt,
      };
    }

    updateSyncState({ status: 'syncing', lastSyncedAt: currentSyncState.lastSyncedAt });

    if (hasCloudSession) {
      const mutationWindowMs = hasLocalMutations ? lastLocalMutationMs : 0;
      const shouldPushToExpress = Boolean(options?.forceFull);
      const [serverRes, firestoreRes] = await Promise.all([
        shouldPushToExpress
          ? (async () => {
              try {
                const authHeaders = await getAuthHeaders();
                if (!authHeaders.Authorization) return null;
                const res = await fetch('/api/sync', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', ...authHeaders },
                  keepalive: true,
                  body: JSON.stringify(payload),
                });
                return res.ok ? await res.json() : null;
              } catch {
                return null;
              }
            })()
          : Promise.resolve(null),
        pushAuthorizedDataToFirestore(payload, currentWebUser, {
          lastLocalMutationMs: mutationWindowMs,
          dirtyKeys: options?.forceFull ? undefined : dirtySnapshot || { entities: [], siteConfig: [], userProfile: false },
          forceFull: options?.forceFull,
          onCourseMediaOffloaded: (cleanCourse) => applyHydratedCourseToLocalCache(cleanCourse),
        }).catch((err) => ({
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        })),
      ]);

      if (serverRes) {
        serverOk = true;
        lastSyncedAt = serverRes.lastSyncedAt;
      }
      if (firestoreRes?.ok) {
        firestoreOk = true;
        hasLocalMutations = dirtyEntityKeys.size > 0 || dirtySiteConfigKeys.size > 0 || dirtyUserProfile;
        lastSyncedAt = lastSyncedAt || payload.lastSyncedAt;
      } else {
        restoreDirtyCloudScope(dirtySnapshot);
        errorMsg = firestoreRes?.error || 'Không thể đẩy dữ liệu lên Cloud Firestore.';
      }
    }

    if (hasCloudSession && !firestoreOk) {
      const finalError = errorMsg || 'Không thể đẩy dữ liệu lên Cloud Firestore.';
      updateSyncState({ status: 'error', error: finalError, lastSyncedAt });
      return {
        success: false,
        lastSyncedAt,
        firestoreSynced: false,
        error: finalError,
      };
    }

    const ok = hasCloudSession ? firestoreOk : serverOk;
    updateSyncState({
      status: ok ? 'synced' : 'idle',
      lastSyncedAt: lastSyncedAt || currentSyncState.lastSyncedAt,
    });

    return {
      success: ok,
      lastSyncedAt,
      firestoreSynced: firestoreOk,
    };
  };

  pushInFlightPromise = runPush().finally(() => {
    pushInFlightPromise = null;
    if (pendingPushQueued) {
      pendingPushQueued = false;
      void triggerCloudSync();
    }
  });

  return await pushInFlightPromise;
}

function getSyncItemTs(item: any): number {
  if (!item || typeof item !== 'object') return 0;
  const raw =
    item.gradedAt ||
    item.updatedAt ||
    item.reviewedAt ||
    item.submittedAt ||
    item.completedAt ||
    item.createdAt ||
    0;
  const ts = new Date(raw).getTime();
  return Number.isFinite(ts) ? ts : 0;
}

function mergeByTimestamp<T extends { id: string }>(
  incomingList: T[],
  localList: T[],
  deletedSet: Set<string>,
  preferIncomingOnTie: boolean = true
): T[] {
  const map = new Map<string, T>();
  for (const item of localList) {
    if (item && item.id && !deletedSet.has(item.id)) {
      map.set(item.id, item);
    }
  }
  for (const item of incomingList) {
    if (!item || !item.id || deletedSet.has(item.id)) continue;
    const prev = map.get(item.id);
    if (!prev) {
      map.set(item.id, item);
      continue;
    }
    const prevTs = getSyncItemTs(prev);
    const nextTs = getSyncItemTs(item);
    if (nextTs > prevTs || (nextTs === prevTs && preferIncomingOnTie)) {
      map.set(item.id, item);
    }
  }
  return Array.from(map.values());
}

function mergeCoursesByTimestamp(
  incomingList: MicroCourse[],
  localList: MicroCourse[],
  deletedSet: Set<string>,
  preferIncomingOnTie: boolean = true
): MicroCourse[] {
  const map = new Map<string, MicroCourse>();
  for (const item of localList) {
    if (item && item.id && !deletedSet.has(item.id)) {
      map.set(item.id, item);
    }
  }
  for (const item of incomingList) {
    if (!item || !item.id || deletedSet.has(item.id)) continue;
    const prev = map.get(item.id);
    if (!prev) {
      map.set(item.id, item);
      continue;
    }
    const prevTs = getSyncItemTs(prev);
    const nextTs = getSyncItemTs(item);
    const incomingIsMetadataStub = item.schemaVersion === 2 && item.detailsLoaded === false;
    const prevHasDetails =
      prev.detailsLoaded !== false &&
      ((prev.chapters && prev.chapters.length > 0) || (prev.lessons && prev.lessons.length > 0));

    if (incomingIsMetadataStub && prevHasDetails) {
      if (nextTs > prevTs) {
        // Remote subcollections/metadata updated — mark detailsLoaded: false so view re-hydrates cleanly
        map.set(item.id, { ...item, detailsLoaded: false });
      } else {
        // Keep local hydrated chapters while optionally updating metadata on timestamp tie
        const base = preferIncomingOnTie && nextTs === prevTs ? { ...prev, ...item } : prev;
        map.set(item.id, {
          ...base,
          chapters: prev.chapters,
          lessons: prev.lessons,
          chapterCount: prev.chapters?.length ?? item.chapterCount,
          lessonCount:
            prev.chapters && prev.chapters.length > 0
              ? prev.chapters.reduce((s, ch) => s + (ch.lessons?.length || 0), 0)
              : prev.lessons?.length ?? item.lessonCount,
          detailsLoaded: true,
        });
      }
      continue;
    }

    if (nextTs > prevTs || (nextTs === prevTs && preferIncomingOnTie)) {
      map.set(item.id, item);
    }
  }
  return Array.from(map.values());
}

function applyMergedSnapshotToLocalStorage(
  sourceData: any,
  options: { preferIncomingOnTie?: boolean } = {}
): void {
  if (!sourceData || typeof sourceData !== 'object') return;
  const preferIncomingOnTie = options.preferIncomingOnTie !== false;
  purgeLegacyLocalCredentials();

  // 1. Merge deleted tombstones first so deleted records stay deleted everywhere
  const mergedDeletedExams = Array.from(
    new Set([...getDeletedExamIds(), ...(Array.isArray(sourceData.deletedExamIds) ? sourceData.deletedExamIds : [])])
  );
  localStorage.setItem(STORAGE_KEY_DELETED_EXAMS, JSON.stringify(mergedDeletedExams));

  const mergedDeletedBundles = Array.from(
    new Set([...getDeletedBundleIds(), ...(Array.isArray(sourceData.deletedBundleIds) ? sourceData.deletedBundleIds : [])])
  );
  localStorage.setItem(STORAGE_KEY_DELETED_BUNDLES, JSON.stringify(mergedDeletedBundles));

  const mergedDeletedClasses = Array.from(
    new Set([...getDeletedClassroomIds(), ...(Array.isArray(sourceData.deletedClassroomIds) ? sourceData.deletedClassroomIds : [])])
  );
  localStorage.setItem(STORAGE_KEY_DELETED_CLASSROOMS, JSON.stringify(mergedDeletedClasses));

  const mergedDeletedCourses = Array.from(
    new Set([...getDeletedCourseIds(), ...(Array.isArray(sourceData.deletedCourseIds) ? sourceData.deletedCourseIds : [])])
  );
  localStorage.setItem(STORAGE_KEY_DELETED_COURSES, JSON.stringify(mergedDeletedCourses));

  const mergedDeletedResults = Array.from(
    new Set([...getDeletedResultIds(), ...(Array.isArray(sourceData.deletedResultIds) ? sourceData.deletedResultIds : [])])
  );
  localStorage.setItem(STORAGE_KEY_DELETED_RESULTS, JSON.stringify(mergedDeletedResults));

  const mergedDeletedHomework = Array.from(
    new Set([...getDeletedHomeworkIds(), ...(Array.isArray(sourceData.deletedHomeworkIds) ? sourceData.deletedHomeworkIds : [])])
  );
  localStorage.setItem(STORAGE_KEY_DELETED_HOMEWORK, JSON.stringify(mergedDeletedHomework));

  const mergedDeletedClassroomHomework = Array.from(
    new Set([
      ...getDeletedClassroomHomeworkIds(),
      ...(Array.isArray(sourceData.deletedClassroomHomeworkIds) ? sourceData.deletedClassroomHomeworkIds : []),
    ])
  );
  localStorage.setItem(STORAGE_KEY_DELETED_CLASSROOM_HOMEWORKS, JSON.stringify(mergedDeletedClassroomHomework));

  const mergedDeletedSubjects = Array.from(
    new Set([...getDeletedSubjectIds(), ...(Array.isArray(sourceData.deletedSubjectIds) ? sourceData.deletedSubjectIds : [])])
  );
  localStorage.setItem(STORAGE_KEY_DELETED_SUBJECTS, JSON.stringify(mergedDeletedSubjects));

  const mergedDeletedScoreboards = Array.from(
    new Set([
      ...getDeletedScoreboardIds(),
      ...(Array.isArray(sourceData.deletedScoreboardIds) ? sourceData.deletedScoreboardIds : []),
    ])
  );
  localStorage.setItem(STORAGE_KEY_DELETED_SCOREBOARDS, JSON.stringify(mergedDeletedScoreboards));

  const delExamSet = new Set(mergedDeletedExams);
  const delBundleSet = new Set(mergedDeletedBundles);
  const delClassSet = new Set(mergedDeletedClasses);
  const delCourseSet = new Set(mergedDeletedCourses);
  const delResultSet = new Set(mergedDeletedResults);
  const delHomeworkSet = new Set(mergedDeletedHomework);
  const delClassroomHomeworkSet = new Set(mergedDeletedClassroomHomework);
  const delSubjectSet = new Set(mergedDeletedSubjects);
  const delScoreboardSet = new Set(mergedDeletedScoreboards);

  // 2. Merge classrooms (scrub any legacy student credentials)
  if (sourceData.classrooms && Array.isArray(sourceData.classrooms)) {
    const localClasses = getAllClassrooms();
    const sanitizedIncoming = sourceData.classrooms.map(sanitizeClassroomStudents);
    const merged = mergeByTimestamp(sanitizedIncoming, localClasses, delClassSet, preferIncomingOnTie);
    localStorage.setItem(STORAGE_KEY_CLASSROOMS, JSON.stringify(merged));
  }

  // 4. Merge custom exams
  if (sourceData.customExams && Array.isArray(sourceData.customExams)) {
    const localExams = getAllExams().filter((e) => e.isCustom);
    const merged = mergeByTimestamp(sourceData.customExams, localExams, delExamSet, preferIncomingOnTie);
    localStorage.setItem(STORAGE_KEY_CUSTOM_EXAMS, JSON.stringify(merged));
  }

  // 5. Merge custom bundles
  if (sourceData.customBundles && Array.isArray(sourceData.customBundles)) {
    const localBundles = getAllBundles().filter((b) => b.isCustom);
    const merged = mergeByTimestamp(sourceData.customBundles, localBundles, delBundleSet, preferIncomingOnTie);
    localStorage.setItem(STORAGE_KEY_CUSTOM_BUNDLES, JSON.stringify(merged));
  }

  // 6. Merge courses (preserve hydrated v2 subcollection content locally when incoming is metadata-only)
  if (sourceData.courses && Array.isArray(sourceData.courses)) {
    const localCourses = getAllCourses();
    const merged = mergeCoursesByTimestamp(
      sourceData.courses,
      localCourses,
      delCourseSet,
      preferIncomingOnTie
    );
    localStorage.setItem(STORAGE_KEY_COURSES, JSON.stringify(merged));
  }

  // 7. Merge exam results
  if (sourceData.results && Array.isArray(sourceData.results)) {
    const localResults = getExamResults();
    const merged = mergeByTimestamp(sourceData.results, localResults, delResultSet, preferIncomingOnTie);
    localStorage.setItem(STORAGE_KEY_RESULTS, JSON.stringify(merged));
  }

  // 8. Merge SCORM / course progress
  if (sourceData.courseProgress && typeof sourceData.courseProgress === 'object') {
    restoreCourseProgressMap(sourceData.courseProgress);
  }

  // 8a. Merge classroom homeworks
  if (sourceData.classroomHomeworks && Array.isArray(sourceData.classroomHomeworks)) {
    const localHomeworks = getAllClassroomHomeworks();
    const merged = mergeByTimestamp(
      sourceData.classroomHomeworks,
      localHomeworks,
      delClassroomHomeworkSet,
      preferIncomingOnTie
    );
    localStorage.setItem(STORAGE_KEY_CLASSROOM_HOMEWORKS, JSON.stringify(merged));
  }

  // 8b. Merge homework submissions
  if (sourceData.homeworkSubmissions && Array.isArray(sourceData.homeworkSubmissions)) {
    const localSubs = getAllHomeworkSubmissions();
    const merged = mergeByTimestamp(
      sourceData.homeworkSubmissions,
      localSubs,
      delHomeworkSet,
      preferIncomingOnTie
    );
    localStorage.setItem(STORAGE_KEY_HOMEWORK_SUBMISSIONS, JSON.stringify(merged));
  }

  // 9. Merge custom subjects
  if (sourceData.subjects && Array.isArray(sourceData.subjects) && sourceData.subjects.length > 0) {
    const rawSubj = localStorage.getItem(STORAGE_KEY_CUSTOM_SUBJECTS);
    const localSubjects: CustomSubject[] = rawSubj ? JSON.parse(rawSubj) : [];
    const merged = mergeByTimestamp(sourceData.subjects, localSubjects, delSubjectSet, preferIncomingOnTie);
    localStorage.setItem(STORAGE_KEY_CUSTOM_SUBJECTS, JSON.stringify(merged));
  }

  // 10. Restore nav tabs only when incoming is newer (or local has no customized timestamp)
  if (sourceData.navTabs && Array.isArray(sourceData.navTabs) && sourceData.navTabs.length > 0) {
    const localNavTs = new Date(localStorage.getItem(STORAGE_KEY_NAV_TABS_UPDATED_AT) || 0).getTime() || 0;
    const incomingNavTs = new Date(sourceData.navTabsUpdatedAt || 0).getTime() || 0;
    const hasLocalTabs = Boolean(localStorage.getItem(STORAGE_KEY_NAV_TABS));
    if (!hasLocalTabs || incomingNavTs > localNavTs || (incomingNavTs === localNavTs && preferIncomingOnTie)) {
      const filtered = sourceData.navTabs.filter((t: NavTabItem) => {
        const tv = (t as any).targetView;
        return tv !== 'oj' && t.id !== 'tab_oj' && tv !== 'battle' && t.id !== 'tab_battle';
      });
      if (filtered.length > 0) {
        const migrated = injectGamesTabIfNeeded(filtered);
        localStorage.setItem(STORAGE_KEY_NAV_TABS, JSON.stringify(migrated.tabs));
        if (sourceData.navTabsUpdatedAt) {
          localStorage.setItem(STORAGE_KEY_NAV_TABS_UPDATED_AT, String(sourceData.navTabsUpdatedAt));
        }
      }
    }
  }

  // 11. Merge feedbacks
  if (sourceData.feedbacks && Array.isArray(sourceData.feedbacks)) {
    const localFeedbacks = getAllFeedbacks();
    const merged = mergeByTimestamp(sourceData.feedbacks, localFeedbacks, new Set(), preferIncomingOnTie);
    localStorage.setItem(STORAGE_KEY_FEEDBACKS, JSON.stringify(merged));
  }

  // 12. Merge live text overrides using timestamps
  if (sourceData.liveTextOverrides && typeof sourceData.liveTextOverrides === 'object') {
    const localLiveTs = new Date(localStorage.getItem(STORAGE_KEY_LIVE_TEXT_UPDATED_AT) || 0).getTime() || 0;
    const incomingLiveTs = new Date(sourceData.liveTextUpdatedAt || 0).getTime() || 0;
    const mergedText =
      incomingLiveTs > localLiveTs
        ? { ...getLiveTextOverrides(), ...sourceData.liveTextOverrides }
        : preferIncomingOnTie && incomingLiveTs === localLiveTs
        ? { ...getLiveTextOverrides(), ...sourceData.liveTextOverrides }
        : { ...sourceData.liveTextOverrides, ...getLiveTextOverrides() };
    localStorage.setItem(STORAGE_KEY_LIVE_TEXT, JSON.stringify(mergedText));
    if (incomingLiveTs > localLiveTs && sourceData.liveTextUpdatedAt) {
      localStorage.setItem(STORAGE_KEY_LIVE_TEXT_UPDATED_AT, String(sourceData.liveTextUpdatedAt));
    }
  }

  // 13. Merge teacher requests
  if (sourceData.teacherRequests && Array.isArray(sourceData.teacherRequests)) {
    const localReqs = getAllTeacherRequests();
    const merged = mergeByTimestamp(sourceData.teacherRequests, localReqs, new Set(), preferIncomingOnTie);
    localStorage.setItem(STORAGE_KEY_TEACHER_REQUESTS, JSON.stringify(merged));
  }

  // 14. Merge scoreboards
  if (sourceData.scoreboards && Array.isArray(sourceData.scoreboards)) {
    const localScoreboards = getAllScoreboards();
    const merged = mergeByTimestamp(
      sourceData.scoreboards,
      localScoreboards,
      delScoreboardSet,
      preferIncomingOnTie
    );
    localStorage.setItem(STORAGE_KEY_SCOREBOARDS, JSON.stringify(merged));
  }

  // 15. Merge student's tracked join requests from Firestore collectionGroup
  if (sourceData.myJoinRequests && Array.isArray(sourceData.myJoinRequests)) {
    const localTracked = getMyTrackedJoinRequests();
    const merged = mergeByTimestamp(
      sourceData.myJoinRequests,
      localTracked,
      new Set(),
      preferIncomingOnTie
    );
    localStorage.setItem(STORAGE_KEY_MY_JOIN_REQUESTS, JSON.stringify(merged.slice(0, 100)));
  }
}

export function applyRealtimeCloudDelta(
  delta: FirestoreSyncSnapshot,
  removedByCollection: Record<string, string[]> = {}
): void {
  const removeMap: {
    col: string;
    storageKey: string;
    delKey: string;
  }[] = [
    { col: 'exams', storageKey: STORAGE_KEY_CUSTOM_EXAMS, delKey: STORAGE_KEY_DELETED_EXAMS },
    { col: 'bundles', storageKey: STORAGE_KEY_CUSTOM_BUNDLES, delKey: STORAGE_KEY_DELETED_BUNDLES },
    { col: 'classrooms', storageKey: STORAGE_KEY_CLASSROOMS, delKey: STORAGE_KEY_DELETED_CLASSROOMS },
    { col: 'courses', storageKey: STORAGE_KEY_COURSES, delKey: STORAGE_KEY_DELETED_COURSES },
    { col: 'results', storageKey: STORAGE_KEY_RESULTS, delKey: STORAGE_KEY_DELETED_RESULTS },
    { col: 'classroomHomeworks', storageKey: STORAGE_KEY_CLASSROOM_HOMEWORKS, delKey: STORAGE_KEY_DELETED_CLASSROOM_HOMEWORKS },
    { col: 'homeworkSubmissions', storageKey: STORAGE_KEY_HOMEWORK_SUBMISSIONS, delKey: STORAGE_KEY_DELETED_HOMEWORK },
    { col: 'scoreboards', storageKey: STORAGE_KEY_SCOREBOARDS, delKey: STORAGE_KEY_DELETED_SCOREBOARDS },
  ];

  for (const cfg of removeMap) {
    const removedIds = removedByCollection[cfg.col];
    if (removedIds && removedIds.length > 0) {
      const remSet = new Set(removedIds);
      try {
        const raw = localStorage.getItem(cfg.storageKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            localStorage.setItem(
              cfg.storageKey,
              JSON.stringify(parsed.filter((item: any) => item && !remSet.has(item.id)))
            );
          }
        }
        // NOTE: Never add onSnapshot `removed` events into STORAGE_KEY_DELETED_* tombstones!
        // Scoped queries fire `removed` when visibility/access/limit shifts, not just on deletion.
      } catch {}
    }
  }

  if (delta.joinRequestsByClassId && typeof delta.joinRequestsByClassId === 'object') {
    const localClasses = getAllClassrooms();
    let changedReqs = false;
    const nextClasses = localClasses.map((cls) => {
      const nextReqs = delta.joinRequestsByClassId?.[cls.id];
      if (!nextReqs) return cls;
      changedReqs = true;
      return sanitizeClassroomStudents({ ...cls, pendingRequests: nextReqs });
    });
    if (changedReqs) {
      localStorage.setItem(STORAGE_KEY_CLASSROOMS, JSON.stringify(nextClasses));
    }
  }

  applyMergedSnapshotToLocalStorage(delta, { preferIncomingOnTie: true });
  updateSyncState({ status: 'synced', lastSyncedAt: new Date().toISOString() });
  try {
    saveSnapshotToIndexedDB(buildFullSyncPayload());
  } catch {}
}

export async function pullDataFromServer(options?: {
  forceFull?: boolean;
  minIntervalMs?: number;
  activeClassId?: string;
}): Promise<{
  success: boolean;
  mergedCount?: number;
  firestoreConnected?: boolean;
  error?: string;
}> {
  const preFbUser = getFirebaseAuthUser();
  const currentAuthUid = preFbUser && !preFbUser.isAnonymous ? preFbUser.uid : '';
  const authChangedSinceLastPull = currentAuthUid !== lastPullAuthUid;

  if (
    !options?.forceFull &&
    !authChangedSinceLastPull &&
    options?.minIntervalMs &&
    initialPullCompleted &&
    lastPullCompletedAtMs > 0 &&
    Date.now() - lastPullCompletedAtMs < options.minIntervalMs
  ) {
    return { success: true, firestoreConnected: Boolean(preFbUser) };
  }

  if (pullInFlightPromise) {
    pendingPullQueued = true;
    return await pullInFlightPromise;
  }

  const executePull = async (): Promise<{
    success: boolean;
    mergedCount?: number;
    firestoreConnected?: boolean;
    error?: string;
  }> => {
    let anySuccess = false;
    let firestoreConnected = false;
    let firestorePullError: string | undefined;

    try {
      const fbUser = getFirebaseAuthUser();
      const currentWebUser = getCurrentUser();
      const hasCloudUser = Boolean(fbUser && !fbUser.isAnonymous);

      // 1. Hydrate IndexedDB local cache synchronously on initial boot only (0ms optimistic render)
      if (!initialPullCompleted) {
        const idbBackup = await loadSnapshotFromIndexedDB().catch(() => null);
        if (idbBackup) {
          applyMergedSnapshotToLocalStorage(idbBackup, { preferIncomingOnTie: false });
          anySuccess = true;
        }
      }

      // 2. Direct single-roundtrip Delta/Full Pull (skip redundant /api/sync when Cloud Auth is active)
      const activeAuthUid = hasCloudUser && fbUser ? fbUser.uid : '';
      const didAuthChange = activeAuthUid !== lastPullAuthUid;
      const forceFull = options?.forceFull ?? (!hasLocalCachedLibraryData() || didAuthChange);
      const forceCoursesFull = !hasLocalCoursesCached() || didAuthChange;
      const activeCls = options?.activeClassId ?? getActiveClassId();
      const firestorePromise = (
        hasCloudUser
          ? pullAuthenticatedDataFromFirestore(currentWebUser, {
              forceFull,
              forceCoursesFull,
              activeClassId: activeCls || undefined,
            })
          : pullPublicDataFromFirestore()
      ).catch((fsErr) => {
        firestorePullError = fsErr instanceof Error ? fsErr.message : String(fsErr);
        console.warn('Firestore pull error:', firestorePullError);
        return null;
      });

      const serverPromise = !hasCloudUser
        ? fetch('/api/sync?skipCloud=1')
            .then((res) => (res.ok ? res.json() : null))
            .catch(() => null)
        : Promise.resolve(null);

      const [serverJson, firestoreSnapshot] = await Promise.all([serverPromise, firestorePromise]);

      if (serverJson && serverJson.success && serverJson.data) {
        applyMergedSnapshotToLocalStorage(serverJson.data, { preferIncomingOnTie: true });
        anySuccess = true;
      }

      if (firestoreSnapshot !== null) {
        firestoreConnected = hasCloudUser;
        if (
          Array.isArray(firestoreSnapshot.falselyTombstonedCourseIds) &&
          firestoreSnapshot.falselyTombstonedCourseIds.length > 0
        ) {
          // Courses still exist on Cloud Firestore: clean false tombstones locally & on cloud
          const falseSet = new Set(firestoreSnapshot.falselyTombstonedCourseIds);
          const cleanedLocalDeleted = getDeletedCourseIds().filter((id) => !falseSet.has(id));
          localStorage.setItem(STORAGE_KEY_DELETED_COURSES, JSON.stringify(cleanedLocalDeleted));
          if (
            currentWebUser &&
            (currentWebUser.role === 'teacher' || isMasterAdminUser(currentWebUser))
          ) {
            void clearCoursesFromCloudTombstones(
              firestoreSnapshot.falselyTombstonedCourseIds,
              [],
              getAllClassrooms(),
              currentWebUser
            ).catch(() => {});
          }
        }
        if (Object.keys(firestoreSnapshot).length > 0) {
          applyMergedSnapshotToLocalStorage(firestoreSnapshot, { preferIncomingOnTie: true });
          anySuccess = true;
        }
        if (currentSyncState.status !== 'error') {
          updateSyncState({ status: 'synced', lastSyncedAt: new Date().toISOString() });
        }
      } else if (firestorePullError) {
        updateSyncState({ status: 'error', error: firestorePullError });
      }

      // 3. Non-blocking background push ONLY when real local mutations exist (never overwrite cloud tombstones)
      if (hasCloudUser && hasLocalMutations) {
        void triggerCloudSync();
      } else if (hasCloudUser && !offlineMigrationTriggered) {
        offlineMigrationTriggered = true;
        const preLocal = buildFullSyncPayload();
        const isTeacherOrAdmin =
          currentWebUser?.role === 'teacher' || isMasterAdminUser(currentWebUser);
        if (
          isTeacherOrAdmin &&
          (preLocal.customExams.length > 0 ||
            preLocal.customBundles.length > 0 ||
            preLocal.courses.length > 0 ||
            preLocal.classrooms.length > 0)
        ) {
          const entitiesToCheck: string[] = [
            ...preLocal.customExams.map((e) => `exams/${sanitizeDocId(e.id)}`),
            ...preLocal.customBundles.map((b) => `bundles/${sanitizeDocId(b.id)}`),
            ...preLocal.courses.map((c) => `courses/${sanitizeDocId(c.id)}`),
            ...preLocal.classrooms.map((cls) => `classrooms/${sanitizeDocId(cls.id)}`),
          ];
          void pushAuthorizedDataToFirestore(preLocal, currentWebUser, {
            lastLocalMutationMs: 0,
            dirtyKeys: { entities: entitiesToCheck, siteConfig: [], userProfile: false },
          }).catch(() => {});
        }
      }

      saveSnapshotToIndexedDB(buildFullSyncPayload());
      lastPullAuthUid = activeAuthUid;
      lastPullCompletedAtMs = Date.now();
      return { success: anySuccess, firestoreConnected, error: firestorePullError };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: anySuccess, firestoreConnected, error: msg };
    } finally {
      initialPullCompleted = true;
    }
  };

  pullInFlightPromise = executePull().finally(() => {
    pullInFlightPromise = null;
    if (pendingPullQueued) {
      pendingPullQueued = false;
      void pullDataFromServer();
    }
  });

  return await pullInFlightPromise;
}

export function exportAllDataAsJson(): string {
  const fullBackup = {
    version: '1.1',
    exportedAt: new Date().toISOString(),
    ...buildFullSyncPayload(),
  };
  return JSON.stringify(fullBackup, null, 2);
}

export function importAllDataFromJson(jsonStr: string): boolean {
  try {
    const data = JSON.parse(jsonStr);
    if (!data || typeof data !== 'object') return false;
    purgeLegacyLocalCredentials();

    if (data.classrooms && Array.isArray(data.classrooms)) {
      localStorage.setItem(
        STORAGE_KEY_CLASSROOMS,
        JSON.stringify(data.classrooms.map(sanitizeClassroomStudents))
      );
    }
    if (data.customExams && Array.isArray(data.customExams)) {
      localStorage.setItem(STORAGE_KEY_CUSTOM_EXAMS, JSON.stringify(data.customExams));
    }
    if (data.customBundles && Array.isArray(data.customBundles)) {
      localStorage.setItem(STORAGE_KEY_CUSTOM_BUNDLES, JSON.stringify(data.customBundles));
    }
    if (data.courses && Array.isArray(data.courses)) {
      localStorage.setItem(STORAGE_KEY_COURSES, JSON.stringify(data.courses));
    }
    if (data.results && Array.isArray(data.results)) {
      localStorage.setItem(STORAGE_KEY_RESULTS, JSON.stringify(data.results));
    }
    if (data.courseProgress && typeof data.courseProgress === 'object') {
      restoreCourseProgressMap(data.courseProgress);
    }
    if (data.classroomHomeworks && Array.isArray(data.classroomHomeworks)) {
      localStorage.setItem(STORAGE_KEY_CLASSROOM_HOMEWORKS, JSON.stringify(data.classroomHomeworks));
    }
    if (data.homeworkSubmissions && Array.isArray(data.homeworkSubmissions)) {
      localStorage.setItem(STORAGE_KEY_HOMEWORK_SUBMISSIONS, JSON.stringify(data.homeworkSubmissions));
    }
    if (data.subjects && Array.isArray(data.subjects)) {
      localStorage.setItem(STORAGE_KEY_CUSTOM_SUBJECTS, JSON.stringify(data.subjects));
    }
    if (data.navTabs && Array.isArray(data.navTabs)) {
      localStorage.setItem(STORAGE_KEY_NAV_TABS, JSON.stringify(data.navTabs));
    }
    if (data.feedbacks && Array.isArray(data.feedbacks)) {
      localStorage.setItem(STORAGE_KEY_FEEDBACKS, JSON.stringify(data.feedbacks));
    }
    if (data.liveTextOverrides && typeof data.liveTextOverrides === 'object') {
      localStorage.setItem(STORAGE_KEY_LIVE_TEXT, JSON.stringify(data.liveTextOverrides));
    }
    if (data.teacherRequests && Array.isArray(data.teacherRequests)) {
      localStorage.setItem(STORAGE_KEY_TEACHER_REQUESTS, JSON.stringify(data.teacherRequests));
    }
    if (data.scoreboards && Array.isArray(data.scoreboards)) {
      localStorage.setItem(STORAGE_KEY_SCOREBOARDS, JSON.stringify(data.scoreboards));
    }
    hasLocalMutations = true;
    lastLocalMutationMs = Date.now();
    void triggerCloudSync({ forceFull: true });
    return true;
  } catch (err) {
    console.error('Failed to import backup data:', err);
    return false;
  }
}

export interface RecoverableCourseEntry {
  course: MicroCourse;
  source: 'cloud' | 'indexeddb' | 'local_hidden' | 'server_backup';
  isTombstoned: boolean;
}

export interface FullCourseRecoveryReport {
  entries: RecoverableCourseEntry[];
  tombstonedCourseIds: string[];
  orphanReferencedCourseIds: string[];
  error?: string;
}

export async function scanAllRecoverableCourses(): Promise<FullCourseRecoveryReport> {
  const curUser = getCurrentUser();
  const [cloudRes, idbCourses, serverCourses] = await Promise.all([
    scanRecoverableCloudCourses(curUser),
    loadCoursesArchiveFromIndexedDB().catch(() => [] as MicroCourse[]),
    fetch('/api/sync?skipCloud=1')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => (Array.isArray(j?.data?.courses) ? (j.data.courses as MicroCourse[]) : []))
      .catch(() => [] as MicroCourse[]),
  ]);

  let rawLocalCourses: MicroCourse[] = [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY_COURSES);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) rawLocalCourses = parsed;
    }
  } catch {}

  const tombSet = new Set<string>([
    ...getDeletedCourseIds(),
    ...(cloudRes.tombstonedCourseIds || []),
  ]);

  const byId = new Map<string, RecoverableCourseEntry>();
  const addEntry = (c: MicroCourse, source: RecoverableCourseEntry['source']) => {
    if (!c || !c.id || c.id === 'course_ham_so_12' || c.id === 'course_grammar_fast') return;
    const prev = byId.get(c.id);
    if (!prev || getSyncItemTs(c) > getSyncItemTs(prev.course)) {
      byId.set(c.id, {
        course: c,
        source,
        isTombstoned: tombSet.has(c.id),
      });
    }
  };

  cloudRes.cloudCourses.forEach((c) => addEntry(c, 'cloud'));
  idbCourses.forEach((c) => addEntry(c, 'indexeddb'));
  serverCourses.forEach((c) => addEntry(c, 'server_backup'));
  rawLocalCourses.forEach((c) => {
    if (tombSet.has(c.id)) addEntry(c, 'local_hidden');
  });

  return {
    entries: Array.from(byId.values()),
    tombstonedCourseIds: Array.from(tombSet),
    orphanReferencedCourseIds: cloudRes.orphanReferencedCourseIds || [],
    error: cloudRes.error,
  };
}

export async function restoreRecoveredCourses(
  coursesToRestore: MicroCourse[],
  extraTombstoneIdsToUnblock: string[] = []
): Promise<{ ok: boolean; restoredCount: number; error?: string }> {
  try {
    const curUser = getCurrentUser();
    const restoreIds = coursesToRestore.map((c) => c.id);
    const unblockSet = new Set<string>([...restoreIds, ...extraTombstoneIdsToUnblock]);

    // 1. Remove from local deletedCourseIds
    const nextDeleted = getDeletedCourseIds().filter((id) => !unblockSet.has(id));
    localStorage.setItem(STORAGE_KEY_DELETED_COURSES, JSON.stringify(nextDeleted));

    // 2. Merge restored courses into localStorage & re-stamp updatedAt so they persist
    const existingLocal = getAllCourses();
    const mergedMap = new Map<string, MicroCourse>();
    existingLocal.forEach((c) => mergedMap.set(c.id, c));
    const nowIso = new Date().toISOString();
    const stampedRestored = coursesToRestore.map((c) => ({
      ...c,
      updatedAt: c.updatedAt || nowIso,
    }));
    stampedRestored.forEach((c) => {
      mergedMap.set(c.id, c);
      markDirtyCloudEntity('courses', c.id);
    });
    const nextList = Array.from(mergedMap.values());
    localStorage.setItem(STORAGE_KEY_COURSES, JSON.stringify(nextList));
    markDirtySiteConfig('tombstones');
    saveSnapshotToIndexedDB(buildFullSyncPayload());

    // 3. Clear cloud tombstones & re-upload courses if Firebase Auth is active
    const fbUser = getFirebaseAuthUser();
    if (fbUser && !fbUser.isAnonymous) {
      const cloudRes = await clearCoursesFromCloudTombstones(
        Array.from(unblockSet),
        stampedRestored,
        getAllClassrooms(),
        curUser
      );
      if (!cloudRes.ok) {
        return { ok: false, restoredCount: stampedRestored.length, error: cloudRes.error };
      }
    }

    return { ok: true, restoredCount: stampedRestored.length };
  } catch (err: any) {
    return { ok: false, restoredCount: 0, error: err?.message || String(err) };
  }
}


