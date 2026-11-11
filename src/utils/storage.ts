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
  StudentMember
} from '../types/exam';
import { PRESET_EXAMS, PRESET_BUNDLES, SAMPLE_DEMO_EXAM } from '../data/presetExams';

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
const STORAGE_KEY_USERS = 'edutest_users_v1';
const STORAGE_KEY_CURRENT_USER = 'edutest_current_user_v1';
const STORAGE_KEY_TEACHER_REQUESTS = 'edutest_teacher_requests_v1';

// --- Deleted IDs ---
function getDeletedExamIds(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_DELETED_EXAMS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function getDeletedBundleIds(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_DELETED_BUNDLES);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
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

export function isItemScheduleOpen(item: { openTime?: string; closeTime?: string; status?: string }): {
  isOpen: boolean;
  statusLabel: string;
  reason?: string;
} {
  if (item.status === 'draft') {
    return { isOpen: false, statusLabel: 'Bản nháp', reason: 'Đề/tổ hợp đang ở chế độ Bản nháp, chưa công bố.' };
  }
  if (item.status === 'closed') {
    return { isOpen: false, statusLabel: 'Đã đóng', reason: 'Kỳ thi đã kết thúc / phòng thi đã đóng.' };
  }

  const now = new Date().getTime();
  if (item.openTime) {
    const openTs = new Date(item.openTime).getTime();
    if (!isNaN(openTs) && now < openTs) {
      const formatted = formatVietnameseDateTime(item.openTime);
      return { 
        isOpen: false, 
        statusLabel: 'Chưa mở', 
        reason: `Chưa đến thời điểm mở đề thi (Mở lúc: ${formatted}). Thí sinh vui lòng quay lại đúng giờ!` 
      };
    }
  }

  if (item.closeTime) {
    const closeTs = new Date(item.closeTime).getTime();
    if (!isNaN(closeTs) && now > closeTs) {
      const formatted = formatVietnameseDateTime(item.closeTime);
      return { 
        isOpen: false, 
        statusLabel: 'Đã hết hạn', 
        reason: `Thời hạn làm bài đã kết thúc (Đóng lúc: ${formatted}).` 
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
    return raw ? JSON.parse(raw) : { fullName: 'Thí sinh tự do', studentCode: 'SBD-' + Math.floor(1000 + Math.random() * 9000) };
  } catch {
    return { fullName: 'Thí sinh tự do', studentCode: 'SBD-1205' };
  }
}

export function saveCandidateProfile(profile: CandidateProfile): void {
  try {
    localStorage.setItem(STORAGE_KEY_CANDIDATE_PROFILE, JSON.stringify(profile));
  } catch (err) {
    console.error('Error saving candidate profile', err);
  }
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
  } catch (err) {
    console.error('Error deleting all exams', err);
  }
}

export function saveCustomExam(newExam: Exam): void {
  try {
    const deleted = getDeletedExamIds().filter((id) => id !== newExam.id);
    localStorage.setItem(STORAGE_KEY_DELETED_EXAMS, JSON.stringify(deleted));

    const raw = localStorage.getItem(STORAGE_KEY_CUSTOM_EXAMS);
    const customExams: Exam[] = raw ? JSON.parse(raw) : [];
    const updated = [newExam, ...customExams.filter((e) => e.id !== newExam.id)];
    localStorage.setItem(STORAGE_KEY_CUSTOM_EXAMS, JSON.stringify(updated));
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
    const deleted = getDeletedBundleIds().filter((id) => id !== newBundle.id);
    localStorage.setItem(STORAGE_KEY_DELETED_BUNDLES, JSON.stringify(deleted));

    const raw = localStorage.getItem(STORAGE_KEY_CUSTOM_BUNDLES);
    const customBundles: ExamBundle[] = raw ? JSON.parse(raw) : [];
    const updated = [newBundle, ...customBundles.filter((b) => b.id !== newBundle.id)];
    localStorage.setItem(STORAGE_KEY_CUSTOM_BUNDLES, JSON.stringify(updated));
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
  } catch (err) {
    console.error('Error deleting custom bundle', err);
  }
}

// --- Exam Results Storage ---
export function getExamResults(): ExamResult[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_RESULTS);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error('Error reading exam results', err);
    return [];
  }
}

export function saveExamResult(result: ExamResult): void {
  try {
    const results = getExamResults();
    localStorage.setItem(STORAGE_KEY_RESULTS, JSON.stringify([result, ...results]));
  } catch (err) {
    console.error('Error saving exam result', err);
  }
}

export function deleteExamResult(resultId: string): void {
  try {
    const results = getExamResults();
    const updated = results.filter((r) => r.id !== resultId);
    localStorage.setItem(STORAGE_KEY_RESULTS, JSON.stringify(updated));
  } catch (err) {
    console.error('Error deleting exam result', err);
  }
}

export function clearExamResults(): void {
  try {
    localStorage.removeItem(STORAGE_KEY_RESULTS);
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
    const raw = localStorage.getItem(STORAGE_KEY_CUSTOM_SUBJECTS);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY_CUSTOM_SUBJECTS, JSON.stringify(DEFAULT_SUBJECTS));
      return DEFAULT_SUBJECTS;
    }
    return JSON.parse(raw);
  } catch (e) {
    console.error(e);
    return DEFAULT_SUBJECTS;
  }
}

export function saveSubject(subject: CustomSubject): void {
  try {
    const list = getAllSubjects();
    const updated = [subject, ...list.filter((s) => s.id !== subject.id)];
    localStorage.setItem(STORAGE_KEY_CUSTOM_SUBJECTS, JSON.stringify(updated));
  } catch (e) {
    console.error(e);
  }
}

export function updateSubjectName(subjectId: string, newName: string): void {
  try {
    const list = getAllSubjects();
    const updated = list.map((s) => s.id === subjectId ? { ...s, name: newName } : s);
    localStorage.setItem(STORAGE_KEY_CUSTOM_SUBJECTS, JSON.stringify(updated));
  } catch (e) {
    console.error(e);
  }
}

export function deleteSubject(subjectId: string): void {
  try {
    const list = getAllSubjects();
    const updated = list.filter((s) => s.id !== subjectId);
    localStorage.setItem(STORAGE_KEY_CUSTOM_SUBJECTS, JSON.stringify(updated));
  } catch (e) {
    console.error(e);
  }
}

