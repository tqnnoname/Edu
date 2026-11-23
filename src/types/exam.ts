export type UserRole = 'teacher' | 'student';

export interface UserAccount {
  id: string;
  uid?: string; // Firebase Auth UID chính chủ
  legacyUserIds?: string[]; // Các ID cũ trước khi chuyển sang Firebase Auth UID
  email: string;
  username: string;
  fullName: string;
  name?: string; // Tên hiển thị (alias cho fullName)
  studentCode?: string;
  role: UserRole;
  isMasterAdmin?: boolean; // Tài khoản của người tạo hệ thống: tranquangnhat418@gmail.com
  hasBackendPassword?: boolean;
  avatar?: string;
  school?: string;
  schoolOrOrg?: string; // Trường / Tổ chức (alias cho school)
  isGoogleAuth?: boolean;
  updatedAt?: string;
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
  updatedAt?: string;
  reviewedAt?: string;
  reviewedBy?: string;
}

export interface ClassJoinRequest {
  id: string;
  classId: string;
  className: string;
  classCode: string;
  teacherId?: string;
  teacherEmail?: string;
  studentId: string;
  studentName: string;
  studentEmail?: string;
  studentCode?: string;
  note?: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  updatedAt?: string;
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
  updatedAt?: string;
}

export type QuestionType = 
  | 'single_choice'   // 1 phương án đúng, tùy biến số lượng options
  | 'multiple_choice' // Chọn nhiều phương án đúng
  | 'true_false'      // Nhiều ý, mỗi ý chọn Đúng hoặc Sai
  | 'text_input'      // Nhập đáp án vào ô văn bản/số (trả lời ngắn)
  | 'matching'        // Ghép đôi hai cột (trái >=< phải, cho phép cột phải nhiều hơn để làm nhiễu)
  | 'grouped'         // Câu hỏi chùm: bối cảnh lớn bao trùm nhiều câu hỏi nhỏ
  | 'essay';          // Tự luận / Soạn thảo văn bản online kèm công thức toán

export type MatchingLabelStyle = 'number' | 'upper_alpha' | 'lower_alpha' | 'roman' | 'custom';

export interface MatchingItem {
  id: string;
  label?: string; // Nhãn tùy chỉnh khi chọn kiểu 'custom'
  content: string; // Nội dung văn bản hoặc công thức LaTeX
  imageUrl?: string; // Ảnh minh họa (tùy chọn)
}

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
  partId?: string;    // ID phần thi của câu hỏi (VD: Phần I, Phần II...)
  partTitle?: string; // Tên phần thi hiển thị (tuỳ chọn)

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
  acceptedAnswers?: string[]; // Các đáp án được chấp nhận (vd: ["3,5", "7/2"])
  caseSensitive?: boolean;

  // Dành cho 'matching' (Ghép đôi hai cột):
  matchingLeftLabelStyle?: MatchingLabelStyle;  // Kiểu đánh ý cột trái (vd: 'number' -> 1, 2, 3 hoặc 'lower_alpha' -> a, b, c)
  matchingRightLabelStyle?: MatchingLabelStyle; // Kiểu đánh ý cột phải (vd: 'upper_alpha' -> A, B, C hoặc 'number' -> 1, 2, 3)
  matchingLeftItems?: MatchingItem[];           // Danh sách ý cột trái (đề bài)
  matchingRightItems?: MatchingItem[];          // Danh sách ý cột phải (đáp án, số lượng >= cột trái, có thể thừa làm nhiễu)
  matchingCorrectPairs?: { [leftItemId: string]: string }; // Map leftItem.id -> rightItem.id

  // Dành cho 'grouped' (câu hỏi chùm):
  subQuestions?: Question[]; // Các câu hỏi nhỏ bên trong (hỗ trợ single_choice, multiple_choice, true_false, text_input)

  // Dành cho 'essay' (tự luận / soạn thảo văn bản):
  sampleAnswer?: string; // Đáp án tham khảo / Gợi ý chấm điểm
}

