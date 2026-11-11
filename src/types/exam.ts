export type UserRole = 'teacher' | 'student';

export interface UserAccount {
  id: string;
  email: string;
  username: string;
  fullName: string;
  studentCode?: string;
  role: UserRole;
  isMasterAdmin?: boolean; // Tài khoản của người tạo hệ thống: tranquangnhat418@gmail.com
  password?: string;
  avatar?: string;
  school?: string;
  createdAt: string;
}

export interface TeacherRoleRequest {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  schoolName: string;
  subject: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
}

export interface ClassJoinRequest {
  id: string;
  classId: string;
  className: string;
  classCode: string;
  teacherId?: string;
  studentId: string;
  studentName: string;
  studentEmail?: string;
  studentCode?: string;
  note?: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

export type StandardSubjectType = 
  | 'math' 
  | 'english' 
  | 'physics' 
  | 'chemistry' 
  | 'history' 
  | 'it' 
  | 'biology' 
  | 'general';

export type SubjectType = StandardSubjectType | string;

export interface CustomSubject {
  id: string;
  name: string;
  code?: string;
  description?: string;
  color?: string;
  iconName?: string;
  createdAt: string;
}

export type QuestionType = 
  | 'single_choice'   // 1 phương án đúng, tùy biến số lượng options
  | 'multiple_choice' // Chọn nhiều phương án đúng
  | 'true_false'      // Nhiều ý, mỗi ý chọn Đúng hoặc Sai
  | 'text_input'      // Nhập đáp án vào ô văn bản/số (trả lời ngắn)
  | 'grouped';        // Câu hỏi chùm: bối cảnh lớn bao trùm nhiều câu hỏi nhỏ

export interface TrueFalseItem {
  id: string;
  statement: string; // Nội dung mệnh đề
  isCorrect: boolean; // true = Đúng, false = Sai
  points?: number; // Điểm riêng của ý này (nếu không có thì tính theo chế độ)
}

export type TrueFalseScoringMode = 
  | 'tiered'            // Gán điểm theo số ý đúng (ví dụ: 1 ý = X điểm, 2 ý = Y điểm, 3 ý = Z điểm, 4 ý = W điểm)
  | 'standard_ministry' // Chuẩn Bộ GD&ĐT (1 ý = 10%, 2 ý = 25%, 3 ý = 50%, 4 ý = 100% điểm câu)
  | 'divide_equally'    // Chia đều điểm câu cho các ý
  | 'custom_item_points'; // Lấy điểm riêng biệt đã gán cho từng ý

export interface Question {
  id: string;
  type: QuestionType;
  question: string; // Nội dung câu hỏi hoặc bài đọc/bối cảnh lớn
  points: number; // Điểm của câu (mặc định 1.0 hoặc tùy chọn)
  explanation: string;
  topic?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  imageUrl?: string;

  // Dành cho 'single_choice' & 'multiple_choice':
  options?: string[]; // Mảng linh hoạt, thêm/bớt bao nhiêu ý tùy thích (2, 3, 4, 5...)
  optionImages?: (string | undefined)[]; // Ảnh tương ứng cho từng phương án
  correctAnswer?: number; // Vị trí phương án đúng (cho single_choice)
  correctAnswers?: number[]; // Danh sách các vị trí phương án đúng (cho multiple_choice)

  // Dành cho 'true_false':
  tfItems?: TrueFalseItem[]; // Danh sách các ý a, b, c, d...
  tfScoringMode?: TrueFalseScoringMode; // Chế độ tính điểm: tiered (theo bậc số ý đúng), standard_ministry, divide_equally, custom_item_points
  tfTierPoints?: number[]; // Mảng điểm theo số ý đúng: [điểm khi đúng 1 ý, điểm khi đúng 2 ý, điểm khi đúng 3 ý, ...]

  // Dành cho 'text_input':
  acceptedAnswers?: string[]; // Các đáp án được chấp nhận (vd: ["3.5", "7/2"])
  caseSensitive?: boolean;

