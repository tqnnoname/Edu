export type UserRole = 'teacher' | 'student';

export type SubjectType = 
  | 'math' 
  | 'english' 
  | 'physics' 
  | 'chemistry' 
  | 'history' 
  | 'it' 
  | 'biology' 
  | 'general';

export type QuestionType = 
  | 'single_choice'  // 1 phương án đúng, tùy biến số lượng options
  | 'true_false'      // Nhiều ý, mỗi ý chọn Đúng hoặc Sai
  | 'text_input'      // Nhập đáp án vào ô văn bản/số
  | 'grouped';        // Câu hỏi chùm: bối cảnh lớn bao trùm nhiều câu hỏi nhỏ

export interface TrueFalseItem {
  id: string;
  statement: string; // Nội dung mệnh đề
  isCorrect: boolean; // true = Đúng, false = Sai
  points?: number; // Điểm riêng của ý này (nếu không có thì chia đều)
}

export interface Question {
  id: string;
  type: QuestionType;
  question: string; // Nội dung câu hỏi hoặc bài đọc/bối cảnh lớn
  points: number; // Điểm của câu (mặc định 1.0 hoặc tùy chọn)
  explanation: string;
  topic?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  imageUrl?: string;

  // Dành cho 'single_choice':
  options?: string[]; // Mảng linh hoạt, thêm/bớt bao nhiêu ý tùy thích (2, 3, 4, 5...)
  optionImages?: (string | undefined)[]; // Ảnh tương ứng cho từng phương án (thay thế hoặc đi kèm nội dung chữ)
  correctAnswer?: number; // Vị trí phương án đúng

  // Dành cho 'true_false':
  tfItems?: TrueFalseItem[]; // Danh sách các ý a, b, c, d...

  // Dành cho 'text_input':
  acceptedAnswers?: string[]; // Các đáp án được chấp nhận (vd: ["3.5", "7/2"])
  caseSensitive?: boolean;

  // Dành cho 'grouped' (câu hỏi chùm):
  subQuestions?: Question[]; // Các câu hỏi nhỏ bên trong
}

export type ExamVisibility = 'public' | 'exam_only' | 'private';
export type ExamStatus = 'draft' | 'scheduled' | 'open' | 'closed';

export interface ExamSettings {
  shuffleQuestions?: boolean; // Đảo thứ tự câu hỏi
  shuffleOptions?: boolean;   // Đảo thứ tự câu trả lời
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
  visibility?: ExamVisibility; // 'public' (công khai), 'exam_only' (chỉ trong kỳ thi), 'private' (riêng người ra đề)

  // Trạng thái đề thi & Thời gian mở/đóng đề
  status?: ExamStatus; // 'draft' | 'scheduled' | 'open' | 'closed'
  openTime?: string;   // Thời gian bắt đầu mở đề (YYYY-MM-DDTHH:mm hoặc ISO)
  closeTime?: string;  // Thời gian khóa đóng đề (YYYY-MM-DDTHH:mm hoặc ISO)

  // Giới hạn số lần thi & Kiểm soát gian lận rời trang
  maxAttempts?: number;     // Số lần tối đa được làm đề (0 = không giới hạn, 1, 2, 3...)
  maxTabSwitches?: number;  // Số lần rời màn hình thi tối đa trước khi tự động nộp bài (0 = không giám sát)
}

export type CandidateAnswerValue = 
  | number                         // index cho single_choice
  | { [itemId: string]: boolean }  // map itemId -> true/false cho true_false
  | string                         // chuỗi nhập cho text_input
  | { [subQId: string]: CandidateAnswerValue }; // map cho grouped

export interface UserExamState {
  examId: string;
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
}

export interface ExamResult {
  id: string;
  examId: string;
  examTitle: string;
  subject: SubjectType;
  grade: string;
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
  submissionReason?: string; // Lý do nộp (nộp bài thông thường, hết giờ, hoặc tự động nộp do rời trang quá số lần)
  tabSwitchCount?: number;   // Số lần ghi nhận rời phòng thi
  answers: { [questionId: string]: CandidateAnswerValue };
  questions: Question[];
  scoreDetails: { [questionId: string]: QuestionScoreDetail };
  topicBreakdown: { [topic: string]: { total: number; earned: number; maxPoints: number } };
}

// Multi-subject Exam Bundle (Tổ hợp đề thi liên môn)
export type BundleSelectionMode = 'all_compulsory' | 'has_electives';

export interface ElectiveGroup {
  id: string;
  name: string; // VD: "Nhóm 1: Khoa học Tự nhiên"
  description?: string;
  minSelectCount: number; // Số lượng môn tối thiểu thí sinh phải chọn (do người ra đề quyết)
  examIds: string[]; // Danh sách ID các môn có trong nhóm này
}

export interface ExamBundle {
  id: string;
  title: string;
  description: string;
  breakMinutes: number; // Thời gian nghỉ giải lao giữa 2 môn
  examIds: string[]; // Danh sách ID các đề thi
  selectionMode?: BundleSelectionMode; // 'all_compulsory' | 'has_electives'
  compulsoryExamIds?: string[]; // Danh sách ID các môn bắt buộc
  electiveGroups?: ElectiveGroup[]; // Các nhóm môn tự chọn với yêu cầu tối thiểu
  minGroupsToSelect?: number; // Số lượng nhóm tự chọn tối thiểu thí sinh phải chọn (vd: 1)
  maxGroupsToSelect?: number; // Số lượng nhóm tự chọn tối đa thí sinh được chọn (vd: 2)
  selectionTimeLimitSeconds?: number; // Thời gian giới hạn chọn môn thi (giây), 0 hoặc không đặt = không giới hạn; hết giờ tự chọn ngẫu nhiên
  createdAt: string;
  isCustom?: boolean;
}