// --- Customizable Navigation Tabs ---
export const DEFAULT_NAV_TABS: NavTabItem[] = [
  { id: 'tab_single', label: 'Đề thi theo môn', iconName: 'book', targetView: 'single', isDefault: true },
  { id: 'tab_bundle', label: 'Tổ hợp liên môn', iconName: 'layers', targetView: 'bundle', isDefault: true },
  { id: 'tab_oj', label: 'Lập trình thi đấu (OJ)', iconName: 'code', targetView: 'oj', badgeText: 'VNOI', isDefault: true },
  { id: 'tab_classes', label: 'Lớp học & Xếp hạng', iconName: 'users', targetView: 'classrooms', isDefault: true },
  { id: 'tab_courses', label: 'Khóa học nhỏ', iconName: 'graduation', targetView: 'courses', isDefault: true },
  { id: 'tab_battle', label: 'Đấu trường 1v1', iconName: 'swords', targetView: 'battle', badgeText: 'HOT', isDefault: true },
  { id: 'tab_analytics', label: 'Thống kê học lực', iconName: 'chart', targetView: 'analytics', isDefault: true },
  { id: 'tab_history', label: 'Lịch sử thi', iconName: 'clock', targetView: 'history', isDefault: true },
];

export function getNavTabs(): NavTabItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_NAV_TABS);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY_NAV_TABS, JSON.stringify(DEFAULT_NAV_TABS));
      return DEFAULT_NAV_TABS;
    }
    const parsed: NavTabItem[] = JSON.parse(raw);
    // Ensure OJ tab is present
    if (!parsed.some((t) => t.targetView === 'oj')) {
      const ojTab: NavTabItem = { 
        id: 'tab_oj', 
        label: 'Lập trình thi đấu (OJ)', 
        iconName: 'code', 
        targetView: 'oj', 
        badgeText: 'VNOI', 
        isDefault: true 
      };
      const updated = [parsed[0], parsed[1], ojTab, ...parsed.slice(2)];
      localStorage.setItem(STORAGE_KEY_NAV_TABS, JSON.stringify(updated));
      return updated;
    }
    return parsed;
  } catch (e) {
    console.error(e);
    return DEFAULT_NAV_TABS;
  }
}

export function saveNavTabs(tabs: NavTabItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_NAV_TABS, JSON.stringify(tabs));
  } catch (e) {
    console.error(e);
  }
}

export function resetDefaultNavTabs(): NavTabItem[] {
  localStorage.setItem(STORAGE_KEY_NAV_TABS, JSON.stringify(DEFAULT_NAV_TABS));
  return DEFAULT_NAV_TABS;
}

// --- Classrooms Storage ---
export const DEFAULT_CLASSROOMS: Classroom[] = [
  {
    id: 'class_12a1',
    name: '12A1 Chuyên Toán - Ôn thi THPT Quốc Gia',
    grade: 'Lớp 12',
    code: 'TOAN12A1',
    teacherName: 'Thầy Nguyễn Quốc Huy',
    description: 'Lớp luyện đề trọng điểm cho kỳ thi tốt nghiệp và đánh giá năng lực đại học.',
    students: [
      { id: 'hs_1', name: 'Trần Minh Quân', studentCode: 'SBD-1201', email: 'quan.tm@edutest.vn', joinedAt: '2026-09-05' },
      { id: 'hs_2', name: 'Lê Hoàng Yến', studentCode: 'SBD-1202', email: 'yen.lh@edutest.vn', joinedAt: '2026-09-05' },
      { id: 'hs_3', name: 'Phạm Đức Anh', studentCode: 'SBD-1203', email: 'anh.pd@edutest.vn', joinedAt: '2026-09-06' },
      { id: 'hs_4', name: 'Vũ Thảo My', studentCode: 'SBD-1204', email: 'my.vt@edutest.vn', joinedAt: '2026-09-07' },
      { id: 'hs_5', name: 'Nguyễn Văn An (Bạn)', studentCode: 'SBD-1205', email: 'an.nv@edutest.vn', joinedAt: '2026-09-08' },
    ],
    assignedExamIds: ['exam-sample-2026', 'exam-toan-12-01', 'exam-toan-01'],
    createdAt: '2026-09-01',
  },
  {
    id: 'class_11b2',
    name: '11B2 Tiếng Anh & Khoa học Tự nhiên',
    grade: 'Lớp 11',
    code: 'ANH11B2',
    teacherName: 'Cô Trần Mai Phương',
    description: 'Tập trung rèn luyện các dạng trắc nghiệm Đúng/Sai và đọc hiểu.',
    students: [
      { id: 'hs_6', name: 'Đỗ Hải Đăng', studentCode: 'SBD-1101', joinedAt: '2026-09-10' },
      { id: 'hs_7', name: 'Bùi Kim Ngân', studentCode: 'SBD-1102', joinedAt: '2026-09-10' },
      { id: 'hs_8', name: 'Nguyễn Văn An (Bạn)', studentCode: 'SBD-1103', joinedAt: '2026-09-12' },
    ],
    assignedExamIds: ['exam-anh-12-01', 'exam-ly-12-01'],
    createdAt: '2026-09-02',
  },
];

export function getAllClassrooms(): Classroom[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CLASSROOMS);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY_CLASSROOMS, JSON.stringify(DEFAULT_CLASSROOMS));
      return DEFAULT_CLASSROOMS;
    }
    return JSON.parse(raw);
  } catch (e) {
    console.error(e);
    return DEFAULT_CLASSROOMS;
  }
}

export function saveClassroom(classroom: Classroom): void {
  try {
    const list = getAllClassrooms();
    const updated = [classroom, ...list.filter((c) => c.id !== classroom.id)];
    localStorage.setItem(STORAGE_KEY_CLASSROOMS, JSON.stringify(updated));
  } catch (e) {
    console.error(e);
  }
}

export function deleteClassroom(classroomId: string): void {
  try {
    const list = getAllClassrooms();
    const updated = list.filter((c) => c.id !== classroomId);
    localStorage.setItem(STORAGE_KEY_CLASSROOMS, JSON.stringify(updated));
  } catch (e) {
    console.error(e);
  }
}