  // Dành cho 'grouped' (câu hỏi chùm):
  subQuestions?: Question[]; // Các câu hỏi nhỏ bên trong (hỗ trợ single_choice, multiple_choice, true_false, text_input)
}

export type ExamVisibility = 'public' | 'exam_only' | 'private' | 'class' | 'bundle_only';
export type ExamStatus = 'draft' | 'scheduled' | 'open' | 'closed';

export interface ExamSettings {
  shuffleQuestions?: boolean; // Đảo thứ tự câu hỏi
  shuffleOptions?: boolean;   // Đảo thứ tự câu trả lời
  allowCopy?: boolean;        // Cho phép hay không cho sao chép (copy)
  showAnswersAfterExam?: boolean;    // Ẩn / hiện đáp án & lời giải chi tiết sau thi
  showLiveScoreDuringExam?: boolean; // Ẩn / hiện điểm khi thi giữa chừng
  showScoreAfterExam?: boolean;      // Ẩn / hiện điểm sau khi kết thúc bài thi
}

export interface Exam {
  id: string;
  title: string;
  subject: SubjectType;
  grade: string;
  durationMinutes: number;
  description: string;
  instructions?: string; // Phần ghi hướng dẫn làm bài
  settings?: ExamSettings;
  questions: Question[];
  totalQuestions: number;
  totalPoints: number; // Tổng điểm của toàn bộ đề
  createdAt: string;
  isCustom?: boolean;

  // Phạm vi hiển thị & Bảo mật
  visibility?: ExamVisibility; // 'public' (công khai), 'exam_only' (chỉ trong kỳ thi), 'private' (riêng người ra đề), 'class' (giới hạn trong lớp)
  assignedClassId?: string;   // ID lớp học nếu giới hạn trong lớp
  assignedClassName?: string; // Tên lớp học hiển thị

  // Trạng thái đề thi & Thời gian mở/đóng đề
  status?: ExamStatus; // 'draft' | 'scheduled' | 'open' | 'closed'
  openTime?: string;   // Thời gian bắt đầu mở đề (YYYY-MM-DDTHH:mm hoặc ISO)
  closeTime?: string;  // Thời gian khóa đóng đề (YYYY-MM-DDTHH:mm hoặc ISO)

  // Chế độ cho phép: đề thi hay luyện tập hay cả hai
  modeType?: 'both' | 'exam_only' | 'practice_only';

  // Giới hạn số lần thi & Kiểm soát gian lận rời trang
  maxAttempts?: number;     // Số lần tối đa được làm đề (0 = không giới hạn, 1, 2, 3...)
  maxTabSwitches?: number;  // Số lần rời màn hình thi tối đa trước khi tự động nộp bài (0 = không giám sát)

  // Chống sao chép & hiển thị kết quả
  allowCopy?: boolean;              // false = cấm copy/chuột phải/bôi đen
  showAnswersAfterExam?: boolean;   // true = hiện đáp án chi tiết sau thi, false = ẩn
  showOnlyStudentAnswersAfterExam?: boolean; // true = chỉ cho xem lại câu trả lời thí sinh đã làm, giấu hoàn toàn đáp án chuẩn & lời giải
  showLiveScoreDuringExam?: boolean;// true = hiện điểm tích lũy ngay khi thi
  showScoreAfterExam?: boolean;     // true = hiện điểm sau thi, false = ẩn điểm chờ giáo viên

  // Mã số đề thi 8 chữ số & Số câu chọn ngẫu nhiên
  examCode?: string;                // Mã số đề thi gồm 8 chữ số (ví dụ: '20261201')
  randomQuestionCount?: number;     // Số câu chọn ngẫu nhiên từ ngân hàng câu hỏi (0 = tất cả)