export type ExamVisibility = 'public' | 'exam_only' | 'private' | 'class' | 'bundle_only';
export type ExamStatus = 'draft' | 'scheduled' | 'open' | 'closed';

export interface ExamSettings {
  shuffleQuestions?: boolean; // Đảo thứ tự câu hỏi
  shuffleOptions?: boolean;   // Đảo thứ tự câu trả lời
  groupByQuestionType?: boolean; // Gom mỗi dạng câu hỏi thành từng cụm cố định
  questionTypeOrder?: QuestionType[]; // Thứ tự cố định các cụm dạng câu hỏi
  allowCopy?: boolean;        // Cho phép hay không cho sao chép (copy)
  showAnswersAfterExam?: boolean;    // Ẩn / hiện đáp án & lời giải chi tiết sau thi
  showLiveScoreDuringExam?: boolean; // Ẩn / hiện điểm khi thi giữa chừng
  showScoreAfterExam?: boolean;      // Ẩn / hiện điểm sau khi kết thúc bài thi
}

export interface ExamPart {
  id: string;
  title: string;        // VD: "Phần I: Trắc nghiệm khách quan", "Phần II: Đúng / Sai"
  description?: string;
  order: number;
}

export interface ExamPartScore {
  partId: string;
  partTitle: string;
  order: number;
  questionIds: string[];
  questionCount: number;
  earnedPoints: number;
  maxPoints: number;
  scoreOnTenScale: number;
  correctCount: number;
}

export interface ExamAttachedFile {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes?: number;
  dataUrl?: string; // Base64 Data URL cho file nhỏ (<= 500KB) để đồng bộ trực tiếp Firestore
  url?: string;     // Đường dẫn /api/files/... hoặc URL tài liệu ngoài
  uploadedAt?: string;
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
  parts?: ExamPart[]; // Cấu trúc chia các phần của đề thi (Phần I, Phần II...)
  attachedFile?: ExamAttachedFile; // File đề thi tích hợp (PDF, Word, Ảnh...) hiển thị chia đôi màn hình khi làm bài
  questions: Question[];
  totalQuestions: number;
  totalPoints: number; // Tổng điểm của toàn bộ đề
  createdAt: string;
  updatedAt?: string;
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

  // Trạng thái chế độ giáo viên & Khóa điều hướng thi chính thức trong lớp
  teacherMode?: 'normal' | 'creator' | 'grading' | 'presenting';
  isCreatorOnlyMode?: boolean;      // True = Đề đang ở chế độ "Người ra đề", tuyệt đối ẩn với học sinh
  isOfficialClassExam?: boolean;    // True = Kỳ thi chính thức khóa điều hướng học sinh trong lớp
  preExamLockMinutes?: number;      // Số phút khóa điều hướng trước giờ mở đề (openTime)
  allowExitAfterSubmit?: boolean;   // Cho phép học sinh thoát khóa sau khi đã nộp bài

  // Quyền sở hữu / Người tạo đề thi
  creatorId?: string;
  creatorEmail?: string;
  creatorName?: string;
}