export function getActiveClassId(): string {
  return localStorage.getItem(STORAGE_KEY_ACTIVE_CLASS_ID) || 'class_12a1';
}

export function setActiveClassId(classId: string): void {
  localStorage.setItem(STORAGE_KEY_ACTIVE_CLASS_ID, classId);
}

const STORAGE_KEY_COURSE_PROGRESS = 'edutest_course_progress_v2';

// --- Micro-Courses (Khóa học: Chương, Bài học & Câu hỏi tương tác) Storage ---
export const DEFAULT_COURSES: MicroCourse[] = [
  {
    id: 'course_ham_so_12',
    title: 'Khóa Chuyên Sâu: Hàm Số & Ứng Dụng Đạo Hàm (Toán 12)',
    subject: 'math',
    grade: 'Lớp 12',
    description: 'Khóa học theo chuẩn chương trình GDPT mới gồm 2 chương trọng điểm. Lý thuyết trực quan với KaTeX, câu hỏi tương tác kiểm tra ngay bài học và đề thi luyện tập từng bài.',
    instructor: 'Thầy Nguyễn Quốc Huy - Chuyên gia Luyện thi THPT',
    chapters: [
      {
        id: 'chap_1',
        title: 'Chương I: Tính đơn điệu & Cực trị của Hàm số',
        description: 'Nắm vững dấu đạo hàm $y = f\'(x)$, kỹ thuật xét bảng biến thiên và phân biệt cực đại - cực tiểu.',
        order: 1,
        chapterExamId: 'exam-toan-12-01',
        chapterExamTitle: 'Đề kiểm tra Chương I: Đạo hàm & Khảo sát hàm số',
        lessons: [
          {
            id: 'les_1_1',
            title: 'Bài 1: Tính đơn điệu của hàm số & Kỹ thuật xét dấu đạo hàm f\'(x)',
            durationMinutes: 30,
            summary: 'Khảo sát sự đồng biến, nghịch biến của hàm số trên các khoảng xác định.',
            practiceExamId: 'exam-toan-12-01',
            practiceExamTitle: 'Đề luyện tập Bài 1: Sự đồng biến & nghịch biến',
            blocks: [
              {
                id: 'blk_1_1_1',
                type: 'theory',
                title: '1. Định lý mở rộng về tính đơn điệu',
                contentMarkdown: `Giả sử hàm số $y = f(x)$ có đạo hàm trên khoảng $K$:
- Nếu $f'(x) \\ge 0, \\forall x \\in K$ và đẳng thức $f'(x) = 0$ chỉ xảy ra tại một số hữu hạn điểm thì hàm số **đồng biến** trên $K$.
- Nếu $f'(x) \\le 0, \\forall x \\in K$ và đẳng thức $f'(x) = 0$ chỉ xảy ra tại một số hữu hạn điểm thì hàm số **nghịch biến** trên $K$.

> **Lưu ý đặc biệt:** Đối với hàm phân thức hữu tỉ bậc nhất trên bậc nhất $y = \\frac{ax + b}{cx + d}$ ($ad - bc \\ne 0$):
> $$y' = \\frac{ad - bc}{(cx + d)^2}$$
> Dấu của đạo hàm **không bao giờ bằng 0**, chỉ có thể luôn âm hoặc luôn dương trên từng khoảng xác định. Do đó không được dùng dấu ngoặc vuông $[a; b]$ mà phải dùng khoảng rời rạc $(-\\infty; -\\frac{d}{c}) \\cup (-\\frac{d}{c}; +\\infty)$.`,
              },
              {
                id: 'blk_1_1_callout',
                type: 'callout',
                calloutType: 'formula',
                title: 'Bí kíp nhớ nhanh công thức đạo hàm hàm phân thức:',
                contentMarkdown: `$$y = \\frac{ax+b}{cx+d} \\implies y' = \\frac{\\begin{vmatrix} a & b \\\\ c & d \\end{vmatrix}}{(cx+d)^2} = \\frac{ad - bc}{(cx+d)^2}$$`,
              },
              {
                id: 'blk_1_1_q1',
                type: 'question',
                title: 'Câu hỏi tương tác 1: Nhận diện khoảng đơn điệu',
                question: {
                  id: 'cp_1_1_q1',
                  type: 'single_choice',
                  points: 1.0,
                  question: 'Cho hàm số $y = \\frac{2x - 1}{x + 1}$. Khẳng định nào sau đây là **đúng** về tính đơn điệu của hàm số?',
                  options: [
                    'Hàm số đồng biến trên các khoảng $(-\\infty; -1)$ và $(-1; +\\infty)$.',
                    'Hàm số nghịch biến trên các khoảng $(-\\infty; -1)$ và $(-1; +\\infty)$.',
                    'Hàm số đồng biến trên toàn trục số $\\mathbb{R} \\setminus \\{-1\\}$.',
                    'Hàm số nghịch biến trên khoảng $(-\\infty; 2)$.',
                  ],
                  correctAnswer: 0,
                  explanation: 'Ta có $y\' = \\frac{2(1) - (-1)(1)}{(x+1)^2} = \\frac{3}{(x+1)^2} > 0, \\forall x \\ne -1$. Do đó hàm số đồng biến trên từng khoảng xác định $(-\\infty; -1)$ và $(-1; +\\infty)$. Chú ý không viết gộp bằng ký hiệu $\\mathbb{R} \\setminus \\{-1\\}$ hay dấu hợp $\\cup$.',
                },
              },
              {
                id: 'blk_1_1_2',
                type: 'theory',
                title: '2. Các bước lập bảng biến thiên & Xét hàm hợp g(x) = f(u(x))',
                contentMarkdown: `Khi xét dấu hàm hợp $g(x) = f(u(x))$:
1. Tính đạo hàm $g'(x) = u'(x) \\cdot f'(u(x))$.
2. Giải phương trình $g'(x) = 0 \\iff u'(x) = 0$ hoặc $f'(u(x)) = 0$.
3. Chọn một giá trị thử nghiệm $x_0$ trên một khoảng để xác định dấu cụ thể, sau đó đan dấu qua các nghiệm đơn.`,
              },
              {
                id: 'blk_1_1_q2',
                type: 'question',
                title: 'Câu hỏi tương tác 2: Mệnh đề Đúng / Sai về tính đơn điệu',
                question: {
                  id: 'cp_1_1_q2',
                  type: 'true_false',
                  points: 1.0,
                  question: 'Cho hàm số bậc ba $y = f(x) = x^3 - 3x^2 + 2$. Xét tính đúng/sai của các mệnh đề sau:',
                  tfScoringMode: 'standard_ministry',
                  tfTierPoints: [0.1, 0.25, 0.5, 1.0],
                  tfItems: [
                    { id: 'cp_1_a', statement: 'Đạo hàm của hàm số là $f\'(x) = 3x^2 - 6x$.', isCorrect: true },
                    { id: 'cp_1_b', statement: 'Hàm số nghịch biến trên khoảng $(0; 2)$.', isCorrect: true },
                    { id: 'cp_1_c', statement: 'Hàm số đồng biến trên đoạn $[1; 3]$.', isCorrect: false },
                    { id: 'cp_1_d', statement: 'Phương trình $f\'(x) = 0$ có 2 nghiệm phân biệt $x = 0$ và $x = 2$.', isCorrect: true },
                  ],
                  explanation: 'Ta có $f\'(x) = 3x(x - 2)$. $f\'(x) = 0 \\iff x = 0$ hoặc $x = 2$. Trong khoảng $(0; 2)$, $f\'(x) < 0$ nên hàm số nghịch biến. Ngoài khoảng $(0; 2)$, $f\'(x) > 0$ nên đồng biến.',
                },
              },
            ],
          },
          {
            id: 'les_1_2',
            title: 'Bài 2: Cực trị của hàm số & Kỹ thuật phân biệt Cực đại - Cực tiểu',
            durationMinutes: 35,
            summary: 'Quy tắc 1 và Quy tắc 2 tìm cực trị; điều kiện để hàm số có cực đại, cực tiểu.',
            practiceExamId: 'exam-toan-01',
            practiceExamTitle: 'Đề luyện tập Bài 2: Cực trị hàm số',
            blocks: [
              {
                id: 'blk_1_2_1',
                type: 'theory',
                title: '1. Khái niệm Cực đại & Cực tiểu',
                contentMarkdown: `Điểm $x_0$ được gọi là **điểm cực trị** của hàm số nếu đạo hàm $f'(x)$ đổi dấu khi đi qua $x_0$:
- Đổi dấu từ **dương sang âm** $(+ \\to -)$: $x_0$ là **điểm cực đại**.
- Đổi dấu từ **âm sang dương** $(- \\to +)$: $x_0$ là **điểm cực tiểu**.

> $f(x_0)$ được gọi là **giá trị cực trị** (hay cực trị), còn điểm $M(x_0; f(x_0))$ trên mặt phẳng tọa độ là **điểm cực trị của đồ thị hàm số**.`,
              },
              {
                id: 'blk_1_2_q1',
                type: 'question',
                title: 'Câu hỏi tương tác 3: Điền giá trị cực tiểu',
                question: {
                  id: 'cp_1_2_q1',
                  type: 'text_input',
                  points: 1.0,
                  question: 'Tìm giá trị cực tiểu $y_{CT}$ của hàm số $y = x^3 - 3x + 1$ (Nhập kết quả bằng số nguyên):',
                  acceptedAnswers: ['-1'],
                  explanation: '$y\' = 3x^2 - 3 = 0 \\iff x = \\pm 1$. Điểm cực tiểu là $x = 1$. Giá trị cực tiểu $y(1) = 1 - 3 + 1 = -1$.',
                },
              },
            ],
          },
        ],
      },
      {
        id: 'chap_2',
        title: 'Chương II: Đường tiệm cận & Giá trị lớn nhất, nhỏ nhất (GTLN - GTNN)',
        description: 'Tiệm cận đứng, tiệm cận ngang, tiệm cận xiên theo chương trình mới và bài toán tối ưu thực tế.',
        order: 2,
        chapterExamId: 'exam-toan-01',
        chapterExamTitle: 'Đề kiểm tra Chương II: Tiệm cận & Min-Max đồ thị',
        lessons: [
          {
            id: 'les_2_1',
            title: 'Bài 3: Đường tiệm cận đứng, tiệm cận ngang & Tiệm cận xiên',
            durationMinutes: 25,
            summary: 'Định nghĩa giới hạn lim và phương pháp phân biệt số lượng đường tiệm cận từ bảng biến thiên.',
            practiceExamId: 'exam-toan-01',
            practiceExamTitle: 'Đề luyện tập Bài 3: Tiệm cận đồ thị',
            blocks: [
              {
                id: 'blk_2_1_1',
                type: 'theory',
                title: '1. Tiệm cận ngang & Tiệm cận đứng',
                contentMarkdown: `- Nếu $\\lim_{x \\to +\\infty} y = y_0$ hoặc $\\lim_{x \\to -\\infty} y = y_0$ thì đường thẳng $y = y_0$ là **tiệm cận ngang**.
- Nếu $\\lim_{x \\to x_0^+} y = \\pm\\infty$ hoặc $\\lim_{x \\to x_0^-} y = \\pm\\infty$ thì đường thẳng $x = x_0$ là **tiệm cận đứng**.`,
              },
              {
                id: 'blk_2_1_q1',
                type: 'question',
                title: 'Câu hỏi tương tác: Số đường tiệm cận',
                question: {
                  id: 'cp_2_1_q1',
                  type: 'single_choice',
                  points: 1.0,
                  question: 'Đồ thị hàm số $y = \\frac{2x - 3}{x - 1}$ có bao nhiêu đường tiệm cận?',
                  options: ['2 đường (1 đứng $x=1$, 1 ngang $y=2$)', '1 đường duy nhất', '3 đường', 'Không có tiệm cận'],
                  correctAnswer: 0,
                  explanation: 'Hàm số có TC đứng $x = 1$ và TC ngang $y = 2$, tổng cộng 2 đường tiệm cận.',
                },
              },
            ],
          },
        ],
      },
    ],
    lessons: [],
    finalExamId: 'exam-sample-2026',
    finalExamTitle: 'Bài thi Tốt nghiệp Tổng kết Khóa Hàm số',
    createdAt: '2026-09-10',
  },
  {
    id: 'course_grammar_fast',
    title: 'Khóa Chuyên Sâu: Ngữ Pháp Tiếng Anh Trọng Điểm & Kỹ Thuật Đọc Hiểu',
    subject: 'english',
    grade: 'Lớp 11 - 12',
    description: 'Chuyên đề 2 chương: Các cấu trúc câu cốt lõi và phương pháp định vị từ khóa trong bài thi.',
    instructor: 'Cô Trần Mai Phương - Thạc sĩ Ngôn ngữ học',
    chapters: [
      {
        id: 'chap_eng_1',
        title: 'Chương I: Hệ thống Thì & Sự hòa hợp Chủ - Vị',
        description: 'Các cấu trúc thì hay bẫy nhất trong bài trắc nghiệm phát hiện lỗi sai và hoàn thành câu.',
        order: 1,
        chapterExamId: 'exam-anh-12-01',
        chapterExamTitle: 'Đề kiểm tra Chương I: Ngữ pháp tiếng Anh',
        lessons: [
          {
            id: 'les_eng_1_1',
            title: 'Bài 1: 12 Thì cốt lõi & Dấu hiệu nhận biết',
            durationMinutes: 20,
            summary: 'Thì hiện tại hoàn thành, quá khứ hoàn thành và tương lai hoàn thành.',
            practiceExamId: 'exam-anh-12-01',
            practiceExamTitle: 'Đề luyện tập Bài 1: 12 Thì Tiếng Anh',
            blocks: [
              {
                id: 'blk_eng_1_1',
                type: 'theory',
                title: 'Present Perfect vs Past Simple',
                contentMarkdown: `- **Past Simple:** Diễn tả hành động đã kết thúc dứt điểm trong quá khứ có mốc thời gian rõ ràng (*yesterday, in 2020, 3 days ago*).
- **Present Perfect:** Diễn tả hành động xảy ra trong quá khứ kéo dài đến hiện tại hoặc kết quả còn ảnh hưởng ở hiện tại (*since, for, already, yet, so far*).`,
              },
              {
                id: 'blk_eng_q1',
                type: 'question',
                title: 'Interactive Checkpoint: Choose the correct tense',
                question: {
                  id: 'cp_eng_1',
                  type: 'single_choice',
                  points: 1.0,
                  question: 'By the time the teacher arrived, all the students ________ their assignments.',
                  options: ['had finished', 'finished', 'have finished', 'were finishing'],
                  correctAnswer: 0,
                  explanation: 'Cấu trúc "By the time + S + V(quá khứ đơn), S + had + V3/ed (quá khứ hoàn thành)" diễn tả hành động đã hoàn tất trước một thời điểm hoặc hành động khác trong quá khứ.',
                },
              },
            ],
          },
        ],
      },
    ],
    lessons: [],
    finalExamId: 'exam-anh-12-01',
    finalExamTitle: 'Bài thi Tốt nghiệp Tổng kết Khóa Tiếng Anh',
    createdAt: '2026-09-15',
  },
];