  // Chế độ phòng thi nghiêm ngặt & Giới hạn nộp bài
  lockExitUntilTimeout?: boolean;   // Không cho phép thoát khỏi giao diện thi cho đến khi hết giờ làm bài
  minSubmitMinutes?: number;        // Giới hạn nộp bài sau bao nhiêu phút (chỉ được nộp khi đã làm tối thiểu X phút)
  requireAccessCode?: boolean;      // Chỉ thí sinh có mã bảo mật được cấp mới được phép làm
  accessSecurityCode?: string;      // Mã bảo mật đề thi (PIN / Passcode giáo viên cấp cho thí sinh)
  accessMode?: 'direct_and_code' | 'code_only'; // 'code_only' = chỉ được vào bằng mã đề, không thể bấm vào trực tiếp
}

export type CandidateAnswerValue = 
  | number                         // index cho single_choice
  | number[]                       // danh sách index cho multiple_choice
  | boolean                        // boolean cho true_false item
  | { [itemId: string]: boolean }  // map itemId -> true/false cho true_false
  | string                         // chuỗi nhập cho text_input
  | { [subQId: string]: CandidateAnswerValue }; // map cho grouped

export interface UserExamState {
  examId: string;
  examCode?: string;
  candidateName?: string;
  candidateCode?: string;
  mode: 'exam' | 'practice';
  answers: { [questionId: string]: CandidateAnswerValue };
  flagged: { [questionId: string]: boolean };
  currentQuestionIndex: number;
  startTime: number;
  remainingSeconds: number;
  isSubmitted: boolean;
}

export interface QuestionScoreDetail {
  questionId: string;
  earnedPoints: number;
  maxPoints: number;
  isFullyCorrect: boolean;
  isPartiallyCorrect: boolean;
  isSkipped: boolean;
  itemScores?: { [itemId: string]: { earned: number; max: number; correct: boolean } };
  subQuestionScores?: { [subId: string]: QuestionScoreDetail };
}

export interface ExamResult {
  id: string;
  examId: string;
  examTitle: string;
  subject: SubjectType;
  grade: string;
  studentName?: string; // Tên thí sinh
  studentCode?: string; // Số báo danh
  classId?: string;     // Lớp nếu có
  className?: string;
  earnedPoints: number; // Điểm đạt được
  totalPoints: number;  // Điểm tối đa của đề thi
  scoreOnTenScale: number; // Quy đổi ra thang điểm 10.0
  score: number; // Điểm quy đổi thang 10 (tương đương scoreOnTenScale)
  percentage: number;
  correctCount: number; // Số câu đúng hoàn toàn
  partialCount: number; // Số câu đúng một phần
  wrongCount: number;
  skippedCount: number;
  totalQuestions: number;
  timeSpentSeconds: number;
  totalDurationSeconds: number;
  completedAt: string;
  examCode?: string;         // Mã đề thi 8 chữ số
  submissionReason?: string; // Lý do nộp (nộp bài thông thường, hết giờ, hoặc tự động nộp do rời trang quá số lần)
  tabSwitchCount?: number;   // Số lần ghi nhận rời phòng thi
  answers: { [questionId: string]: CandidateAnswerValue };
  questions: Question[];
  scoreDetails: { [questionId: string]: QuestionScoreDetail };
  topicBreakdown: { [topic: string]: { total: number; earned: number; maxPoints: number } };
  
  // Settings snapshot at time of test
  showScoreAfterExam?: boolean;
  showAnswersAfterExam?: boolean;
  showOnlyStudentAnswersAfterExam?: boolean;
}

// Multi-subject Exam Bundle (Tổ hợp đề thi liên môn)
export type BundleSelectionMode = 'all_compulsory' | 'has_electives';

export type BundleTimingMode = 
  | 'compulsory_seq_elective_cluster_max' // Môn bắt buộc nối tiếp, cụm tự chọn làm chung thời gian bằng thời gian lớn nhất của 1 môn
  | 'all_sequential_independent';         // Tất cả các môn thi riêng biệt nối tiếp nhau

export interface ElectiveGroup {
  id: string;
  name: string; // VD: "Nhóm 1: Khoa học Tự nhiên"
  description?: string;
  minSelectCount: number; // Số lượng môn tối thiểu thí sinh phải chọn trong nhóm này
  examIds: string[]; // Danh sách ID các môn có trong nhóm này
  randomQuestionCountPerExam?: { [examId: string]: number }; // Số câu bốc ngẫu nhiên cho từng môn trong nhóm
}

export interface ExamBundle {
  id: string;
  title: string;
  description: string;
  bundleCode?: string; // Mã tổ hợp môn gồm 8 chữ số (chỉ hiển thị cho Giáo viên)
  breakMinutes: number; // Thời gian nghỉ giải lao giữa 2 môn
  intermissionMinutes?: number; // Tùy chọn alias thời gian nghỉ giữa môn
  examIds: string[]; // Danh sách ID các đề thi
  selectionMode?: BundleSelectionMode; // 'all_compulsory' | 'has_electives'
  timingMode?: BundleTimingMode; // 'compulsory_seq_elective_cluster_max' (mặc định khi có tự chọn) | 'all_sequential_independent'
  compulsoryExamIds?: string[]; // Danh sách ID các môn bắt buộc
  electiveGroups?: ElectiveGroup[]; // Các nhóm môn tự chọn với yêu cầu tối thiểu
  minGroupsToSelect?: number; // Số lượng nhóm tự chọn tối thiểu thí sinh phải chọn (vd: 1)
  maxGroupsToSelect?: number; // Số lượng nhóm tự chọn tối đa thí sinh được chọn (vd: 2)
  selectionTimeLimitSeconds?: number; // Thời gian giới hạn chọn môn thi (giây), 0 = không giới hạn; hết giờ tự chọn ngẫu nhiên bổ sung cho đủ
  randomQuestionCountPerExam?: { [examId: string]: number }; // Số câu bốc ngẫu nhiên cho từng môn trong bộ tự chọn
  