export type CandidateAnswerValue = 
  | number                         // index cho single_choice
  | number[]                       // danh sách index cho multiple_choice
  | boolean                        // boolean cho true_false item
  | { [itemId: string]: boolean }  // map itemId -> true/false cho true_false
  | { [leftId: string]: string }   // map leftItemId -> rightItemId (hoặc __raw__:text) cho matching
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
  userId?: string;      // ID tài khoản học sinh làm bài (bảo mật năng lực riêng tư)
  userEmail?: string;   // Email tài khoản học sinh làm bài
  studentName?: string; // Tên thí sinh
  studentCode?: string; // Số báo danh
  classId?: string;     // Lớp nếu có
  className?: string;
  bundleId?: string;    // ID tổ hợp môn nếu thi theo tổ hợp
  bundleAttemptId?: string; // ID phiên làm bài tổ hợp
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
  partBreakdowns?: ExamPartScore[]; // Điểm chi tiết theo từng phần của đề thi & cộng tổng
  
  // Settings snapshot at time of test
  showScoreAfterExam?: boolean;
  showAnswersAfterExam?: boolean;
  showOnlyStudentAnswersAfterExam?: boolean;
  updatedAt?: string;
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
  assignedClassId?: string;         // ID lớp học nếu giới hạn trong lớp
  assignedClassName?: string;       // Tên lớp học nếu giới hạn trong lớp
  accessMode?: 'direct_and_code' | 'code_only'; // 'code_only' = chỉ vào bằng mã tổ hợp môn
  lockExitUntilTimeout?: boolean;   // Không cho thoát giao diện thi đến khi hết giờ
  showScoreAfterExam?: boolean;     // Hiện điểm số sau khi hoàn thành toàn bộ tổ hợp
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

  // Quyền sở hữu / Người tạo tổ hợp
  creatorId?: string;
  creatorEmail?: string;
  creatorName?: string;
  updatedAt?: string;
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
  assignedCourseIds?: string[]; // Danh sách khóa học được giao cho lớp này
  createdAt: string;
  updatedAt?: string;
}

// --- Micro-Courses (Hệ thống Khóa học: Chương, Bài học & Tương tác + SCORM) ---
export type LessonBlockType = 'theory' | 'question' | 'callout' | 'image' | 'file' | 'practice_link';

export interface CourseAttachment {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes?: number;
  dataUrl?: string; // Cho tệp tải lên từ máy (Base64 Data URL)
  url?: string;     // Cho đường dẫn tài liệu ngoài (Google Drive, OneDrive, PDF URL...)
  uploadedAt?: string;
  uploadedBy?: string;
}

export interface LessonBlock {
  id: string;
  type: LessonBlockType;
  title?: string;
  contentMarkdown?: string; // Hỗ trợ Markdown, LaTeX KaTeX & ảnh chèn giữa nội dung
  imageUrl?: string;
  caption?: string; // Chú thích ảnh minh họa
  calloutType?: 'info' | 'tip' | 'warning' | 'formula';
  attachments?: CourseAttachment[]; // Tài liệu đính kèm (PDF, Word, PPT, Excel, Zip...)
  // Dành cho 'question' (câu hỏi tương tác trung gian giữa bài học):
  question?: Question;
  // Dành cho 'practice_link':
  practiceExamId?: string;
  practiceExamTitle?: string;
}

export interface HomeworkAttachment {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  dataUrl?: string;
  url?: string;
}

export interface ClassroomHomework {
  id: string;
  classId: string;
  title: string;
  instructions?: string;
  attachments?: HomeworkAttachment[];
  openTime?: string;   // Thời gian mở nộp BTVN (YYYY-MM-DDTHH:mm)
  closeTime?: string;  // Thời gian đóng nộp BTVN (YYYY-MM-DDTHH:mm)
  maxScore?: number;   // Điểm tối đa (mặc định 10)
  createdBy?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface LessonHomeworkConfig {
  enabled: boolean;
  title: string;
  instructions?: string;
  openTime?: string;
  closeTime?: string;
  maxScore?: number;
}

export interface HomeworkSubmission {
  id: string;
  classId?: string;
  homeworkId?: string;
  homeworkTitle?: string;
  courseId?: string;
  courseTitle?: string;
  lessonId?: string;
  lessonTitle?: string;
  studentId: string;
  studentName: string;
  studentEmail?: string;
  studentCode?: string;
  imageUrls: string[];
  attachments?: HomeworkAttachment[];
  textAnswer?: string;
  note?: string;
  submittedAt: string;
  updatedAt?: string;
  score?: number;
  maxScore?: number;
  teacherFeedback?: string;
  gradedAt?: string;
  gradedBy?: string;
}

export interface CourseLesson {
  id: string;
  title: string;
  durationMinutes?: number;
  summary?: string;
  contentMarkdown?: string;
  blocks?: LessonBlock[]; // Danh sách các khối lý thuyết, ảnh, tài liệu & câu hỏi trung gian
  attachments?: CourseAttachment[]; // Tài liệu đính kèm của bài học (PDF, DOC, PPT, Excel...)
  practiceExamId?: string; // Đề luyện tập đính kèm
  practiceExamTitle?: string;
  homework?: LessonHomeworkConfig;
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