export function getAllCourses(): MicroCourse[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_COURSES);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY_COURSES, JSON.stringify(DEFAULT_COURSES));
      return DEFAULT_COURSES;
    }
    const parsed: MicroCourse[] = JSON.parse(raw);
    // Nếu dữ liệu cũ chưa có chapters, chuyển đổi mềm hoặc dùng DEFAULT_COURSES nếu khớp id
    return parsed.map((c) => {
      if (!c.chapters || c.chapters.length === 0) {
        const defaultMatch = DEFAULT_COURSES.find((dc) => dc.id === c.id);
        if (defaultMatch && defaultMatch.chapters) {
          return { ...c, chapters: defaultMatch.chapters, finalExamTitle: defaultMatch.finalExamTitle };
        }
        // Tự động đóng gói lessons cũ vào 1 chương
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
    return DEFAULT_COURSES;
  }
}

export function saveCourse(course: MicroCourse): void {
  try {
    const list = getAllCourses();
    const updated = [course, ...list.filter((c) => c.id !== course.id)];
    localStorage.setItem(STORAGE_KEY_COURSES, JSON.stringify(updated));
  } catch (e) {
    console.error(e);
  }
}

export function deleteCourse(courseId: string): void {
  try {
    const list = getAllCourses();
    const updated = list.filter((c) => c.id !== courseId);
    localStorage.setItem(STORAGE_KEY_COURSES, JSON.stringify(updated));
  } catch (e) {
    console.error(e);
  }
}

// --- Tiến độ học tập của học sinh trong khóa học (Course Progress Tracking) ---
export function getStudentCourseProgress(courseId: string, studentId: string): StudentCourseProgress {
  try {
    const key = `${STORAGE_KEY_COURSE_PROGRESS}_${studentId}_${courseId}`;
    const raw = localStorage.getItem(key);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error(e);
  }

  return {
    courseId,
    studentId,
    completedLessonIds: [],
    interactiveAnswers: {},
    completedExamIds: [],
    lastStudiedAt: new Date().toISOString(),
  };
}

export function saveStudentCourseProgress(progress: StudentCourseProgress): void {
  try {
    const key = `${STORAGE_KEY_COURSE_PROGRESS}_${progress.studentId}_${progress.courseId}`;
    localStorage.setItem(key, JSON.stringify(progress));
  } catch (e) {
    console.error(e);
  }
}

export function markLessonCompleted(courseId: string, studentId: string, lessonId: string): StudentCourseProgress {
  const current = getStudentCourseProgress(courseId, studentId);
  if (!current.completedLessonIds.includes(lessonId)) {
    current.completedLessonIds = [...current.completedLessonIds, lessonId];
  }
  current.currentLessonId = lessonId;
  current.lastStudiedAt = new Date().toISOString();
  saveStudentCourseProgress(current);
  return current;
}

export function recordInteractiveAnswer(
  courseId: string,
  studentId: string,
  blockId: string,
  answer: any,
  isCorrect: boolean
): StudentCourseProgress {
  const current = getStudentCourseProgress(courseId, studentId);
  current.interactiveAnswers[blockId] = {
    selectedAnswer: answer,
    isCorrect,
    answeredAt: new Date().toISOString(),
  };
  current.lastStudiedAt = new Date().toISOString();
  saveStudentCourseProgress(current);
  return current;
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
  const allLessons: CourseLesson[] = [];
  if (course.chapters && course.chapters.length > 0) {
    course.chapters.forEach((chap) => {
      chap.lessons.forEach((les) => allLessons.push(les));
    });
  } else if (course.lessons && course.lessons.length > 0) {
    allLessons.push(...course.lessons);
  }

  if (allLessons.length === 0) return 0;

  // Điểm tiến độ: Bài học đã hoàn thành
  const completedCount = allLessons.filter((l) => progress.completedLessonIds.includes(l.id)).length;
  const pct = Math.round((completedCount / allLessons.length) * 100);
  return Math.min(100, Math.max(0, pct));
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
  } catch (err) {
    console.error('Error saving live text override', err);
  }
}