  // Thời gian mở / đóng tổ hợp thi & Trạng thái
  openTime?: string;   // Thời gian bắt đầu mở tổ hợp thi (YYYY-MM-DDTHH:mm)
  closeTime?: string;  // Thời gian đóng tổ hợp thi (YYYY-MM-DDTHH:mm)
  status?: ExamStatus; // 'open' | 'closed' | 'scheduled' | 'draft'
  maxAttempts?: number;// Số lần làm bài tối đa (0 = không giới hạn)

  // Quy chế phòng thi & Nộp bài
  visibility?: ExamVisibility;      // 'public' | 'private' | 'class' | 'bundle_only'
  accessMode?: 'direct_and_code' | 'code_only'; // 'code_only' = chỉ vào bằng mã tổ hợp môn
  lockExitUntilTimeout?: boolean;   // Không cho thoát giao diện thi đến khi hết giờ
  showAnswersAfterExam?: boolean;   // Hiện đáp án chi tiết sau thi
  showOnlyStudentAnswersAfterExam?: boolean; // Sau khi thi xong chỉ cho xem câu trả lời đã làm
  minSubmitMinutes?: number;        // Giới hạn nộp bài sau bao nhiêu phút
  requireAccessCode?: boolean;      // Thí sinh cần có mã cung cấp mới được làm
  accessSecurityCode?: string;      // Mã bảo mật tổ hợp môn
  allowCopy?: boolean;              // Chống sao chép
  maxTabSwitches?: number;          // Giới hạn số lần rời màn hình
  sections?: any[];                 // Các phân đoạn đề thi nếu có
  createdAt: string;
  isCustom?: boolean;
}

// --- Classrooms & Students (Lớp học & Quản lý học sinh) ---
export interface StudentMember {
  id: string;
  name: string;
  studentCode: string; // SBD / Mã học sinh
  email?: string;
  avatar?: string;
  joinedAt: string;
}

export interface Classroom {
  id: string;
  name: string;         // VD: 12A1 Chuyên Toán
  grade: string;        // Khối 12
  code: string;         // Mã tham gia lớp, VD: TOAN12A1
  teacherId?: string;   // ID của tài khoản giáo viên tạo lớp
  teacherName: string;  // Giáo viên phụ trách
  teacherEmail?: string;
  description?: string;
  students: StudentMember[];
  pendingRequests?: ClassJoinRequest[]; // Danh sách học sinh đang gửi yêu cầu chờ duyệt vào lớp
  assignedExamIds: string[]; // Danh sách đề thi được giao cho lớp này
  createdAt: string;
}

// --- Micro-Courses (Hệ thống Khóa học: Chương, Bài học & Tương tác) ---
export type LessonBlockType = 'theory' | 'question' | 'callout' | 'practice_link';

export interface LessonBlock {
  id: string;
  type: LessonBlockType;
  title?: string;
  contentMarkdown?: string; // Hỗ trợ Markdown, LaTeX KaTeX
  imageUrl?: string;
  calloutType?: 'info' | 'tip' | 'warning' | 'formula';
  // Dành cho 'question' (câu hỏi tương tác trung gian giữa bài học):
  question?: Question;
  // Dành cho 'practice_link':
  practiceExamId?: string;
  practiceExamTitle?: string;
}

export interface CourseLesson {
  id: string;
  title: string;
  durationMinutes?: number;
  summary?: string;
  contentMarkdown?: string;
  blocks?: LessonBlock[]; // Danh sách các khối lý thuyết & câu hỏi trung gian
  practiceExamId?: string; // Đề luyện tập đính kèm
  practiceExamTitle?: string;
}

export interface CourseChapter {
  id: string;
  title: string;
  description?: string;
  order: number;
  lessons: CourseLesson[];
  chapterExamId?: string; // Đề thi / kiểm tra định kỳ kết thúc chương
  chapterExamTitle?: string;
}

export interface MicroCourse {
  id: string;
  title: string;
  subject: string;
  grade: string;
  description: string;
  instructor: string;
  chapters?: CourseChapter[]; // Hệ thống chương / bài học
  lessons: CourseLesson[]; // Danh sách phẳng hoặc bài học chung
  finalExamId?: string; // Đề thi tổng kết khóa học
  finalExamTitle?: string;
  createdAt: string;
}

export interface StudentCourseProgress {
  courseId: string;
  studentId: string;
  completedLessonIds: string[];
  currentChapterId?: string;
  currentLessonId?: string;
  interactiveAnswers: {
    [blockId: string]: {
      selectedAnswer: any;
      isCorrect: boolean;
      answeredAt: string;
    };
  };
  completedExamIds: string[];
  lastStudiedAt: string;
}

// --- Customizable Navigation Tabs ---
export interface NavTabItem {
  id: string;
  label: string;
  iconName: 'book' | 'layers' | 'users' | 'graduation' | 'swords' | 'chart' | 'clock' | 'folder' | 'atom' | 'code';
  targetView: 'single' | 'bundle' | 'classrooms' | 'courses' | 'battle' | 'analytics' | 'history' | 'custom_subject' | 'oj';
  subjectFilter?: string; // Nếu là tab môn học cụ thể
  badgeText?: string;
  isCustom?: boolean;
  isVisible?: boolean;
  isDefault?: boolean;
}

// --- Online Judge / VNOI / SPOJ Competitive Programming ---
export type OJLanguage = 'cpp' | 'python' | 'java' | 'pascal';

export type OJVerdict = 
  | 'AC'       // Accepted (100đ)
  | 'WA'       // Wrong Answer
  | 'TLE'      // Time Limit Exceeded
  | 'MLE'      // Memory Limit Exceeded
  | 'CE'       // Compile Error
  | 'RTE'      // Runtime Error
  | 'PENDING';

export interface OJTestCase {
  id: string;
  input: string;
  expectedOutput: string;
  explanation?: string;
  isSample?: boolean;
  points?: number;
}

export interface OJProblem {
  id: string;
  code: string; // VD: VNOI_LIS, SPOJ_PRIME1, VOI_KNAP
  title: string;
  difficulty: 'Dễ' | 'Trung bình' | 'Khó' | 'Chuyên gia';
  category: 'Quy hoạch động' | 'Cấu trúc dữ liệu' | 'Đồ thị' | 'Toán học' | 'Tham lam' | 'Chuỗi ký tự' | 'Nhập môn';
  timeLimitSeconds: number; // VD: 1.0
  memoryLimitMB: number;   // VD: 256
  statement: string;       // Đề bài chi tiết Markdown + LaTeX
  inputSpec: string;       // Định dạng dữ liệu vào
  outputSpec: string;      // Định dạng dữ liệu ra
  constraints: string;     // Ràng buộc giới hạn (N <= 10^5...)
  sampleTestCases: OJTestCase[];
  hiddenTestCases: OJTestCase[];
  tags: string[];
  source?: string;         // VNOI, SPOJ, VOI, Codeforces
  solvedCount?: number;
  totalSubmissions?: number;
  author?: string;
  starterCodes?: Partial<Record<OJLanguage, string>>;
  solutionExplanation?: string;
  isCustom?: boolean;
  createdAt?: string;
}

export interface OJTestResult {
  testIndex: number;
  verdict: OJVerdict;
  executionTimeMs: number;
  memoryUsedMB: number;
  actualOutput?: string;
  expectedOutput?: string;
  input?: string;
  errorMessage?: string;
  isSample?: boolean;
}

export interface OJSubmission {
  id: string;
  problemId: string;
  problemCode: string;
  problemTitle: string;
  userId?: string;
  userName: string;
  language: OJLanguage;
  code: string;
  verdict: OJVerdict;
  score: number; // 0 - 100
  passedTests: number;
  totalTests: number;
  maxExecutionTimeMs: number;
  maxMemoryMB: number;
  submittedAt: string;
  testResults: OJTestResult[];
  compileOutput?: string;
}

// --- Thi đối kháng 1v1 / Battle Arena ---
export interface BattleQuestion {
  id: string;
  question: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
  timeLimitSeconds: number;
  points: number;
}

export interface BattleOpponent {
  id: string;
  name: string;
  avatar: string;
  score: number;
  isBot?: boolean;
  currentStreak: number;
}

// --- Góp ý & Đánh giá trang web ---
export interface FeedbackItem {
  id: string;
  rating: number; // 1-5 sao
  category: 'ui' | 'exams' | 'feature' | 'bug' | 'general';
  comments: string;
  userName?: string;
  userRole?: UserRole;
  email?: string;
  createdAt: string; // ISO string
}