  // Trạng thái & Thời gian mở/đóng khóa học
  status?: ExamStatus; // 'draft' | 'scheduled' | 'open' | 'closed'
  openTime?: string;   // Thời gian bắt đầu mở khóa học (YYYY-MM-DDTHH:mm)
  closeTime?: string;  // Thời gian khóa đóng khóa học (YYYY-MM-DDTHH:mm)

  // Phạm vi hiển thị & Quyền sở hữu
  visibility?: ExamVisibility; // 'public' | 'class' | 'private'
  assignedClassId?: string;
  assignedClassName?: string;
  creatorId?: string;
  creatorEmail?: string;
  creatorName?: string;

  // Chuẩn đóng gói & Theo dõi tiến độ SCORM
  isScormEnabled?: boolean;
  scormVersion?: '1.2' | '2004';
  updatedAt?: string;
}

export interface ScormTrackingData {
  lessonStatus: 'not attempted' | 'incomplete' | 'completed' | 'passed';
  lessonLocation?: string;
  scoreRaw?: number;
  suspendData?: string;
  totalBlocksCompleted?: number;
  totalBlocksCount?: number;
}

export interface StudentCourseProgress {
  courseId: string;
  studentId: string;
  completedLessonIds: string[];
  completedBlockIds?: string[]; // Theo dõi hoàn thành từng khối nội dung (SCORM granular progress)
  currentChapterId?: string;
  currentLessonId?: string;
  currentBlockIdsByLesson?: { [lessonId: string]: string };
  interactiveAnswers: {
    [blockId: string]: {
      selectedAnswer: any;
      isCorrect: boolean;
      answeredAt: string;
    };
  };
  completedExamIds: string[];
  scormData?: ScormTrackingData;
  lastStudiedAt: string;
}

// --- Customizable Navigation Tabs ---
export interface NavTabItem {
  id: string;
  label: string;
  iconName: 'book' | 'layers' | 'users' | 'graduation' | 'swords' | 'gamepad' | 'chart' | 'clock' | 'folder' | 'atom' | 'code';
  targetView: 'single' | 'bundle' | 'classrooms' | 'courses' | 'battle' | 'games' | 'analytics' | 'history' | 'custom_subject';
  subjectFilter?: string; // Nếu là tab môn học cụ thể
  badgeText?: string;
  isCustom?: boolean;
  isVisible?: boolean;
  isDefault?: boolean;
}

// --- Mountain Climb Interactive Quiz Game ("Vượt chướng ngại vật — Chinh phục đỉnh núi") ---
export type MountainGameMode = 'solo' | 'duo' | 'multi';
export type MountainTimeMode = 'per_question' | 'total_game';
export type MountainRoomStatus = 'lobby' | 'playing' | 'finished';
export type MountainPlayStage = 'main' | 'retry';
export type MountainRoundPhase = 'question' | 'round_result' | 'retry_loop';

export interface MountainPetDef {
  id: string;
  name: string;
  emoji: string;
  trait: string;
  accentHex: string;
  bgClass: string;
  borderClass: string;
  textClass: string;
}

export interface MountainQuestionItem {
  id: string;
  question: string;
  imageUrl?: string;
  options: string[];
  correctAnswer?: number;
  explanation?: string;
  sourceTitle?: string;
}

export interface MountainGameConfig {
  mode: MountainGameMode;
  timeMode: MountainTimeMode;
  questionTimeSec: number;
  totalTimeSec: number;
  summitSteps: number;
  rank1Bonus: number;
  rank2Bonus: number;
  baseCorrectBonus: number;
  wrongPenalty: number;
  questionCount: number;
  sourceExamId: string;
  sourceTitle: string;
}

export interface MountainPlayerRoundDelta {
  playerId: string;
  playerName: string;
  petId: string;
  isCorrect: boolean;
  selectedOptionIndex: number | null;
  reactionMs: number | null;
  rankInRound: number | null;
  stepDelta: number;
  badgeLabel: string;
  newStep: number;
}

export interface MountainRoundResultSummary {
  questionIndex: number;
  questionId: string;
  correctAnswer: number;
  explanation?: string;
  fastestPlayerId?: string;
  secondPlayerId?: string;
  deltas: MountainPlayerRoundDelta[];
  resolvedAt: number;
}

export interface MountainRetryFeedback {
  questionId: string;
  isCorrect: boolean;
  correctAnswer: number;
  explanation?: string;
  stepDelta: number;
  remainingWrongCount: number;
  timestamp: number;
}

export interface MountainPlayerState {
  id: string;
  name: string;
  petId: string;
  isHost: boolean;
  connected: boolean;
  step: number;
  rawSteps: number;
  mainAnsweredCount: number;
  firstTryCorrectCount: number;
  wrongAttemptCount: number;
  retryClearedCount: number;
  wrongQueueIds: string[];
  currentAnswer?: {
    questionIndex: number;
    selectedIndex: number;
    reactionMs: number;
  } | null;
  currentRetryStartedAt?: number | null;
  lastRetryFeedback?: MountainRetryFeedback | null;
  totalReactionMs: number;
  answeredCountForAvg: number;
  reachedSummitAt?: number | null;
  officiallyFinished: boolean;
  finishedAt?: number | null;
}

export interface MountainGameRoomState {
  code: string;
  hostId: string;
  status: MountainRoomStatus;
  stage: MountainPlayStage;
  roundPhase: MountainRoundPhase;
  config: MountainGameConfig;
  questions: MountainQuestionItem[];
  players: MountainPlayerState[];
  currentMainIndex: number;
  questionStartedAt?: number | null;
  questionEndsAt?: number | null;
  roundResultEndsAt?: number | null;
  gameStartedAt?: number | null;
  gameEndsAt?: number | null;
  lastRoundSummary?: MountainRoundResultSummary | null;
  createdAt: number;
  updatedAt: number;
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
  updatedAt?: string;
}

// --- Công cụ Giáo viên: Quản lý Bảng điểm & Vinh danh động ---
export type ScoreboardDisplayMode = '1v1' | 'group' | 'top_n';
export type TeacherSpecialMode = 'normal' | 'creator' | 'grading' | 'presenting';

export interface ScoreboardRound {
  id: string;
  name: string;
  maxPoints?: number;
  order: number;
}

export interface ScoreboardParticipant {
  id: string;
  name: string;
  code?: string;
  email?: string;
  /** Điểm đã lưu theo từng phần/vòng thi */
  scores: { [roundId: string]: number };
  /** Điểm đã công bố (trình chiếu) theo từng phần/vòng thi để tạo hiệu ứng Odometer & FLIP */
  revealedScores?: { [roundId: string]: number };
  lastAnnouncedRoundId?: string;
  lastAnnouncedDelta?: number;
  lastAnnouncedAt?: string;
}

export interface Scoreboard {
  id: string;
  title: string;
  description?: string;
  mode: ScoreboardDisplayMode;
  topN?: number;
  specialMode: TeacherSpecialMode;
  classId?: string;
  className?: string;
  rounds: ScoreboardRound[];
  participants: ScoreboardParticipant[];
  creatorId?: string;
  creatorUid?: string;
  creatorEmail?: string;
  creatorName?: string;
  createdAt: string;
  updatedAt?: string;
}