export function clearLiveTextOverrides(): void {
  try {
    localStorage.removeItem(STORAGE_KEY_LIVE_TEXT);
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
    list.unshift(fb);
    localStorage.setItem(STORAGE_KEY_FEEDBACKS, JSON.stringify(list));
  } catch (err) {
    console.error('Error saving feedback', err);
  }
}

export function deleteFeedback(id: string): void {
  try {
    const list = getAllFeedbacks().filter((f) => f.id !== id);
    localStorage.setItem(STORAGE_KEY_FEEDBACKS, JSON.stringify(list));
  } catch (err) {
    console.error('Error deleting feedback', err);
  }
}

// =========================================================================
// 1. TÀI KHOẢN NGƯỜI DÙNG & PHÂN QUYỀN (AUTHENTICATION & RBAC)
// =========================================================================

export const MASTER_ADMIN_EMAIL = 'tranquangnhat418@gmail.com';

export const INITIAL_MASTER_ADMIN: UserAccount = {
  id: 'usr_master_teacher',
  email: MASTER_ADMIN_EMAIL,
  username: 'tranquangnhat418',
  fullName: 'Thầy Trần Quang Nhật (Admin Tối Cao)',
  role: 'teacher',
  isMasterAdmin: true,
  password: '123456',
  avatar: '',
  school: 'Trường THPT Chuyên',
  createdAt: '2026-01-01',
};

export function getAllUsers(): UserAccount[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_USERS);
    let users: UserAccount[] = raw ? JSON.parse(raw) : [];
    // Ensure master admin is always present
    if (!users.some((u) => u.email.toLowerCase() === MASTER_ADMIN_EMAIL.toLowerCase())) {
      users = [INITIAL_MASTER_ADMIN, ...users];
      localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(users));
    }
    return users;
  } catch {
    return [INITIAL_MASTER_ADMIN];
  }
}

export function saveUser(user: UserAccount): void {
  try {
    const list = getAllUsers();
    const updated = [user, ...list.filter((u) => u.id !== user.id && u.email.toLowerCase() !== user.email.toLowerCase())];
    localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(updated));
    triggerCloudSync();
  } catch (e) {
    console.error(e);
  }
}

export function getCurrentUser(): UserAccount | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CURRENT_USER);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setCurrentUser(user: UserAccount | null): void {
  if (user) {
    localStorage.setItem(STORAGE_KEY_CURRENT_USER, JSON.stringify(user));
    localStorage.setItem('edutest_user_role', user.role);
  } else {
    localStorage.removeItem(STORAGE_KEY_CURRENT_USER);
    localStorage.setItem('edutest_user_role', 'student');
  }
}

export async function registerUserAccount(data: {
  email: string;
  username?: string;
  fullName: string;
  password: string;
  school?: string;
  studentCode?: string;
}): Promise<{ success: boolean; user?: UserAccount; error?: string }> {
  const normalizedEmail = data.email.trim().toLowerCase();
  const normalizedUsername = data.username ? data.username.trim().toLowerCase() : normalizedEmail.split('@')[0];

  const users = getAllUsers();
  if (users.some((u) => u.email.toLowerCase() === normalizedEmail || u.username.toLowerCase() === normalizedUsername)) {
    return { success: false, error: 'Email hoặc tên đăng nhập này đã được sử dụng!' };
  }

  const isMaster = normalizedEmail === MASTER_ADMIN_EMAIL.toLowerCase();

  // Mặc định tài khoản đăng kí mới là "Học sinh" (Student), trừ tài khoản của người dùng là Giáo viên
  const newUser: UserAccount = {
    id: 'usr_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
    email: normalizedEmail,
    username: normalizedUsername,
    fullName: data.fullName.trim(),
    role: isMaster ? 'teacher' : 'student',
    isMasterAdmin: isMaster,
    password: data.password.trim(),
    school: data.school?.trim() || 'Trường THPT',
    studentCode: data.studentCode?.trim() || 'HS-' + Math.floor(1000 + Math.random() * 9000),
    createdAt: new Date().toISOString().split('T')[0],
  };

  saveUser(newUser);
  setCurrentUser(newUser);

  // Sync with server if online
  try {
    fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).catch(() => {});
  } catch {}

  return { success: true, user: newUser };
}

export async function loginUserAccount(
  identifier: string,
  pass: string
): Promise<{ success: boolean; user?: UserAccount; error?: string }> {
  const query = identifier.trim().toLowerCase();
  const inputPass = pass.trim();

  // Check master teacher initial login
  if (
    (query === MASTER_ADMIN_EMAIL.toLowerCase() || query === 'tranquangnhat418' || query === 'admin') &&
    (inputPass === '123456' || inputPass === 'admin')
  ) {
    setCurrentUser(INITIAL_MASTER_ADMIN);
    return { success: true, user: INITIAL_MASTER_ADMIN };
  }

  const users = getAllUsers();
  const found = users.find(
    (u) => u.email.toLowerCase() === query || u.username.toLowerCase() === query
  );

  if (!found || found.password !== inputPass) {
    return { success: false, error: 'Tài khoản hoặc mật khẩu không chính xác!' };
  }

  setCurrentUser(found);
  return { success: true, user: found };
}

export function logoutUserAccount(): void {
  setCurrentUser(null);
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
    const updated = [req, ...list.filter((r) => r.id !== req.id)];
    localStorage.setItem(STORAGE_KEY_TEACHER_REQUESTS, JSON.stringify(updated));
    triggerCloudSync();
  } catch (e) {
    console.error(e);
  }
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

  const newReq: TeacherRoleRequest = {
    id: 'req_tea_' + Date.now(),
    userId: data.userId,
    userEmail: data.userEmail,
    userName: data.userName,
    schoolName: data.schoolName,
    subject: data.subject,
    reason: data.reason,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  saveTeacherRequest(newReq);

  // Sync to server
  try {
    fetch('/api/auth/request-teacher', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).catch(() => {});
  } catch {}

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

  target.status = action === 'approve' ? 'approved' : 'rejected';
  target.reviewedAt = new Date().toISOString();
  target.reviewedBy = reviewerEmail || MASTER_ADMIN_EMAIL;

  saveTeacherRequest(target);

  // If approved: update user's role to teacher!
  if (action === 'approve') {
    const users = getAllUsers();
    const targetUser = users.find((u) => u.id === target.userId || u.email.toLowerCase() === target.userEmail.toLowerCase());
    if (targetUser) {
      targetUser.role = 'teacher';
      saveUser(targetUser);

      // If currently logged in user is this person, update live session
      const currentUser = getCurrentUser();
      if (currentUser && currentUser.id === targetUser.id) {
        setCurrentUser(targetUser);
      }
    }
  }

  // Sync to server
  try {
    fetch(`/api/admin/teacher-requests/${requestId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, reviewerEmail }),
    }).catch(() => {});
  } catch {}

  return { success: true };
}

// =========================================================================
// 3. BẢO MẬT & PHÂN QUYỀN LỚP HỌC (CLASSROOM SECURITY & VISIBILITY)
// =========================================================================

/**
 * Kiểm tra xem người dùng hiện tại có phải là thành viên chính thức của lớp học không
 */
export function isStudentMemberOfClass(classroom: Classroom, user: UserAccount | null): boolean {
  if (!user) return false;
  // Giáo viên và Admin quản trị luôn có quyền vào lớp
  if (user.role === 'teacher' || user.isMasterAdmin) return true;

  // Với học sinh: bắt buộc phải có tên/email/mã học sinh trong danh sách học sinh chính thức của lớp
  const students = classroom.students || [];
  return students.some(
    (s) =>
      s.id === user.id ||
      (user.email && s.email && s.email.toLowerCase() === user.email.toLowerCase()) ||
      (user.studentCode && s.studentCode && s.studentCode.toUpperCase() === user.studentCode.toUpperCase())
  );
}

/**
 * Lọc danh sách lớp học hiển thị theo quyền người dùng:
 * - Học sinh CHỈ nhìn thấy những lớp mình ĐÃ ĐƯỢC DUYỆT tham gia (ẩn hoàn toàn các lớp khác)
 * - Giáo viên nhìn thấy các lớp mình tạo và quản lý
 */
export function getVisibleClassrooms(allClassrooms: Classroom[], user: UserAccount | null): Classroom[] {
  if (!user || user.role === 'student') {
    return allClassrooms.filter((c) => isStudentMemberOfClass(c, user));
  }
  // Giáo viên hoặc Quản trị viên
  if (user.isMasterAdmin) {
    return allClassrooms;
  }
  return allClassrooms.filter(
    (c) => !c.teacherId || c.teacherId === user.id || c.teacherEmail?.toLowerCase() === user.email.toLowerCase() || c.teacherName === user.fullName
  );
}

/**
 * Học sinh gửi yêu cầu xin gia nhập lớp học bằng Mã Lớp
 */
export function submitClassJoinRequest(
  classCode: string,
  user: UserAccount,
  note?: string
): { success: boolean; message: string; classroom?: Classroom } {
  if (!classCode.trim()) {
    return { success: false, message: 'Vui lòng nhập mã lớp học!' };
  }

  const allClassrooms = getAllClassrooms();
  const targetClass = allClassrooms.find(
    (c) => c.code.trim().toUpperCase() === classCode.trim().toUpperCase()
  );

  if (!targetClass) {
    return { success: false, message: 'Mã lớp không hợp lệ hoặc lớp học không tồn tại trên hệ thống!' };
  }

  // 1. Kiểm tra nếu học sinh đã là thành viên chính thức
  if (isStudentMemberOfClass(targetClass, user)) {
    return { success: true, message: `Bạn đã là thành viên chính thức của lớp "${targetClass.name}"!`, classroom: targetClass };
  }

  // 2. Kiểm tra nếu học sinh đã gửi yêu cầu và đang chờ duyệt
  const pendingRequests = targetClass.pendingRequests || [];
  const existingPending = pendingRequests.find(
    (r) => r.studentId === user.id || (user.email && r.studentEmail && r.studentEmail.toLowerCase() === user.email.toLowerCase())
  );

  if (existingPending) {
    return {
      success: false,
      message: `Bạn đã gửi yêu cầu gia nhập lớp "${targetClass.name}". Vui lòng chờ giáo viên phụ trách phê duyệt!`,
      classroom: targetClass,
    };
  }

  // 3. Tạo yêu cầu tham gia lớp mới
  const newJoinRequest: ClassJoinRequest = {
    id: 'req_join_' + Date.now(),
    classId: targetClass.id,
    className: targetClass.name,
    classCode: targetClass.code,
    teacherId: targetClass.teacherId,
    studentId: user.id,
    studentName: user.fullName,
    studentEmail: user.email,
    studentCode: user.studentCode,
    note: note || 'Xin tham gia lớp học để làm bài thi',
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  const updatedClass: Classroom = {
    ...targetClass,
    pendingRequests: [newJoinRequest, ...pendingRequests],
  };

  saveClassroom(updatedClass);
  triggerCloudSync();

  return {
    success: true,
    message: `Đã gửi yêu cầu tham gia lớp "${targetClass.name}" thành công! Vui lòng chờ giáo viên duyệt vào lớp.`,
    classroom: targetClass,
  };
}

/**
 * Giáo viên phê duyệt hoặc từ chối yêu cầu xin gia nhập lớp của học sinh
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
    return { success: false, message: 'Không tìm thấy yêu cầu này!' };
  }

  const remainingRequests = pendingRequests.filter((r) => r.id !== requestId);

  let updatedStudents = targetClass.students || [];

  if (action === 'approve') {
    // Thêm học sinh vào danh sách lớp
    const newStudent: StudentMember = {
      id: targetRequest.studentId,
      name: targetRequest.studentName,
      studentCode: targetRequest.studentCode || `SBD-${Math.floor(1000 + Math.random() * 9000)}`,
      email: targetRequest.studentEmail,
      joinedAt: new Date().toISOString().split('T')[0],
    };

    // Tránh trùng lặp
    if (!updatedStudents.some((s) => s.id === newStudent.id || (s.email && s.email === newStudent.email))) {
      updatedStudents = [...updatedStudents, newStudent];
    }
  }

  const updatedClass: Classroom = {
    ...targetClass,
    students: updatedStudents,
    pendingRequests: remainingRequests,
  };

  saveClassroom(updatedClass);
  triggerCloudSync();

  return {
    success: true,
    message: action === 'approve' ? `Đã duyệt học sinh ${targetRequest.studentName} vào lớp!` : `Đã từ chối yêu cầu của ${targetRequest.studentName}.`,
  };
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
  triggerCloudSync();

  return { success: true, message: `Đã thêm học sinh "${newStudent.name}" vào lớp thành công!` };
}

// =========================================================================
// 4. ĐỒNG BỘ DỮ LIỆU ĐÁM MÂY (LIVE SERVER CLOUD SYNC & BACKUP)
// =========================================================================

export async function triggerCloudSync(): Promise<{ success: boolean; lastSyncedAt?: string }> {
  try {
    const payload = {
      users: getAllUsers(),
      teacherRequests: getAllTeacherRequests(),
      customExams: getAllExams().filter((e) => e.isCustom),
      customBundles: getAllBundles().filter((b) => b.isCustom),
      classrooms: getAllClassrooms(),
      results: getExamResults(),
      lastSyncedAt: new Date().toISOString(),
    };

    const res = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const data = await res.json();
      return { success: true, lastSyncedAt: data.lastSyncedAt };
    }
  } catch (err) {
    // Local storage works as resilient offline fallback
  }
  return { success: false };
}

export async function pullDataFromServer(): Promise<{ success: boolean; mergedCount?: number }> {
  try {
    const res = await fetch('/api/sync');
    if (!res.ok) return { success: false };

    const json = await res.json();
    if (!json.success || !json.data) return { success: false };

    const serverData = json.data;

    // Merge users
    if (serverData.users && Array.isArray(serverData.users)) {
      const localUsers = getAllUsers();
      const userMap = new Map<string, UserAccount>();
      [...localUsers, ...serverData.users].forEach((u) => userMap.set(u.id, u));
      localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(Array.from(userMap.values())));
    }

    // Merge classrooms
    if (serverData.classrooms && Array.isArray(serverData.classrooms) && serverData.classrooms.length > 0) {
      const localClasses = getAllClassrooms();
      const classMap = new Map<string, Classroom>();
      [...localClasses, ...serverData.classrooms].forEach((c) => classMap.set(c.id, c));
      localStorage.setItem(STORAGE_KEY_CLASSROOMS, JSON.stringify(Array.from(classMap.values())));
    }

    // Merge custom exams
    if (serverData.customExams && Array.isArray(serverData.customExams)) {
      const localExams = getAllExams().filter((e) => e.isCustom);
      const examMap = new Map<string, Exam>();
      [...localExams, ...serverData.customExams].forEach((e) => examMap.set(e.id, e));
      localStorage.setItem(STORAGE_KEY_CUSTOM_EXAMS, JSON.stringify(Array.from(examMap.values())));
    }

    // Merge teacher requests
    if (serverData.teacherRequests && Array.isArray(serverData.teacherRequests)) {
      const localReqs = getAllTeacherRequests();
      const reqMap = new Map<string, TeacherRoleRequest>();
      [...localReqs, ...serverData.teacherRequests].forEach((r) => reqMap.set(r.id, r));
      localStorage.setItem(STORAGE_KEY_TEACHER_REQUESTS, JSON.stringify(Array.from(reqMap.values())));
    }

    return { success: true };
  } catch {
    return { success: false };
  }
}

export function exportAllDataAsJson(): string {
  const fullBackup = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    users: getAllUsers(),
    teacherRequests: getAllTeacherRequests(),
    classrooms: getAllClassrooms(),
    customExams: getAllExams().filter((e) => e.isCustom),
    customBundles: getAllBundles().filter((b) => b.isCustom),
    results: getExamResults(),
    courses: getAllCourses(),
    subjects: getAllSubjects(),
  };
  return JSON.stringify(fullBackup, null, 2);
}

export function importAllDataFromJson(jsonStr: string): boolean {
  try {
    const data = JSON.parse(jsonStr);
    if (!data || typeof data !== 'object') return false;

    if (data.users && Array.isArray(data.users)) {
      localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(data.users));
    }
    if (data.classrooms && Array.isArray(data.classrooms)) {
      localStorage.setItem(STORAGE_KEY_CLASSROOMS, JSON.stringify(data.classrooms));
    }
    if (data.customExams && Array.isArray(data.customExams)) {
      localStorage.setItem(STORAGE_KEY_CUSTOM_EXAMS, JSON.stringify(data.customExams));
    }
    if (data.customBundles && Array.isArray(data.customBundles)) {
      localStorage.setItem(STORAGE_KEY_CUSTOM_BUNDLES, JSON.stringify(data.customBundles));
    }
    if (data.results && Array.isArray(data.results)) {
      localStorage.setItem(STORAGE_KEY_RESULTS, JSON.stringify(data.results));
    }
    if (data.teacherRequests && Array.isArray(data.teacherRequests)) {
      localStorage.setItem(STORAGE_KEY_TEACHER_REQUESTS, JSON.stringify(data.teacherRequests));
    }
    triggerCloudSync();
    return true;
  } catch (err) {
    console.error('Failed to import backup data:', err);
    return false;
  }
}

